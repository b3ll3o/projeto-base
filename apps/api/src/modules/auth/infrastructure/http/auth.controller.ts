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
import { Throttle } from '@nestjs/throttler';

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
 * Por que o teto GLOBAL do `@nestjs/throttler` (100/min) não serve aqui: ele é
 * por IP, e o ataque de brute force é "muitas senhas contra UM e-mail". Por IP,
 * um atacante distribuído nunca esgota o bucket de nenhum IP seu, e um IP
 * compartilhado de verdade (NAT de escritório, VPN) tranca a rede inteira atrás
 * de um usuário que errou a senha uma vez.
 *
 * Por que 5: é o número que o NIST SP 800-63B sugere para tentativas de
 * autenticação, e o teto mais apertado que serve ao ataque sem travar o
 * usuário legítimo que errou a senha duas vezes.
 *
 * ⚠️ Este número é a restrição que a suíte impõe, e ela a pagou no momento em
 * que o limite entrou. MEDIDO 2026-10-14, com o limite instalado: `users.e2e.spec.ts`
 * fazia 6 logins da MESMA chave `ip:email` (seis `it()` independentes que por
 * acaso compartilhavam `a@b.com`) e o 6º levou 429; o harness e2e gastava um
 * login por `beforeEach` na conta de sessão, com 17 testes vermelhos. As DUAS
 * correções foram nos specs — e-mail próprio por teste, e token reaproveitado —
 * e nenhuma no número. Subir o teto para a suíte passar seria trocar o
 * controle de segurança pela conveniência do teste.
 */
export const LIMITE_LOGIN_POR_MINUTO = 5;
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
  // ⚠️ O `getTracker` é o ponto inteiro deste decorator: sem ele o throttler
  // chaveia por IP, que é o teto global e não o que segura brute force. A
  // chave `ip:email` esgota o bucket DA CONTA que está sendo atacada.
  //
  // MEDIDO, removendo o `getTracker` (o tracker padrão da lib volta a ser o IP):
  // 2 dos 3 testes do `09-rate-limit.e2e.spec.ts` caem. O que morre é o
  // per-conta — a conta B recebe 429 onde esperava 401, porque herdou o bucket
  // que a conta A esgotou. Esse é o teste que separa "limitou por conta" de
  // "limitou por IP", e ele só é o load-bearing DEPOIS que o harness deixou de
  // gastar um login por `beforeEach`: antes da correção, os três caíam no
  // `beforeEach` e a mutação provava o motivo errado (a 5ª tentativa do 1º
  // teste era 429 porque o bucket do IP já vinha gasto pelo bootstrap).
  //
  // `req.body` pode não existir (o throttle roda antes dos pipes, e um corpo
  // ausente é 400 do Zod, não 500 daqui). Fallback para string vazia mantém a
  // chave estável: login sem e-mail conta no bucket compartilhado, o que é o
  // comportamento correto — esse request não é uma tentativa de conta.
  //
  // ⚠️ A chave é `default`, e não um nome próprio como `login`. MEDIDO: com
  // `@Throttle({ login: {...} })` e um `ThrottlerModule.forRoot([{...}])` sem
  // `name`, o header continuava `x-ratelimit-limit: 100` em todo request e o
  // spec caía 3/3 com 401 onde esperava 429 — um decorator que nomeia um
  // throttler inexistente é inerte, e o sintoma é justamente o 429 que nunca
  // chega. Só `default` existe no módulo; o `limit`/`ttl` aqui sobrescrevem os
  // do `forRoot` apenas nesta rota.
  @Throttle({
    default: {
      limit: LIMITE_LOGIN_POR_MINUTO,
      ttl: 60_000,
      getTracker: (req) => {
        const ip = (req.ip ?? req.socket?.remoteAddress ?? 'desconhecido') as string;
        const email =
          typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
        return `${ip}:${email}`;
      },
    },
  })
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
