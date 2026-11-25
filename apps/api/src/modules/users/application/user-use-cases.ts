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
  type LinhaDeHistoricoDaEscrita,
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
import { paraRegistro } from '../../../shared/domain/para-registro.js';
import { TENANCY_USE_CASES } from '../../tenancy/application/tenancy.use-cases.js';
import {
  ehAdministradorDeSistema,
  exigeAdministradorDeSistema,
  type AtorAutenticado,
} from '../../../shared/auth/eh-administrador-de-sistema.js';
import type { UserHistoryPageDto } from '@projeto/shared-types';
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
import type { ListUserHistoryInput } from './dto/list-user-history.input.js';
import { toUserHistoryPageDto } from './dto/user-history.output.js';
import { toUserOutput, toUserOutputNoEscopo, type UserOutput } from './dto/user.output.js';
import type { ListUsersOutput } from './dto/list-users.output.js';

import {
  ApplicationConcurrencyException,
  ApplicationEmailAlreadyInUseException,
  ApplicationInvalidRestoreException,
  ApplicationResourceDeletedException,
  ApplicationResourceNotFoundException,
  ApplicationValidationException,
} from './exceptions/application.exceptions.js';
import { Inject, Injectable, Logger } from '@nestjs/common';

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
 * 4. Persiste via repo.save(user, expectedVersion) — o `expectedVersion` vem do
 *    `If-Match` do cliente. #123: a âncora do optimistic lock é a versão LIDA
 *    do banco (`loadedVersion()`), não uma suposição sobre a versão atual.
 * 5. Drena domain events e chama audit.record() para cada um (INSERT/UPDATE/DELETE/RESTORE).
 * 6. Em soft-delete: também chama audit.archive().
 *
 * pt-BR: converte exceções de domínio em exceções application-layer
 * (boundary inbound) — o caller (HTTP handler) nunca importa domain
 * diretamente.
 */
export const USER_USE_CASES = Symbol.for('@projeto/api/users/UserUseCases');

/**
 * O REGISTRO da leitura de histórico pelo admin do SISTEMA.
 *
 * ⚠️ O nome do logger é o que separa este registro dos outros: quem lê o log
 * precisa saber que ali está "o administrador do sistema leu o histórico de
 * uma pessoa" — e o histórico carrega o NOME e o E-MAIL de cada versão.
 *
 * O `AuditContext` do repo é auditoria de ESCRITA (INSERT/UPDATE/DELETE), e
 * uma leitura não é uma entidade: o precedente para operação sensível é o
 * `Logger` dedicado (`AdminTenancyInventory`), e é o que está aqui.
 */
const loggerHistorico = new Logger('AdminUserHistory');

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
      // ⚠️ (issue #184) A auditoria viaja DENTRO da escrita: a mutação e o
      // registro do histórico são a MESMA transação.
      await this.userRepo.save(user, 0, tenantId, {
        historico: this.registrosDeAuditoria(user),
      });
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
    //
    // ⚠️ (issue #184) O caminho COM destino tem a AUDITORIA FORA da transação
    // de tenancy: o usuário é gravado dentro da transação da
    // empresa/perfil/membership, e o histórico é uma transação à parte. O
    // conserto completo desse caminho (a transação de tenancy ganhar a
    // escrita de auditoria) é uma demanda própria — o port de tenancy tem a
    // sua própria fronteira transacional, e mexer nela é mexer no onboarding.
    // O que este PR garante é o RESTO: e o `registrosDeAuditoria` drena os
    // eventos, então o caminho COM destino também precisa gravá-los.
    if (input.destino !== undefined) {
      for (const registro of this.registrosDeAuditoria(user)) {
        await this.auditService.record(
          {
            entityName: 'User',
            entityId: user.id().value,
            operation: registro.operation as AuditOperation,
            previousVersion: registro.previousVersion,
            newVersion: registro.newVersion,
            snapshot: registro.snapshot,
            reason: registro.reason ?? null,
          },
          ctx,
        );
      }
    }

    // 7. Retornar DTO
    return toUserOutput(user);
  }

  // ----- READ -----

  /**
   * A pessoa pelo id — e, com `includeDeleted`, mesmo apagada.
   *
   * ⚠️ pt-BR (2026-11-17): a opção existe para a rota do ADMIN do SISTEMA,
   * cuja trilha precisa alcançar a pessoa que **saiu** — o soft-delete não
   * apaga a trilha, e sem esta opção o histórico de quem saiu era
   * inalcançável. As outras chamadas seguem sem a opção (e sem a pessoa
   * apagada) — o comportamento delas não muda.
   */
  async obterPorId(
    input: GetUserByIdInput,
    tenantId: string | null,
    options?: FindByIdOptions,
  ): Promise<UserOutput> {
    const id = UserId.create(input.id);
    const user = await this.userRepo.findById(id, tenantId, options);
    if (user === null) {
      throw new ApplicationResourceNotFoundException('User', id.value);
    }
    return toUserOutput(user);
  }

  /**
   * O HISTÓRICO de uma pessoa, lido pelo ADMINISTRADOR DO SISTEMA.
   *
   * ⚠️ É a rota do ADMIN, e não a do DONO. A do DONO (`GET /users/:id/history`)
   * é barrada pelo `UserOwnershipGuard` — o `:id` tem de ser o `sub` do
   * token. Esta existe porque a tela do admin do SISTEMA é de outra pessoa:
   * o admin do sistema não é dono de ninguém, e sem esta rota ele não
   * consegue ler o histórico de ninguém.
   *
   * ⚠️ O PORTÃO É D2 (`tenantId === null && isAdmin`), e ele mora AQUI, na
   * camada de aplicação — não no guard. Quem tem `isAdmin` no perfil efetivo
   * DA EMPRESA DELE (o dono de uma empresa) passa pelo `PermissionsGuard` e
   * chega aqui; o D2 é o que o recusa. Um portão no guard seria o mesmo
   * portão em dois lugares, e o `@RequirePermission` é defense in depth.
   */
  async listarHistoricoDeUsuarioNoSistema(
    input: ListUserHistoryInput,
    ator: AtorAutenticado,
  ): Promise<UserHistoryPageDto> {
    // ⚠️ O PORTÃO D2 É A PRIMEIRA LINHA, antes de qualquer leitura. Recusar
    // depois de ler seria devolver o histórico e o 403 — e o teste negativo
    // (que afirma que o `auditService` NÃO foi chamado) existe para prender
    // esta ordem.
    //
    // ⚠️ E A RECUSA DEIXA RASTRO (2026-11-17): o `Logger` só era chamado no
    // caminho do SUCESSO, e o `GlobalExceptionFilter` só loga a partir de 500 —
    // então a tentativa de ler a trilha alheia por um ator que não é admin
    // ficava numa linha com method/url/status, e sem ator. Agora é um registro
    // com o ATOR e o ALVO — o precedente é o `recusaEscalada`
    // (`profiles.use-cases.ts`), cujo comentário já diz: "uma escalada é 403,
    // então passava sem rastro".
    if (!ehAdministradorDeSistema(ator)) {
      loggerHistorico.warn(
        `leitura recusada: o ator ${paraRegistro(ator.userId)} (escopo ${paraRegistro(ator.tenantId ?? 'sistema')}) tentou ler o histórico da pessoa ${paraRegistro(input.id)}`,
      );
    }
    exigeAdministradorDeSistema(ator, 'só o administrador do sistema lê o histórico de uma pessoa');

    // ⚠️ A EXISTÊNCIA é conferida ANTES da leitura. Sem isto, o histórico de
    // um id inexistente devolveria 200 com uma lista vazia — e "não existe" e
    // "existe mas nunca foi mudado" sairiam IGUAIS, o que transformaria a
    // rota num oráculo de existência para quem não deveria saber.
    //
    // ⚠️ E A EXISTÊNCIA INCLUI A PESSOA APAGADA (2026-11-17). O soft-delete
    // NÃO apaga a trilha: a linha em `users`, a entrada `DELETE` em
    // `users_history` e o `users_archive` continuam lá, visíveis na credencial
    // de sistema. Sem o `includeDeleted`, o histórico de quem SAIU da empresa
    // era inalcançável pela única rota que o lê — que é exatamente o caso que
    // a rota existe para servir.
    //
    // O escopo da busca é o de SISTEMA (`null`): o admin do sistema não
    // pertence a empresa nenhuma, e a pessoa lida pode estar em qualquer uma.
    await this.obterPorId({ id: input.id }, null, { includeDeleted: true });

    const pagina = await this.auditService.listHistory(
      {
        entityName: 'User',
        entityId: input.id,
        cursor: input.cursor ?? null,
        limit: input.limit,
        // ⚠️ A ORDEM é DESCENDENTE: a mais recente primeiro. A ordem é do
        // INPUT porque o cursor anda com ela — e o cursor da API andava para o
        // mais antigo, o que punha a tela de exibir as 100 versões mais
        // ANTIGAS e cortava justamente as mais recentes (as que dizem quando a
        // pessoa mudou pela última vez).
        ordem: 'desc',
      },
      // ⚠️ O escopo da LEITURA é o de SISTEMA (`null`), e não o da empresa do
      // ator. A policy `history_leitura` libera a linha quando
      // `usuario_no_escopo(entity_id)` — e o bucket de SISTEMA é o único que
      // atravessa empresas. Com o escopo errado a leitura volta VAZIA, e
      // "vazia" parece "não tem histórico".
      null,
    );

    // ⚠️ O REGISTRO DA LEITURA. O histórico é dado pessoal (o nome e o e-mail
    // de cada versão da pessoa), e o ATOR entra no registro — sem ele, o log
    // diz que o histórico foi lido, e não por quem.
    // ⚠️ O `:id` e o ATOR vão SANITIZADOS (`paraRegistro`), e não crus: os dois
    // vêm do cliente (o `sub` é assinado por nós, mas a invariante mora em
    // outro arquivo — e um `\n` em qualquer um deles gravaria uma linha de
    // log em branco, ou uma linha que PARECE outra).
    //
    // ⚠️ E O ESCOPO vai junto: ele é o que distingue D2 (`tenantId === null`)
    // de tudo o mais — e o mesmo ator, membro de DUAS empresas, produzia
    // DUAS linhas idênticas para escaladas em empresas diferentes
    // (MEDIDO 2026-11-17, revisão de segurança do PR #171).
    loggerHistorico.log(
      `histórico lido: ${pagina.entries.length} entrada(s) da pessoa ${paraRegistro(input.id)} — ator ${paraRegistro(ator.userId)} (escopo ${paraRegistro(ator.tenantId ?? 'sistema')})`,
    );

    return toUserHistoryPageDto(pagina);
  }

  /**
   * O HISTÓRICO de uma pessoa — lido pelo DONO dela.
   *
   * ⚠️ A rota do DONO (`GET /users/:id/history`) mora AQUI, e não no
   * controller: era a ÚNICA rota do repo que compunha o escopo e chamava o
   * PORT DIRETO do controller — e o `:id` CRU ia para a query sem validação
   * nenhuma (um id que não é uuid dava 500 onde o certo é 400).
   *
   * ⚠️ A ORDEM é ASCENDENTE — e ela é EXPLICITA, e não o default do port: a
   * rota do ADMIN pede `'desc'`, e um copy-paste que invertesse a ordem
   * ninguém notaria sem uma asserção sobre a ordem.
   */
  async listarHistoricoDoUsuario(
    input: ListUserHistoryInput,
    tenantId: string | null,
  ): Promise<UserHistoryPageDto> {
    const id = UserId.create(input.id);
    const pagina = await this.auditService.listHistory(
      {
        entityName: 'User',
        entityId: id.value,
        cursor: input.cursor ?? null,
        limit: input.limit,
        ordem: 'asc',
      },
      tenantId,
    );
    return toUserHistoryPageDto(pagina);
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
    // pt-BR (#106): o perfil efetivo vem por FORA do agregado, indexado por
    // userId. Quem não estiver no map é porque a projeção não foi pedida ou o
    // id não veio da página — `null` é quem não tem perfil.
    const efetivos = page.perfilEfetivo;
    return {
      users: page.users.map((u) => toUserOutputNoEscopo(u, efetivos?.get(u.id().value))),
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
    await this.userRepo.save(user, input.expectedVersion, tenantId, {
      historico: this.registrosDeAuditoria(user),
    });
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
    await this.userRepo.save(user, input.expectedVersion, tenantId, {
      historico: this.registrosDeAuditoria(user),
    });
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
    // ⚠️ (issue #184) O histórico E o arquivo do soft-delete vão na MESMA
    // transação da mutação — eram DUAS antes (o `save` e o `archive` abriam
    // transações diferentes), e um soft-delete sem arquivo é um registro que
    // não volta.
    await this.userRepo.save(user, input.expectedVersion, tenantId, {
      historico: this.registrosDeAuditoria(user),
      arquivo: {
        version: user.version(),
        snapshot: toUserOutput(user) as unknown as Record<string, unknown>,
        reason: input.reason,
      },
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
      // ⚠️ O MOTIVO viaja com o evento: ele era aceito pela API e
      // descartado no caminho (MEDIDO 2026-11-17 na revisão do PR #171), e a
      // trilha de auditoria ficava sem o porquê da restauração.
      user.restaurar(ctx.timestamp, input.reason ?? null);
    } catch (e) {
      this.translateDomainException(e, 'User', id.value);
    }
    await this.userRepo.save(user, input.expectedVersion, tenantId, {
      historico: this.registrosDeAuditoria(user),
    });
    return toUserOutput(user);
  }

  // ----- HELPERS -----

  /**
   * Os REGISTROS de auditoria dos eventos pendentes do agregado — SEM
   * gravá-los.
   *
   * ⚠️ (issue #184) Antes, este método GRAVAVA: cada evento virava uma
   * chamada a `auditService.record`, que abria a SUA transação — e a mutação
   * (o `userRepo.save`) tinha aberto a DELE. MEDIDO: com a auditoria falhando
   * depois (P2002 no unique `(entity_id, version)`), a linha em `users`
   * SOBREVIVIA e o `users_history` ficava com 1 linha de 2 — o estado
   * alterado sem o registro que promete justificar a alteração.
   *
   * Agora os registros viajam DENTRO da escrita (`userRepo.save(…, auditoria)`)
   * e são gravados na MESMA transação da mutação — ou os dois acontecem, ou
   * nenhum.
   */
  private registrosDeAuditoria(user: User): LinhaDeHistoricoDaEscrita[] {
    const events = user.pullEvents();
    return events.map((ev) => {
      const op = mapEventNameToOperation(ev.eventName);
      const previousVersion = extractPreviousVersion(
        ev as unknown as { eventName: string; [k: string]: unknown },
      );
      return {
        // ⚠️ O `cast`: o `AuditOperation` do `shared/audit` é um enum de
        // string (nominal no TypeScript), e o port do usuário declara o mesmo
        // conjunto de valores como união de literais — para o DOMÍNIO do
        // usuário não depender do enum de outro BC.
        operation: op as LinhaDeHistoricoDaEscrita['operation'],
        previousVersion,
        newVersion: user.version(),
        snapshot: toUserOutput(user) as unknown as Record<string, unknown>,
        reason: extractReason(ev as unknown as { eventName: string; [k: string]: unknown }),
      };
    });
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
  // ⚠️ A EXCLUSÃO e a RESTAURAÇÃO: as duas carregam o motivo. Antes, só a
  // exclusão carregava — e o motivo que a API aceitava na restauração era
  // descartado (MEDIDO 2026-11-17 na revisão do PR #171).
  const temMotivo = ev.eventName.endsWith('.deleted.v1') || ev.eventName.endsWith('.restored.v1');
  if (temMotivo && 'reason' in ev) {
    return (ev as unknown as { reason: string | null }).reason;
  }
  return null;
}
