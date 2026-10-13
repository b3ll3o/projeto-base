// apps/web/app/users/actions.spec.ts
//
// Contrato da Server Action de saída ("Sair").
//
// pt-BR: a Ação existe para que o cookie de sessão desapareça. O que se
// verifica é que ela limpa os DOIS tokens e vai para o login — e o "vai
// para o login" não é decoração: sem o `redirect`, a resposta do Next
// re-renderiza a listagem com o cookie já removido, e a tela de listagem
// (que agora chama `exigirSessao()`) jogaria a pessoa para o login numa
// segunda navegação. Com o redirect, a ida é uma só.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { sair } from './actions.js';
import { limparSessao } from '@/lib/sessao';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/sessao', () => ({
  limparSessao: vi.fn(async () => undefined),
  guardarTokens: vi.fn(async () => undefined),
  lerTokens: vi.fn(async () => ({ accessToken: null, refreshToken: null })),
  exigirSessao: vi.fn(async () => 'token'),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sair', () => {
  it('limpa a sessão', async () => {
    await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

    expect(limparSessao).toHaveBeenCalledTimes(1);
  });

  it('devolve a pessoa para a tela de login', async () => {
    await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
