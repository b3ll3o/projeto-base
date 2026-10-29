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
//
// ⚠️ 2026-10-29 (revisão do PR #127): o token entra por PARÂMETRO, e o
// cliente nasce de uma função que o recebe — o mesmo desenho de
// `lib/empresas.ts`. Antes este arquivo tinha a SUA cópia do `getClient()` de
// `lib/flags.ts` (mesmo `baseUrl`, mesmo `getToken`, mesmo "sem `getTenant`"),
// e as DUAS leituras da tela montavam DOIS clientes e liam o cookie DOIS
// vezes — a página é `force-dynamic`, e isso valia a cada navegação.

import { ApiClient } from './api-client';
import type { InventarioAdminTenancyDto } from '@projeto/shared-types';

/**
 * O cliente do inventário.
 *
 * O token vem por parâmetro (e não do cookie): quem chama é a página, que já
 * leu a sessão UMA vez para o guard — e o cliente nasce junto com a leitura.
 */
function client(accessToken: string): ApiClient {
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
    // Sem `getTenant` — D7. Ver o cabeçalho.
  });
}

/**
 * O inventário da tenancy (`GET /admin/tenancy`): as empresas com os seus
 * membros E os usuários com as suas empresas.
 *
 * ⚠️ As DUAS listas viajam JUNTAS, e é o que garante que a tela não discorde
 * de si mesma: em duas respostas seriam dois instantes do banco.
 *
 * `empresas: []` e `usuarios: []` são RESPOSTAS legítimas — a empresa
 * recém-aberta não tem ninguém dentro, e a conta do administrador do sistema
 * vive no bucket GLOBAL e não pertence a empresa nenhuma.
 */
export async function listarInventario(accessToken: string): Promise<InventarioAdminTenancyDto> {
  return client(accessToken).get<InventarioAdminTenancyDto>('/admin/tenancy');
}
