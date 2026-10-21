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
  valores: { nome: '', email: '', senha: '' },
};

/** Resposta JSON com o envelope RFC 7807 que a API devolve. */
function problem(status: number, code: string, title: string, errors?: unknown[]) {
  const body = {
    type: 'about:blank',
    title,
    status,
    detail: title,
    instance: '/api/v1/users',
    code,
    traceId: 'trace-123',
    ...(errors ? { errors } : {}),
  };
  // pt-BR: `text` junto de `json` — o `request()` lê o corpo de ERRO via `text()`
  // e cai para `JSON.parse`, porque um corpo de erro nem sempre é JSON (502 de
  // proxy, HTML de gateway). Mesmo motivo do `okResponse` abaixo: um fake com só
  // `json` mente sobre a plataforma, `Response` real tem os dois.
  return { status, ok: false, json: async () => body, text: async () => JSON.stringify(body) };
}

function okResponse(body: unknown = { id: 'u1' }) {
  // pt-BR (#97): `text` junto de `json` — o `request()` lê o corpo via
  // `text()` (para tolerar resposta vazia de endpoint `void`). Um fake com
  // só `json` mente sobre a plataforma: `Response` real tem os dois.
  return { status: 201, ok: true, json: async () => body, text: async () => JSON.stringify(body) };
}

/**
 * pt-BR: a senha tem PADRÃO, e não é por conveniência. Os testes deste
 * arquivo verificam erros de EMAIL, de rede e de status — none deles é
 * sobre senha. Sem o padrão, `formData('Maria', 'maria@empresa.com')`
 * pararia na validação de senha vazia e o teste passaria pelo motivo
 * errado: ele estaria medindo a senha, não o que diz medir, e continuaria
 * verde mesmo com a lógica de email quebrada.
 */
function formData(nome: string, email: string, senha = 'senha1234'): FormData {
  const fd = new FormData();
  fd.set('nome', nome);
  fd.set('email', email);
  fd.set('senha', senha);
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
  it('cria o usuário e redireciona para o LOGIN — não para a listagem', async () => {
    responder(okResponse());

    // pt-BR: `redirect()` sinaliza a navegação LANÇANDO — é assim que o
    // Next marca o fluxo. O sentinela chegar ao chamador é parte do
    // contrato: se a Action engolisse essa exceção, a pessoa ficaria
    // olhando um formulário preenchido de um usuário que já existe.
    //
    // ⚠️ E o destino é o LOGIN, não `/users`. MEDIDO 2026-10-13: o cadastro
    // é `@Public()` e NÃO emite sessão (`POST /users` devolve só o usuário,
    // sem par de tokens), enquanto `/users` chama `exigirSessao()`, que sem
    // cookie de access redireciona para `/login`. A redireção para `/users`
    // era portanto um beco sem saída: a pessoa criava a conta, era jogada
    // numa rota protegida, voltava ao login sem nenhuma mensagem — e teria
    // de digitar a senha que acabara de escolher.
    await expect(
      cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com')),
    ).rejects.toThrow('NEXT_REDIRECT:/login?cadastrado=1');

    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/login?cadastrado=1');
  });

  it('envia nome e email aparados, e a senha CRUA, para POST /users', async () => {
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
      senha: 'senha1234',
    });
  });

  it('a senha NÃO é aparada no envio — espaço digitado é espaço usado', async () => {
    // pt-BR: nome e email levam `.trim()` porque são identidades e
    // normalização é inofensiva. Senha NÃO leva: aparar um segredo é
    // mutá-lo em silêncio. Se este teste um dia cair, o sintoma em produção
    // é uma senha que a pessoa digitou e que não abre a conta — sem erro
    // em lugar nenhum.
    responder(okResponse());

    await expect(
      cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com', '  abcdefgh  ')),
    ).rejects.toThrow();

    expect(JSON.parse(String(chamadas[0]?.init?.body)).senha).toBe('  abcdefgh  ');
  });
});

describe('cadastrarUsuario — entrada por convite', () => {
  // pt-BR (onboarding de empresa, 2026-10-21): quem entra por convite nasce
  // NA empresa que convidou, e o `destino` do corpo é o que diz isso. Sem o
  // `destino`, a conta nasce sem empresa nenhuma e o funil do login a leva à
  // página de criação de empresa — o oposto do que a pessoa veio fazer.
  const TOKEN = 'a'.repeat(64);

  function formDataComConvite(convite: string | null): FormData {
    const fd = formData('Maria Silva', 'maria@empresa.com');
    if (convite !== null) fd.set('convite', convite);
    return fd;
  }

  it('manda o destino de convite para POST /users', async () => {
    responder(okResponse());

    await expect(cadastrarUsuario(INICIAL, formDataComConvite(TOKEN))).rejects.toThrow();

    expect(JSON.parse(String(chamadas[0]?.init?.body)).destino).toEqual({
      tipo: 'convite',
      token: TOKEN,
    });
  });

  it('sem convite, o corpo NÃO leva destino — a conta nasce sem empresa', async () => {
    // pt-BR: `destino: undefined` no objeto NÃO é o mesmo que "sem destino" —
    // o `JSON.stringify` apagaria a chave, mas o objeto em memória a teria.
    // A asserção é sobre o CORPO ENVIADO, que é o que a API recebe.
    responder(okResponse());

    await expect(cadastrarUsuario(INICIAL, formDataComConvite(null))).rejects.toThrow();

    expect(JSON.parse(String(chamadas[0]?.init?.body))).not.toHaveProperty('destino');
  });

  it('convite com formato inválido NÃO cria a conta — e diz por quê', async () => {
    // pt-BR: o link de convite pode ter sido adulterado ou truncado. Criar
    // a conta "normal" seria silenciar o problema: a pessoa entraria, não
    // pertenceria a empresa nenhuma, e o motivo sumiria.
    responder(okResponse());

    const r = await cadastrarUsuario(INICIAL, formDataComConvite('token-adulterado'));

    expect(chamadas).toHaveLength(0);
    expect(r.ok).toBe(false);
    expect(r.formError).toContain('convite');
  });

  it('convite de OUTRO e-mail diz o motivo — e não "verifique a conexão"', async () => {
    // pt-BR: a API responde 403 com `code: 'CONVITE_INVALIDO'` quando o
    // convite foi emitido para outro e-mail. Sem o mapeamento, a pessoa lia
    // "não foi possível cadastrar o usuário, verifique a conexão" — e o que
    // tinha falhado era o CONVITE, não a internet. O que a pessoa precisa
    // saber é que o e-mail dela não é o do convite.
    responder(problem(403, 'CONVITE_INVALIDO', 'Convite inválido'));

    const r = await cadastrarUsuario(INICIAL, formDataComConvite(TOKEN));

    expect(r.ok).toBe(false);
    expect(r.formError).toContain('outro e-mail');
    expect(r.formError).not.toContain('Verifique a conexão');
  });

  it('convite EXPIRADO diz que expirou — o que a pessoa tem que fazer', async () => {
    responder(problem(410, 'CONVITE_INVALIDO', 'Convite inválido'));

    const r = await cadastrarUsuario(INICIAL, formDataComConvite(TOKEN));

    expect(r.formError).toContain('expirou');
  });

  it('CONVITE_INVALIDO de motivo desconhecido cai no genérico COM traceId', async () => {
    // O `status` é o motivo, e nem todo status é um motivo de convite: o que
    // sobra é falha genérica — e a genérica carrega o traceId, para o
    // suporte saber o que aconteceu.
    responder(problem(422, 'CONVITE_INVALIDO', 'Convite inválido'));

    const r = await cadastrarUsuario(INICIAL, formDataComConvite(TOKEN));

    expect(r.formError).toContain('Verifique a conexão');
    expect(r.formError).toContain('trace-123');
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

  it('não chama a API quando a senha está vazia, e pede a senha', async () => {
    responder(okResponse());

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com', ''));

    expect(chamadas).toHaveLength(0);
    expect(r.fieldErrors.senha).toBe('Informe a senha.');
    // pt-BR: os outros campos estavam válidos de propósito. Com o
    // formulário todo vazio os três seriam inválidos e o teste passaria
    // pelo motivo errado — marcaria todos em vez de mostrar que sabe
    // qual está errado.
    expect(r.fieldErrors.email).toBeUndefined();
  });

  it('senha curta demais é rejeitada com a mensagem de comprimento', async () => {
    responder(okResponse());

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com', 'abc'));

    expect(chamadas).toHaveLength(0);
    expect(r.fieldErrors.senha).toContain('pelo menos');
  });

  it('preserva nome e email digitados ao voltar o erro', async () => {
    responder(okResponse());

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'nao-e-email'));

    expect(r.valores).toEqual({ nome: 'Maria Silva', email: 'nao-e-email', senha: '' });
  });

  it('NÃO devolve a senha digitada no estado (o estado volta ao browser)', async () => {
    // pt-BR: `CadastroUsuarioState` é serializado e entregue ao Client
    // Component — passa pela rede e é visível no DevTools. Com a senha
    // dentro, um erro de validação deixaria o segredo num lugar que
    // ninguém escolheu para guardá-lo. O preço é a pessoa redigitar a
    // senha depois do erro; o benefício é o segredo não passear.
    responder(problem(409, 'EMAIL_IN_USE', 'Email já em uso'));

    const r = await cadastrarUsuario(
      INICIAL,
      formData('Maria Silva', 'maria@empresa.com', 'minhaSenhaSecreta'),
    );

    expect(r.valores.senha).toBe('');
    expect(JSON.stringify(r)).not.toContain('minhaSenhaSecreta');
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
    expect(r.valores).toEqual({ nome: 'Maria Silva', email: 'maria@empresa.com', senha: '' });
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
    // pt-BR: o campo de exemplo mudou de `senha` para `apelido` quando a
    // senha entrou no formulário. `senha` deixou de ser um campo
    // desconhecido — usá-lo aqui faria o teste passar pelo motivo errado:
    // ele mediria "o formulário conhece senha" e não "campo órfão não
    // some". O nome abaixo é o que realmente não existe no formulário.
    responder(
      problem(400, 'VALIDATION_ERROR', 'Erro de validação', [
        { field: 'apelido', message: 'Apelido não permitido', code: 'unknown' },
      ]),
    );

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    // pt-BR: o tipo de `fieldErrors` só conhece os campos do formulário —
    // é proposital. O teste olha por uma chave que NÃO existe no tipo, que
    // é exatamente o caso que precisa ser provado.
    expect(Object.keys(r.fieldErrors)).not.toContain('apelido');
    expect(r.formError).toContain('Apelido não permitido');
  });

  it('um erro de senha da API vai PARA O CAMPO senha, não para o topo', async () => {
    // Contrapartida do teste acima: agora que `senha` É campo do
    // formulário, um erro de senha tem endereço próprio e não deve
    // poluir o topo — a pessoa precisa ver qual campo corrigir.
    responder(
      problem(400, 'VALIDATION_ERROR', 'Erro de validação', [
        { field: 'senha', message: 'Senha muito fraca', code: 'too_weak' },
      ]),
    );

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.fieldErrors.senha).toBe('Senha muito fraca');
    expect(r.formError).toBeNull();
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
      // pt-BR: o corpo NÃO é JSON — é o que um proxy devolve, e o fake
      // precisa ter `text` para o `request()` conseguir lê-lo. Este teste
      // prova que a Action não estoura; ele NÃO prova o fallback do
      // `request()`, porque `estadoDeErro` mapeia tudo que não é
      // `EMAIL_IN_USE` para `ERRO_GENERICO` — com ou sem o fix, a string
      // é a mesma. O fallback é testado em `lib/api-client.spec.ts`.
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
      text: async () => '<html><body>502 Bad Gateway</body></html>',
    });

    const r = await cadastrarUsuario(INICIAL, formData('Maria Silva', 'maria@empresa.com'));

    expect(r.ok).toBe(false);
    expect(r.formError).toBeTruthy();
  });
});
