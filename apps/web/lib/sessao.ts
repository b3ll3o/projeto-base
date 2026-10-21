// apps/web/lib/sessao.ts
//
// Sessão do web: JWT Bearer stateless na API, tokens guardados em cookie
// httpOnly no browser.
//
// pt-BR — o desenho e o porquê.
//
// A API autentica com JWT e não guarda sessão em lugar nenhum. O web
// guarda os DOIS tokens (access e refresh) em cookies httpOnly. Guardar em
// `localStorage` seria criar uma exceção de XSS sem nenhum ganho: neste app
// o browser NUNCA fala com a API — todo o tráfego é server-side, via Server
// Action — e o `localStorage` é legível por qualquer script da página, ao
// passo que o cookie httpOnly não é. Um token em `localStorage` é um token
// roubável por um XSS; em cookie httpOnly, não.
//
// São DOIS tokens porque têm prazos diferentes (contrato (F): access 15min,
// refresh 7d) e porque os usos são diferentes: o access vai em todo
// `Authorization: Bearer`, o refresh só serve para renovar o access. Por
// isso o refresh não abre porta nenhuma — `exigirSessao()` olha
// exclusivamente o access (ver o teste "refresh token sozinho NÃO abre a
// porta").
//
// ⚠️ Decisão em aberto, nomeada de propósito: os cookies são de SESSÃO (sem
// `maxAge`), então fechar o browser encerra a sessão. Nenhum prazo é
// duplicado aqui porque o web não conhece o TTL da API — e um número
// copiado nos dois lados envelhece em um deles só. Quando o fluxo de refresh
// entrar, o `maxAge` deve ser lido de config, não hardcoded.
//
// pt-BR (onde cada função pode ser chamada): `cookies()` só pode ESCREVER
// dentro de Server Action ou Route Handler. `guardarTokens` e `limparSessao`
// só podem ser chamadas de lá; `lerTokens` e `exigirSessao` leem, e leitura
// funciona em qualquer lugar do servidor. No Next 15 `cookies()` é ASSÍNCRONO
// — por isso todo acesso aqui passa por `await`.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const COOKIE_ACCESS = 'access_token';
export const COOKIE_REFRESH = 'refresh_token';
/** pt-BR (Fase 3): a empresa selecionada. NÃO é httpOnly — o id da empresa
 *  não é segredo, e um cookie httpOnly obrigaria toda troca de empresa a
 *  passar por Server Action. Sem token não há sessão, e o header só é lido
 *  depois da autenticação. */
export const COOKIE_TENANT = 'tenant_id';

/**
 * Atributos do cookie de sessão.
 *
 * pt-BR: `httpOnly` é o que segura o desenho inteiro — é ele que impede o
 * JavaScript da página de ler o token. `sameSite: 'lax'` segura o envio em
 * navegações originadas por outro site. `path: '/'` é obrigatório para o
 * cookie valer nas rotas aninhadas (`/users`, `/users/novo`): um path
 * estreito produziria uma sessão que funciona na tela de login e morre na
 * listagem, que é o tipo de defeito que só se vê em produção.
 *
 * A função é avaliada a CADA chamada em vez de ser uma constante de módulo,
 * e isso é para que `secure` acompanhe o ambiente em runtime — e para que o
 * teste consiga exercitar os dois lados.
 */
function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  };
}

/** Grava os dois tokens. Só pode ser chamada de Server Action/Route Handler. */
export async function guardarTokens(accessToken: string, refreshToken: string): Promise<void> {
  const store = await cookies();
  const opcoes = opcoesCookie();

  store.set(COOKIE_ACCESS, accessToken, opcoes);
  store.set(COOKIE_REFRESH, refreshToken, opcoes);
}

export interface Tokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/** Lê os dois tokens. Ausente é `null` — nunca `undefined` — para casar com
 *  a assinatura de `ApiClientConfig.getToken`. */
export async function lerTokens(): Promise<Tokens> {
  const store = await cookies();

  return {
    accessToken: store.get(COOKIE_ACCESS)?.value ?? null,
    refreshToken: store.get(COOKIE_REFRESH)?.value ?? null,
  };
}

/**
 * pt-BR (Fase 3 — tenancy, 2026-10-16): a empresa escolhida na sessão.
 * Só pode GRAVAR de Server Action.
 */
export async function guardarTenant(tenantId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_TENANT, tenantId, {
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Apaga a empresa escolhida — SEM tocar nos tokens.
 *
 * pt-BR (onboarding de empresa, 2026-10-21): o login grava a empresa quando
 * descobre uma, e APAGA quando descobre que a conta não tem empresa nenhuma.
 * Sem apagar, o cookie de uma sessão anterior sobrevive ao login — e o
 * administrador de sistema, que não pertence a empresa nenhuma, passaria a
 * levar 403 `TENANT_MEMBERSHIP_REQUIRED` na tela principal, sem caminho para
 * sair. É o mesmo motivo de `limparSessao` apagar a empresa, sem o resto.
 */
export async function limparTenant(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_TENANT);
}

/**
 * pt-BR (Fase 3): a empresa escolhida. Ausente ou vazio → `null`, e o
 * `ApiClient` OMITE o header — mandar string vazia seria 400 do outro lado.
 */
export async function lerTenant(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_TENANT)?.value || null;
}

/**
 * Devolve o access token, ou manda a pessoa para o login.
 *
 * pt-BR: o token volta para que o chamador monte o `ApiClient` com
 * `getToken: () => token`. Um cookie VAZIO conta como ausente de propósito:
 * é o estado que sobra de um cookie expirado que o browser ainda envia, e
 * tratá-lo como sessão resultaria em `Authorization: Bearer ` sem nada
 * depois — a tela protegida existiria e nunca deixaria entrar ninguém.
 */
export async function exigirSessao(): Promise<string> {
  const { accessToken } = await lerTokens();

  if (!accessToken) {
    redirect('/login');
  }

  return accessToken;
}

/**
 * Apaga a sessão inteira: os dois tokens E a empresa escolhida.
 * Só pode ser chamada de Server Action/Route Handler.
 *
 * pt-BR (Fase 3, achado da revisão): a empresa é estado de sessão, não
 * preferência permanente. Deixá-la sobreviver ao logout faz o estado de
 * empresa atravessar a fronteira de sessão — A escolhe ACME, sai, B entra no
 * mesmo browser e sai declarando `X-Tenant-Id: ACME`.
 */
export async function limparSessao(): Promise<void> {
  const store = await cookies();

  store.delete(COOKIE_ACCESS);
  store.delete(COOKIE_REFRESH);
  store.delete(COOKIE_TENANT);
}
