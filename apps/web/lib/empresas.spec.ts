// apps/web/lib/empresas.spec.ts
//
// Contrato web↔API das empresas (onboarding de empresa, 2026-10-21).
//
// O que estes testes seguram, e por quê: as DUAS rotas novas (`POST /tenants`
// e `GET /me/tenants`) não existiam, e a terceira (`POST /invitations/accept`)
// existia mas não devolvia a empresa — sem ela, a conta entrava na empresa e
// ficava com membership sem escopo, o que a tela mostra como "sem permissões"
// sem dizer por quê.
//
// A prova de que o teste tem dente: os PATHS e o BODY são conferidos, e o
// `getTenant` é conferido por AUSÊNCIA — as três rotas são "por conta", e
// mandar `X-Tenant-Id` para quem ainda não tem empresa nenhuma é pedir 403
// `TENANT_MEMBERSHIP_REQUIRED` justamente na página que existe para criar a
// primeira empresa.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from './api-client';

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock PARCIAL: só o construtor é dublê (mesmo padrão de `perfil.spec.ts`).
vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>();
  return { ...actual, ApiClient: vi.fn(() => clientMock) };
});

const { aceitarConvite, criarEmpresa, listarEmpresas } = await import('./empresas');

const TOKEN = 'token-ator';
const EMPRESA = { id: '0190a8b6-0000-7000-8000-00000000000a', nome: 'ACME', slug: 'acme' };

/** A config da ÚLTIMA construção do `ApiClient`. */
function configAtual(): { getToken?: () => string | null; getTenant?: () => string | null } {
  const ctor = ApiClient as unknown as { mock: { calls: unknown[][] } };
  const ultima = ctor.mock.calls[ctor.mock.calls.length - 1];
  return (ultima?.[0] ?? {}) as { getToken?: () => string | null; getTenant?: () => string | null };
}

beforeEach(() => {
  clientMock.get.mockReset();
  clientMock.post.mockReset();
  clientMock.get.mockResolvedValue([]);
  clientMock.post.mockResolvedValue(EMPRESA);
});

describe('listarEmpresas — GET /me/tenants', () => {
  it('lê as empresas do ator e devolve a lista como veio', async () => {
    const lista = [{ ...EMPRESA, role: 'gerente' }];
    clientMock.get.mockResolvedValue(lista);

    await expect(listarEmpresas(TOKEN)).resolves.toEqual(lista);
    expect(clientMock.get.mock.calls[0]?.[0]).toBe('/me/tenants');
  });

  it('a lista vazia é uma RESPOSTA, não um erro (a conta em onboarding não tem empresa)', async () => {
    clientMock.get.mockResolvedValue([]);
    await expect(listarEmpresas(TOKEN)).resolves.toEqual([]);
  });
});

describe('criarEmpresa — POST /tenants', () => {
  it('manda o nome e o slug, e devolve a empresa criada', async () => {
    await expect(criarEmpresa(TOKEN, { nome: 'ACME', slug: 'acme' })).resolves.toEqual(EMPRESA);
    expect(clientMock.post).toHaveBeenCalledWith('/tenants', { nome: 'ACME', slug: 'acme' });
  });
});

describe('aceitarConvite — POST /invitations/accept', () => {
  it('manda o token e devolve a empresa que convidou', async () => {
    const aceite = { aceito: true as const, tenantId: EMPRESA.id };
    clientMock.post.mockResolvedValue(aceite);

    await expect(aceitarConvite(TOKEN, 'a'.repeat(64))).resolves.toEqual(aceite);
    expect(clientMock.post).toHaveBeenCalledWith('/invitations/accept', { token: 'a'.repeat(64) });
  });
});

describe('o cliente das empresas', () => {
  it('manda o token do ator', async () => {
    await listarEmpresas(TOKEN);
    expect(configAtual().getToken?.()).toBe(TOKEN);
  });

  it('NÃO monta `getTenant` — nenhuma das três rotas é "por empresa"', async () => {
    // A asserção de AUSÊNCIA. Montar `getTenant` devolveria `X-Tenant-Id` e a
    // API responderia 403 `TENANT_MEMBERSHIP_REQUIRED` para quem ainda não
    // pertence a empresa nenhuma — que é exatamente quem usa a página de
    // criação de empresa.
    await listarEmpresas(TOKEN);
    expect(configAtual().getTenant).toBeUndefined();
  });

  it('nenhum path começa com /api/v1 — o prefixo já vem em API_BASE_URL', async () => {
    // MEDIDO 2026-10-16 no `perfil.ts`: prefixar de novo mandava
    // `/api/v1/api/v1/...` e as 4 telas admin respondiam "Acesso restrito"
    // para todo mundo, com a suíte verde.
    await listarEmpresas(TOKEN);
    await criarEmpresa(TOKEN, { nome: 'ACME', slug: 'acme' });
    await aceitarConvite(TOKEN, 'a'.repeat(64));

    const paths = [
      ...clientMock.get.mock.calls.map((c: unknown[]) => c[0] as string),
      ...clientMock.post.mock.calls.map((c: unknown[]) => c[0] as string),
    ];
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => p.startsWith('/api/v1'))).toEqual([]);
  });
});
