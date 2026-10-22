// apps/web/app/empresa/nova/actions.spec.ts
//
// Contrato da Server Action de criação de empresa.
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
import { criarEmpresaDoAtor } from './actions.js';
import { EMPRESA_INICIAL } from './state.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

/** Store de cookies em memória, com o formato que o Next 15 entrega. */
const estado = { valores: new Map<string, string>() };

const store = {
  get: (name: string) => {
    const value = estado.valores.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set: (name: string, value: string) => {
    estado.valores.set(name, value);
  },
  delete: (name: string) => {
    estado.valores.delete(name);
  },
};

// pt-BR: `cookies()` é assíncrono no Next 15, e a referência a `store` fica
// DENTRO do `async` — assim ela só é lida quando a Action chama, e não
// quando o módulo é importado (o `vi.mock` é içado para o topo do arquivo).
vi.mock('next/headers', () => ({
  cookies: async () => store,
}));

/** Resposta JSON com o envelope RFC 7807 que a API devolve. */
function problem(status: number, code: string, title: string, errors?: unknown[]) {
  const body = {
    type: 'about:blank',
    title,
    status,
    detail: title,
    instance: '/api/v1/tenants',
    code,
    traceId: 'trace-123',
    ...(errors ? { errors } : {}),
  };
  return { status, ok: false, json: async () => body, text: async () => JSON.stringify(body) };
}

function okResponse(body: unknown = { id: 'empresa-1', nome: 'ACME', slug: 'acme' }) {
  return { status: 201, ok: true, json: async () => body, text: async () => JSON.stringify(body) };
}

function formData(nome: string, slug: string): FormData {
  const fd = new FormData();
  fd.set('nome', nome);
  fd.set('slug', slug);
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
  estado.valores.clear();
  // A Action exige sessão: sem o cookie de access, `exigirSessao()`
  // redireciona para `/login` e nada é enviado.
  estado.valores.set('access_token', 'token-ator');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('criarEmpresaDoAtor — caminho feliz', () => {
  it('cria a empresa, aponta a sessão para ela e redireciona para a listagem', async () => {
    responder(okResponse());

    await expect(criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'))).rejects.toThrow(
      'NEXT_REDIRECT:/users',
    );

    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/users');
    // pt-BR: o cookie `tenant_id` é o que faz a sessão agir na empresa nova.
    // Sem ele, a pessoa cai no `/users` sem escopo e a listagem volta vazia
    // sem dizer por quê.
    expect(estado.valores.get('tenant_id')).toBe('empresa-1');
  });

  it('envia nome e identificador aparados para POST /tenants', async () => {
    responder(okResponse());

    await expect(
      criarEmpresaDoAtor(EMPRESA_INICIAL, formData('  ACME  ', '  acme  ')),
    ).rejects.toThrow();

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toContain('/tenants');
    expect(chamadas[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(chamadas[0]?.init?.body))).toEqual({ nome: 'ACME', slug: 'acme' });
  });

  it('NÃO manda o header de empresa — a rota é "por conta"', async () => {
    // pt-BR: esta é a armadilha da rota. Quem ainda não tem empresa receberia
    // 403 `TENANT_MEMBERSHIP_REQUIRED` de `X-Tenant-Id` — a resposta errada
    // logo depois de criar a primeira empresa.
    responder(okResponse());

    await expect(criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'))).rejects.toThrow();

    const headers = chamadas[0]?.init?.headers as Headers | undefined;
    expect(headers?.get('x-tenant-id')).toBeNull();
  });
});

describe('criarEmpresaDoAtor — validação no servidor da Action', () => {
  it('não chama a API quando o nome está vazio e aponta o campo', async () => {
    responder(okResponse());

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('', 'acme'));

    expect(chamadas).toHaveLength(0);
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.nome).toBe('Informe o nome da empresa.');
    expect(r.fieldErrors.slug).toBeUndefined();
  });

  it('não chama a API quando o identificador está fora do padrão', async () => {
    responder(okResponse());

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'ACME LTDA'));

    expect(chamadas).toHaveLength(0);
    expect(r.fieldErrors.slug).toContain('minúsculas');
  });

  it('preserva o que a pessoa digitou ao voltar o erro', async () => {
    responder(okResponse());

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'ACME LTDA'));

    expect(r.valores).toEqual({ nome: 'ACME', slug: 'ACME LTDA' });
  });
});

describe('criarEmpresaDoAtor — erro 409 (identificador já usado)', () => {
  it('aponta o erro no campo slug, não no topo do formulário', async () => {
    responder(problem(409, 'EMPRESA_JA_EXISTE', 'Empresa já existe'));

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(r.ok).toBe(false);
    expect(r.fieldErrors.slug).toBe('Já existe uma empresa com este identificador.');
    expect(r.formError).toBeNull();
  });

  it('não redireciona quando a criação falha', async () => {
    responder(problem(409, 'EMPRESA_JA_EXISTE', 'Empresa já existe'));

    await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
    expect(estado.valores.get('tenant_id')).toBeUndefined();
  });
});

describe('criarEmpresaDoAtor — sessão vencida (401)', () => {
  it('um 401 é SESSÃO VENCIDA: leva ao login COM o sinal, e não a "verifique a conexão"', async () => {
    // pt-BR: o access token dura 15 min, e a pessoa pode ter ficado na tela
    // mais que isso. Sem isto ela leria "não foi possível criar a empresa" e
    // tentaria de novo, com o mesmo token velho — um loop sem saída.
    //
    // ⚠️ O `?empresa=1` é o sinal de que a empresa ficou PENDENTE: sem ele,
    // a pessoa entra, o funil a traz de volta para `/empresa/nova` com o
    // formulário vazio, e não há explicação nenhuma do porquê. É o mesmo
    // mecanismo do `?cadastrado=1` do cadastro — e é um SINAL: os valores
    // digitados não viajam na query string.
    responder(problem(401, 'UNAUTHORIZED', 'Não autorizado'));

    await expect(criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'))).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    );

    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/login?empresa=1');
    // A empresa não foi criada — e a sessão não aponta para empresa nenhuma.
    expect(estado.valores.get('tenant_id')).toBeUndefined();
  });
});

describe('criarEmpresaDoAtor — erro 400 (validação do backend)', () => {
  it('distribui errors[] pelos campos correspondentes', async () => {
    responder(
      problem(400, 'VALIDATION_ERROR', 'Erro de validação', [
        { field: 'slug', message: 'slug em minúsculo', code: 'invalid_string' },
      ]),
    );

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(r.fieldErrors.slug).toBe('slug em minúsculo');
    expect(r.formError).toBeNull();
  });

  it('um erro de campo que o formulário não tem vira erro de formulário, não some', async () => {
    // pt-BR: o nome abaixo é o que realmente não existe no formulário — usar
    // um campo que existe faria o teste passar pelo motivo errado.
    responder(
      problem(400, 'VALIDATION_ERROR', 'Erro de validação', [
        { field: 'apelido', message: 'Apelido não permitido', code: 'unknown' },
      ]),
    );

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(Object.keys(r.fieldErrors)).not.toContain('apelido');
    expect(r.formError).toContain('Apelido não permitido');
  });
});

describe('criarEmpresaDoAtor — falha inesperada', () => {
  it('500 não vaza o título cru da API para a tela', async () => {
    responder(problem(500, 'INTERNAL_ERROR', 'Erro interno'));

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(r.ok).toBe(false);
    expect(r.formError).not.toContain('Erro interno');
    expect(r.formError).toContain('Não foi possível criar a empresa');
  });

  it('o erro de formulário carrega o traceId, para suporte', async () => {
    responder(problem(500, 'INTERNAL_ERROR', 'Erro interno'));

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(r.formError).toContain('trace-123');
  });

  it('rede caída vira erro de formulário, sem estourar', async () => {
    responder(new TypeError('fetch failed'));

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(r.ok).toBe(false);
    expect(r.formError).toBeTruthy();
  });

  it('um 201 sem corpo não deixa a sessão sem empresa', async () => {
    // pt-BR: um 201 sem id é o mesmo defeito que o login tratou — a empresa
    // teria sido criada, mas não há id para apontar a sessão, e a pessoa
    // cairia no `/users` sem escopo sem entender por quê.
    responder({ status: 201, ok: true, json: async () => undefined, text: async () => '' });

    const r = await criarEmpresaDoAtor(EMPRESA_INICIAL, formData('ACME', 'acme'));

    expect(r.ok).toBe(false);
    expect(r.formError).toBeTruthy();
    expect(estado.valores.get('tenant_id')).toBeUndefined();
  });
});
