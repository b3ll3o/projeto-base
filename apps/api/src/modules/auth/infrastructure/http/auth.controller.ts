// apps/api/src/modules/auth/infrastructure/http/auth.controller.ts
//
// Controller HTTP do BC Auth. Camada fina: o controller valida o
// formato com Zod e delega TUDO ao `AuthUseCases`. Nenhuma regra de
// negócio mora aqui.
//
// ── ROTAS (contrato D) ─────────────────────────────────────────────────────
//
//   POST /api/v1/auth/login    pública   → 201 { accessToken, refreshToken, user }
//   POST /api/v1/auth/refresh  pública   → 201 { accessToken, refreshToken }
//   GET  /api/v1/auth/me       sessão    → 200 UserOutput
//
// ── A FASE 6 INSTALOU O GUARD AQUI ─────────────────────────────────────────
//
// Este controller tem o `JwtAuthGuard` na CLASSE (`@UseGuards`), com o
// carve-out por metadata `@Public()` em `login` e `refresh` — as duas
// rotas abertas. É o mesmo desenho do `UsersController`, pelo mesmo
// motivo (ver o bloco em `public.decorator.ts`: um `@UseGuards` no
// método NÃO removeria o guard da classe, e um `APP_GUARD` global
// trocaria o marcador no ponto de uso por uma lista centralizada que
// alguém esquece e a rota nova tranca calada).
//
// ── O QUE FALTAVA ANTES, E O QUE O GUARD CONSERTOU ─────────────────────────
//
// MEDIDO 2026-10-13: sem o `@UseGuards`, o único filtro de `me` era o
// `if (subject === undefined)` dentro do próprio handler. Duas
// consequências, ambas reproduzidas na spec antes de consertar:
//
//   1. UM TOKEN VÁLIDO NÃO FUNCIONAVA — 401. `request.user` é publicado
//      pelo guard; sem guard, nada o escreve, `@CurrentUser()` devolvia
//      `undefined` SEMPRE e a rota rejeitava a sessão legítima. A rota
//      estava inútil, e nenhuma suite de request media isso: o spec
//      antigo (`auth.controller.spec.ts`) instancia o controller na mão,
//      onde não há decorator nem metadata.
//
//   2. O 401 SAIA COM `INVALID_CREDENTIALS` — o código do LOGIN. O
//      cliente voltava ao formulário de senha quando o certo era renovar
//      a sessão; são ações opostas na UI, decididas por uma string.
//
// O `openapi.json` declarava `me` com `security: [{"bearer": []}]` desde
// a Fase 5 — o contrato dizia "exige sessão" enquanto o runtime não
// validava nada do token apresentado. A spec
// `auth.controller.guard.spec.ts` é o que amarra guard e documento.
//
// O `if (subject === undefined)` abaixo NÃO foi removido. Ele virou
// inalcançável para `me`, e continua sendo necessário: `@CurrentUser()`
// é tipado `TokenSubject | undefined` (a rota é `@Public()` em outros
// usos futuros), e `subject.sub` em `undefined` seria TypeError → 500
// num request de leitura. É narrowing, não defesa.

import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { AuthUseCases, AUTH_USE_CASES } from '../../application/auth-use-cases.js';
import { InvalidCredentialsException } from '../../domain/exceptions/auth.exceptions.js';
import type { TokenSubject } from '../../domain/ports/token-issuer.port.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';

/**
 * Tentativas de login por minuto, por conta (`ip:email`).
 *
 * ⚠️ (issue #182) A CONSTANTE e a POLÍTICA do limite do login passaram para
 * `throttle-do-login.ts` — o dono da política. O motivo é o conserto do
 * sec-N1-001: o `@Throttle` da rota usava a chave `'default'`, o MESMO nome
 * do único throttler do módulo, e no `@nestjs/throttler@6.8.0` o decorator
 * SUBSTITUI o valor do módulo na rota (`routeOrClassLimit ??
 * namedThrottler.limit`). MEDIDO com o guard real: 1 IP + 200 e-mails
 * diferentes → 200 requisições permitidas na rota de login, com o teto global
 * por IP em 100 — o decorator não restringia, REMOVIA a restrição.
 *
 * Com o throttler NOMEADO (`'login'`), os dois valem na rota: o global por IP
 * e o de login por `(IP, e-mail)`.
 *
 * O reexport existe porque o spec e2e (`09-rate-limit.e2e.spec.ts`) importa
 * este caminho — e o NÚMERO tem UM dono, importado pelos dois lados.
 */
export { LIMITE_LOGIN_POR_MINUTO } from './throttle-do-login.js';
import { LoginSchema, RefreshSchema, type LoginDto, type RefreshDto } from './auth.schemas.js';

@ApiTags('auth')
// pt-BR: guard na CLASSE. `login` e `refresh` se libertam com `@Public()`,
// que o guard lê via `Reflector` antes de qualquer validação. Sem este
// `@UseGuards`, `GET /auth/me` rejeitava até a sessão legítima — ver o
// bloco "O QUE FALTAVA ANTES" no topo deste arquivo.
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_USE_CASES) private readonly authUseCases: AuthUseCases) {}

  // ───────────────────────── POST /auth/login ─────────────────────────

  @Public()
  // ⚠️ (issue #182, sec-N1-001) O `@Throttle` desta rota SAIU — e a rota
  // continua com o teto do login, que agora vive no throttler NOMEADO
  // `'login'` do `ThrottlerModule.forRoot` (ver
  // `throttle-do-login.ts`, o dono da política).
  //
  // O motivo do conserto: o decorator usava a chave `'default'`, que é o
  // MESMO nome do único throttler do módulo — e no `@nestjs/throttler@6.8.0`
  // o decorator SUBSTITUI o valor do módulo na rota
  // (`routeOrClassLimit ?? namedThrottler.limit`), em vez de virar um bucket
  // novo. MEDIDO com o guard real: na rota de login, 1 IP + 200 e-mails
  // diferentes → 200 requisições permitidas, com o teto global por IP em
  // 100. O decorator não restringia — REMOVIA a restrição que existia.
  //
  // Com o throttler nomeado, os DOIS valem na rota de login: o global por IP
  // (100/min) e o de login por `(IP, e-mail)` (5/min).
  @Post('login')
  @ApiOperation({ summary: 'Autenticar e emitir sessão' })
  // ⚠️ O `RefreshSchema`/`LoginSchema` do Zod NÃO é um decorator do Swagger —
  // e sem o `@ApiBody` o contrato publicado não declara o corpo que a rota
  // exige. O `openapi.json` é versionado, e um contrato que não diz o que a
  // rota pede é um contrato incompleto.
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'senha'],
      properties: {
        email: { type: 'string', format: 'email', example: 'pessoa@example.com' },
        senha: { type: 'string', example: 'uma senha qualquer' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Sessão emitida',
    schema: {
      example: {
        accessToken: 'eyJhbGciOi…',
        refreshToken: 'eyJhbGciOi…',
        user: { id: '0190a8b6-…', nome: 'João', email: 'joao@example.com' },
      },
    },
  })
  // pt-BR: 401 e não 403 — e a mensagem é genérica DE PROPÓSITO (não
  // distingue e-mail inexistente de senha errada). 400 = payload inválido.
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  // ⚠️ 429 entrou no contrato em 2026-10-14, junto com o `@Throttle`. O
  // `openapi.json` versionado listava 201/400/401 — a rota já devolvia 429
  // desde que o limite por conta (`ip:email`) foi instalado, e o contrato
  // continuava calado.
  //
  // ⚠️ (issue #182) O `@Throttle` da rota SAIU (o dono da política é o
  // throttler nomeado `'login'` do módulo), mas o 429 CONTINUA: a rota tem
  // DOIS tetos agora — o global por IP (100/min) e o de login por
  // `(IP, e-mail)` (5/min) — e qualquer um dos dois responde 429.
  @ApiResponse({
    status: 429,
    description: 'Limite de tentativas excedido (global por IP ou de login por `ip:email`)',
  })
  // ⚠️ 423 é a conta TRAVADA por tentativas (o lockout por conta, que é POR
  // CONTA e não por IP) — e é um status diferente do 429 de propósito: um
  // cliente que confunde os dois trata o travamento como "tente de novo em X
  // segundos", quando o que importa é "a conta está travada por 15 minutos".
  @ApiResponse({ status: 423, description: 'Conta bloqueada por tentativas de login' })
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginDto): Promise<unknown> {
    return this.authUseCases.login({ email: body.email, senha: body.senha });
  }

  // ───────────────────────── POST /auth/refresh ───────────────────────

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Renovar a sessão a partir do refresh token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string', example: 'eyJhbGciOi…' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Par de tokens renovado' })
  @ApiResponse({ status: 401, description: 'Refresh token ausente, expirado ou inválido' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto): Promise<unknown> {
    return this.authUseCases.renovar({ refreshToken: body.refreshToken });
  }

  // ───────────────────────── POST /auth/logout ───────────────────────

  // ⚠️ (#132) A rota é `@Public()`, e o refresh token vem no CORPO — o
  // mesmo formato de `/auth/refresh`.
  //
  // O motivo de ser `@Public()`: o refresh token É a credencial do logout.
  // Exigir o access token seria pedir a credencial de quem já tem o
  // equivalente do token que se quer matar — e o access vive 15 minutos,
  // o refresh 7 dias: quem ficou logado mais de 15 min sem usar a API
  // levaria 401 no logout, e o token (que é o que importa) continuaria
  // válido no servidor.
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revogar o refresh token da sessão' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string', example: 'eyJhbGciOi…' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Refresh token revogado' })
  @ApiResponse({ status: 401, description: 'Refresh token ausente, expirado ou inválido' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  async logout(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto): Promise<unknown> {
    // ⚠️ O `revogado` é o que o registro respondeu — e não um `true` fixo.
    // Um token que nunca entrou no registro (ou que já estava revogado)
    // devolve `false`, e a resposta afirma isso.
    const revogado = await this.authUseCases.sair({ refreshToken: body.refreshToken });
    return { revogado };
  }

  // ───────────────────────── GET /auth/me ─────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário da sessão atual' })
  @ApiResponse({ status: 200, description: 'Perfil do usuário autenticado' })
  @ApiResponse({ status: 401, description: 'Sessão ausente ou inválida' })
  async me(@CurrentUser() subject: TokenSubject | undefined): Promise<unknown> {
    // Narrowing, não defesa: atrás do guard, `subject` nunca é `undefined`
    // — o guard valida antes do handler e 401 antes de chegar aqui. Mas
    // `@CurrentUser()` é tipado `TokenSubject | undefined` (o decorator
    // não pode prometer presença: rota `@Public()` que o usasse receberia
    // `undefined`), e `subject.sub` sobre `undefined` seria TypeError →
    // 500 num request de leitura. A exceção dá 401 em vez de 500.
    if (subject === undefined) {
      throw new InvalidCredentialsException();
    }
    return this.authUseCases.eu(subject.sub);
  }
}
