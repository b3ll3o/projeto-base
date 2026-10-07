// apps/web/app/users/novo/actions.spec.ts
//
// Contrato da Server Action de cadastro.
//
// pt-BR: a Action é testada por `fetch` injetado via `vi.stubGlobal` — o
// `ApiClient` usa o `fetch` global quando nenhum é passado em `init`, e é
// esse caminho que a Action exercita. Não há seam de produção só para teste:
// o seam já existe (`ApiRequestInit.fetch`) e o caller real não o usa.
//
// O `redirect` do Next é mockado para lançar um sentinela, como o framework
// faz. Sem isso, um `try/catch` bem-intencionado engoliria a exceção de
// redirect e a tela ficaria "preso" no formulário depois do sucesso.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { cadastrarUsuario } from './actions.js';
import type { CadastroUsuarioState } from './state.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const INICIAL: CadastroUsuarioState = {
  ok: false,
  fieldErrors: {},
  formError: null,
  valores: { nome: '', email: '' },
};

/** Resposta JSON com o envelope RFC 7807 que a API devolve. */
function problem(status: number, code: string, title: string, errors?: unknown[]) {
  return {
    status,
    ok: false,
    json: async () => ({
      type: 'about:blank',
      title,
      status,
      detail: title,
      instance: '/api/v1/users',
      code,
      traceId: 'trace-123',
      ...(errors ? { errors } : {}),
    }),
  };
}

function okResponse(body: unknown = { id: 'u1' }) {
  return { status: 201, ok: true, json: async () => body };
}

function formData(nome: string, email: string): FormData {
  const fd = new FormData();
  fd.set('nome', nome);
  fd.set('email', email);
  return fd;
}

/** Chamadas de fetch feitas pela Action, para inspecionar o que foi enviado. */
let chamadas: Array<{ url: string; init?: RequestInit | undefined }> = [];

function responder(resposta: unknown) {
  chamadas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url: String(url), init });
      if (resposta instanceof Error) throw resposta;
      return resposta;
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cadastrarUsuario — caminho feliz', () => {
  it('cria o usuário e redireciona para a listagem', async () => {
    responder(okResponse());

    // pt-BR: `redirect()` sinaliza a navegação LANÇANDO — é assim que o
    // Next marca o fluxo. O sentinela chegar ao chamador é parte do
    // contrato: se a Action engolisse essa exceção, a pessoa ficaria
    // olhando um formulário preenchido de um usuário que já existe.
    await expect(
      cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com')),
    ).rejects.toThrow('NEXT_REDIRECT:/users');

    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/users');
  });

  it('envia só nome e email, já aparados, para POST /users', async () => {
    responder(okResponse());

    await expect(
      cadastrarUsuario(INICIAL, formData('  Maria Silva  ', '  maria@empresa.com ')),
    ).rejects.toThrow();

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toContain('/users');
    expect(chamadas[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(chamadas[0]?.init?.body))).toEqual({
      nome: 'Maria Silva',
      email: 'maria@empresa.com',
    });
  });
});

describe('cadastrarUsuario — validação no cliente da Action', () => {
  it('não chama a API quando o nome está vazio e aponta o campo', async () => {
    responder(okResponse());

    const r = await cadastrarUsuario(INICIAL, formData('', 'maria@empresa.com'));

    expect(chamadas).toHaveLength(0);
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.nome).toBe('Informe o nome do usuário.');
    expect(r.fieldErrors.email).toBeUndefined();
  });

  it('não chama a API quando o email é inválido e aponta o campo', async () => {
    responder(okResponse());

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'nao-e-email'));

    expect(chamadas).toHaveLength(0);
    expect(r.fieldErrors.email).toContain('Exemplo: nome@empresa.com');
  });

  it('preserva o que a pessoa digitou ao voltar o erro', async () => {
    responder(okResponse());

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'nao-e-email'));

    expect(r.valores).toEqual({ nome: 'Maria Silva', email: 'nao-e-email' });
  });
});

describe('cadastrarUsuario — erro 409 (email duplicado)', () => {
  it('aponta o erro no campo email, não no topo do formulário', async () => {
    responder(problem(409, 'EMAIL_IN_USE', 'Email já em uso'));

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.ok).toBe(false);
    expect(r.fieldErrors.email).toBe('Este email já está cadastrado.');
    expect(r.formError).toBeNull();
  });

  it('não redireciona quando a criação falha', async () => {
    responder(problem(409, 'EMAIL_IN_USE', 'Email já em uso'));

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
    // pt-BR: o `not.toHaveBeenCalled()` sozinho é quase tautológico dado o
    // fluxo — o `redirect` não é alcançado porque a Action retorna antes. O
    // que dá substância ao teste é o ESTADO devolvido: se a falha passasse
    // a redirecionar, ou a devolver o inicial sem o erro do campo, é aqui que
    // aparece. A proteção do `redirect` fora do `try` fica no teste do
    // caminho feliz, que afirma o sentinela `NEXT_REDIRECT`.
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.email).toBe('Este email já está cadastrado.');
    expect(r.valores).toEqual({ nome: 'Maria Silva', email: 'maria@empresa.com' });
  });
});

describe('cadastrarUsuario — erro 400 (validação do backend)', () => {
  it('distribui errors[] pelos campos correspondentes', async () => {
    responder(
      problem(400, 'VALIDATION_ERROR', 'Erro de validação', [
        {
          field: 'nome',
          message: 'String must contain at least 1 character(s)',
          code: 'too_small',
        },
        { field: 'email', message: 'Invalid email', code: 'invalid_string' },
      ]),
    );

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.fieldErrors.nome).toContain('at least 1 character');
    expect(r.fieldErrors.email).toBe('Invalid email');
    expect(r.formError).toBeNull();
  });

  it('um erro de campo que o formulário não tem vira erro de formulário, não some', async () => {
    responder(
      problem(400, 'VALIDATION_ERROR', 'Erro de validação', [
        { field: 'senha', message: 'Senha obrigatória', code: 'required' },
      ]),
    );

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    // pt-BR: o tipo de `fieldErrors` só conhece os campos do formulário —
    // é proposital. O teste olha por uma chave que NÃO existe no tipo, que
    // é exatamente o caso que precisa ser provado.
    expect(Object.keys(r.fieldErrors)).not.toContain('senha');
    expect(r.formError).toContain('Senha obrigatória');
  });
});

describe('cadastrarUsuario — falha inesperada', () => {
  it('500 não vaza o título cru da API para a tela', async () => {
    responder(problem(500, 'INTERNAL_ERROR', 'Erro interno'));

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.ok).toBe(false);
    expect(r.formError).not.toContain('Erro interno');
    expect(r.formError).toContain('Não foi possível cadastrar');
  });

  it('o erro de formulário carrega o traceId, para suporte', async () => {
    responder(problem(500, 'INTERNAL_ERROR', 'Erro interno'));

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.formError).toContain('trace-123');
  });

  it('rede caída vira erro de formulário, sem estourar', async () => {
    responder(new TypeError('fetch failed'));

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.ok).toBe(false);
    expect(r.formError).toBeTruthy();
  });

  it('resposta de erro sem corpo JSON não quebra a Action', async () => {
    responder({
      status: 502,
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.ok).toBe(false);
    expect(r.formError).toBeTruthy();
  });
});
