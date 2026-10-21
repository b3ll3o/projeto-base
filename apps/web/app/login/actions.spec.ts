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
import { guardarTenant, guardarTokens, limparTenant } from '@/lib/sessao';
import { CREDENCIAIS_INVALIDAS, ERRO_GENERICO_LOGIN, type LoginState } from './state.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/sessao', () => ({
  guardarTokens: vi.fn(async () => undefined),
  guardarTenant: vi.fn(async () => undefined),
  limparTenant: vi.fn(async () => undefined),
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

function formData(
  email = CREDENCIAIS_VALIDAS.email,
  senha = CREDENCIAIS_VALIDAS.senha,
  convite?: string,
) {
  const fd = new FormData();
  fd.set('email', email);
  fd.set('senha', senha);
  if (convite !== undefined) fd.set('convite', convite);
  return fd;
}

/** Envelope RFC 7807, como a API devolve nos erros. */
function problem(status: number, code: string, title: string, errors?: unknown[]) {
  const body = {
    type: 'about:blank',
    title,
    status,
    detail: title,
    instance: '/api/v1/auth/login',
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

function okResponse(body: unknown) {
  // pt-BR (#97): `text` junto de `json` — o `request()` lê o corpo via
  // `text()` (para tolerar resposta vazia de endpoint `void`). Um fake com
  // só `json` mente sobre a plataforma: `Response` real tem os dois.
  return { status: 201, ok: true, json: async () => body, text: async () => JSON.stringify(body) };
}

const RESPOSTA_VALIDA = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
  user: { id: 'u1', nome: 'Maria', email: CREDENCIAIS_VALIDAS.email },
};

/** A forma que o `ApiClient` consome: `text` primeiro, `json` nunca. */
type RespostaFake = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

/**
 * Respostas por TRECHO de URL.
 *
 * pt-BR (onboarding de empresa, 2026-10-21): o login passou a fazer TRÊS
 * pedidos em sequência — `/auth/login`, `/me/tenants` e, só quando a lista
 * vem vazia, `/me/profile`. Um stub que devolve sempre o mesmo corpo
 * mentiria sobre os três: a lista de empresas viria com o corpo do login, e
 * o perfil viria com o que fosse.
 */
function responderPorUrl(rotas: Record<string, RespostaFake | Error>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit): Promise<RespostaFake> => {
    for (const [trecho, resposta] of Object.entries(rotas)) {
      if (String(url).includes(trecho)) {
        if (resposta instanceof Error) throw resposta;
        return resposta;
      }
    }
    return okResponse(RESPOSTA_VALIDA);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('entrar — caminho feliz', () => {
  it('guarda os dois tokens devolvidos pela API e leva a pessoa para a listagem', async () => {
    responderPorUrl({
      '/me/tenants': okResponse([{ id: 'empresa-1', nome: 'ACME', slug: 'acme' }]),
    });

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

describe('entrar — para onde a pessoa vai depois de entrar', () => {
  // pt-BR (onboarding de empresa, 2026-10-21): TODA conta pertence a uma
  // empresa, exceto o administrador de SISTEMA — que administra a plataforma e
  // não pertence a empresa nenhuma. O login deixou de ser "sempre `/users`" e
  // passou a fazer as duas perguntas que separam esses três casos.

  it('conta que JÁ tem empresa vai para a listagem, e a sessão passa a agir nela', async () => {
    responderPorUrl({
      '/me/tenants': okResponse([{ id: 'empresa-1', nome: 'ACME', slug: 'acme' }]),
    });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    // pt-BR: o cookie `tenant_id` é o que faz a sessão agir na empresa. Sem
    // ele, a pessoa cai no `/users` sem escopo e a listagem volta vazia sem
    // dizer por quê.
    expect(guardarTenant).toHaveBeenCalledWith('empresa-1');
    // A empresa da sessão anterior é substituída, não acumulada.
    expect(limparTenant).not.toHaveBeenCalled();
  });

  it('conta SEM empresa vai para a página de criação de empresa', async () => {
    responderPorUrl({ '/me/tenants': okResponse([]) });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/empresa/nova');

    expect(guardarTenant).not.toHaveBeenCalled();
    // pt-BR: a empresa de uma sessão ANTERIOR é apagada — ela viraria
    // `X-Tenant-Id` de uma empresa que a pessoa não pertence, e a API
    // responderia 403 `TENANT_MEMBERSHIP_REQUIRED` na tela principal, sem
    // caminho de volta. (É o caso do administrador de sistema, que não
    // pertence a empresa nenhuma.)
    expect(limparTenant).toHaveBeenCalled();
  });

  it('administrador de SISTEMA vai para a listagem, sem empresa e sem criar uma', async () => {
    responderPorUrl({
      '/me/tenants': okResponse([]),
      '/me/profile': okResponse({ isAdmin: true, permissions: [] }),
    });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    expect(guardarTenant).not.toHaveBeenCalled();
    expect(limparTenant).toHaveBeenCalled();
  });

  it('a pergunta "é admin de SISTEMA?" é feita no bucket GLOBAL', async () => {
    // pt-BR: com `X-Tenant-Id`, a API responde o perfil DA EMPRESA — e o dono
    // também é `isAdmin`. Aí o administrador de sistema cairia na página de
    // criação de empresa, que é exatamente o oposto do que ele é.
    const fetchMock = responderPorUrl({
      '/me/tenants': okResponse([]),
      '/me/profile': okResponse({ isAdmin: true, permissions: [] }),
    });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    const pedidoDoPerfil = fetchMock.mock.calls.find((chamada) =>
      String(chamada[0]).includes('/me/profile'),
    );
    expect(new Headers(pedidoDoPerfil?.[1]?.headers).get('x-tenant-id')).toBeNull();
  });

  it('o administrador de SISTEMA NÃO fica preso na empresa que ele tem', async () => {
    // pt-BR: o admin de sistema é a EXCEÇÃO da invariante — e a lista de
    // empresas NÃO está vazia para ele: um convite aceito, ou uma empresa que
    // ele mesmo criou, deixam uma membership lá. Escolher a primeira delas
    // prenderia a sessão no escopo dela, onde
    // `ehAdministradorDeSistema` (`tenantId === null && isAdmin`) é FALSO: as
    // rotas de sistema responderiam 403 — e não há volta, porque todo login
    // re-executa este funil e não existe tela de troca de empresa.
    responderPorUrl({
      '/me/tenants': okResponse([{ id: 'empresa-1', nome: 'ACME', slug: 'acme' }]),
      '/me/profile': okResponse({ isAdmin: true, permissions: [] }),
    });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    // O cookie de empresa NÃO é gravado — é ele que prende a sessão.
    expect(guardarTenant).not.toHaveBeenCalled();
    expect(limparTenant).toHaveBeenCalled();
  });

  it('a falha do perfil NÃO tira a empresa de quem a tem', async () => {
    // pt-BR: o `/me/profile` é uma pergunta a MAIS, e ela não pode custar a
    // empresa de quem já a tem: a lista de empresas já está na mão, e trocar
    // um admin que perde o sistema por qualquer pessoa que perde a empresa
    // seria um preço altíssimo.
    responderPorUrl({
      '/me/tenants': okResponse([{ id: 'empresa-1', nome: 'ACME', slug: 'acme' }]),
      '/me/profile': new Error('ECONNREFUSED'),
    });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    expect(guardarTenant).toHaveBeenCalledWith('empresa-1');
  });

  it('a lista de empresas vem SEM header de empresa — ela é "por conta"', async () => {
    const fetchMock = responderPorUrl({
      '/me/tenants': okResponse([{ id: 'empresa-1', nome: 'ACME', slug: 'acme' }]),
    });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    const pedidoDaLista = fetchMock.mock.calls.find((chamada) =>
      String(chamada[0]).includes('/me/tenants'),
    );
    expect(new Headers(pedidoDaLista?.[1]?.headers).get('x-tenant-id')).toBeNull();
  });

  it('falha ao listar as empresas NÃO desfaz o login — a sessão já está guardada', async () => {
    // pt-BR: a pessoa ENTROU. Um erro de rede na hora de escolher a empresa
    // não pode apagar o login que deu certo — nem virar a tela de erro do
    // Next, que diria "algo deu errado" a quem entrou com sucesso.
    //
    // E o destino é `/users`, NUNCA `/empresa/nova`: a consulta falhou, então
    // NÃO se sabe se a conta tem empresa — e levar quem TEM empresa para a
    // tela de criação produz uma empresa DUPLICADA, com o mesmo dono e mais
    // um conjunto de perfis, sem nada na tela avisando que era duplicado.
    responderPorUrl({ '/me/tenants': new Error('ECONNREFUSED') });

    await expect(entrar(INICIAL, formData())).rejects.toThrow('NEXT_REDIRECT:/users');

    expect(guardarTokens).toHaveBeenCalledWith('access-abc', 'refresh-xyz');
  });
});

describe('entrar — o convite que atravessa o login', () => {
  // pt-BR (onboarding de empresa, 2026-10-21): a sessão vence em 15 min, e o
  // aceite do convite devolve 401 quando isso acontece. O token do convite
  // precisa SOBREVIVER ao login — sem ele, a pessoa entra sem convite
  // nenhum, o funil pergunta "qual empresa?" e a responde `/empresa/nova`,
  // porque o convite AINDA NÃO foi aceito e a conta não tem membership
  // nenhuma: ela criava a PRÓPRIA empresa, e o convite de quem a convidou
  // nunca era usado.

  const TOKEN = 'b'.repeat(64);

  it('vai para a tela do CONVITE, e não para a de criação de empresa', async () => {
    // pt-BR: a lista de empresas viria VAZIA de propósito — é o estado real
    // de quem ainda não aceitou o convite. O desvio acontece ANTES do funil,
    // e por isso o caminho de `/empresa/nova` (a reserva que CRIA empresa)
    // fica fora do alcance desta pessoa.
    responderPorUrl({ '/me/tenants': okResponse([]) });

    await expect(
      entrar(INICIAL, formData(CREDENCIAIS_VALIDAS.email, CREDENCIAIS_VALIDAS.senha, TOKEN)),
    ).rejects.toThrow(`NEXT_REDIRECT:/convite/${TOKEN}`);

    expect(guardarTokens).toHaveBeenCalledWith('access-abc', 'refresh-xyz');
  });

  it('NÃO consulta as empresas: quem decide a empresa é o aceite do convite', async () => {
    const fetchMock = responderPorUrl({ '/me/tenants': okResponse([]) });

    await expect(
      entrar(INICIAL, formData(CREDENCIAIS_VALIDAS.email, CREDENCIAIS_VALIDAS.senha, TOKEN)),
    ).rejects.toThrow(`NEXT_REDIRECT:/convite/${TOKEN}`);

    const consultouEmpresas = fetchMock.mock.calls.some((chamada) =>
      String(chamada[0]).includes('/me/tenants'),
    );
    expect(consultouEmpresas).toBe(false);
  });

  it('apaga o cookie de empresa da sessão ANTERIOR — ela não é a empresa do convite', async () => {
    // pt-BR: o cookie `tenant_id` que sobrou pertence à IDENTIDADE que o
    // login acabou de trocar. Mantido, ele sairia como `X-Tenant-Id` de uma
    // empresa que a pessoa não pertence — e a API responderia 403
    // `TENANT_MEMBERSHIP_REQUIRED`. É o aceite do convite que grava o cookie
    // CERTO, logo depois.
    responderPorUrl({ '/me/tenants': okResponse([]) });

    await expect(
      entrar(INICIAL, formData(CREDENCIAIS_VALIDAS.email, CREDENCIAIS_VALIDAS.senha, TOKEN)),
    ).rejects.toThrow(`NEXT_REDIRECT:/convite/${TOKEN}`);

    expect(limparTenant).toHaveBeenCalled();
    expect(guardarTenant).not.toHaveBeenCalled();
  });

  it('token com formato errado NÃO desvia o funil — a pessoa entra normal', async () => {
    // pt-BR: o `FormData` não é fronteira de confiança. Um token adulterado
    // escolhe a rota, então precisa ser recusado pelo formato — e o caminho
    // da recusa é o funil de sempre, sem desvio.
    responderPorUrl({ '/me/tenants': okResponse([]) });

    await expect(
      entrar(
        INICIAL,
        formData(CREDENCIAIS_VALIDAS.email, CREDENCIAIS_VALIDAS.senha, 'token-adulterado'),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/empresa/nova');
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
