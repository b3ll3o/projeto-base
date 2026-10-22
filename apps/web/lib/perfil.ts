// apps/web/lib/perfil.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): cliente da API de profiles
// (server-side). Usado por:
//   - layout/sidebar condicional (`isAdmin`)
//   - páginas admin (`/admin/profiles`, `/admin/users`)
//   - `/me/profile`
//
// Segue o mesmo padrão de `api-client.ts` (server-side, tokens via
// `getToken` seam).
//
// pt-BR (#97): este arquivo deixou de chamar rotas que não existem. Não há
// `GET /admin/profiles/:id/authorizations`, não há `PUT .../authorizations`
// e não há `DELETE /admin/users/:id/profile` — as três davam 404 em tempo
// de execução com a suíte verde. O `:id` de tudo aqui é UUID; o slug que o
// admin digita na URL entra só por `obterPerfilPorSlug`, que o resolve
// antes de chamar a API.

import { ApiClient, ApiError } from './api-client';
import { exigirSessao, lerTenant, lerTokens } from './sessao';
import type {
  AssignProfileInputDto,
  CreateProfileInputDto,
  MeProfileDto,
  ProfileDetail,
  ProfileSummary,
  UpdateProfileInputDto,
} from '@projeto/shared-types';

async function getClient(): Promise<ApiClient> {
  const accessToken = await exigirSessao();
  const tenantId = await lerTenant();
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
    // pt-BR (Fase 3): `/me/profile` é por empresa — sem o header a API
    // responde no bucket `null` e o perfil mostrado é sempre o global.
    getTenant: () => tenantId,
  });
}

/**
 * Versão tolerante: NÃO chama `exigirSessao()` (que redireciona) — em vez
 * disso lê os cookies direto. Se não há token, devolve `null` em vez de jogar
 * `NEXT_REDIRECT`. Serve para componentes que não devem forçar login só por
 * estarem no layout (ex.: Sidebar) — o login de verdade é responsabilidade
 * da página, não o chrome.
 *
 * `tenantScoped = false` monta `getTenant` devolvendo `null` — e o `ApiClient`
 * só manda o header quando o valor existe (`api-client.ts:66-67`), então o
 * `/me/profile` responde no bucket global. Ver `obterMeuPerfilGlobal`.
 */
async function getClientOpcional(tenantScoped = true): Promise<ApiClient | null> {
  const { accessToken } = await lerTokens();
  if (accessToken === null) return null;
  const tenantId = tenantScoped ? await lerTenant() : null;
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
    getTenant: () => tenantId,
  });
}

/**
 * O cliente com um token JÁ CONHECIDO, no bucket GLOBAL.
 *
 * pt-BR (onboarding de empresa, 2026-10-21): existe para o LOGIN, que tem o
 * token na mão e ainda não tem cookie. O `getTenant` devolve `null` — e o
 * `ApiClient` só manda o header quando o valor existe (`api-client.ts:66-67`),
 * então o `/me/profile` responde no bucket global, que é o que a função
 * promete.
 */
function clientDoToken(accessToken: string): ApiClient {
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
    getTenant: () => null,
  });
}

/**
 * Perfil do ator no tenant da sessão.
 *
 * pt-BR (#107, 2026-10-18): o `catch` deixou de ser `catch {}`.
 *
 * Antes, 401, 403, 5xx, timeout e rede caída devolviam o MESMO `null` do
 * "não sou admin". As quatro telas `/admin/*` leem `null` como veredito
 * (`me === null || me.isAdmin !== true` → "Esta página exige perfil de
 * administrador"), então uma administradora legítima com a API caída recebia
 * uma tela afirmando o contrário — e um 403 real recebia a mesma.
 *
 * O que muda aqui é o que NÃO é dissolvido:
 *
 * - **sem sessão** (não há token) → `null`. Não é erro: é ausência de sessão.
 * - **401** → `null`. Token expirado (15 min) é o mesmo estado observável de
 *   "não autenticado" para quem só tem o token em cookie. Propagar aqui
 *   transformaria "saiu do login" em erro de página.
 * - **403 e todo o resto** → propaga. A decisão é de quem chamou: redirecionar,
 *   dizer "acesso restrito" ou oferecer retry são três respostas diferentes
 *   para três causas diferentes, e nenhuma delas é `null`.
 *
 * ⚠️ Quem chama decide o que fazer com a propagação, e os dois chamadores
 * decidem diferente — de propósito:
 *
 *   - o guard de `/admin/*` (`app/admin/guard-admin.tsx`) DISTINGUE os casos,
 *     porque é quem tem o que fazer com a diferença;
 *   - o `Sidebar` ENGOLE, porque é chrome: ele é renderizado pelo layout de
 *     todas as telas, e uma exceção ali derruba páginas que não têm nada a ver
 *     com perfil (MEDIDO: sem o `catch` dele, os e2e F1 e F5 caíram).
 *
 * O padrão de 401 já existia no repo em `app/users/page.tsx`
 * (`err instanceof ApiError && err.status === 401` → `redirect('/login')`); o
 * que faltava era este arquivo parando de esconder o resto.
 */
export async function obterMeuPerfil(): Promise<MeProfileDto | null> {
  // `getClientOpcional()` devolve `null` (não lança) quando não há token, e
  // propaga se a leitura do cookie falhar — que é infraestrutura, não sessão
  // ausente. Por isso não há `try` em volta: um catch que só relança seria
  // `no-useless-catch`, e o comportamento seria idêntico sem ele.
  const client = await getClientOpcional();
  if (client === null) return null;

  try {
    return await client.get<MeProfileDto>('/me/profile');
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 401) return null;
    throw erro;
  }
}

/**
 * O MESMO perfil, lido no bucket GLOBAL — o que a tela de feature flags
 * precisa, e o que `obterMeuPerfil` **não** devolve.
 *
 * Por que existe (achado A, revisão adversarial 2026-10-18): os dois `isAdmin`
 * não são a mesma pessoa. O da empresa é o perfil de GERENTE (todo gerente de empresa
 * nova nasce com `isAdmin: true`, `prisma-tenant-onboarding.repository.ts:202`);
 * o global é o do bucket de sistema. D2 exige o **global**
 * (`ehAdministradorDeSistema`: `tenantId === null && isAdmin`). Autorizar por
 * `obterMeuPerfil` usava um sinal que a API não usa — e, com `X-Tenant-Id` no
 * cookie, o próprio pedido levava 403 `TENANT_MEMBERSHIP_REQUIRED` antes de
 * chegar lá.
 *
 * ⚠️ O token pode chegar por PARÂMETRO (onboarding de empresa, 2026-10-21).
 * Quem chama é o LOGIN, que acabou de RECEBER o token da API e ainda não tem
 * cookie nenhum — depender do store do Next devolver um cookie recém-escrito
 * é a mesma fragilidade que `lib/empresas.ts` documenta. Sem o parâmetro, o
 * comportamento é o de sempre: o token vem do cookie.
 */
export async function obterMeuPerfilGlobal(accessToken?: string): Promise<MeProfileDto | null> {
  const client =
    accessToken === undefined ? await getClientOpcional(false) : clientDoToken(accessToken);
  if (client === null) return null;

  try {
    return await client.get<MeProfileDto>('/me/profile');
  } catch (erro) {
    // A MESMA política de `obterMeuPerfil` — e é a do #107, não a que existia
    // quando esta função nasceu. Só o 401 vira `null`; 403, 5xx, timeout e rede
    // sobem. O `catch { return null }` original jurava a mesma política e
    // mentia depois do #108: a tela de flags lê `null` como veredito
    // (`me === null || me.isAdmin !== true` → "acesso restrito"), então uma
    // administradora do SISTEMA com a API fora do ar recebia a tela afirmando
    // o contrário — o defeito que o #107 existe para matar, reintroduzido por
    // um merge. O que sobe aqui é tratado por `app/error.tsx`.
    if (erro instanceof ApiError && erro.status === 401) return null;
    throw erro;
  }
}

export async function listarPerfis(): Promise<ProfileSummary[]> {
  const client = await getClient();
  return client.get<ProfileSummary[]>('/admin/profiles');
}

/** Detalhe por UUID. `id` NÃO é slug — a API faz `findById`. */
export async function obterPerfil(id: string): Promise<ProfileDetail> {
  const client = await getClient();
  return client.get<ProfileDetail>(`/admin/profiles/${id}`);
}

/**
 * Resolve o slug da URL (`/admin/profiles/[slug]`) no UUID que a API exige.
 * Devolve `null` se o slug não existir — a página traduz para `notFound()`.
 *
 * `null` e não `throw`: o "não existe" é uma resposta legítima desta função,
 * e a página é quem decide virar 404. Um `Error` puro escapava de qualquer
 * `catch` que procurasse `ApiError`, e o 404 virava 500.
 */
export async function obterPerfilPorSlug(slug: string): Promise<ProfileDetail | null> {
  const perfil = (await listarPerfis()).find((p) => p.slug === slug);
  if (perfil === undefined) return null;
  return obterPerfil(perfil.id);
}

/**
 * Catálogo completo de permissões, para o dropdown do admin.
 *
 * shortcut: sem `catch` aqui — a página de detalhe faz
 * `Promise.all([obterPerfilPorSlug(), listarPermissoes()])`, então um slug
 * inexistente (404)races com o catálogo e o `notFound()` não é alcançado: o
 * usuário vê 500 em vez de 404. Não alcançável hoje porque a API rejeita quem
 * não tem `admin.manage-profiles` ANTES de resolver o slug. Quando o catálogo
 * virar editável fora do admin, trocar por `Promise.allSettled`.
 */
export async function listarPermissoes(): Promise<string[]> {
  const client = await getClient();
  return client.get<string[]>('/admin/permissions');
}

export async function criarPerfil(input: CreateProfileInputDto): Promise<ProfileDetail> {
  const client = await getClient();
  return client.post<ProfileDetail>('/admin/profiles', input);
}

export async function atualizarPerfil(
  id: string,
  input: UpdateProfileInputDto,
): Promise<ProfileDetail> {
  const client = await getClient();
  return client.patch<ProfileDetail>(`/admin/profiles/${id}`, input);
}

export async function deletarPerfil(id: string): Promise<void> {
  const client = await getClient();
  await client.delete(`/admin/profiles/${id}`);
}

export async function atribuirPermissao(id: string, permissionKey: string): Promise<ProfileDetail> {
  const client = await getClient();
  return client.post<ProfileDetail>(`/admin/profiles/${id}/authorizations`, {
    permissionKey,
  });
}

export async function revogarPermissao(id: string, permissionKey: string): Promise<void> {
  const client = await getClient();
  await client.delete(`/admin/profiles/${id}/authorizations/${permissionKey}`);
}

export function diffPermissoes(
  atuais: readonly string[],
  desejadas: readonly string[],
): { remover: string[]; adicionar: string[] } {
  const atuaisSet = new Set(atuais);
  const desejadasSet = new Set(desejadas);
  return {
    remover: [...atuaisSet].filter((k) => !desejadasSet.has(k)),
    adicionar: [...desejadasSet].filter((k) => !atuaisSet.has(k)),
  };
}

/**
 * Aplica o conjunto desejado de permissões. A API não tem sync atômico, então
 * isto é um diff de chamadas — e o ORDEM é deliberado:
 *
 * pt-BR (#97): revoga ANTES de conceder. Se a concessão falhar no meio, o
 * perfil fica com MENOS privilégio do que o admin pediu, nunca com um
 * privilégio a mais. O inverso (conceder primeiro) deixaria um perfil mais
 * permissivo do que a tela mostra.
 *
 * Falha não é engolida: propaga para a Server Action, que não revalida a
 * página. O que isso garante é o que existe hoje sem `error.tsx` no app: o
 * erro SOBE em vez de a tela recarregar com um "salvo" falso sobre um estado
 * parcial. O usuário vê a página de erro genérica do Next — não a mensagem de
 * domínio.
 */
export async function trocarPermissoes(
  id: string,
  atuais: readonly string[],
  desejadas: readonly string[],
): Promise<void> {
  // shortcut: `atuais` é o snapshot do RENDER, não o estado corrente — dois
  // admins salvando a mesma tela se sobrescrevem em silêncio. Não alcançável
  // hoje porque a API valida a chave de cada chamada na escrita (permissão
  // inexistente / já atribuída é recusada), o que limita o estrago ao diff
  // visual. Quando a API ganhar sync atômico com ETag/If-Match, o baseline
  // passa a ser lido do servidor em `trocarPermissoes` em vez de vir da tela.
  const { remover, adicionar } = diffPermissoes(atuais, desejadas);
  for (const key of remover) {
    await revogarPermissao(id, key);
  }
  for (const key of adicionar) {
    await atribuirPermissao(id, key);
  }
}

/** O que o admin escolheu no `<select>` deve resultar em qual chamada. */
export type DecisaoAtribuicaoPerfil =
  { tipo: 'sem-mudanca' } | { tipo: 'atribuir'; profileId: string } | { tipo: 'remover' };

/**
 * Traduz (selecionado, atual) na chamada — ou em nada.
 *
 * pt-BR (#97, M3): a decisão é fail-safe para o lado seguro. Selecionar a
 * opção vazia só REMOVE quando o usuário de fato tem perfil e escolheu a
 * vazia; sem perfil atual, a opção vazia é o estado que já estava lá e não
 * gera PUT. O inverso — tratar a opção vazia como "sempre limpar" — fazia
 * `Salvar` sem tocar em nada apagar o perfil de quem já estava sem perfil
 * (e apagar o de quem tinha, se o `defaultValue` do `<select>` não batesse).
 */
export function decidirAtribuicaoPerfil({
  selecionado,
  atual,
}: {
  selecionado: string;
  atual: string | null;
}): DecisaoAtribuicaoPerfil {
  // `null` e `''` são o MESMO estado ("sem perfil"); comparar direto faria
  // "sem perfil + nada escolhido" parecer mudança.
  if (selecionado === (atual ?? '')) return { tipo: 'sem-mudanca' };
  if (selecionado === '') return { tipo: 'remover' };
  return { tipo: 'atribuir', profileId: selecionado };
}

/** `profileId: null` limpa o perfil do usuário — é o mesmo PUT, não um DELETE. */
export async function atribuirPerfil(userId: string, profileId: string | null): Promise<void> {
  const client = await getClient();
  const body: AssignProfileInputDto = { profileId };
  await client.put(`/admin/users/${userId}/profile`, body);
}
