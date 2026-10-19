// apps/web/lib/perfil.spec.ts
//
// Contrato web↔API do módulo de profiles (#97).
//
// O que estes testes seguram, e por quê: até #97 o cliente web falava com
// rotas que a API NÃO TEM (`GET /admin/profiles/:id/authorizations`,
// `PUT .../authorizations`, `DELETE /admin/users/:id/profile`) e passava
// **slug** onde a API faz `findById` por **UUID**. Nenhum desses defeitos
// quebrava a página — elas davam 404 em tempo de execução, com a suíte
// inteira verde. Por isso o que está aqui não é "a função chama o método
// certo", é "a função chama o método E o path certos, com o body certo".
//
// A prova de que o teste tem dente: `ID` e `SLUG` são strings distintas e o
// path é conferido contra `ID`. Se alguém voltar a passar slug, o teste
// fica vermelho — não "verde por não ter olhado".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError, ApiTimeoutError } from './api-client';

const { clientMock, exigirSessaoMock, lerTenantMock, lerTokensMock } = vi.hoisted(() => ({
  clientMock: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  exigirSessaoMock: vi.fn(async () => 'token-admin'),
  // pt-BR (Fase 3): `null` = nenhuma empresa escolhida → o `ApiClient` omite
  // `X-Tenant-Id`. ⚠️ O bucket `null` NÃO é "sem permissão nenhuma": ele resolve
  // o perfil GLOBAL, e o único `isAdmin` do sistema é global.
  lerTenantMock: vi.fn(async (): Promise<string | null> => null),
  lerTokensMock: vi.fn(
    async (): Promise<{ accessToken: string | null; refreshToken: string | null }> => ({
      accessToken: 'token-admin',
      refreshToken: null,
    }),
  ),
}));

// Mock PARCIAL: só o `ApiClient` (o construtor) é dublê. `ApiError` e
// `ApiTimeoutError` são as classes REAIS, e é exatamente isso que os testes do
// #107 precisam: se o `perfil.ts` discrimina por `instanceof`, o teste tem que
// discriminar pela mesma classe de verdade. Um `instanceof` contra uma classe
// dublê passaria mesmo com a lógica errada.
vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>();
  return { ...actual, ApiClient: vi.fn(() => clientMock) };
});
vi.mock('./sessao', () => ({
  exigirSessao: exigirSessaoMock,
  lerTenant: lerTenantMock,
  lerTokens: lerTokensMock,
}));

const {
  atribuirPermissao,
  atribuirPerfil,
  atualizarPerfil,
  criarPerfil,
  decidirAtribuicaoPerfil,
  deletarPerfil,
  diffPermissoes,
  listarPerfis,
  listarPermissoes,
  obterMeuPerfil,
  obterMeuPerfilGlobal,
  obterPerfil,
  obterPerfilPorSlug,
  revogarPermissao,
  trocarPermissoes,
} = await import('./perfil');

const ID = '3f6a2b1c-0000-4000-8000-000000000001';
const SLUG = 'editor'; // nunca é um id — se aparecer num path, o bug voltou
const BASE = '/admin/profiles';

function callPaths(method: 'get' | 'post' | 'patch' | 'put' | 'delete'): string[] {
  return clientMock[method].mock.calls.map((c: unknown[]) => c[0] as string);
}

beforeEach(() => {
  for (const m of ['get', 'post', 'patch', 'put', 'delete'] as const) {
    clientMock[m].mockReset();
  }
  exigirSessaoMock.mockClear();
  clientMock.get.mockResolvedValue([]);
  clientMock.post.mockResolvedValue({});
  clientMock.patch.mockResolvedValue({});
  clientMock.put.mockResolvedValue({ ok: true });
  clientMock.delete.mockResolvedValue(undefined);
});

describe('obterMeuPerfil — payload de GET me/profile', () => {
  it('devolve a resposta da API sem reinterpretar os campos', async () => {
    // O payload real: a API devolve profileId/profileSlug/profileName, e
    // NÃO devolve `userId` nem `profile`. Se o cliente voltar a inventar um
    // objeto, esta identidade quebra.
    const payload = {
      profileId: ID,
      profileSlug: SLUG,
      profileName: 'Editor',
      isAdmin: false,
      permissions: ['users.read'],
    };
    clientMock.get.mockResolvedValue(payload);

    await expect(obterMeuPerfil()).resolves.toEqual(payload);
    expect(callPaths('get')).toEqual(['/me/profile']);
  });

  it('sem sessão devolve null em vez de redirecionar (Sidebar não pode quebrar o layout)', async () => {
    lerTokensMock.mockResolvedValueOnce({ accessToken: null, refreshToken: null });
    await expect(obterMeuPerfil()).resolves.toBeNull();
    expect(exigirSessaoMock).not.toHaveBeenCalled();
  });

  // ── pt-BR (#107): o `null` é do 401, e só do 401 ────────────────────────────
  //
  // O defeito: `catch { return null }` devolvia o mesmo `null` para 401, 403,
  // 5xx, timeout e rede caída. As quatro telas `/admin/*` leem `null` como
  // veredito ("não sou admin"), então uma administradora legítima com a API
  // caída lia uma tela afirmando o contrário.
  describe('distingue 401 de 5xx (#107)', () => {
    function erroApi(status: number): ApiError {
      // `instance`, `code` e `traceId` são exigidos pelo `ProblemDetailsDto` —
      // o tipo é o mesmo que a API serializa, e preenchê-los pela metade não
      // compila. O que o teste usa é o `status`, que é o que o `perfil.ts`
      // discrimina.
      const problem = {
        type: 'about:blank',
        title: 'erro',
        status,
        detail: 'detalhe',
        instance: '/me/profile',
        code: 'ERRO',
        traceId: 'trace-1',
      };
      return new ApiError('erro', 'codigo', status, problem);
    }

    it('401 volta a ser null — token expirado é o mesmo estado de "sem sessão"', async () => {
      clientMock.get.mockRejectedValueOnce(erroApi(401));
      await expect(obterMeuPerfil()).resolves.toBeNull();
    });

    it('403 NÃO vira null — "não tem a permissão" não é "não sei quem você é"', async () => {
      clientMock.get.mockRejectedValueOnce(erroApi(403));
      await expect(obterMeuPerfil()).rejects.toThrow(ApiError);
    });

    it('500 NÃO vira null — o serviço caiu, e a conta está bem', async () => {
      clientMock.get.mockRejectedValueOnce(erroApi(500));
      await expect(obterMeuPerfil()).rejects.toThrow(ApiError);
    });

    it('timeout NÃO vira null — é transporte, e o guard de admin distingue', async () => {
      // `ApiTimeoutError` é separado de `ApiError` de propósito (ver
      // api-client.ts): o fetch nem chegou a ter status.
      clientMock.get.mockRejectedValueOnce(new ApiTimeoutError('/me/profile', 10_000, 'GET'));
      await expect(obterMeuPerfil()).rejects.toThrow(ApiTimeoutError);
    });

    it('rede caída NÃO vira null — erro sem status não é autorização', async () => {
      clientMock.get.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(obterMeuPerfil()).rejects.toThrow(TypeError);
    });

    it('o status que importa é o do ApiError, não o nome da classe', async () => {
      // Um ApiError de 503 é serviço indisponível. Se alguém "consertar" o
      // guard testando `instanceof ApiError` como se fosse negação, este
      // teste é o que diz que 503 não é 403.
      clientMock.get.mockRejectedValueOnce(erroApi(503));
      await expect(obterMeuPerfil()).rejects.toThrow(ApiError);
    });
  });
});

// pt-BR (Fase 3, achado da revisão): o `ApiClient` é mockado como construtor,
// então o header `X-Tenant-Id` SÓ existe se alguém montou `getTenant` — e o
// `api-client.spec.ts` mede o `ApiClient`, não quem o monta. Sem esta
// asserção, apagar `getTenant` de `perfil.ts` deixa a suíte inteira verde e o
// header desaparece da aplicação sem um único teste vermelho.
describe('getTenant é montado no ApiClient (Fase 3)', () => {
  const ACME = '0190a8b6-0000-4000-8000-00000000000a';

  /** A config da ÚLTIMA construção — `beforeEach` não limpa o construtor. */
  function configAtual(): { getTenant?: () => string | null } {
    const ctor = ApiClient as unknown as { mock: { calls: unknown[][] } };
    const ultima = ctor.mock.calls[ctor.mock.calls.length - 1];
    return (ultima?.[0] ?? {}) as { getTenant?: () => string | null };
  }

  it('getClient passa getTenant devolvendo a empresa de lerTenant()', async () => {
    lerTenantMock.mockResolvedValueOnce(ACME);
    clientMock.get.mockResolvedValue([]);

    await listarPerfis();

    const getTenant = configAtual().getTenant;
    expect(typeof getTenant).toBe('function');
    expect(getTenant?.()).toBe(ACME);
  });

  it('sem empresa, getTenant ainda é montado e devolve null (header omitido, não string vazia)', async () => {
    lerTenantMock.mockResolvedValueOnce(null);
    clientMock.get.mockResolvedValue([]);

    await listarPerfis();

    expect(configAtual().getTenant?.()).toBeNull();
  });

  it('obterMeuPerfil também monta getTenant — é a rota por empresa', async () => {
    lerTenantMock.mockResolvedValueOnce(ACME);
    clientMock.get.mockResolvedValue(null);

    await obterMeuPerfil();

    expect(configAtual().getTenant?.()).toBe(ACME);
  });

  /**
   * O contrário, e é o dente do achado A (revisão adversarial 2026-10-18).
   *
   * A tela de feature flags autoriza pelo `isAdmin` do bucket **GLOBAL** — o
   * que D2 exige (`ehAdministradorDeSistema`: `tenantId === null && isAdmin`) —
   * e não pelo `isAdmin` de DONO que `obterMeuPerfil` devolve. O de dono é
   * `true` em toda empresa nova
   * (`prisma-tenant-onboarding.repository.ts:202`), então ler o sinal errado
   * mostra a tabela para um ator que a API recusa.
   *
   * Por que a asserção é sobre `getTenant` e não sobre o retorno: `clientMock`
   * não concatena header e o `ApiClient` é mockado como construtor. O `getTenant`
   * é montado **sempre** — o que muda é o valor devolvido: `null`, e o
   * `ApiClient` omite o header quando é `null` (`api-client.ts:66-67`, provado
   * no `api-client.spec.ts`). Então a configuração montada é a única coisa
   * observável daqui, e é onde o bug mora.
   *
   * ⚠️ O cenário `ACME` é o que dá o dente: com empresa escolhida no cookie,
   * `obterMeuPerfilGlobal` devolvendo `null` prova que ela **ignora**
   * `lerTenant()`; uma implementação que escopasse por empresa devolveria a ACME
   * aqui — e mandaria `X-Tenant-Id`, tirando o ator do bucket global (D14/D2).
   */
  it('obterMeuPerfilGlobal devolve getTenant NULO mesmo com empresa escolhida', async () => {
    // `beforeEach` não limpa este spy, e os testes acima já o chamaram — sem
    // esta linha a asserção de contagem mede a suíte, não a função.
    lerTenantMock.mockClear();
    lerTenantMock.mockResolvedValueOnce(ACME);
    clientMock.get.mockResolvedValue(null);

    await obterMeuPerfilGlobal();

    expect(configAtual().getTenant?.()).toBeNull();
    // E ele realmente não pergunta — `lerTenant()` é a fonte do valor.
    expect(lerTenantMock).not.toHaveBeenCalled();
  });

  /**
   * A política de ERRO é a mesma de `obterMeuPerfil`, e só o 401 vira `null`.
   *
   * O que o merge de #108 revelou: esta função nasceu com `catch { return null }`
   * e um comentário jurando que era "mesma política" de `obterMeuPerfil` — mas
   * `obterMeuPerfil` foi corrigida no #107 para distinguir 401 de 403/5xx, e o
   * `catch` daqui ficou para trás. Consequência na tela de flags, que lê `null`
   * como veredito (`me === null || me.isAdmin !== true` → "acesso restrito"):
   * administradora do SISTEMA com a API fora do ar recebia a tela afirmando que
   * não era administradora — o defeito que o #107 existe para matar.
   *
   * ⚠️ Por que estes dois e não todos: 401→`null` e 500→propaga são os dois
   * lados do `if`. Um `catch { return null }` passa no primeiro e falha no
   * segundo; um `throw` cego faz o contrário. Os dois juntos provam que a
   * discriminação existe; 403/timeout/rede são o mesmo `if` com outro rótulo.
   */
  describe('a política de erro é a do #107 (só o 401 vira null)', () => {
    function erroApi(status: number): ApiError {
      const problem = {
        type: 'about:blank',
        title: 'erro',
        status,
        detail: 'detalhe',
        instance: '/me/profile',
        code: 'ERRO',
        traceId: 'trace-1',
      };
      return new ApiError('erro', 'codigo', status, problem);
    }

    it('401 vira null — token expirado é o mesmo estado de "sem sessão"', async () => {
      clientMock.get.mockRejectedValueOnce(erroApi(401));
      await expect(obterMeuPerfilGlobal()).resolves.toBeNull();
    });

    it('500 NÃO vira null — "não é administradora" e "a API caiu" são telas diferentes', async () => {
      clientMock.get.mockRejectedValueOnce(erroApi(500));
      await expect(obterMeuPerfilGlobal()).rejects.toThrow(ApiError);
    });
  });
});

describe('leitura de perfis', () => {
  it('listarPerfis lista e devolve ProfileSummary[]', async () => {
    clientMock.get.mockResolvedValue([]);
    await listarPerfis();
    expect(callPaths('get')).toEqual([BASE]);
  });

  it('obterPerfil busca por ID, não por slug (a API faz findById)', async () => {
    clientMock.get.mockResolvedValue({ id: ID });
    await obterPerfil(ID);
    expect(callPaths('get')).toEqual([`${BASE}/${ID}`]);
    expect(callPaths('get')[0]).not.toContain(SLUG);
  });

  it('obterPerfilPorSlug resolve o slug via a lista e só então busca pelo ID', async () => {
    // A URL pública é `[slug]` (é o que o admin digita), mas a API só
    // conhece UUID. Se o slug fosse interpolado direto no path, o `findById`
    // levaria garbage e a página daria 404 sempre. Aqui o slug passa pelo
    // cliente e NUNCA chega a um path.
    clientMock.get
      .mockResolvedValueOnce([{ id: ID, slug: SLUG }])
      .mockResolvedValueOnce({ id: ID });

    await obterPerfilPorSlug(SLUG);

    expect(callPaths('get')).toEqual([BASE, `${BASE}/${ID}`]);
    for (const p of callPaths('get')) expect(p).not.toContain(SLUG);
  });

  it('obterPerfilPorSlug devolve null quando o slug não existe em lugar nenhum', async () => {
    // O título antigo prometia "propaga 404" e a asserção era `rejects.toThrow()`
    // sem tipo nem status — qualquer erro passava, então o teste não distinguia
    // "não encontrado" de 500. O contrato agora é `null`, e a página decide.
    clientMock.get.mockResolvedValueOnce([{ id: ID, slug: 'outro' }]);
    await expect(obterPerfilPorSlug(SLUG)).resolves.toBeNull();
  });
});

describe('catálogo de permissões', () => {
  it('listarPermissoes lê GET /admin/permissions — não há rota de authorizations na API', async () => {
    clientMock.get.mockResolvedValue(['users.read']);
    const r = await listarPermissoes();
    expect(callPaths('get')).toEqual(['/admin/permissions']);
    expect(r).toEqual(['users.read']);
  });
});

describe('escrita de perfis', () => {
  it('criarPerfil manda só o que a API aceita (sem isAdmin — admin é só via seed)', async () => {
    await criarPerfil({ slug: SLUG, name: 'Editor', initialPermissions: ['users.read'] });
    expect(clientMock.post).toHaveBeenCalledWith(BASE, {
      slug: SLUG,
      name: 'Editor',
      initialPermissions: ['users.read'],
    });
    expect(JSON.stringify(clientMock.post.mock.calls[0]?.[1])).not.toContain('isAdmin');
  });

  it('atualizarPerfil PATCH por ID com name obrigatório', async () => {
    await atualizarPerfil(ID, { name: 'Editor sênior' });
    expect(clientMock.patch).toHaveBeenCalledWith(`${BASE}/${ID}`, { name: 'Editor sênior' });
  });

  it('deletarPerfil DELETE por ID', async () => {
    await deletarPerfil(ID);
    expect(clientMock.delete).toHaveBeenCalledWith(`${BASE}/${ID}`);
  });
});

describe('autorizações — a API não tem sync, tem atribuir/revogar', () => {
  it('atribuirPermissao faz POST com { permissionKey }', async () => {
    await atribuirPermissao(ID, 'users.write');
    expect(clientMock.post).toHaveBeenCalledWith(`${BASE}/${ID}/authorizations`, {
      permissionKey: 'users.write',
    });
  });

  it('revogarPermissao faz DELETE em .../authorizations/:key', async () => {
    await revogarPermissao(ID, 'users.write');
    expect(clientMock.delete).toHaveBeenCalledWith(`${BASE}/${ID}/authorizations/users.write`);
  });
});

describe('diffPermissoes', () => {
  it('separa o que entra do que sai, ignoras fora dos dois conjuntos', () => {
    expect(diffPermissoes(['a', 'b'], ['b', 'c'])).toEqual({
      remover: ['a'],
      adicionar: ['c'],
    });
  });

  it('conjuntos iguais não geram chamada nenhuma', () => {
    expect(diffPermissoes(['a', 'b'], ['b', 'a'])).toEqual({ remover: [], adicionar: [] });
  });
});

describe('trocarPermissoes — o diff é o comportamento correto', () => {
  it('revoga ANTES de conceder, para que uma falha deixe o perfil com MENOS privilégio', async () => {
    // Fail-safe: se o POST falhar depois de um DELETE, o usuário fica sem
    // permissão — nunca com uma que não pediu.
    await trocarPermissoes(ID, ['a', 'b'], ['b', 'c']);

    expect(clientMock.delete).toHaveBeenCalledWith(`${BASE}/${ID}/authorizations/a`);
    expect(clientMock.post).toHaveBeenCalledWith(`${BASE}/${ID}/authorizations`, {
      permissionKey: 'c',
    });
    const [revogouEm] = clientMock.delete.mock.invocationCallOrder;
    const [concedeuEm] = clientMock.post.mock.invocationCallOrder;
    expect(revogouEm!).toBeLessThan(concedeuEm!);
  });

  it('propaga a falha: uma revogação que falha não pode virar "salvo com sucesso"', async () => {
    clientMock.delete.mockRejectedValueOnce(new Error('401'));
    await expect(trocarPermissoes(ID, ['a'], ['b'])).rejects.toThrow('401');
    expect(clientMock.post).not.toHaveBeenCalled();
  });

  it('propaga a falha da concessão também — estado parcial não é sucesso', async () => {
    clientMock.post.mockRejectedValueOnce(new Error('500'));
    await expect(trocarPermissoes(ID, ['a'], ['b'])).rejects.toThrow('500');
    // a revogação já tinha acontecido: por isso o erro precisa chegar ao usuário
    expect(clientMock.delete).toHaveBeenCalled();
  });

  it('sem diferença, não chama a API', async () => {
    await trocarPermissoes(ID, ['a'], ['a']);
    expect(clientMock.post).not.toHaveBeenCalled();
    expect(clientMock.delete).not.toHaveBeenCalled();
  });
});

describe('atribuição de perfil a usuário', () => {
  it('atribui com PUT /admin/users/:id/profile', async () => {
    await atribuirPerfil('user-1', ID);
    expect(clientMock.put).toHaveBeenCalledWith('/admin/users/user-1/profile', {
      profileId: ID,
    });
  });

  it('LIMPAR o perfil usa o mesmo PUT com profileId null — DELETE não existe', async () => {
    await atribuirPerfil('user-1', null);
    expect(clientMock.put).toHaveBeenCalledWith('/admin/users/user-1/profile', {
      profileId: null,
    });
    expect(clientMock.delete).not.toHaveBeenCalled();
  });
});

describe('decidirAtribuicaoPerfil — o que o valor selecionado significa (M3)', () => {
  // A página é RSC e não tem spec (`app/**/*.tsx` fora da cobertura por
  // decisão do vitest.config.ts). A decisão vai para cá porque é pura e é
  // aqui que dá para provar o comportamento de verdade.
  //
  // O defeito que ela segura: seleção vazia virava `PUT profileId: null`
  // incondicionalmente. Bastava `atual` ser `undefined` — ou o `defaultValue`
  // do `<select>` não bater — para clicar "Salvar" sem tocar em nada APAGAR
  // o perfil do usuário. Antes do PR a seleção vazia era no-op.

  it('sem perfil atual e nada selecionado → NÃO envia nada (o bug do M3)', () => {
    expect(decidirAtribuicaoPerfil({ selecionado: '', atual: null })).toEqual({
      tipo: 'sem-mudanca',
    });
  });

  it('perfil atual mantido → NÃO envia nada, mesmo com a tela "suja"', () => {
    expect(decidirAtribuicaoPerfil({ selecionado: ID, atual: ID })).toEqual({
      tipo: 'sem-mudanca',
    });
  });

  it('perfil atual + opção vazia escolhida → remover (é uma ESCOLHA, não um default)', () => {
    expect(decidirAtribuicaoPerfil({ selecionado: '', atual: ID })).toEqual({ tipo: 'remover' });
  });

  it('sem perfil atual + outro perfil escolhido → atribuir aquele', () => {
    expect(decidirAtribuicaoPerfil({ selecionado: 'p-2', atual: null })).toEqual({
      tipo: 'atribuir',
      profileId: 'p-2',
    });
  });

  it('troca de perfil → atribuir o novo', () => {
    expect(decidirAtribuicaoPerfil({ selecionado: 'p-2', atual: ID })).toEqual({
      tipo: 'atribuir',
      profileId: 'p-2',
    });
  });

  it('a decisão "sem mudança" realmente não chama a API quando aplicada pela página', async () => {
    // Fecha o ciclo: a função existe para ser consumida, e o consumo é o que
    // impede o PUT destrutivo. Se alguém voltar a chamar `atribuirPerfil`
    // direto, este teste não pega — quem pega é a página, que não tem spec.
    // O que ele prova é que a decisão, sozinha, é segura.
    const d = decidirAtribuicaoPerfil({ selecionado: '', atual: null });
    if (d.tipo !== 'sem-mudanca') {
      await atribuirPerfil('user-1', null);
    }
    expect(clientMock.put).not.toHaveBeenCalled();
  });
});

// ─── O prefixo da API é UM, e ele vive no `baseUrl` ───────────────────────
//
// MEDIDO 2026-10-16 (#97): este arquivo afirmava path `/api/v1/...` com
// `ApiClient` MOCKADO, e a suíte ficava verde enquanto as 4 telas admin
// respondiam "Acesso restrito" para TODO mundo — inclusive admin de verdade —
// em dev, em produção e no e2e. Motivo: `API_BASE_URL` JÁ vem com `/api/v1`
// (é o que os 4 configs de deploy passam: `docker-compose.yml:164`,
// `docker-compose.dev.yml:17`, `.env.production.example:35`,
// `apps/web/.env.example:2`), e `lib/perfil.ts` prefixava de novo — a
// chamada saía como `/api/v1/api/v1/me/profile`, o `ApiError` era engolido
// pelo `catch` de `obterMeuPerfil`, e o 404 virava "sem perfil".
//
// A asserção abaixo é a que teria pegado: ela afirma a INVARIANTE, não cada
// path. Os testes acima continuam válidos — eles fixam o shape de cada
// chamada — mas nenhum deles notava o prefixo, porque o mock não concatena.
describe('prefixo da API (MEDIDO — 4 telas admin respondiam "Acesso restrito")', () => {
  it('nenhum path começa com /api/v1 — o prefixo já vem em API_BASE_URL', async () => {
    await chamarTodasQueFalamComApi();

    const todos = [
      ...callPaths('get'),
      ...callPaths('post'),
      ...callPaths('patch'),
      ...callPaths('put'),
      ...callPaths('delete'),
    ];
    expect(todos.length).toBeGreaterThan(0);
    expect(todos.filter((p) => p.startsWith('/api/v1'))).toEqual([]);
  });
});

/**
 * Chama um de cada função que fala com a API, para o guard acima ter o quê olhar.
 *
 * shortcut: a lista é manual — uma função nova com `/api/v1` NÃO é coberta.
 * Quando existir, trocar por um gate que varra `perfil.ts` (o lugar do
 * `check-e2e-flow-coverage`), não por mais um item nesta lista.
 */
async function chamarTodasQueFalamComApi(): Promise<void> {
  await obterMeuPerfil();
  await listarPerfis();
  await obterPerfil(ID);
  await listarPermissoes();
  await criarPerfil({ slug: 'novo', name: 'Novo' });
  await atualizarPerfil(ID, { name: 'Renomeado' });
  await deletarPerfil(ID);
  await atribuirPermissao(ID, 'users.read');
  await revogarPermissao(ID, 'users.read');
  await atribuirPerfil('user-1', ID);
}
