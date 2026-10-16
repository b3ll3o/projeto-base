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

import { ApiClient } from './api-client';
import { exigirSessao, lerTokens } from './sessao';
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
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
  });
}

/**
 * Versão tolerante: NÃO chama `exigirSessao()` (que redireciona) — em vez
 * disso lê os cookies direto. Se não há token, devolve `null` em vez de jogar
 * `NEXT_REDIRECT`. Serve para componentes que não devem forçar login só por
 * estarem no layout (ex.: Sidebar) — o login de verdade é responsabilidade
 * da página, não do chrome.
 */
async function getClientOpcional(): Promise<ApiClient | null> {
  const { accessToken } = await lerTokens();
  if (accessToken === null) return null;
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
  });
}

export async function obterMeuPerfil(): Promise<MeProfileDto | null> {
  try {
    const client = await getClientOpcional();
    if (client === null) return null;
    return await client.get<MeProfileDto>('/me/profile');
  } catch {
    // pt-BR: 401 (sem sessão), 5xx e rede caída devolvem `null` — o Sidebar não
    // pode derrubar a página. Havia um `if` que jurava separar o 401 testando
    // `e.statusCode`, campo que o `ApiError` não tem: nunca entrava, e os dois
    // ramos devolviam `null` por acidente. O `catch` sem `e` é a mesma
    // comportamento sem a mentira. Quem precisar distinguir 401 de 5xx faz isso
    // na página, que é onde a decisão (redirecionar ou mostrar erro) mora.
    return null;
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
