// apps/web/app/login/actions.spec.ts
//
// Contrato da Server Action de login.
//
// pt-BR: a Action é testada por `fetch` injetado via `vi.stubGlobal` — o
// `ApiClient` cai no `fetch` global quando nenhum é passado em `init`, e é
// esse caminho que a Action exercita. O seam já existe
// (`ApiRequestInit.fetch`) e o caller real não o usa.
//
// `@/lib/sessao` é mockado de propósito, e a escolha é o que este arquivo
// verifica: a Action precisa CHAMAR `guardarTokens` com os tokens que a API
// devolveu. Se a Action chamasse o store de cookies direto, o teste passaria
// com a sessão nunca guardada — o cookie é o produto inteiro dessa tela.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { entrar } from './actions.js';
import { guardarTokens } from '@/lib/sessao';
import { CREDENCIAIS_INVALIDAS, ERRO_GENERICO_LOGIN, type LoginState } from './state.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/sessao', () => ({
  guardarTokens: vi.fn(async () => undefined),
  lerTokens: vi.fn(async () => ({ accessToken: null, refreshToken: null })),
  exigirSessao: vi.fn(async () => 'token'),
  limparSessao: vi.fn(async () => undefined),
}));

const INICIAL: LoginState = {
  ok: false,
  fieldErrors: {},
  formError: null,
  valores: { email: '', senha: '' },
};

const CREDENCIAIS_VALIDAS = { email: 'maria@empresa.com', senha: 'segredo123' };

function formData(email = CREDENCIAIS_VALIDAS.email, senha = CREDENCIAIS_VALIDAS.senha) {
  const fd = new FormData();
  fd.set('email', email);
  fd.set('senha', senha);
  return fd;
}

/** Envelope RFC 7807, como a API devolve nos erros. */
function problem(status: number, code: string, title: string, errors?: unknown[]) {
  return {
    status,
    ok: false,
    json: async () => ({
      type: 'about:blank',
      title,
      status,
      detail: title,
      instance: '/api/v1/auth/login',
      code,
      traceId: 'trace-123',
      ...(errors ? { errors } : {}),
    }),
  };
}

function okResponse(body: unknown) {
  return { status: 201, ok: true, json: async () => body };
}

const RESPOSTA_VALIDA = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
  user: { id: 'u1', nome: 'Maria', email: CREDENCIAIS_VALIDAS.email },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('entrar — caminho feliz', () => {
  it('guarda os dois tokens devolvidos pela API e redireciona para /users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse(RESPOSTA_VALIDA)),
    );

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    expect(guardarTokens).toHaveBeenCalledWith('access-abc', 'refresh-xyz');
  });

  it('o pedido vai para /auth/login com o par email/senha e sem token', async () => {
    // pt-BR: o mock declara os DOIS parâmetros de propósito. Um stub de
    // zero parâmetros tipa `mock.calls` como tupla de comprimento 0, e
    // então ler a URL e o body do pedido não compila.
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      okResponse(RESPOSTA_VALIDA),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(entrar(INICIAL, formData())).rejects.toThrow();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain('/auth/login');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(CREDENCIAIS_VALIDAS);
    // pt-BR: login é público. Mandar `authorization` aqui seria mandar
    // credencial velha num pedido que não pede nenhuma.
    expect(new Headers(init?.headers).get('authorization')).toBeNull();
  });

  it('o e-mail é enviado aparado — o mesmo valor que o schema valida', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      okResponse(RESPOSTA_VALIDA),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      entrar(INICIAL, formData('  maria@empresa.com  ', 'segredo123')),
    ).rejects.toThrow();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'maria@empresa.com',
      senha: 'segredo123',
    });
  });
});

describe('entrar — credencial recusada (o caso de segurança)', () => {
  // pt-BR: os quatro testes abaixo cobrem a MESMA resposta 401 vinda por
  // caminhos diferentes, e todos esperam o MESMO estado. Isso é o que
  // fecha a enumeração de contas: se um dia alguém "melhorar" a mensagem
  // para 401 distinguindo e-mail de senha, os quatro caem juntos.

  it('401 da API vira mensagem genérica, sem marcar campo nenhum', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(401, 'INVALID_CREDENTIALS', 'Não autorizado')),
    );

    const estado = await entrar(INICIAL, formData());

    expect(estado.formError).toBe(CREDENCIAIS_INVALIDAS);
    expect(estado.fieldErrors).toEqual({});
  });

  it('401 NÃO devolve a senha digitada (o segredo não volta ao browser)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(401, 'INVALID_CREDENTIALS', 'Não autorizado')),
    );

    const estado = await entrar(INICIAL, formData());

    expect(estado.valores.senha).toBe('');
    // pt-BR: o e-mail volta, a senha não. Devolver o e-mail evita a
    // redigitação; devolver a senha colocaria o segredo no payload da
    // Server Action, visível no DevTools — que é exatamente o que o
    // `httpOnly` do cookie de sessão existe para impedir.
    expect(estado.valores.email).toBe('maria@empresa.com');
  });

  it('401 não guarda cookie nenhum — a pessoa NÃO entrou', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(401, 'INVALID_CREDENTIALS', 'Não autorizado')),
    );

    await entrar(INICIAL, formData());

    expect(guardarTokens).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('a mensagem não diz qual dos dois estava errado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(401, 'INVALID_CREDENTIALS', 'Não autorizado')),
    );

    const estado = await entrar(INICIAL, formData());
    const texto = (estado.formError ?? '').toLowerCase();

    // pt-BR: o teste afirma sobre o TEXTO QUE A PESSOA LÊ, não sobre um
    // campo interno. Um `formError` que contivesse "não encontrado" cairia
    // aqui; uma constante interna errada, não — e é a constante que o
    // DevTools mostra.
    expect(texto).not.toContain('não encontrado');
    expect(texto).not.toContain('não existe');
    expect(texto).not.toContain('inválido');
  });
});

describe('entrar — validação local (não chega a chamar a API)', () => {
  it('campo em branco reprova no servidor, sem pedir nada a ninguém', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const estado = await entrar(INICIAL, formData('', ''));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(estado.fieldErrors.email).toBeTruthy();
    expect(estado.fieldErrors.senha).toBeTruthy();
  });

  it('e-mail malformado reprova com erro no campo email', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const estado = await entrar(INICIAL, formData('nao-e-email', 'segredo123'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(estado.fieldErrors.email).toBeTruthy();
    expect(estado.formError).toBeNull();
  });

  it('campo em branco tem MENSAGEM — um erro sem texto não ajuda ninguém', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const estado = await entrar(INICIAL, formData('', ''));

    expect(estado.fieldErrors.email).toBe('Informe o e-mail.');
  });
});

describe('entrar — falhas que não são de credencial', () => {
  it('erro de rede vira mensagem genérica, não exceção', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const estado = await entrar(INICIAL, formData());

    expect(estado.formError).toBe(ERRO_GENERICO_LOGIN);
    expect(guardarTokens).not.toHaveBeenCalled();
  });

  it('200 SEM tokens é falha, não login — não guarda cookie vazio', async () => {
    // pt-BR: um 200 com corpo vazio é o modo de falha silencioso desta
    // tela. Guardar `undefined` como cookie produz um cookie vazio, que
    // `exigirSessao` trata como ausente — a pessoa cairia no `/users`,
    // seria jogada de volta ao login, sem entender nada.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse({})),
    );

    const estado = await entrar(INICIAL, formData());

    expect(guardarTokens).not.toHaveBeenCalled();
    expect(estado.formError).toBe(ERRO_GENERICO_LOGIN);
  });

  it('500 da API traz o traceId no texto — é o que reabre a conversa com o suporte', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(500, 'INTERNAL_ERROR', 'Erro interno')),
    );

    const estado = await entrar(INICIAL, formData());

    expect(estado.formError).toContain('trace-123');
  });

  it('422 com `errors[]` vira erro por campo, não erro genérico', async () => {
    // pt-BR: o caminho de validação do SERVIDOR. É alcançável mesmo com o
    // schema local no lugar — a cópia web pode envelhecer em relação ao
    // backend — e sem este teste o ramo ficaria escrito e nunca
    // exercitado, que é como uma tradução de erro apodrece.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        problem(422, 'VALIDATION_ERROR', 'Erro de validação', [
          { field: 'email', message: 'E-mail não reconhecido.' },
        ]),
      ),
    );

    const estado = await entrar(INICIAL, formData());

    expect(estado.fieldErrors.email).toBe('E-mail não reconhecido.');
    expect(estado.formError).toBeNull();
  });

  it('erro de campo que o formulário não conhece SOBE para o topo, não é descartado', async () => {
    // pt-BR: descartar seria a mesma falha de um log em inglês numa tela
    // pt-BR — a pessoa ficaria sem nenhuma explicação visível.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        problem(422, 'VALIDATION_ERROR', 'Erro de validação', [
          { field: 'campo-que-nao-existe', message: 'Algo não bateu.' },
        ]),
      ),
    );

    const estado = await entrar(INICIAL, formData());

    expect(estado.formError).toBe('Algo não bateu.');
  });
});
