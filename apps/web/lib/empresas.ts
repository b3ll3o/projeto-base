// apps/web/lib/empresas.ts
//
// pt-BR (onboarding de empresa, 2026-10-21): cliente da API de empresas
// (server-side). Três rotas, uma ideia:
//
//   POST /tenants            → a empresa de quem JÁ tem conta (a página de criação)
//   GET  /me/tenants         → as empresas do ator (o que o login consulta)
//   POST /invitations/accept → a empresa de quem entra por convite
//
// Segue o mesmo padrão de `lib/perfil.ts` (server-side, `ApiClient` com a seam
// `getToken`), com DUAS diferenças que são o ponto do arquivo:
//
// 1. O token chega por PARÂMETRO, e não pelo cookie. O login ainda não tem
//    cookie — ele acabou de RECEBER o token da API — e o `criarEmpresa` roda
//    para quem ainda não tem empresa nenhuma (o cookie `tenant_id` não
//    existe). Ler o cookie nesses dois momentos seria ler um cookie que o
//    request anterior acabou de gravar, e depender de o store do Next devolver
//    o valor recém-escrito.
//
// 2. SEM `getTenant`: nenhuma das três rotas é "por empresa". São "por CONTA" —
//    e mandar `X-Tenant-Id` aqui seria pedir 403 `TENANT_MEMBERSHIP_REQUIRED`
//    para quem ainda não pertence a empresa nenhuma, que é justamente quem
//    vai criar a primeira.

import { ApiClient } from './api-client';
import type {
  ConviteAceitoDto,
  CriarEmpresaInputDto,
  EmpresaDoUsuarioDto,
  EmpresaDto,
} from '@projeto/shared-types';

/**
 * O cliente das empresas.
 *
 * `baseUrl` já vem com `/api/v1` (é o que os configs de deploy passam) — o
 * prefixo NÃO é repetido aqui, pelo mesmo motivo de `lib/perfil.ts`.
 */
function client(accessToken: string): ApiClient {
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
  });
}

/**
 * As empresas do ator.
 *
 * Lista vazia é a resposta NORMAL de quem está em onboarding (e do
 * administrador de sistema, que não pertence a empresa nenhuma). Não é erro.
 */
export async function listarEmpresas(accessToken: string): Promise<EmpresaDoUsuarioDto[]> {
  return client(accessToken).get<EmpresaDoUsuarioDto[]>('/me/tenants');
}

/**
 * Cria a empresa e vira o ator DONO dela, com as permissões da empresa.
 *
 * O `id` que volta é o que o web grava no cookie `tenant_id` — a empresa em que
 * a sessão vai agir a partir de agora.
 */
export async function criarEmpresa(
  accessToken: string,
  input: CriarEmpresaInputDto,
): Promise<EmpresaDto> {
  return client(accessToken).post<EmpresaDto>('/tenants', input);
}

/**
 * Aceita o convite e devolve a empresa que convidou.
 *
 * O `tenantId` da resposta é o que o web aponta no cookie `tenant_id`: sem
 * ele, a conta entra na empresa e fica com membership sem escopo.
 */
export async function aceitarConvite(
  accessToken: string,
  token: string,
): Promise<ConviteAceitoDto> {
  return client(accessToken).post<ConviteAceitoDto>('/invitations/accept', { token });
}
