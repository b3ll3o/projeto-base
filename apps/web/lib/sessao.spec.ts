// apps/web/lib/sessao.spec.ts
//
// Contrato da camada de sessão do web.
//
// pt-BR: o desenho é "JWT Bearer stateless na API, tokens em cookie httpOnly
// no web". O porquê está no cabeçalho de `lib/sessao.ts`; aqui o que se
// verifica são as PROPRIEDADES que fazem esse desenho valer, porque são
// elas que quebram em silêncio:
//
//  1. `httpOnly` — se sumir, qualquer XSS na página lê a sessão. É a
//     diferença entre um token roubável por script e um que não é.
//  2. `sameSite: 'lax'` + `path: '/'` — o par decide para onde o browser
//     manda o cookie. `path` estreito deixaria a sessão morta em metade
//     das rotas, que é um bug que só aparece "em produção".
//  3. `exigirSessao()` redireciona — é o que transforma "não tem sessão" em
//     "vai para o login" em vez de uma tela quebrada.
//
// `next/headers` é mockado inteiro. A alternativa seria testar contra o
// runtime real do Next, que exige uma request em escopo — caro e sem
// retorno: o que se quer verificar são as CHAMADAS de `set`/`delete`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  COOKIE_TENANT,
  exigirSessao,
  guardarTenant,
  guardarTokens,
  lerTenant,
  lerTokens,
  limparSessao,
  limparTenant,
} from './sessao';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Store de cookies em memória, com o formato que o Next 15 entrega:
// `cookies()` é ASSÍNCRONO e devolve um objeto com `get`/`set`/`delete`.
const estado = {
  valores: new Map<string, string>(),
  // pt-BR: `options` é declarado como `Record | undefined` e não como
  // `options?: Record` — o projeto liga `exactOptionalPropertyTypes`, e com
  // a forma opcional o `push({ ..., options })` de uma chamada sem opções
  // seria erro de tipo.
  escritas: [] as { name: string; value: string; options: Record<string, unknown> | undefined }[],
  removidos: [] as string[],
};

const store = {
  get: (name: string) => {
    const value = estado.valores.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set: (name: string, value: string, options?: Record<string, unknown>) => {
    estado.valores.set(name, value);
    estado.escritas.push({ name, value, options });
  },
  delete: (name: string) => {
    estado.valores.delete(name);
    estado.removidos.push(name);
  },
};

vi.mock('next/headers', () => ({
  // pt-BR: `cookies()` é assíncrono no Next 15. Devolver o store direto
  // (sem `await`) seria um `Promise`-falso que só funciona porque o código
  // nunca usa `await` — e a primeira vez que usar, quebra.
  cookies: async () => store,
}));

beforeEach(() => {
  estado.valores.clear();
  estado.escritas.length = 0;
  estado.removidos.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('guardarTokens', () => {
  it('grava os DOIS tokens em cookies httpOnly', async () => {
    await guardarTokens('access-abc', 'refresh-xyz');

    expect(estado.valores.get(COOKIE_ACCESS)).toBe('access-abc');
    expect(estado.valores.get(COOKIE_REFRESH)).toBe('refresh-xyz');
    for (const escrita of estado.escritas) {
      expect(escrita.options?.httpOnly).toBe(true);
    }
  });

  it('o cookie é sameSite lax e vale para o site inteiro (path /)', async () => {
    await guardarTokens('access-abc', 'refresh-xyz');

    for (const escrita of estado.escritas) {
      expect(escrita.options?.sameSite).toBe('lax');
      expect(escrita.options?.path).toBe('/');
    }
  });

  it('fora de produção o cookie NÃO é secure (localhost não tem TLS)', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await guardarTokens('a', 'r');

    for (const escrita of estado.escritas) {
      expect(escrita.options?.secure).toBe(false);
    }
  });

  it('em produção o cookie É secure — sem isso o token viaja em texto claro', async () => {
    // pt-BR: este é o teste que segura a decisão. `secure` é lido do
    // ambiente a CADA chamada (não no import) justamente para que este
    // teste consiga exercitar os dois lados.
    vi.stubEnv('NODE_ENV', 'production');

    await guardarTokens('a', 'r');

    for (const escrita of estado.escritas) {
      expect(escrita.options?.secure).toBe(true);
    }
  });
});

describe('lerTokens', () => {
  it('sem cookies, devolve null nos dois campos (não undefined)', async () => {
    // pt-BR: `null` e não `undefined` porque o chamador faz `? :`, e
    // `undefined` num ternário é falsy igual — mas num `??` também. A
    // diferença real é no TIPO: os dois precisam servir ao mesmo
    // `ApiClient.getToken`, cuja assinatura é `() => string | null`.
    const t = await lerTokens();

    expect(t).toEqual({ accessToken: null, refreshToken: null });
  });

  it('com cookies, devolve os valores', async () => {
    await guardarTokens('access-abc', 'refresh-xyz');

    await expect(lerTokens()).resolves.toEqual({
      accessToken: 'access-abc',
      refreshToken: 'refresh-xyz',
    });
  });
});

// pt-BR (Fase 3 — tenancy, 2026-10-16): a empresa selecionada mora num
// cookie PRÓPRIO (o `tenant_id` NÃO é httpOnly — ele não é segredo, e um
// cookie httpOnly obrigaria toda troca de empresa a passar por Server
// Action). A leitora é o que o `ApiClient` consome via `getTenant`.
describe('lerTenant', () => {
  it('sem cookie de empresa, devolve null (não undefined)', async () => {
    await expect(lerTenant()).resolves.toBeNull();
  });

  it('com cookie, devolve o UUID da empresa', async () => {
    await guardarTenant('0190a8b6-0000-4000-8000-00000000000a');

    await expect(lerTenant()).resolves.toBe('0190a8b6-0000-4000-8000-00000000000a');
  });

  it('cookie VAZIO conta como ausente, não como empresa ""', async () => {
    // `''` vazaria um `X-Tenant-Id:` sem valor, que a API rejeita com 400.
    const store = await cookies();
    store.set(COOKIE_TENANT, '', { path: '/' });

    await expect(lerTenant()).resolves.toBeNull();
  });
});

describe('exigirSessao', () => {
  it('com access token, DEVOLVE o token e não redireciona', async () => {
    await guardarTokens('access-abc', 'refresh-xyz');

    await expect(exigirSessao()).resolves.toBe('access-abc');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sem sessão, redireciona para /login', async () => {
    await expect(exigirSessao()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('cookie de access token VAZIO conta como ausente', async () => {
    // pt-BR: um cookie vazio é o estado que sobra de um `delete` mal feito
    // e de um cookie expirado que o browser ainda envia. Se passasse, a
    // pessoa chegaria à tela protegida com o header `Bearer ` vazio e a
    // API devolveria 401 — a tela protegida existiria mas nunca deixaria
    // entrar ninguém, que é um defeito silencioso.
    await guardarTokens('', '');

    await expect(exigirSessao()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('refresh token sozinho NÃO abre a porta — o que autoriza é o access', async () => {
    // pt-BR: um refresh token é de longa duração. Deixá-lo valer como
    // credencial de acesso daria a quem capturasse aquele cookie o mesmo
    // poder do access token, e é o motivo de existirem os dois.
    await guardarTokens('', 'refresh-xyz');

    await expect(exigirSessao()).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});

describe('limparSessao', () => {
  it('apaga os TRÊS cookies de sessão, não só o access', async () => {
    await guardarTokens('access-abc', 'refresh-xyz');
    await limparSessao();

    expect(estado.removidos).toEqual([COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_TENANT]);
    await expect(lerTokens()).resolves.toEqual({ accessToken: null, refreshToken: null });
  });

  it('apaga a EMPRESA junto — senão ela atravessa a fronteira de sessão (Fase 3)', async () => {
    // pt-BR (Fase 3, achado da revisão): a empresa escolhida é estado de sessão,
    // não preferência permanente. Deixá-la sobreviver ao logout é a direção
    // cross-tenant do bug: A escolhe ACME, clica em "Sair", B entra no mesmo
    // browser — e TODA requisição de B sai declarando `X-Tenant-Id: ACME`,
    // resolvendo perfil no bucket da empresa errada.
    await guardarTokens('access-abc', 'refresh-xyz');
    await guardarTenant('0190a8b6-0000-4000-8000-00000000000a');

    await limparSessao();

    await expect(lerTenant()).resolves.toBeNull();
  });

  it('apagar sem sessão nenhuma não é erro', async () => {
    await expect(limparSessao()).resolves.toBeUndefined();
  });
});

describe('limparTenant', () => {
  it('apaga a EMPRESA e NÃO toca nos tokens — a sessão continua viva', async () => {
    // pt-BR (onboarding de empresa, 2026-10-21): o login precisa trocar a
    // empresa da sessão sem deslogar a pessoa — e o caso que exige isto é o
    // administrador de sistema, que não pertence a empresa nenhuma e por isso
    // não pode herdar a empresa de quem entrou antes no mesmo browser.
    await guardarTokens('access-abc', 'refresh-xyz');
    await guardarTenant('0190a8b6-0000-4000-8000-00000000000a');

    await limparTenant();

    await expect(lerTenant()).resolves.toBeNull();
    await expect(lerTokens()).resolves.toEqual({
      accessToken: 'access-abc',
      refreshToken: 'refresh-xyz',
    });
    expect(estado.removidos).toEqual([COOKIE_TENANT]);
  });

  it('apagar sem empresa nenhuma não é erro', async () => {
    await expect(limparTenant()).resolves.toBeUndefined();
  });
});
