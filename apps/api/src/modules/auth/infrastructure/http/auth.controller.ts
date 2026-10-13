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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { AuthUseCases, AUTH_USE_CASES } from '../../application/auth-use-cases.js';
import { InvalidCredentialsException } from '../../domain/exceptions/auth.exceptions.js';
import type { TokenSubject } from '../../domain/ports/token-issuer.port.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';
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
  @Post('login')
  @ApiOperation({ summary: 'Autenticar e emitir sessão' })
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
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginDto): Promise<unknown> {
    return this.authUseCases.login({ email: body.email, senha: body.senha });
  }

  // ───────────────────────── POST /auth/refresh ───────────────────────

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Renovar a sessão a partir do refresh token' })
  @ApiResponse({ status: 201, description: 'Par de tokens renovado' })
  @ApiResponse({ status: 401, description: 'Refresh token ausente, expirado ou inválido' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto): Promise<unknown> {
    return this.authUseCases.renovar({ refreshToken: body.refreshToken });
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
