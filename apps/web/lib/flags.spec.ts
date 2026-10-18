// apps/web/lib/flags.spec.ts
//
// Contrato web↔API das feature flags (Fase 5).
//
// O que estes testes seguram, além do path e do método:
//
//  1. **D14** — `listarFeatureFlags` monta o `ApiClient` SEM `getTenant`. É a
//     razão de o arquivo existir em vez de reusar o factory de `perfil.ts`:
//     mandar `X-Tenant-Id` tira o ator do bucket global (`tenantId !== null`)
//     e D2 exige `tenantId === null`, então o admin do sistema que tivesse
//     empresa selecionada no cookie levaria 403 numa tela recem-nascida.
//     O teste mede a CONFIGURAÇÃO do cliente, não só a chamada — um
//     `getTenant` a mais passaria em qualquer asserção de path.
//  2. O corpo do PUT é o estado INTEIRO (`{ ativada }`), e a chave viaja na
//     URL — o mesmo split do backend.
//  3. Erro não vira sucesso: `403` e corpo inválido propagam, não viram lista
//     vazia nem `undefined` (o defeito do PR #99).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { clientMock, configMock, exigirSessaoMock, lerTenantMock } = vi.hoisted(() => {
  // A anotação é o que segura o teste. Sem ela, `{ getToken: undefined }`
  // infere o tipo LITERAL `undefined`, e `configMock.getToken?.()` estreita
  // para `never` — o tsc falha em código que roda verde no Vitest, que não
  // typecheca. MEDIDO: `TS2349` em `flags.spec.ts:77` depois de 7/7 verde.
  const configMock: {
    baseUrl: string;
    getToken: (() => string) | undefined;
    getTenant: (() => Promise<string | null>) | undefined;
  } = { baseUrl: 'http://api/api/v1', getToken: undefined, getTenant: undefined };
  return {
    clientMock: { get: vi.fn(), put: vi.fn() },
    configMock,
    exigirSessaoMock: vi.fn(async () => 'token-admin'),
    lerTenantMock: vi.fn(async (): Promise<string | null> => 'empresa-do-admin'),
  };
});

vi.mock('./api-client', () => ({
  ApiClient: vi.fn((config: unknown) => {
    Object.assign(configMock, config);
    return clientMock;
  }),
}));
vi.mock('./sessao', () => ({
  exigirSessao: exigirSessaoMock,
  lerTenant: lerTenantMock,
  lerTokens: vi.fn(async () => ({ accessToken: 'token-admin', refreshToken: null })),
}));

const { definirFeatureFlag, listarFeatureFlags } = await import('./flags');

const CHAVE = 'tenancy.invites';

beforeEach(() => {
  vi.clearAllMocks();
  configMock.getToken = undefined;
  configMock.getTenant = undefined;
  clientMock.get.mockResolvedValue([{ chave: CHAVE, descricao: 'Convites', ativada: true }]);
  clientMock.put.mockResolvedValue({ chave: CHAVE, descricao: 'Convites', ativada: false });
});

describe('lib/flags — o cliente da tela de admin', () => {
  it('lista por GET na rota de admin e devolve o que a API devolveu', async () => {
    const resposta = await listarFeatureFlags();

    expect(clientMock.get).toHaveBeenCalledWith('/admin/feature-flags');
    expect(resposta).toEqual([{ chave: CHAVE, descricao: 'Convites', ativada: true }]);
  });

  it('NÃO manda `X-Tenant-Id` — D14: enviar o header tira o admin do bucket global', async () => {
    // `lerTenant` DEVOLVE uma empresa de propósito: o defeito de D14 só
    // aparece quando existe empresa escolhida. Com `lerTenant` devolvendo
    // `null` o header seria omitido de qualquer jeito, e o teste passaria
    // mesmo com o `getTenant` presente.
    await listarFeatureFlags();

    expect(configMock.getTenant).toBeUndefined();
    expect(lerTenantMock).not.toHaveBeenCalled();
  });

  it('manda o token de sessão', async () => {
    await listarFeatureFlags();

    expect(configMock.getToken?.()).toBe('token-admin');
  });

  it('o PUT leva a chave NA URL e o estado no corpo — corpo inteiro, não patch', async () => {
    await definirFeatureFlag(CHAVE, false);

    expect(clientMock.put).toHaveBeenCalledWith(`/admin/feature-flags/${CHAVE}`, {
      ativada: false,
    });
  });

  it('o PUT também é sem `getTenant` — a mesma tela, a mesma decisão', async () => {
    await definirFeatureFlag(CHAVE, true);

    expect(configMock.getTenant).toBeUndefined();
  });

  it('erro 403 da API PROPAGA — não vira lista vazia (a tela mentiria: "nenhuma flag")', async () => {
    const erro = new Error('Forbidden');
    clientMock.get.mockRejectedValue(erro);

    await expect(listarFeatureFlags()).rejects.toBe(erro);
  });

  it('o PUT que falha NÃO resolve como se tivesse gravado', async () => {
    clientMock.put.mockRejectedValue(new Error('VALIDATION_ERROR'));

    await expect(definirFeatureFlag(CHAVE, false)).rejects.toThrow('VALIDATION_ERROR');
  });
});
