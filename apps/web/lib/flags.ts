// apps/web/lib/flags.ts
//
// pt-BR (feature-flags, 2026-10-18 — Fase 5): cliente (server-side) das
// feature flags. Usado por `app/admin/flags/page.tsx`.
//
// ⚠️ D14 — este cliente é montado SEM `getTenant`, ao contrário de
// `lib/perfil.ts:30-40`. Não é descuido: enviar `X-Tenant-Id` tira o ator do
// bucket GLOBAL (`tenantId !== null`), e D2 exige `tenantId === null` para o
// admin do sistema. O admin que tivesse empresa selecionada no cookie levaria
// 403 numa tela recem-nascida. Omitir o campo opcional custa UMA LINHA — e é
// a diferença entre a tela funcionar para o único ator que pode usá-la e não
// funcionar. MEDIDO: `api-client.ts:66-67` só manda o header quando existe.

import { ApiClient } from './api-client';
import { exigirSessao } from './sessao';
import type { FeatureFlagDto, UpdateFeatureFlagInputDto } from '@projeto/shared-types';

async function getClient(): Promise<ApiClient> {
  const accessToken = await exigirSessao();
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
    // Sem `getTenant` — D14. Ver o cabeçalho.
  });
}

/**
 * Catálogo com o estado efetivo de cada chave.
 *
 * A chave e a `descricao` vêm do CATÁLOGO do servidor: o web não tem catálogo
 * próprio (duplicá-lo aqui seria uma segunda escrita da mesma lista, que
 * divergiria em silêncio). `ativada` chega `true` para chave sem linha no banco
 * — D4 — e o cliente nunca infere estado a partir de ausência.
 */
export async function listarFeatureFlags(): Promise<FeatureFlagDto[]> {
  const client = await getClient();
  return client.get<FeatureFlagDto[]>('/admin/feature-flags');
}

/**
 * Liga ou desliga UMA chave. O corpo é o estado INTEIRO do recurso (não um
 * patch) e a chave viaja na URL — o mesmo contrato do backend.
 */
export async function definirFeatureFlag(chave: string, ativada: boolean): Promise<FeatureFlagDto> {
  const client = await getClient();
  const body: UpdateFeatureFlagInputDto = { ativada };
  // `encodeURIComponent` e não interpolação crua: a chave vem de um
  // `FormData` no caminho da tela, e `/` ou `..` ali moldariam a URL ANTES de a
  // API ver a chave — a revalidação `isFeatureFlagKey` acontece depois do
  // roteamento. Hoje o catálogo só tem `a-z` e `.`, então é defesa de borda.
  return client.put<FeatureFlagDto>(`/admin/feature-flags/${encodeURIComponent(chave)}`, body);
}
