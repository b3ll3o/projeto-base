// apps/web/lib/tenancy.ts
//
// pt-BR (visão de admin, 2026-10-22): cliente (server-side) do INVENTÁRIO da
// tenancy — as DUAS direções, vistas pelo administrador do SISTEMA. Usado por
// `app/admin/tenancy/page.tsx`.
//
// ⚠️ D7 — este cliente é montado SEM `getTenant`, ao contrário de
// `lib/perfil.ts:30-40`. Não é descuido: enviar `X-Tenant-Id` tira o ator do
// bucket GLOBAL (`tenantId !== null`), e D2 exige `tenantId === null` para o
// admin do sistema. O admin que tivesse empresa selecionada no cookie levaria
// 403 numa tela recem-nascida. É o mesmo motivo (e o mesmo desenho) de
// `lib/flags.ts` — D14 lá. Omitir o campo opcional custa UMA LINHA — e é a
// diferença entre a tela funcionar para o único ator que pode usá-la e não
// funcionar. MEDIDO: `api-client.ts:96` só manda o header quando existe.
//
// ⚠️ E o `getTenant` NÃO seria um detalhe de performance: o header é
// CAPACIDADE DECLARADA pelo cliente (issue #102). O `tenantId` do pedido é o
// que a API lê para decidir o bucket — mandá-lo é o cliente asserting um
// escopo que a tela de inventário não tem.

import { ApiClient } from './api-client';
import { exigirSessao } from './sessao';
import type { EmpresaComMembrosDto, UsuarioComEmpresasDto } from '@projeto/shared-types';

async function getClient(): Promise<ApiClient> {
  const accessToken = await exigirSessao();
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
    // Sem `getTenant` — D7. Ver o cabeçalho.
  });
}

/**
 * Todas as empresas do sistema, com os membros de cada uma (`GET
 * /admin/tenants`).
 *
 * `membros: []` é uma RESPOSTA legítima — a empresa recém-aberta não tem
 * ninguém dentro ainda — e a lista volta como veio.
 */
export async function listarEmpresasComMembros(): Promise<EmpresaComMembrosDto[]> {
  const client = await getClient();
  return client.get<EmpresaComMembrosDto[]>('/admin/tenants');
}

/**
 * Todos os usuários do sistema, com as empresas de cada um (`GET
 * /admin/users`).
 *
 * `empresas: []` também é uma resposta legítima: a conta do administrador do
 * sistema vive no bucket GLOBAL e não pertence a empresa nenhuma.
 */
export async function listarUsuariosComEmpresas(): Promise<UsuarioComEmpresasDto[]> {
  const client = await getClient();
  return client.get<UsuarioComEmpresasDto[]>('/admin/users');
}
