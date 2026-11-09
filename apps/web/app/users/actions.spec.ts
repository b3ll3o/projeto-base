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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { sair } from './actions.js';
import { limparSessao, lerTokens } from '@/lib/sessao';

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

// ⚠️ `@/lib/api-client` NÃO é mockado, e é de propósito: o que este spec
// mede é a REVOGAÇÃO de verdade — o `ApiClient` de verdade, chamando o
// `fetch` de verdade. O seam é o `fetch` global (o mesmo que
// `app/login/actions.spec.ts` usa), e o pedido inteiro é conferido: URL,
// método e corpo. Um mock do construtor mediria o mock.

beforeEach(() => {
  vi.clearAllMocks();
  // ⚠️ `clearAllMocks` limpa as CHAMADAS, não as IMPLEMENTAÇÕES — e o mock de
  // `lerTokens` deixado por um teste vaza para o seguinte. Resetar aqui é o
  // que impede um teste de passar (ou de falhar) por causa do anterior.
  vi.mocked(lerTokens).mockResolvedValue({ accessToken: null, refreshToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Resposta de sucesso — a API responde 201 no logout. */
function okResponse() {
  return {
    status: 201,
    ok: true,
    json: async () => ({ revogado: true }),
    text: async () => JSON.stringify({ revogado: true }),
  };
}

/** Resposta 401 — o token já está morto (expirado, ou revogado antes). */
function resposta401() {
  const corpo = {
    type: 'about:blank',
    title: 'Não autorizado',
    status: 401,
    detail: 'Token inválido',
    instance: '/auth/logout',
    code: 'INVALID_TOKEN',
    traceId: 'trace-1',
  };
  return {
    status: 401,
    ok: false,
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
  };
}

/**
 * Embraça o `fetch` global.
 *
 * ⚠️ O stub declara os DOIS parâmetros de propósito: um stub de zero
 * parâmetros tipa `mock.calls` como tupla de comprimento 0, e então ler a
 * URL e o body do pedido não compila.
 */
function stubFetch(resposta: unknown | Error) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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
      const fetchMock = stubFetch(okResponse());

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toContain('/auth/logout');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        refreshToken: 'refresh-que-e-credencial',
      });
    });

    it('a API fora do ar NÃO trava o logout — e o cookie é apagado assim mesmo', async () => {
      vi.mocked(lerTokens).mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      stubFetch(new Error('ECONNREFUSED'));
      const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(limparSessao).toHaveBeenCalledTimes(1);
      // ⚠️ E a falha NÃO é silenciosa: a revogação é o controle que a #132
      // entrega, e uma falha invisível é um controle que não existe.
      expect(erro).toHaveBeenCalled();
      erro.mockRestore();
    });

    it('sem refresh token no cookie, não há o que revogar', async () => {
      vi.mocked(lerTokens).mockResolvedValue({ accessToken: 'access', refreshToken: null });
      const fetchMock = stubFetch(okResponse());

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cookie de refresh VAZIO não é revogado — e não vira log de erro', async () => {
      // ⚠️ Um cookie VAZIO conta como AUSENTE (a regra da casa, em
      // `lib/sessao.ts`). Com `!== null`, ele viraria `{refreshToken: ''}` — a
      // API recusa com 400 (`min(1)`) — e o log acusaria uma revogação que
      // nunca teve token para revogar.
      vi.mocked(lerTokens).mockResolvedValue({ accessToken: 'access', refreshToken: '' });
      const fetchMock = stubFetch(okResponse());
      const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(erro).not.toHaveBeenCalled();
      erro.mockRestore();
    });

    it('401 da API NÃO é falha de revogação — o token já está morto', async () => {
      // ⚠️ O 401 é o estado final DESEJADO (token expirado, ou revogado
      // antes): quem ficou com o browser aberto mais de 7 dias — o TTL do
      // refresh — receberia 401. Logá-lo como "a API não revogou" faria quem
      // investiga abrir chamado de indisponibilidade de uma API que
      // respondeu 401 corretamente.
      vi.mocked(lerTokens).mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
      const fetchMock = stubFetch(resposta401());
      const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(sair(new FormData())).rejects.toThrow('NEXT_REDIRECT:/login');

      // A revogação FOI tentada…
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toContain('/auth/logout');
      // … e o 401 NÃO foi logado como falha.
      expect(erro).not.toHaveBeenCalled();
      // E o logout aconteceu do mesmo jeito.
      expect(limparSessao).toHaveBeenCalledTimes(1);
      erro.mockRestore();
    });
  });
});
