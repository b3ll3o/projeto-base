// apps/web/app/convite/[token]/page.spec.tsx
//
// Teste da página de convite: para ONDE a pessoa vai.
//
// pt-BR (onboarding de empresa, 2026-10-21): a página tem DUAS decisões, e
// as duas são de rota — sem sessão, o caminho é o cadastro COM o token; com
// sessão, o caminho é o aceite.
//
// ⚠️ `next/navigation` é mockado pelo mesmo motivo do spec do login: o
// `redirect` real lança `NEXT_REDIRECT`, e aqui nada navega de verdade.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import { lerTokens } from '@/lib/sessao';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/sessao', () => ({
  lerTokens: vi.fn(async () => ({ accessToken: 'token-ator', refreshToken: 'refresh-ator' })),
  exigirSessao: vi.fn(async () => 'token-ator'),
  guardarTenant: vi.fn(async () => undefined),
}));

import PaginaConvite from './page';

const TOKEN = 'a'.repeat(64);

async function renderCom(token: string) {
  render(await PaginaConvite({ params: Promise.resolve({ token }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('PaginaConvite — sem sessão', () => {
  it('manda a pessoa para o CADASTRO com o token — é de lá que a conta nasce na empresa', async () => {
    vi.mocked(lerTokens).mockResolvedValueOnce({ accessToken: null, refreshToken: null });

    // pt-BR: o `redirect` LANÇA (é assim que o Next sinaliza a navegação),
    // então o render PROPAGA a exceção — como o render de uma página real.
    await expect(renderCom(TOKEN)).rejects.toThrow(`NEXT_REDIRECT:/users/novo?convite=${TOKEN}`);

    // pt-BR: o token vai na query porque a página de cadastro é a porta de
    // entrada pública; ele volta no FormData e a Action o valida de novo.
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(`/users/novo?convite=${TOKEN}`);
  });
});

describe('PaginaConvite — com sessão', () => {
  it('oferece o aceite, sem redirecionar para lugar nenhum', async () => {
    await renderCom(TOKEN);

    expect(screen.getByRole('button', { name: /aceitar convite/i })).toBeInTheDocument();
    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
  });
});

describe('PaginaConvite — token que não tem o formato', () => {
  it('diz que o convite é inválido, sem mandar a pessoa para o cadastro', async () => {
    await renderCom('token-adulterado');

    expect(screen.getByRole('heading', { name: 'Convite inválido' })).toBeInTheDocument();
    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /aceitar convite/i })).toBeNull();
  });
});
