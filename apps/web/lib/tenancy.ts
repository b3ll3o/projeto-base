// apps/web/lib/tenancy.ts
//
// pt-BR (visão de admin, 2026-10-22): cliente (server-side) do INVENTÁRIO da
// tenancy — as DUAS direções, vistas pelo administrador do SISTEMA. Usado por
// `app/admin/tenancy/page.tsx`, `app/users/[id]/page.tsx` e
// `app/empresa/[id]/page.tsx`.
//
// pt-BR (2026-11-17): o HISTÓRICO de auditoria de UMA pessoa entrou aqui —
// `GET /admin/users/:id/history`, lido pela tela do detalhe da pessoa.
//
// Este arquivo tem TRÊS donos: o CLIENTE do inventário (`listarInventario`),
// o CLIENTE do histórico (`listarHistoricoDoUsuario`) e os RÓTULOS que as
// telas escrevem (`vinculo` e `rotuloDaOperacao`) — o `papel · perfil` e o
// `criação · alteração` que as telas mostram. Os rótulos moravam como
// função local de cada tela, e as telas novas precisaram do MESMO texto: duas
// cópias de uma decisão envelhecem em uma delas só (convenção `dry.md`).
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
// ⚠️ O HISTÓRICO HERDA O MESMO D7: ele é lido no bucket de SISTEMA (a API
// lê a trilha de auditoria com o escopo `null`), e um `X-Tenant-Id` ali
// tiraria o admin do sistema do bucket global — a resposta viria VAZIA, e
// "vazia" parece "não tem histórico".
//
// ⚠️ 2026-10-29 (revisão do PR #127): o token entra por PARÂMETRO, e o
// cliente nasce de uma função que o recebe — o mesmo desenho de
// `lib/empresas.ts`. Antes este arquivo tinha a SUA cópia do `getClient()` de
// `lib/flags.ts` (mesmo `baseUrl`, mesmo `getToken`, mesmo "sem `getTenant`"),
// e as DUAS leituras da tela montavam DOIS clientes e liam o cookie DOIS
// vezes — a página é `force-dynamic`, e isso valia a cada navegação.

import { ApiClient, baseUrlDaApi } from './api-client';
import type {
  AuditOperationType,
  InventarioAdminTenancyDto,
  UserHistoryPageDto,
} from '@projeto/shared-types';

/**
 * O cliente do inventário.
 *
 * O token vem por parâmetro (e não do cookie): quem chama é a página, que já
 * leu a sessão UMA vez para o guard — e o cliente nasce junto com a leitura.
 */
function client(accessToken: string): ApiClient {
  return new ApiClient({
    baseUrl: baseUrlDaApi(),
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
 *
 * shortcut: o endpoint traz TODA pessoa e TODA empresa com os seus membros —
 * uma base de 10 mil pessoas devolve o inventário inteiro a cada clique da
 * tela do detalhe. Subir para uma página com cursor quando a base passar de
 * ~1.000 pessoas (e o nome do ator vier no payload do histórico).
 */
export async function listarInventario(accessToken: string): Promise<InventarioAdminTenancyDto> {
  return client(accessToken).get<InventarioAdminTenancyDto>('/admin/tenancy');
}

/**
 * Quantas entradas de histórico a tela pede POR PÁGINA.
 *
 * ⚠️ 100 é o MÁXIMO da API (`LIMITE_MAXIMO`, `user-repository.port.ts`), e
 * não o padrão (20): a tela pede UMA página por visita, e 20 por página
 * mostraria 20 linhas de uma trilha que a API pagina de 100 em 100.
 *
 * ⚠️ E o número tem um DONO: a paridade com a API é medida pelo
 * `lib/paginacao.parity.spec.ts` — sem ela, uma cópia aqui envelhecia
 * sozinha, e o `?limit=100` viraria 400 na API (a seção inteira viraria um
 * `Alerta` para toda pessoa).
 */
export const TAMANHO_DA_PAGINA_HISTORICO = 100;

/**
 * UMA página do histórico de uma pessoa (`GET /admin/users/:id/history`).
 *
 * O `cursor` é o da PRÓXIMA página, e `null` no fim — a API pagina por
 * cursor, e a tela pede UMA página por visita (o cursor viaja na URL).
 *
 * ⚠️ A API devolve a trilha do **mais novo para o mais antigo** (a ordem é
 * do input do port de auditoria), e o cursor aponta para as versões mais
 * **antigas**.
 *
 * ⚠️ O `id` vai codificado: ele vem do path da tela, e um id cru moldaria a
 * URL ANTES de a API ver o caminho.
 *
 * ⚠️ O `limite` é OPCIONAL, e o padrão é o tamanho da página da tela. Ele
 * existe para a leitura de UMA versão (a mais recente), que a tela do
 * detalhe precisa quando a pessoa está fora do inventário (a apagada) e a
 * página corrente do histórico não é a primeira.
 */
export async function listarHistoricoDoUsuario(
  accessToken: string,
  id: string,
  cursor?: string,
  limite?: number,
): Promise<UserHistoryPageDto> {
  const tamanho = limite ?? TAMANHO_DA_PAGINA_HISTORICO;
  const consulta =
    cursor === undefined
      ? `?limit=${tamanho}`
      : `?limit=${tamanho}&cursor=${encodeURIComponent(cursor)}`;
  return client(accessToken).get<UserHistoryPageDto>(
    `/admin/users/${encodeURIComponent(id)}/history${consulta}`,
  );
}

/**
 * O PAPEL da tenancy, no idioma da tela.
 *
 * ⚠️ O enum da API é `'gerente' | 'member'` (`tenant_memberships.role`) — e
 * `member` é INGLÊS numa tela pt-BR. O rótulo é o DONO da tradução, e ele é
 * o `vinculo` abaixo.
 */
const PAPEL: Record<string, string> = {
  gerente: 'gerente',
  member: 'membro',
};

/**
 * O vínculo, do jeito que a tela mostra: `papel: X · perfil: Y`.
 *
 * O `perfil` é `null` quando o vínculo não tem um (ou tem o de outra empresa) —
 * e "sem perfil" é o rótulo honesto para esse estado.
 *
 * ⚠️ As DUAS partes são NOMEADAS, e não soltas: o papel e o perfil podem ter
 * a MESMA palavra (`gerente · gerente` é o caso comum — o dono veste o papel
 * `gerente` e o perfil `gerente`), e o par solto parecia duplicata. Quem lê a
 * tela precisa saber qual é qual sem deduzir.
 *
 * ⚠️ O DONO morava em `app/admin/tenancy/page.tsx`, como função local — e as
 * telas de detalhe do usuário e da empresa precisaram do MESMO rótulo. Duas
 * cópias de uma decisão envelhecem em uma delas só (convenção `dry.md`).
 */
export function vinculo(role: string, perfil: string | null): string {
  const papel = PAPEL[role] ?? role;
  return perfil === null ? `papel: ${papel} · sem perfil` : `papel: ${papel} · perfil: ${perfil}`;
}

/**
 * A OPERAÇÃO da auditoria, no idioma da tela: o que aconteceu naquela versão.
 *
 * ⚠️ O enum da API é INGLÊS (`AuditOperationType`: `INSERT`, `UPDATE`,
 * `DELETE`, `RESTORE`) e a tela é pt-BR. O rótulo é o DONO da tradução —
 * o mesmo desenho do `vinculo` acima, e pelo mesmo motivo (`dry.md`).
 *
 * ⚠️ O mapa é TIPADO pelo enum (`Record<AuditOperationType, string>`): sem
 * a tipagem, um valor novo no enum da API sairia em inglês na tela sem o
 * compilador reclamar — e a tradução que falta é justamente a que o
 * compilador devia apontar.
 *
 * ⚠️ Uma operação que a API não conhece PASSA COMO VEIO: a tela não
 * esconde dado, e um `operation` novo é informação, não erro.
 */
const OPERACAO: Record<AuditOperationType, string> = {
  INSERT: 'criação',
  UPDATE: 'alteração',
  DELETE: 'remoção',
  RESTORE: 'restauração',
};

export function rotuloDaOperacao(operation: string): string {
  return OPERACAO[operation as AuditOperationType] ?? operation;
}
