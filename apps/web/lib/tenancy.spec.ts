// apps/web/lib/tenancy.spec.ts
//
// Contrato web↔API do inventário da tenancy (visão de admin, 2026-10-22;
// revisão de 2026-10-29 — as DUAS rotas viraram UMA).
//
// O inventário é UMA chamada: `GET /admin/tenancy` devolve
// `{ empresas, usuarios }` — as DUAS listas viajam juntas, e é isso que
// garante que a tela não discorde de si mesma (em duas respostas seriam dois
// instantes do banco).
//
// O que estes testes seguram, além do path e do método:
//
//  1. **D7** — `listarInventario` monta o `ApiClient` SEM `getTenant`. É a
//     razão de o arquivo existir em vez de reusar o factory de `perfil.ts`:
//     mandar `X-Tenant-Id` tira o ator do bucket global (`tenantId !== null`)
//     e D2 exige `tenantId === null`, então o admin do sistema que tivesse
//     empresa selecionada no cookie levaria 403 numa tela recem-nascida. O
//     teste mede a CONFIGURAÇÃO do cliente, não só a chamada — um `getTenant`
//     a mais passaria em qualquer asserção de path.
//  2. O path e o método da chamada.
//  3. O INVENTÁRIO INTEIRO volta como veio — as DUAS listas dentro do mesmo
//     envelope. É o contrato do DTO: um `toEqual` do envelope mede os dois
//     lados de uma vez.
//  4. Erro não vira sucesso: o erro da API PROPAGA, não vira inventário
//     vazio — a tela mentiria ("nenhuma empresa") sobre uma falha.
//  5. O TOKEN VEM POR PARÂMETRO e o cliente NÃO lê o cookie da sessão: a
//     página é `force-dynamic` e já leu a sessão uma vez (para o guard).
//
// Este arquivo é o espelho de `lib/flags.spec.ts` (mesma ponte de tipos, mesma
// medição de D7/D14, mesmo critério de erro que propaga).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiClientConfig } from './api-client';

const { clientMock, configMock, exigirSessaoMock } = vi.hoisted(() => {
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
    exigirSessaoMock: vi.fn(async () => 'token-do-cookie'),
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
// ⚠️ `lib/tenancy.ts` NÃO importa este módulo — o token chega por PARÂMETRO.
// O mock existe para o NEGATIVO: se alguém voltar a ler o cookie aqui dentro,
// a página passa a ler o cookie DUAS vezes por navegação (ela é
// `force-dynamic`) e o teste do "token por parâmetro" fica vermelho.
vi.mock('./sessao', () => ({
  exigirSessao: exigirSessaoMock,
  lerTenant: vi.fn(async (): Promise<string | null> => 'empresa-do-admin'),
  lerTokens: vi.fn(async () => ({ accessToken: 'token-do-cookie', refreshToken: null })),
}));

const { listarInventario } = await import('./tenancy');

const TOKEN = 'token-admin';

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

const INVENTARIO = { empresas: [EMPRESA], usuarios: [USUARIO] };

beforeEach(() => {
  vi.clearAllMocks();
  configMock.getToken = undefined;
  configMock.getTenant = undefined;
  clientMock.get.mockResolvedValue(INVENTARIO);
});

describe('lib/tenancy — o cliente do inventário de tenancy', () => {
  it('lê o inventário por GET em `/admin/tenancy` e devolve o que a API devolveu', async () => {
    clientMock.get.mockResolvedValue(INVENTARIO);

    const resposta = await listarInventario(TOKEN);

    expect(clientMock.get).toHaveBeenCalledWith('/admin/tenancy');
    expect(resposta).toEqual(INVENTARIO);
  });

  it('NÃO manda `X-Tenant-Id` — D7: enviar o header tira o admin do bucket global', async () => {
    // ⚠️ O defeito de D7 mudou de FORMA, e a asserção acompanhou. Antes o
    // cliente lia a empresa do COOKIE, e bastava `lerTenant` devolver uma
    // empresa para o header aparecer. Agora o cliente não lê cookie nenhum (o
    // token chega por parâmetro), então a garantia é ESTRUTURAL: o
    // `getTenant` não existe na config. É a CONFIGURAÇÃO que este teste
    // mede — um `getTenant` a mais passaria em qualquer asserção de path.
    await listarInventario(TOKEN);

    expect(configMock.getTenant).toBeUndefined();
  });

  it('manda o token que recebeu por parâmetro', async () => {
    await listarInventario(TOKEN);

    expect(configMock.getToken?.()).toBe(TOKEN);
  });

  it('NÃO lê a sessão do cookie — o token chega por parâmetro (a página é `force-dynamic`)', async () => {
    await listarInventario(TOKEN);

    expect(exigirSessaoMock).not.toHaveBeenCalled();
  });

  // ⚠️ O nome NÃO diz 403, e é de propósito — o mesmo critério que
  // `lib/flags.spec.ts` fixou: num teste cujo `client` é mockado, o `ApiError`
  // de `api-client.ts` nunca entra em cena, então um 403 no nome seria uma
  // afirmação que o corpo não mede. O nome diz o que o corpo mede: o erro
  // PROPAGA.
  it('erro da API PROPAGA — não vira inventário vazio (a tela mentiria: "nenhuma empresa")', async () => {
    const erro = new Error('Forbidden');
    clientMock.get.mockRejectedValue(erro);

    await expect(listarInventario(TOKEN)).rejects.toBe(erro);
  });
});
