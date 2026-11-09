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
import { limparSessao, lerTokens } from '@/lib/sessao';
import { ApiClient } from '@/lib/api-client';

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

vi.mock('@/lib/api-client', () => ({
  ApiClient: vi.fn(() => ({ post: vi.fn(async () => ({ revogado: true })) })),
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

  // ─── #132: o "sair" REVOGA o refresh token no backend ─────────────────────
  //
  // ⚠️ Sem estes casos, a revogação NÃO é exercitada: o mock de `lerTokens`
  // devolve `refreshToken: null`, e o `if` nunca entra. A spec ficava verde
  // sem provar nada do que a #132 adds no web.
  describe('#132 — a revogação no backend', () => {
    it('chama POST /auth/logout com o refresh token', async () => {
      vi.mocked(lerTokens).mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh-que-e-credencial',
      });
      const post = vi.fn(async () => ({ revogado: true }));
      vi.mocked(ApiClient).mockImplementation(
        () => ({ post }) as unknown as InstanceType<typeof ApiClient>,
      );

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(post).toHaveBeenCalledWith('/auth/logout', {
        refreshToken: 'refresh-que-e-credencial',
      });
    });

    it('a API fora do ar NÃO trava o logout — e o cookie é apagado assim mesmo', async () => {
      vi.mocked(lerTokens).mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      const post = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      });
      vi.mocked(ApiClient).mockImplementation(
        () => ({ post }) as unknown as InstanceType<typeof ApiClient>,
      );
      const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(limparSessao).toHaveBeenCalledTimes(1);
      // ⚠️ E a falha NÃO é silenciosa: a revogação é o controle que a #132
      // entrega, e uma falha invisível é um controle que não existe.
      expect(erro).toHaveBeenCalled();
      erro.mockRestore();
    });

    it('sem refresh token no cookie, não há o que revogar', async () => {
      // ⚠️ O mock é resetado EXPLICITAMENTE: `vi.clearAllMocks()` limpa as
      // chamadas, mas NÃO as implementações — e o caso anterior deixou um
      // `lerTokens` devolvendo um refresh token.
      vi.mocked(lerTokens).mockResolvedValue({ accessToken: 'access', refreshToken: null });
      const post = vi.fn(async () => ({ revogado: true }));
      vi.mocked(ApiClient).mockImplementation(
        () => ({ post }) as unknown as InstanceType<typeof ApiClient>,
      );

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(post).not.toHaveBeenCalled();
    });
  });
});
