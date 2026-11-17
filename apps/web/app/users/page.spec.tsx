// apps/web/app/users/page.spec.tsx
//
// O FURO que este spec fecha: o LINK da listagem é do ADMINISTRADOR DO
// SISTEMA. O `isAdmin` da EMPRESA é o do DONO (`true` em toda empresa nova),
// e usá-lo abriria o detalhe de uma pessoa — e as empresas em que ela está —
// para um gerente que a API recusa com 403.
//
// E o segundo furo: a LEITURA DO PERFIL não pode derrubar a LISTAGEM. Uma API
// fora do ar no perfil tem de devolver a lista SEM link — não a página de erro.
//
// A página é RSC e está fora do denominador de cobertura
// (`vitest.config.ts`: `app/**/*.tsx`); o comportamento no browser é do e2e
// (F20). Este spec fixa a DECISÃO da página — quem vê o link — que é a única
// coisa que nenhum outro arquivo fixa.

// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const obterMeuPerfilGlobal = vi.fn();
const exigirSessao = vi.fn();
const get = vi.fn();

vi.mock('../../lib/sessao', () => ({
  exigirSessao: () => exigirSessao(),
  lerTenant: vi.fn(async (): Promise<string | null> => null),
  lerTokens: vi.fn(async () => ({ accessToken: 'token', refreshToken: null })),
}));

vi.mock('../../lib/perfil', () => ({
  obterMeuPerfilGlobal: (accessToken?: string) => obterMeuPerfilGlobal(accessToken),
}));

// ⚠️ O `ApiClient` é dublê: o que esta spec mede é a DECISÃO da página (link
// ou não), e não o contrato HTTP. O `ApiError` é uma classe de verdade,
// porque a página testa `err instanceof ApiError`.
vi.mock('../../lib/api-client', () => {
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    baseUrlDaApi: () => 'http://api.test',
    revogarRefreshToken: vi.fn(),
    ApiClient: class {
      constructor(_config: unknown) {}
      get<T>(): Promise<T> {
        return get() as Promise<T>;
      }
    },
  };
});

vi.mock('./actions', () => ({ sair: vi.fn() }));

const { default: Page } = await import('./page');

const PAGINA = {
  users: [{ id: 'u1', nome: 'Dona Da Empresa', email: 'dona@exemplo.dev', version: 3 }],
  nextCursor: null,
};

describe('users — a listagem só é clicável pelo ADMINISTRADOR DO SISTEMA', () => {
  beforeEach(() => {
    obterMeuPerfilGlobal.mockReset();
    exigirSessao.mockReset().mockResolvedValue('token');
    get.mockReset().mockResolvedValue(PAGINA);
  });

  // O projeto não usa `globals: true`: sem `cleanup`, o DOM acumulado faz o
  // segundo teste achar o link do primeiro.
  afterEach(() => {
    cleanup();
  });

  it('para o administrador do sistema, a pessoa abre o detalhe', async () => {
    obterMeuPerfilGlobal.mockResolvedValue({ isAdmin: true });

    render(await Page());

    expect(screen.getByRole('link', { name: /Dona Da Empresa/ })).toHaveAttribute(
      'href',
      '/users/u1',
    );
  });

  it('para quem não é administrador do sistema, a linha é texto — e a lista continua', async () => {
    obterMeuPerfilGlobal.mockResolvedValue({ isAdmin: false });

    render(await Page());

    expect(screen.queryByRole('link', { name: /Dona Da Empresa/ })).not.toBeInTheDocument();
    expect(screen.getByText('Dona Da Empresa')).toBeInTheDocument();
  });

  it('a leitura do perfil que falha NÃO derruba a listagem — e ela segue sem link', async () => {
    obterMeuPerfilGlobal.mockRejectedValue(new Error('500 Internal Server Error'));

    render(await Page());

    expect(screen.getByText('Dona Da Empresa')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dona Da Empresa/ })).not.toBeInTheDocument();
  });
});
