import { User } from '../domain/user.aggregate.js';
import { UserId } from '../domain/value-objects/user-id.vo.js';
import { Email } from '../domain/value-objects/email.vo.js';
import { PasswordHash } from '../domain/value-objects/password-hash.vo.js';
import {
  UserNotFoundException,
  UserDeletedException,
  InvalidRestoreException,
  EmailAlreadyInUseException,
  ConcurrencyException,
} from '../domain/exceptions/user.exceptions.js';
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
  type FindByIdOptions,
} from '../domain/ports/user-repository.port.js';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from '../domain/ports/password-hasher.port.js';
import { AUDIT_SERVICE_PORT } from '../../../shared/audit/shared/audit.tokens.js';
import type {
  AuditOperation,
  AuditServicePort,
} from '../../../shared/audit/application/audit-service.port.js';
import { AuditContextStore } from '../../../shared/audit/shared/audit-context-store.js';
import { TENANCY_USE_CASES } from '../../tenancy/application/tenancy.use-cases.js';
// `import type` e não no import de cima: `TenancyUseCases` é apagado em
// runtime (só entra como tipo do campo `tenancy`), e manter a aresta viva em
// runtime criaria um ciclo users/application → tenancy/application →
// users/domain.
import type { TenancyUseCases } from '../../tenancy/application/tenancy.use-cases.js';

import type { CreateUserInput } from './dto/create-user.input.js';
import type { UpdateUserNameInput } from './dto/update-user-name.input.js';
import type { UpdateUserEmailInput } from './dto/update-user-email.input.js';
import type { SoftDeleteUserInput } from './dto/soft-delete-user.input.js';
import type { RestoreUserInput } from './dto/restore-user.input.js';
import type { GetUserByIdInput } from './dto/get-user-by-id.input.js';
import type { ListUsersInput } from './dto/list-users.input.js';
import { toUserOutput, type UserOutput } from './dto/user.output.js';
import type { ListUsersOutput } from './dto/list-users.output.js';

import {
  ApplicationConcurrencyException,
  ApplicationEmailAlreadyInUseException,
  ApplicationInvalidRestoreException,
  ApplicationResourceDeletedException,
  ApplicationResourceNotFoundException,
  ApplicationValidationException,
} from './exceptions/application.exceptions.js';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Casos de uso do bounded context de Users.
 *
 * Orquestram: agregado User + repositório (port) + AuditServicePort +
 * AuditContextStore (AsyncLocalStorage).
 *
 * Cada operação:
 * 1. Puxa AuditContext do AuditContextStore (lançando se fora de run()).
 * 2. Carrega o agregado (load via repo) ou cria novo.
 * 3. Aplica o mutator correspondente.
 * 4. Persiste via repo.save(user, expectedVersion=version()-1).
 * 5. Drena domain events e chama audit.record() para cada um (INSERT/UPDATE/DELETE/RESTORE).
 * 6. Em soft-delete: também chama audit.archive().
 *
 * pt-BR: converte exceções de domínio em exceções application-layer
 * (boundary inbound) — o caller (HTTP handler) nunca importa domain
 * diretamente.
 */
export const USER_USE_CASES = Symbol.for('@projeto/api/users/UserUseCases');

/**
 * pt-BR: decorado com `@Injectable()` + `@Inject(USER_REPOSITORY_PORT)` /
 * `@Inject(AUDIT_SERVICE_PORT)` / `@Inject(PASSWORD_HASHER_PORT)` no
 * construtor porque os parâmetros são interfaces (apagadas em runtime pelo
 * TS). Sem tokens explícitos o container DI passaria `undefined` para os
 * params e `userRepo.findByEmail` quebraria em runtime — bug latente
 * descoberto pelos testes e2e (Task 7.7).
 *
 * O `@Inject(PASSWORD_HASHER_PORT)` segue a mesma regra e não é opcional:
 * `PasswordHasherPort` é uma interface, então sem o token explícito o Nest
 * resolveria `undefined` e `criarUser` gravaria a senha em claro — o
 * defeito mais caro desta fase, e um que nenhuma asserção de tipo pega,
 * porque `undefined.hash(...)` só estoura em runtime.
 */
@Injectable()
export class UserUseCases {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(AUDIT_SERVICE_PORT) private readonly auditService: AuditServicePort,
    @Inject(PASSWORD_HASHER_PORT) private readonly passwordHasher: PasswordHasherPort,
    @Inject(TENANCY_USE_CASES) private readonly tenancy: TenancyUseCases,
  ) {}

  // ----- CREATE -----

  async criarUser(input: CreateUserInput, tenantId: string | null): Promise<UserOutput> {
    const ctx = AuditContextStore.get();

    // 1. Validar input no nível application (campos não-vazios antes de criar VO)
    if (typeof input.nome !== 'string' || input.nome.trim() === '') {
      throw new ApplicationValidationException('nome', 'campo obrigatório (string não-vazia)');
    }
    if (typeof input.email !== 'string' || input.email.trim() === '') {
      throw new ApplicationValidationException('email', 'campo obrigatório (string não-vazia)');
    }
    if (typeof input.senha !== 'string' || input.senha.trim() === '') {
      // ⚠️ A mensagem NÃO embute o valor recebido — um `throw` com
      // `${input.senha}` no meio põe a senha em claro no log de erro.
      throw new ApplicationValidationException('senha', 'campo obrigatório (string não-vazia)');
    }

    // 2. Email uniqueness check (application-level, antes de chamar VO)
    const emailVO = Email.create(input.email);
    const existing = await this.userRepo.findByEmail(emailVO, tenantId);
    if (existing !== null) {
      throw new ApplicationEmailAlreadyInUseException(emailVO.value);
    }

    // 3. Hash da senha — ANTES de tocar o agregado.
    //
    //    ⚠️ Esta é a única linha do fluxo onde a senha em claro existe como
    //    valor, e ela é destruída no fim da próxima. `input.senha` continua
    //    referenciável pelo resto do método porque `input` é o objeto do
    //    caller — daqui em diante nada o copia, e a senha não é passada a
    //    `User.criar`, nem a `save`, nem ao `toUserOutput` (a segunda
    //    barreira, em `dto/user.output.ts`).
    const senhaHash = PasswordHash.create(await this.passwordHasher.hash(input.senha));

    // 4. Criar agregado (User.criar emite UserCreatedEvent)
    const user = User.criar({
      nome: input.nome,
      email: input.email,
      senhaHash,
      agora: ctx.timestamp,
    });

    // 5. Persistir (INSERT, expectedVersion=0)
    //
    //    Fase 5 (D5): COM destino, o `users` NÃO é escrito por este
    //    repositório — ele vai para `TenancyUseCases`, que o grava dentro da
    //    mesma transação da empresa/perfil/membership. Salvar aqui e só depois
    //    provisionar deixaria o estado intermediário observável de fora: uma
    //    conta sem empresa, que a Fase 4 resolve para zero permissões sem
    //    ninguém entender por quê — e um `slug` duplicado deixaria essa conta
    //    órfã para sempre, porque o rollback do `$transaction` de tenancy não
    //    alcança uma escrita que já saiu daqui.
    if (input.destino === undefined) {
      await this.userRepo.save(user, 0, tenantId);
    } else {
      const usuario = {
        id: user.id().value,
        nome: user.nome().value,
        email: emailVO.value,
        senhaHash: senhaHash.value,
        createdAt: ctx.timestamp,
      };
      if (input.destino.tipo === 'empresa') {
        await this.tenancy.provisionarEmpresaPropria({
          usuario,
          empresa: { nome: input.destino.nome, slug: input.destino.slug },
        });
      } else {
        await this.tenancy.criarContaPorConvite({ usuario, token: input.destino.token });
      }
    }

    // 6. Auditar evento de criação
    await this.emitAuditForEvents(user);

    // 7. Retornar DTO
    return toUserOutput(user);
  }

  // ----- READ -----

  async obterPorId(input: GetUserByIdInput, tenantId: string | null): Promise<UserOutput> {
    const id = UserId.create(input.id);
    const user = await this.userRepo.findById(id, tenantId);
    if (user === null) {
      throw new ApplicationResourceNotFoundException('User', id.value);
    }
    return toUserOutput(user);
  }

  async listar(input: ListUsersInput, tenantId: string | null): Promise<ListUsersOutput> {
    const page = await this.userRepo.list(
      {
        cursor: input.cursor ?? null,
        limit: input.limit,
        includeDeleted: input.includeDeleted === true,
        // ⚠️ Este campo É repassado. A versão anterior da lista o esquecia, e o
        // `list()` do repositório que o lia virava código morto — ninguém
        // exercitava o caminho, então o teste de integração acusava 3 linhas
        // onde devia vir 1. Campo novo no port que não é repassado aqui é
        // exatamente a mudança que passa em review e não acontece em runtime.
        somenteUsuarioId: input.somenteUsuarioId ?? null,
      },
      tenantId,
    );
    return {
      users: page.users.map(toUserOutput),
      nextCursor: page.nextCursor,
    };
  }

  // ----- UPDATE (rename / email) -----

  async atualizarNome(input: UpdateUserNameInput, tenantId: string | null): Promise<UserOutput> {
    const ctx = AuditContextStore.get();
    const id = UserId.create(input.id);
    const user = await this.userRepo.findById(id, tenantId);
    if (user === null) {
      throw new ApplicationResourceNotFoundException('User', id.value);
    }
    // Curto-circuito HTTP-observável: 412 antes de tentar mutar.
    if (user.version() !== input.expectedVersion) {
      throw new ApplicationConcurrencyException('User', input.expectedVersion, user.version());
    }
    try {
      user.renomear(input.novoNome, ctx.timestamp);
    } catch (e) {
      this.translateDomainException(e, 'User', id.value);
    }
    await this.userRepo.save(user, input.expectedVersion, tenantId);
    await this.emitAuditForEvents(user);
    return toUserOutput(user);
  }

  async atualizarEmail(input: UpdateUserEmailInput, tenantId: string | null): Promise<UserOutput> {
    const ctx = AuditContextStore.get();
    const id = UserId.create(input.id);
    const user = await this.userRepo.findById(id, tenantId);
    if (user === null) {
      throw new ApplicationResourceNotFoundException('User', id.value);
    }
    // Curto-circuito HTTP-observável: 412 antes de tentar mutar.
    if (user.version() !== input.expectedVersion) {
      throw new ApplicationConcurrencyException('User', input.expectedVersion, user.version());
    }

    // Email-uniqueness check ANTES de mutar
    const novoEmailVO = Email.create(input.novoEmail);
    if (user.email().value !== novoEmailVO.value) {
      const existing = await this.userRepo.findByEmail(novoEmailVO, tenantId);
      if (existing !== null && existing.id().value !== id.value) {
        throw new ApplicationEmailAlreadyInUseException(novoEmailVO.value);
      }
    }

    try {
      user.alterarEmail(input.novoEmail, ctx.timestamp);
    } catch (e) {
      this.translateDomainException(e, 'User', id.value);
    }
    await this.userRepo.save(user, input.expectedVersion, tenantId);
    await this.emitAuditForEvents(user);
    return toUserOutput(user);
  }

  // ----- SOFT DELETE -----

  async softDelete(input: SoftDeleteUserInput, tenantId: string | null): Promise<UserOutput> {
    const ctx = AuditContextStore.get();
    const id = UserId.create(input.id);
    const user = await this.userRepo.findById(id, tenantId);
    if (user === null) {
      throw new ApplicationResourceNotFoundException('User', id.value);
    }
    // Curto-circuito HTTP-observável: 412 antes de tentar mutar.
    if (user.version() !== input.expectedVersion) {
      throw new ApplicationConcurrencyException('User', input.expectedVersion, user.version());
    }
    try {
      user.marcarExcluido(input.reason, ctx.timestamp);
    } catch (e) {
      this.translateDomainException(e, 'User', id.value);
    }
    await this.userRepo.save(user, input.expectedVersion, tenantId);
    await this.emitAuditForEvents(user);

    // Soft-delete também vai para o archive
    await this.auditService.archive({
      entityName: 'User',
      entityId: id.value,
      version: user.version(),
      snapshot: toUserOutput(user) as unknown as Record<string, unknown>,
      reason: input.reason,
      ctx,
    });

    return toUserOutput(user);
  }

  // ----- RESTORE -----

  async restaurar(input: RestoreUserInput, tenantId: string | null): Promise<UserOutput> {
    const ctx = AuditContextStore.get();
    const id = UserId.create(input.id);
    // includeDeleted: precisamos carregar o agregado mesmo soft-deleted
    // para então restaurá-lo. Default (filter) seria null aqui.
    const findOptions: FindByIdOptions = { includeDeleted: true };
    const user = await this.userRepo.findById(id, tenantId, findOptions);
    if (user === null) {
      throw new ApplicationResourceNotFoundException('User', id.value);
    }
    // Curto-circuito HTTP-observável: 412 antes de tentar mutar.
    if (user.version() !== input.expectedVersion) {
      throw new ApplicationConcurrencyException('User', input.expectedVersion, user.version());
    }
    try {
      user.restaurar(ctx.timestamp);
    } catch (e) {
      this.translateDomainException(e, 'User', id.value);
    }
    await this.userRepo.save(user, input.expectedVersion, tenantId);
    await this.emitAuditForEvents(user);
    return toUserOutput(user);
  }

  // ----- HELPERS -----

  /**
   * Drena os domain events pendentes do agregado e chama audit.record()
   * para cada um. Converte o tipo de evento para AuditOperation.
   */
  private async emitAuditForEvents(user: User): Promise<void> {
    const ctx = AuditContextStore.get();
    const events = user.pullEvents();
    for (const ev of events) {
      const op = mapEventNameToOperation(ev.eventName);
      const previousVersion = extractPreviousVersion(
        ev as unknown as { eventName: string; [k: string]: unknown },
      );
      await this.auditService.record(
        {
          entityName: 'User',
          entityId: ev.aggregateId,
          operation: op,
          previousVersion,
          newVersion: user.version(),
          snapshot: toUserOutput(user) as unknown as Record<string, unknown>,
          reason: extractReason(ev as unknown as { eventName: string; [k: string]: unknown }),
        },
        ctx,
      );
    }
  }

  /**
   * Converte exceções de domínio em exceções application-layer.
   */
  private translateDomainException(e: unknown, resource: string, id: string): never {
    if (e instanceof UserNotFoundException) {
      throw new ApplicationResourceNotFoundException(resource, id);
    }
    if (e instanceof UserDeletedException) {
      throw new ApplicationResourceDeletedException(resource, id);
    }
    if (e instanceof InvalidRestoreException) {
      throw new ApplicationInvalidRestoreException(e.message);
    }
    if (e instanceof EmailAlreadyInUseException) {
      throw new ApplicationEmailAlreadyInUseException(e.email);
    }
    if (e instanceof ConcurrencyException) {
      throw new ApplicationConcurrencyException(resource, e.expectedVersion, e.actualVersion);
    }
    throw e;
  }
}

function mapEventNameToOperation(eventName: string): AuditOperation {
  if (eventName.endsWith('.created.v1')) return 'INSERT';
  if (eventName.endsWith('.updated.v1')) return 'UPDATE';
  if (eventName.endsWith('.deleted.v1')) return 'DELETE';
  if (eventName.endsWith('.restored.v1')) return 'RESTORE';
  throw new Error(`Operação desconhecida para eventName: ${eventName}`);
}

function extractPreviousVersion(ev: { eventName: string; [k: string]: unknown }): number | null {
  if (ev.eventName.endsWith('.created.v1')) return null;
  if ('previousVersion' in ev && typeof ev.previousVersion === 'number') return ev.previousVersion;
  if ('restoredFromVersion' in ev && typeof ev.restoredFromVersion === 'number') {
    return ev.restoredFromVersion;
  }
  return null;
}

function extractReason(ev: { eventName: string; [k: string]: unknown }): string | null {
  if (ev.eventName.endsWith('.deleted.v1') && 'reason' in ev) {
    return (ev as unknown as { reason: string | null }).reason;
  }
  return null;
}
