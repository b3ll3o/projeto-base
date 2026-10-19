// apps/api/src/modules/users/infrastructure/http/users.controller.ts
//
// Controller HTTP do BC Users. Camada fina — delega TUDO para os use cases.
//
// pt-BR:
// - Mutating endpoints wrapped em AuditContextStore.run() para que os use
//   cases possam puxar o AuditContext via AuditContextStore.get().
// - Optimistic locking (RFC 7232): parseIfMatch extrai W/"v<n>" do header
//   `If-Match`; divergência vira ApplicationConcurrencyException → 412.
// - ETag (RFC 7232): toda resposta mutante inclui `ETag: W/"v<n>"` para
//   que clientes possam re-enviá-lo no próximo `If-Match` (evita lost-update).
// - Validation (Task 7.4): Zod schemas por rota via
//   `@Body(new ZodValidationPipe(SchemaDoDto))`. Defense-in-depth — os use
//   cases também validam via VOs, mas o boundary HTTP rejeita 400 cedo
//   com mensagem útil para o cliente.

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyAdapter } from '@nestjs/platform-fastify';
import { trace, context } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { UserProfileUseCases } from '../../../profiles/application/profiles.use-cases.js';
import { Public } from '../../../auth/infrastructure/http/public.decorator.js';
import type { TokenSubject } from '../../../auth/domain/ports/token-issuer.port.js';

import { AUDIT_SERVICE_PORT } from '../../../../shared/audit/shared/audit.tokens.js';
import { AuditContextStore } from '../../../../shared/audit/shared/audit-context-store.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import type {
  AuditServicePort,
  ListHistoryInput,
} from '../../../../shared/audit/application/audit-service.port.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { UserOwnershipGuard } from './user-ownership.guard.js';

import { UserId } from '../../domain/value-objects/user-id.vo.js';

import { UserUseCases, USER_USE_CASES } from '../../application/user-use-cases.js';
import type { GetUserByIdInput } from '../../application/dto/get-user-by-id.input.js';
import type { ListUsersInput } from '../../application/dto/list-users.input.js';
import type { RestoreUserInput } from '../../application/dto/restore-user.input.js';
import type { SoftDeleteUserInput } from '../../application/dto/soft-delete-user.input.js';
import type { UpdateUserNameInput } from '../../application/dto/update-user-name.input.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  type CreateUserDto,
  type UpdateUserDto,
} from './users.schemas.js';

// pt-BR: extraído de @nestjs/platform-fastify (TReply do FastifyAdapter)
// porque o pacote 'fastify' não é dep direta de @projeto/api nesta fase.
type FastifyReply = Parameters<FastifyAdapter['setHeader']>[0];

/**
 * Request com o campo `user` publicado pelo `JwtAuthGuard`.
 *
 * pt-BR: `users/` NÃO importa o guard por caminho de arquivo para montar
 * isto — importa o símbolo `TokenSubject` do PORT e o tipo do request aqui.
 * O guard em si é resolvido pelo container (ver o `@UseGuards` da classe).
 * A aresta entre módulos é `users → auth`, um caminho só; importar o
 * arquivo do guard aqui criaria a aresta que o `AuthModule` já satisfaz.
 */
/**
 * `JwtAuthGuard` hidrata `tenantId` e `isAdmin` no `request.user` além do
 * `TokenSubject` — a mesma forma de `RequestComAtor` em `admin-profiles.controller.ts`.
 * É o `tenantId` daqui que vira o escopo de RLS, e ele NÃO vem do corpo nem da
 * query: vem do `X-Tenant-Id` que o guard validou.
 */
interface RequestWithUser {
  user?: TokenSubject & { tenantId?: string | null; isAdmin?: boolean };
}

/**
 * A empresa do ator, ou `null` (bucket de SISTEMA) quando a rota não tem header.
 *
 * `request?.` e não `request.`: o `resolveActorId` logo abaixo já é
 * opcional por decisão (`request?: RequestWithUser`) porque uma rota `@Public()`
 * pode chegar sem request, e um `undefined` aqui virava TypeError — 500 — no
 * meio de um caminho que antes terminava em auditoria sem ator.
 */
function empresaDoAtor(request?: RequestWithUser): string | null {
  return request?.user?.tenantId ?? null;
}

@ApiTags('users')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(USER_USE_CASES) private readonly userUseCases: UserUseCases,
    @Inject(AUDIT_SERVICE_PORT) private readonly auditService: AuditServicePort,
    // pt-BR (2026-10-17): `GET /users` hidrata o perfil para decidir o
    // recorte. Provider do `ProfilesModule`, que `UsersModule` importa.
    // `@Inject` explícito pela mesma razão do `Reflector` no `PermissionsGuard`:
    // `tsx`/esbuild não emite `design:paramtypes`.
    @Inject(UserProfileUseCases) private readonly profiles: UserProfileUseCases,
  ) {}

  // ───────────────────────── POST /users ─────────────────────────
  // Decisão D-2: o cadastro é ABERTO — `POST /users` fica público mesmo
  // com `@UseGuards` na classe. Sem este `@Public()`, aplicar o guard na
  // classe trancaria o cadastro e não existiria mais caminho para criar
  // o primeiro usuário.
  @Public()
  @Post()
  // pt-BR: NÃO PONHA `@ApiBearerAuth()` aqui. No documento OpenAPI a rota
  // pública é a ÚNICA que não declara `security` — e `@ApiBearerAuth()` é o
  // que a faria declarar (defeito medido em 2026-10-13: `openapi.json`
  // anunciava token no cadastro ABERTO, com o runtime correto o tempo todo).
  // Quem trava isso é a spec "o carve-out público sobrevive ao OpenAPI".
  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({
    status: 201,
    description: 'User criado',
    schema: { example: { id: '0190a8b6-…', nome: 'João', email: 'joao@example.com' } },
  })
  @ApiResponse({ status: 409, description: 'Email já em uso' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  async create(
    @Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserDto,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: RequestWithUser,
  ): Promise<unknown> {
    // `POST /users` é `@Public()`: não há ator, e a conta nasce sem empresa —
    // logo o bucket de SISTEMA, que é o único onde "sem empresa" é visível.
    const user = await AuditContextStore.run(this.buildContext(request), () =>
      this.userUseCases.criarUser(body, null),
    );
    reply.header('ETag', `W/"v${user.version}"`);
    reply.status(201);
    return user;
  }

  // ───────────────────────── GET /users ──────────────────────────
  //
  // ⚠️ A rota NÃO tem `@RequirePermission` — o gate mora em `list()`, abaixo, e
  // isso é deliberado. O decorator deny-first matava o produto: a conta
  // recém-cadastrada não tem empresa e não tem perfil, então recebia 403, e
  // `f2-cadastro-sucesso` (que afirma que ela aparece na lista, no browser)
  // ficava VERMELHO com 2 falhas de "element(s) not found". MEDIDO 2026-10-17.
  //
  // O que o furo É: `empresaDoAtor` devolve `null` sem `X-Tenant-Id`, e
  // `escopoDoTenant(null)` é `'*'` — bucket de SISTEMA. Em `'*'`,
  // `usuario_no_escopo` satisfaz a PRIMEIRA cláusula do `OR` e a listagem
  // devolvia a base INTEIRA, atravessando empresas. `POST /users` é `@Public()`,
  // então criar conta e enumerar levava duas chamadas.
  //
  // O que o furo NÃO é: credencial. Um comentário anterior (deste arquivo) e o
  // comentário do revisor no PR afirmavam que a conta voltava "INTEIRA,
  // `password_hash` incluído". É FALSO: `UserOutput`
  // (application/dto/user.output.ts) é um literal de chaves fixas — `id, nome,
  // email, profileId, createdAt, updatedAt, version, deletedAt, isDeleted` — e
  // `user.output.spec.ts:55` afirma a ausência de `passwordHash`. O hash entra
  // no agregado do repositório (`findMany` sem `select`) e SAI no DTO. O que
  // vazava era IDENTIFICAÇÃO cross-tenant: nome, e-mail, `profileId` e
  // timestamps de toda a base.
  //
  // ⚠️ A HIDRATAÇÃO É FEITA AQUI, e não pelo `PermissionsGuard`, e é o ponto
  // mais frágil desta rota. O guard retorna ANTES de hidratar quando não há
  // `@RequirePermission` (permissions.guard.ts:58-60), e o `JwtAuthGuard` só lê
  // um cache que o `GET /me/profile` produz. Sem a chamada abaixo, um cliente
  // que chama a API direto — curl, e2e, outro app — leria cache frio e o
  // `isAdmin` viraria `false` para o ADMIN, que perderia o bypass. Fail-open
  // por omissão de um `await` é exatamente a classe de bug que o guard foi
  // escrito para matar (o comentário dele mede exatamente esse incidente).
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar usuários (paginado por cursor)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    type: String,
    description: 'Aceita "true" ou "1" (case-insensitive). Default: false (esconde soft-deleted)',
  })
  @ApiResponse({ status: 200, description: 'Página de usuários' })
  async list(
    @Req() request: RequestWithUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<unknown> {
    const empresa = empresaDoAtor(request);
    // Read-through: quando o cache está quente é um Map lookup, quando frio são
    // 2 queries que preenchem o cache. O `obterMeuPerfil` NUNCA lança aqui —
    // para conta sem perfil ele devolve o "denied" (perfil nulo, zero
    // permissões), que é o ramo que interessa a esta rota.
    const perfil = await this.profiles.obterMeuPerfil(request?.user?.sub ?? '', empresa);
    // ⚠️ A ordem das condições importa e não é estética. O recorte SÓ vale
    // quando NÃO há empresa (bucket `'*'`, o furo) e o ator NÃO é admin global
    // e NÃO tem `users.read`. Sob escopo de empresa a RLS já devolve só os
    // membros, e um membro da ACME com `users.read` precisa ver o diretório da
    // ACME — não a si mesmo.
    //
    // ⚠️ ESTE RECORTE NÃO VAI PARA A RLS. A proposta aparece a cada revisão
    // ("o bucket '*' deveria ser estreitado no banco"), e ela quebra TRÊS
    // comportamentos que `08-ownership.e2e.spec.ts:204` trava de propósito:
    // (1) quem não tem perfil tem de LER UMA LINHA, a sua — `f2-cadastro-sucesso`
    // afirma a conta recém-cadastrada na tela, e 403 apagava a tela;
    // (2) quem tem `users.read` lê o diretório, mesmo sem empresa;
    // (3) o admin global lê tudo por bypass — o `isAdmin` do seed é global, e uma
    // policy que o escondesse trancaria o admin fora do próprio bucket.
    // Nenhuma delas é bug: é o produto. Mudar aqui é mudança de requisito, com
    // migração de dado junto, não correção de furo.
    // pt-BR (#108 revisão, achado 2): `perfil.isAdmin` NÃO é o único sinal de
    // admin. Com `X-Tenant-Id`, `obterMeuPerfil` resolve o perfil pela
    // MEMBERSHIP (`findProfileId` → só `tenant_memberships`), e o perfil do
    // admin do sistema vive em `users.profile_id`. MEDIDO: o fluxo real devolve
    // `denied { isAdmin: false, permissions: [] }` para o admin global com
    // header — então `semDireito` era verdadeiro, `semVinculo` era verdadeiro,
    // e o admin do sistema era recortado para a PRÓPRIA LINHA em qualquer
    // listagem com header. O sintoma do #102 invertido: negação de acesso
    // legítimo.
    //
    // O token é quem carrega o bypass global, e é o mesmo sinal que o
    // `PermissionsGuard` aceita. `perfil.isAdmin` continua sendo consultado
    // porque cobre o admin CUJO perfil resolve (o da própria empresa).
    const isAdminGlobal = request?.user?.isAdmin === true;
    const semDireito =
      perfil.isAdmin !== true && !isAdminGlobal && !perfil.permissions.includes('users.read');
    //
    // ⚠️ (issue #102) `perfil.profileId === null` significa que `findProfileId`
    // NÃO resolveu perfil para o escopo pedido — e o banco só não resolve quando
    // não há `tenant_memberships` ligando a conta àquela empresa. É a resposta a
    // "o ATOR pertence a essa empresa?", que a RLS nunca fez:
    // `usuario_no_escopo(alvo)` pergunta pelo ALVO
    // (`EXISTS(… WHERE m.user_id = alvo AND m.tenant_id = escopo_atual())`), e o
    // `JwtAuthGuard` valida o FORMATO do uuid do header sem consultar membership.
    // Logo o header é capacidade declarada pelo cliente.
    //
    // ⚠️ (achado 7) O NOME `semVinculo` afirma mais do que o dado sustenta:
    // `profileId === null` é verdade tanto para "não pertence a esta empresa"
    // quanto para "pertence e ainda não tem perfil". Os dois colapsam aqui.
    // O conserto do admin (acima) torna essa ambiguidade INOFENSIVA para o
    // recorte — quem pertence sem perfil e não tem `users.read` é recortado
    // pelos dois caminhos —, mas o nome continua mentindo e a próxima pessoa vai
    // raciocinar errado por ele. Fica anotado aqui em vez de renomeado porque
    // renomear o sinal sem trocar a semântica seria cosmetismo.
    //
    // MEDIDO antes do conserto (sessão `app_runtime`, escopo de empresa válida,
    // transação commitada, conta sem nenhuma membership):
    //
    //   X-Tenant-Id: <ACME>  → HTTP 200 · 2 usuarios  → ana@…, carla@…
    //   X-Tenant-Id: <HEX>   → HTTP 200 · 1 usuario   → bruno@…
    //
    // Com `semVinculo`, o recorte dispara nesses casos e a resposta é a própria
    // linha — que é o mesmo tratamento que a conta sem header já recebia.
    //
    // ⚠️ POR QUE ISSO NÃO FECHA SOZINHO, E O QUE SOBRA: a invariante de que
    // NENHUMA rota deve abrir escopo a partir de um header não conferido vale
    // para as 24 rotas da API, e é mudança de contrato — decisão de produto, não
    // correção. Aqui o efeito é contido por `semDireito`; numa rota `admin.*` (que
    // exige `users.read` ou `isAdmin`) um header alheio sem vínculo já falha no
    // `PermissionsGuard`, porque o perfil resolve `denied`. Ver a issue #102.
    const semVinculo = perfil.profileId === null;
    const input: ListUsersInput = {
      cursor: cursor ?? null,
      limit: Number(limit),
      // pt-BR: normaliza case (clients podem mandar 'True'/'TRUE'/'1') +
      // aceita os dois valores truthy canônicos ('true' e '1').
      includeDeleted: includeDeleted?.toLowerCase() === 'true' || includeDeleted === '1',
      somenteUsuarioId:
        (empresa === null || semVinculo) && semDireito ? (request?.user?.sub ?? null) : null,
    };
    // pt-BR (#108 revisão, achado 10): só esta rota pede a projeção — é a que a
    // tela `/admin/users` consome. As demais não pagariam uma transação extra
    // por página para um campo que ninguém renderiza.
    return this.userUseCases.listar(input, empresa, true);
  }

  // ───────────────────────── GET /users/:id ──────────────────────
  @Get(':id')
  @UseGuards(UserOwnershipGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  @ApiResponse({ status: 200, description: 'User encontrado' })
  @ApiResponse({
    status: 403,
    description: 'O `:id` da rota não é o `sub` do token (USER_OWNERSHIP_VIOLATION)',
  })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  async findOne(@Param('id') id: string, @Req() request: RequestWithUser): Promise<unknown> {
    const input: GetUserByIdInput = { id };
    return this.userUseCases.obterPorId(input, empresaDoAtor(request));
  }

  // ───────────────────────── PATCH /users/:id ───────────────────
  @Patch(':id')
  @UseGuards(UserOwnershipGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renomear usuário (optimistic locking via If-Match)' })
  @ApiResponse({
    status: 403,
    description: 'O `:id` da rota não é o `sub` do token (USER_OWNERSHIP_VIOLATION)',
  })
  @ApiHeader({
    name: 'If-Match',
    required: true,
    description: 'ETag esperado no formato W/"v<n>"',
  })
  @ApiResponse({ status: 200, description: 'User renomeado' })
  @ApiResponse({ status: 400, description: 'Header If-Match ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  @ApiResponse({ status: 412, description: 'Conflito de versão (optimistic lock)' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUserDto,
    @Headers('if-match') ifMatch: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: RequestWithUser,
  ): Promise<unknown> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const input: UpdateUserNameInput = {
      id,
      novoNome: body.novoNome,
      expectedVersion,
    };
    const user = await AuditContextStore.run(this.buildContext(request), () =>
      this.userUseCases.atualizarNome(input, empresaDoAtor(request)),
    );
    reply.header('ETag', `W/"v${user.version}"`);
    return user;
  }

  // ───────────────────────── DELETE /users/:id ──────────────────
  @Delete(':id')
  @UseGuards(UserOwnershipGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete do usuário (optimistic locking via If-Match)' })
  @ApiResponse({
    status: 403,
    description: 'O `:id` da rota não é o `sub` do token (USER_OWNERSHIP_VIOLATION)',
  })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiResponse({ status: 204, description: 'User soft-deletado' })
  @ApiResponse({ status: 400, description: 'Header If-Match ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  @ApiResponse({ status: 412, description: 'Conflito de versão' })
  async remove(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const input: SoftDeleteUserInput = {
      id,
      reason: null,
      expectedVersion,
    };
    await AuditContextStore.run(this.buildContext(request), () =>
      this.userUseCases.softDelete(input, empresaDoAtor(request)),
    );
  }

  // ───────────────────────── POST /users/:id/restore ────────────
  @Post(':id/restore')
  @UseGuards(UserOwnershipGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restaurar usuário soft-deletado (optimistic locking)' })
  @ApiResponse({
    status: 403,
    description: 'O `:id` da rota não é o `sub` do token (USER_OWNERSHIP_VIOLATION)',
  })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiResponse({ status: 201, description: 'User restaurado' })
  @ApiResponse({ status: 400, description: 'Header If-Match ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  @ApiResponse({ status: 412, description: 'Conflito de versão' })
  async restore(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: RequestWithUser,
  ): Promise<unknown> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const input: RestoreUserInput = { id, expectedVersion };
    const user = await AuditContextStore.run(this.buildContext(request), () =>
      this.userUseCases.restaurar(input, empresaDoAtor(request)),
    );
    reply.header('ETag', `W/"v${user.version}"`);
    reply.status(201);
    return user;
  }

  // ───────────────────────── GET /users/:id/history ─────────────
  @Get(':id/history')
  @UseGuards(UserOwnershipGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Histórico de auditoria do usuário' })
  @ApiResponse({
    status: 403,
    description: 'O `:id` da rota não é o `sub` do token (USER_OWNERSHIP_VIOLATION)',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Histórico paginado' })
  async history(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
    @Req() request?: RequestWithUser,
  ): Promise<unknown> {
    const input: ListHistoryInput = {
      entityName: 'User',
      entityId: id,
      cursor: cursor ?? null,
      limit: Number(limit),
    };
    // pt-BR (Fase 10+): o escopo vem do MESMO header que escopa as mutações.
    // Sem ele a leitura cai em SISTEMA e devolve o histórico cross-tenant — que
    // é o elo 1 da escalada fechada na migration `20261020000002`.
    return this.auditService.listHistory(input, empresaDoAtor(request));
  }

  // ───────────────────────── helpers ─────────────────────────────

  /**
   * pt-BR: parseia `If-Match: W/"v<n>"` em número.
   * Lança `BadRequestException` (RFC 7807 via GlobalExceptionFilter)
   * para header ausente ou formato inválido. Case-insensitive em W/
   * e tolerante a whitespace externo.
   */
  private parseIfMatch(raw: string | undefined): number {
    if (!raw || raw.trim() === '') {
      throw new BadRequestException({
        code: 'IF_MATCH_REQUIRED',
        detail: 'Header If-Match ausente. Forneça W/"v<n>" para optimistic locking.',
      });
    }
    const match = /^W\/"v(\d+)"$/i.exec(raw.trim());
    if (!match) {
      throw new BadRequestException({
        code: 'IF_MATCH_INVALID',
        detail: 'Header If-Match inválido. Esperado W/"v<n>" (versão numérica).',
      });
    }
    return Number(match[1]);
  }

  /**
   * pt-BR: monta o AuditContext a partir da request.
   *
   * `actorId` é o `sub` do token (o id do usuário) — é o que o
   * `PrismaAuditService` grava em `users_history.changed_by` e
   * `users_archive.deleted_by`. Antes da Fase 6 era `null` hardcoded,
   * porque não havia de onde tirar a identidade; agora o `JwtAuthGuard`
   * a publica em `request.user` e a auditoria fica atribuída.
   *
   * `correlationId` é W3C-compliant quando há um span OTel ativo no
   * contexto (32 chars hex minúsculos), correlacionando audit com
   * traces no backend OTel. Fallback para `randomUUID()` mantém compat
   * com testes e callers fora de uma span ativa — o VO AuditContext
   * rejeita correlationId vazio.
   *
   * ── POR QUE O `sub` PASSA PELO VO `UserId` ──────────────────────────────
   *
   * `changed_by` é `@db.Uuid` no Postgres. Um `sub` que não seja UUID
   * faria o INSERT estourar na camada de dados — um 500 num request que
   * deveria ter sido gravado. O `sub` vem de um token que NÓS assinamos,
   * então hoje ele sempre é um `UserId` (UUID v7); a validação existe
   * para o caso em que o emissor mudar, e o efeito do descasamento é
   * `actorId: null` (auditoria sem ator) em vez de 500.
   *
   * A validação é a DO VO, não uma regex reescrita aqui: o limite fica
   * num lugar só.
   */
  private buildContext(request?: RequestWithUser): AuditContext {
    const span = trace.getSpan(context.active());
    const w3cTraceId = span?.spanContext().traceId;
    return new AuditContext({
      actorId: this.resolveActorId(request),
      correlationId: w3cTraceId ?? randomUUID(),
      source: 'http',
      timestamp: new Date(),
      // pt-BR (Fase 10+): o mesmo header que escopa as mutações escopa a
      // auditoria delas. Sem isto, `record()`/`archive()` gravam sob SISTEMA e
      // as policies de `users_history`/`users_archive` leem isso como "vejo tudo".
      tenantId: empresaDoAtor(request),
    });
  }

  /**
   * Extrai o `sub` do token para `actorId`, ou `null` se não houver
   * ator válido. `undefined` numa rota `@Public()` (POST /users sem
   * token) e num `sub` malformado dão o mesmo resultado: auditoria sem
   * ator, nunca exceção.
   */
  private resolveActorId(request?: RequestWithUser): string | null {
    const sub = request?.user?.sub;
    if (typeof sub !== 'string' || sub.trim() === '') {
      return null;
    }
    try {
      return UserId.create(sub).value;
    } catch {
      return null;
    }
  }
}
