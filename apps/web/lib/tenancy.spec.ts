// apps/web/lib/tenancy.spec.ts
//
// Contrato web↔API do inventário da tenancy (visão de admin, 2026-10-22).
//
// O que estes testes seguram, além do path e do método:
//
//  1. **D7** — `listarEmpresasComMembros` e `listarUsuariosComEmpresas` montam
//     o `ApiClient` SEM `getTenant`. É a razão de o arquivo existir em vez de
//     reusar o factory de `perfil.ts`: mandar `X-Tenant-Id` tira o ator do
//     bucket global (`tenantId !== null`) e D2 exige `tenantId === null`,
//     então o admin do sistema que tivesse empresa selecionada no cookie
//     levaria 403 numa tela recem-nascida. O teste mede a CONFIGURAÇÃO do
//     cliente, não só a chamada — um `getTenant` a mais passaria em qualquer
//     asserção de path.
//  2. O path e o método de cada chamada.
//  3. Erro não vira sucesso: o erro da API PROPAGA, não vira lista vazia —
//     a tela mentiria ("nenhuma empresa") sobre uma falha.
//
// Este arquivo é o espelho de `lib/flags.spec.ts` (mesma ponte de tipos, mesma
// medição de D7/D14, mesmo critério de erro que propaga).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiClientConfig } from './api-client';

const { clientMock, configMock, exigirSessaoMock, lerTenantMock } = vi.hoisted(() => {
  // A anotação é o que segura o teste. Sem ela, `{ getToken: undefined }`
  // infere o tipo LITERAL `undefined`, e `configMock.getToken?.()` estreita
  // para `never` — o tsc falha em código que roda verde no Vitest, que não
  // typecheca.
  //
  // `| undefined` EXPLÍCITO nas duas: o projeto liga `exactOptionalPropertyTypes`,
  // e sem ele `Partial<ApiClientConfig>` recusa o `undefined` do estado inicial.
  //
  // ⚠️ `getTenant` é `() => string | null`, **síncrono** (`api-client.ts:14`) —
  // e a anotação dizia `() => Promise<string | null>`. Ninguém conferiu contra
  // o tipo real porque a factory recebia `config: unknown`: nenhuma ponte
  // cruzava os dois. A ponte é a atribuição campo a campo lá embaixo.
  const configMock: {
    baseUrl: string;
    getToken: (() => string | null) | undefined;
    getTenant: (() => string | null) | undefined;
  } = { baseUrl: 'http://api/api/v1', getToken: undefined, getTenant: undefined };
  return {
    clientMock: { get: vi.fn() },
    configMock,
    exigirSessaoMock: vi.fn(async () => 'token-admin'),
    lerTenantMock: vi.fn(async (): Promise<string | null> => 'empresa-do-admin'),
  };
});

vi.mock('./api-client', () => ({
  // ⚠️ ATRIBUIÇÃO CAMPO A CAMPO, e não `Object.assign`. `Object.assign` tem
  // tipagem `(T, U) => T & U` e NÃO cruza `U` contra `T`: a anotação errada de
  // `configMock.getTenant` passaria no tsc com o `unknown` E passaria com o
  // `ApiClientConfig`. Aqui `config.getTenant` tem que caber em
  // `configMock.getTenant`, e é essa ponte que faz o tipo real ser conferido.
  ApiClient: vi.fn((config: ApiClientConfig) => {
    configMock.baseUrl = config.baseUrl;
    configMock.getToken = config.getToken;
    configMock.getTenant = config.getTenant;
    return clientMock;
  }),
}));
vi.mock('./sessao', () => ({
  exigirSessao: exigirSessaoMock,
  lerTenant: lerTenantMock,
  lerTokens: vi.fn(async () => ({ accessToken: 'token-admin', refreshToken: null })),
}));

const { listarEmpresasComMembros, listarUsuariosComEmpresas } = await import('./tenancy');

const EMPRESA = {
  id: 'e1f2a3b4-0000-4000-8000-000000000001',
  nome: 'ACME',
  slug: 'acme',
  membros: [
    {
      id: 'a1b2c3d4-0000-4000-8000-000000000002',
      nome: 'Bruno',
      email: 'bruno@acme.test',
      role: 'gerente',
      perfil: 'editor',
    },
  ],
};

const USUARIO = {
  id: 'a1b2c3d4-0000-4000-8000-000000000002',
  nome: 'Bruno',
  email: 'bruno@acme.test',
  empresas: [
    {
      id: 'e1f2a3b4-0000-4000-8000-000000000001',
      nome: 'ACME',
      slug: 'acme',
      role: 'gerente',
      perfil: 'editor',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  configMock.getToken = undefined;
  configMock.getTenant = undefined;
  clientMock.get.mockResolvedValue([]);
});

describe('lib/tenancy — o cliente do inventário de tenancy', () => {
  it('lista as empresas por GET em `/admin/tenants` e devolve o que a API devolveu', async () => {
    clientMock.get.mockResolvedValue([EMPRESA]);

    const resposta = await listarEmpresasComMembros();

    expect(clientMock.get).toHaveBeenCalledWith('/admin/tenants');
    expect(resposta).toEqual([EMPRESA]);
  });

  it('lista os usuários por GET em `/admin/users` e devolve o que a API devolveu', async () => {
    clientMock.get.mockResolvedValue([USUARIO]);

    const resposta = await listarUsuariosComEmpresas();

    expect(clientMock.get).toHaveBeenCalledWith('/admin/users');
    expect(resposta).toEqual([USUARIO]);
  });

  it('NÃO manda `X-Tenant-Id` — D7: enviar o header tira o admin do bucket global', async () => {
    // `lerTenant` DEVOLVE uma empresa de propósito: o defeito de D7 só
    // aparece quando existe empresa escolhida. Com `lerTenant` devolvendo
    // `null` o header seria omitido de qualquer jeito, e o teste passaria
    // mesmo com o `getTenant` presente.
    await listarEmpresasComMembros();
    await listarUsuariosComEmpresas();

    expect(configMock.getTenant).toBeUndefined();
    expect(lerTenantMock).not.toHaveBeenCalled();
  });

  it('manda o token de sessão', async () => {
    await listarEmpresasComMembros();

    expect(configMock.getToken?.()).toBe('token-admin');
  });

  // ⚠️ O nome NÃO diz 403, e é de propósito — o mesmo critério que
  // `lib/flags.spec.ts` fixou: num teste cujo `client` é mockado, o `ApiError`
  // de `api-client.ts` nunca entra em cena, então um 403 no nome seria uma
  // afirmação que o corpo não mede. O nome diz o que o corpo mede: o erro
  // PROPAGA.
  it('erro da API PROPAGA — não vira lista vazia (a tela mentiria: "nenhuma empresa")', async () => {
    const erro = new Error('Forbidden');
    clientMock.get.mockRejectedValue(erro);

    await expect(listarEmpresasComMembros()).rejects.toBe(erro);
    await expect(listarUsuariosComEmpresas()).rejects.toBe(erro);
  });
});
