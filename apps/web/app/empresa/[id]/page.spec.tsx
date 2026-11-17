// apps/web/app/empresa/[id]/page.spec.tsx
//
// O FURO que este spec fecha: trocar `exigirAdminDoSistema()` por
// `exigirAdmin()` na página da empresa deixaria a suíte INTEIRA verde e a
// tela errada — o `isAdmin` do DONO é `true` em toda empresa nova, então o
// gerente de empresa passaria pelo guard e veria os MEMBROS de uma empresa
// alheia, que a API recusa por D2.
//
// É o mesmo furo que `app/admin/tenancy/page.spec.tsx` fecha: as telas do
// admin do sistema leem o bucket GLOBAL, e nada ligava essa escolha ao ponto
// de chamada.
//
// A página é RSC e está fora do denominador de cobertura
// (`vitest.config.ts`: `app/**/*.tsx`): este spec fixa a ESCOLHA do guard, e
// o comportamento da tela é medido pelo e2e (F20).

// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const exigirAdminDoSistema = vi.fn();
const exigirAdmin = vi.fn();
const listarInventario = vi.fn();
const exigirSessao = vi.fn();

// ⚠️ O caminho relativo resolve o MESMO arquivo que a página importa — um
// caminho que não resolve não dá erro: o mock é registrado sob uma chave que
// ninguém importa, e o spec falha sem dizer por quê.
vi.mock('../../admin/guard-admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../admin/guard-admin')>();
  return {
    ...real,
    exigirAdminDoSistema: (accessToken?: string) => exigirAdminDoSistema(accessToken),
    exigirAdmin: () => exigirAdmin(),
  };
});
// ⚠️ `lerTenant`/`lerTokens` estão aqui porque o `guard-admin.tsx` VERDADEIRO
// importa `lib/perfil.ts`, que os usa — e o mock é por MÓDULO resolvido.
vi.mock('../../../lib/sessao', () => ({
  exigirSessao: () => exigirSessao(),
  lerTenant: vi.fn(async (): Promise<string | null> => null),
  lerTokens: vi.fn(async () => ({ accessToken: 'token-admin', refreshToken: null })),
}));
// ⚠️ O mock é PARCIAL: `vinculo` (o rótulo `papel · perfil`) mora em
// `lib/tenancy.ts`, e um mock que só devolvesse `listarInventario` o deixaria
// `undefined` — e a página quebraria ao renderizar a tabela de membros.
vi.mock('../../../lib/tenancy', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/tenancy')>();
  return {
    ...real,
    listarInventario: (accessToken: string) => listarInventario(accessToken),
  };
});

const { default: Page } = await import('./page');

/** Os params da rota — `id` é o UUID da empresa. */
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('empresa/[id] — a página da empresa usa o guard do ADMINISTRADOR DO SISTEMA', () => {
  beforeEach(() => {
    exigirAdminDoSistema.mockReset();
    exigirAdmin.mockReset();
    listarInventario.mockReset().mockResolvedValue({
      empresas: [
        {
          id: 'e1',
          nome: 'Acme',
          slug: 'acme',
          membros: [
            {
              id: 'u1',
              nome: 'Dona Da Empresa',
              email: 'dona@exemplo.dev',
              role: 'gerente',
              perfil: 'gerente',
            },
          ],
        },
      ],
      usuarios: [],
    });
    exigirSessao.mockReset().mockResolvedValue('token-admin');
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
    exigirAdmin.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
  });

  afterEach(() => {
    cleanup();
  });

  it('chama `exigirAdminDoSistema()` e NUNCA `exigirAdmin()`', async () => {
    await Page(params('e1'));

    expect(exigirAdminDoSistema).toHaveBeenCalledTimes(1);
    expect(exigirAdmin).not.toHaveBeenCalled();
  });

  it('manda o MESMO token para o guard e para a leitura — a sessão é lida UMA vez', async () => {
    await Page(params('e1'));

    expect(exigirSessao).toHaveBeenCalledTimes(1);
    expect(exigirAdminDoSistema).toHaveBeenCalledWith('token-admin');
    expect(listarInventario).toHaveBeenCalledWith('token-admin');
  });

  it('devolve a TELA do guard quando o guard bloqueia — e não busca o inventário', async () => {
    const tela = { tipo: 'negativa-do-guard' };
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: true, tela });

    expect(await Page(params('e1'))).toBe(tela);
    expect(listarInventario).not.toHaveBeenCalled();
  });

  it('a leitura que falha mostra "Serviço indisponível" — e NÃO propaga o erro', async () => {
    listarInventario.mockRejectedValue(new Error('500 Internal Server Error'));

    render(await Page(params('e1')));

    expect(screen.getByRole('heading', { name: 'Serviço indisponível' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acme' })).not.toBeInTheDocument();
  });

  it('mostra a empresa e quem está dentro dela', async () => {
    render(await Page(params('e1')));

    expect(screen.getByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.getByText('Dona Da Empresa')).toBeInTheDocument();
    expect(screen.getByText('dona@exemplo.dev')).toBeInTheDocument();
    // O vínculo: o rótulo do papel e o perfil efetivo NAQUELA empresa.
    expect(screen.getByText('papel: gerente · perfil: gerente')).toBeInTheDocument();
  });
});
