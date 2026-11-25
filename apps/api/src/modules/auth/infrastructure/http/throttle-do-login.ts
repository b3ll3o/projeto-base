// apps/api/src/modules/auth/infrastructure/http/throttle-do-login.ts
//
// O DONO da política de throttling do login (issue #182, sec-N1-001).
//
// ── O QUE ESTE ARQUIVO FECHA ────────────────────────────────────────────────
//
// O `@Throttle` da rota de login usava a chave `'default'` — o MESMO nome do
// único throttler declarado no `ThrottlerModule.forRoot`. No
// `@nestjs/throttler@6.8.0` o guard resolve o limite da rota com
// `routeOrClassLimit ?? namedThrottler.limit` — ou seja, o decorator da rota
// SUBSTITUÍ o valor do módulo, em vez de virar um SEGUNDO bucket.
//
// MEDIDO com o guard real (`throttler.guard.js` da 6.8.0): na rota de login,
// 1 IP + 200 e-mails DIFERENTES → 200 requisições permitidas (o teto global
// por IP é 100); numa rota SEM `@Throttle`, 200 requisições → 100 permitidas.
// Ou seja: o `@Throttle` do login não restringia — REMOVIA a restrição que
// existia.
//
// Cada tentativa de login paga um argon2id verify de ~250 ms com 64 MiB de
// memória, então 200 tentativas de um IP só são 200 verifies.
//
// ── A CORREÇÃO: DOIS BUCKETS, E O GLOBAL CONTINUA VALENDO ─────────────────
//
// O módulo declara DOIS throttlers:
//
//   - `'default'` — o teto GLOBAL por IP (100/min). Nenhuma rota o desliga.
//   - `'login'`   — o teto do login (5/min), com `skipIf` para não contar as
//                   outras rotas.
//
// Na rota de login valem os DOIS: o global por IP (100/min) E o de login por
// `(IP, e-mail)` (5/min). Fora do login, só o global.
//
// ⚠️ O `skipIf` é do THROTTLER NOMEADO, e é por ele que o bucket de login
// não conta as outras rotas: sem ele, o bucket `'login'` contaria TODAS as
// requisições da api, e o teto de 5/min viraria um limite global de 5/min.
//
// ⚠️ A IDENTIFICAÇÃO DA ROTA é por MÉTODO + PATH, e não pelo nome do método
// do handler (`context.getHandler().name`): o nome do método é um detalhe
// da implementação, e renomear o handler mudaria o comportamento do
// throttling sem ninguém perceber.
//
// ── POR QUE A CHAVE É `(IP, e-mail)` E NÃO SÓ O e-mail ────────────────────
//
// O limite por IP é o que segura o DO SPRAYING (uma senha comum contra
// 1000 e-mails): com a chave só por e-mail, o limite por conta não existiria
// e o spraying passaria. E o limite por conta (o lockout, no
// `login-lockout.port.ts`) é o que segura o ATAQUE DIRIGIDO a uma conta.
//
// ⚠️ O tracker é o MESMO de antes — `ip:e-mail` — e ele é lido ANTES dos
// pipes (o throttle roda antes da validação), então `req.body` pode não
// existir: um login sem e-mail cai no bucket compartilhado (`ip:`), que é o
// comportamento correto — esse request não é uma tentativa de conta.

import type { ExecutionContext } from '@nestjs/common';

/**
 * O teto do login: 5 requisições por minuto para o MESMO par (IP, e-mail).
 *
 * ⚠️ Este número é a restrição que a suíte impõe, e ela a pagou no momento em
 * que o limite entrou. MEDIDO em 2026-10-14, com o limite instalado: o
 * `users.e2e.spec.ts` fazia 6 logins da MESMA chave `ip:email` (seis `it()`
 * independentes que por acaso compartilhavam `a@b.com`) e o 6º levou 429; o
 * harness e2e gastava um login por `beforeEach` na conta de sessão, com 17
 * testes vermelhos. As DUAS correções foram nos specs — e-mail próprio por
 * teste, e token reaproveitado — e nenhuma no número. Subir o teto para a
 * suíte passar seria trocar o controle de segurança pela conveniência do
 * teste.
 *
 * ⚠️ O número é o mesmo do NIST SP 800-63B (5 tentativas), e são DUAS coisas
 * diferentes: este é o teto por `(IP, e-mail)` (a REQUISIÇÃO), e o do NIST é
 * por conta (a TENTATIVA contra a mesma conta) — o segundo é o
 * `LIMITE_DE_TENTATIVAS_DE_LOGIN`, no `login-lockout.port.ts`.
 */
export const LIMITE_LOGIN_POR_MINUTO = 5;

/** A janela do limite de login, em milissegundos. */
export const JANELA_LOGIN_MS = 60_000;

/**
 * O caminho da rota de login, SEM o prefixo global.
 *
 * ⚠️ O prefixo global (`api/v1`) é um detalhe do `main.ts` — o path do
 * controller (`auth/login`) é o que a rota tem. A comparação usa o FIM do
 * caminho, para não depender do prefixo.
 */
export const CAMINHO_DE_LOGIN = '/auth/login';

/** O método HTTP da rota de login. */
export const METODO_DE_LOGIN = 'POST';

/**
 * A chave do balde de login: `(IP, e-mail)`.
 *
 * O e-mail é NORMALIZADO (trim + toLowerCase) — o mesmo tratamento que o
 * `Email.create` faz no login, para que ` Joao@Example.com ` e
 * `joao@example.com` caiam no MESMO balde.
 */
export function trackerDoLogin(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  body?: { email?: unknown };
}): string {
  const ip = (req.ip ?? req.socket?.remoteAddress ?? 'desconhecido') as string;
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return `${ip}:${email}`;
}

/**
 * O `skipIf` do throttler `'login'`.
 *
 * Devolve `true` (= "esta rota NÃO é o login" = o bucket de login não conta
 * esta requisição) para tudo que não for o login.
 */
export function foraDaRotaDeLogin(context: ExecutionContext): boolean {
  const requisicao = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
  const metodo = requisicao.method ?? '';
  const url = requisicao.url ?? '';
  if (metodo !== METODO_DE_LOGIN) return true;
  return !url.endsWith(CAMINHO_DE_LOGIN);
}
