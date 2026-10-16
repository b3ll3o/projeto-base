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

import { ApiClient } from './api-client';
import { exigirSessao, lerTokens } from './sessao';
import type {
  AuthorizationOutputDto,
  CreateProfileInputDto,
  MeProfileDto,
  PermissionKey,
  ProfileOutputDto,
  SyncAuthorizationsInputDto,
  UpdateProfileInputDto,
} from '@projeto/shared-types';

async function getClient(): Promise<ApiClient> {
  const accessToken = await exigirSessao();
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://api:3000',
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
    baseUrl: process.env.API_BASE_URL ?? 'http://api:3000',
    getToken: () => accessToken,
  });
}

export async function obterMeuPerfil(): Promise<MeProfileDto | null> {
  try {
    const client = await getClientOpcional();
    if (client === null) return null;
    return await client.get<MeProfileDto>('/api/v1/me/profile');
  } catch (e) {
    if (
      e instanceof Error &&
      'statusCode' in e &&
      (e as { statusCode: number }).statusCode === 401
    ) {
      return null;
    }
    // pt-BR: erro de rede/5xx no Sidebar não pode derrubar a página inteira.
    // O chrome continua mostrando o que pode (links, "Sem perfil") e o
    // conteúdo fica responsável por proteger a si mesmo.
    return null;
  }
}

export async function listarPerfis(): Promise<ProfileOutputDto[]> {
  const client = await getClient();
  return client.get<ProfileOutputDto[]>('/api/v1/admin/profiles');
}

export async function obterPerfil(slug: string): Promise<ProfileOutputDto> {
  const client = await getClient();
  return client.get<ProfileOutputDto>(`/api/v1/admin/profiles/${slug}`);
}

export async function listarAutorizacoes(profileId: string): Promise<AuthorizationOutputDto[]> {
  const client = await getClient();
  return client.get<AuthorizationOutputDto[]>(`/api/v1/admin/profiles/${profileId}/authorizations`);
}

export async function criarPerfil(input: CreateProfileInputDto): Promise<ProfileOutputDto> {
  const client = await getClient();
  return client.post<ProfileOutputDto>('/api/v1/admin/profiles', input);
}

export async function atualizarPerfil(
  slug: string,
  input: UpdateProfileInputDto,
): Promise<ProfileOutputDto> {
  const client = await getClient();
  return client.patch<ProfileOutputDto>(`/api/v1/admin/profiles/${slug}`, input);
}

export async function deletarPerfil(slug: string): Promise<void> {
  const client = await getClient();
  await client.delete(`/api/v1/admin/profiles/${slug}`);
}

export async function sincronizarAutorizacoes(
  profileId: string,
  keys: readonly PermissionKey[],
): Promise<AuthorizationOutputDto[]> {
  const client = await getClient();
  const body: SyncAuthorizationsInputDto = { permissionKeys: keys };
  return client.put<AuthorizationOutputDto[]>(
    `/api/v1/admin/profiles/${profileId}/authorizations`,
    body,
  );
}

export interface UserWithProfileDto {
  id: string;
  email: string;
  nome: string;
  profileId: string | null;
  isAdmin: boolean;
}

export async function atribuirPerfil(userId: string, profileId: string): Promise<void> {
  const client = await getClient();
  await client.put(`/api/v1/admin/users/${userId}/profile`, { profileId });
}

export async function removerPerfil(userId: string): Promise<void> {
  const client = await getClient();
  await client.delete(`/api/v1/admin/users/${userId}/profile`);
}
