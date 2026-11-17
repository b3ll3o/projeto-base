// apps/api/test/e2e/scenarios/18-admin-historico-usuario.e2e.spec.ts
//
// Cenário E2E 18: o HISTÓRICO de auditoria de uma pessoa, lido pelo ADMIN DO
// SISTEMA.
//
//   GET /api/v1/admin/users/:id/history → as versões da pessoa, no bucket de
//                                          SISTEMA
//
// POR QUE ESTE ARQUIVO EXISTE, e por que é e2e e não unitário
//
// A rota de DONO (`GET /users/:id/history`) já tem spec e2e, e a use case tem
// spec unitária. O que NENHUM dos dois mede é o que este arquivo mede:
//
//   - `AdminUserHistoryController` fora de `controllers` .......... 404
//   - `UsersModule` sem o `ProfilesModule` ...................... DI quebrado
//   - o `@RequirePermission` fora do handler .................... rota ABERTA
//   - o portão D2 fora da use case .............................. ESCALA
//
// A quarta é a que muda COMPORTAMENTO, e ela é MEDIDA AQUI nos DOIS baldes:
// o dono de uma empresa tem `isAdmin: true` no perfil efetivo DA EMPRESA DELE
// e `listAllPermissions()` no banco — logo o `PermissionsGuard` o LIBERA. Com
// o header de empresa, quem barra é o D2; SEM o header, quem barra é o guard
// (o bucket global não o promove). Nenhum dos dois caminhos devolve o
// histórico.
//
// ⚠️ Sem cabeçalho `// FLUXO:` — igual aos cenários `01`-`17`. O inventário de
// fluxos (`.agents/specs/conventions/e2e-playwright.md`) é um artefato de
// TELAS (`apps/web/e2e`); um spec em `apps/api/test/e2e/` que nele aparecesse
// deixaria o `check-e2e-flow-coverage` vermelho por construção.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  criarUsuarioAutenticado,
  tokenDe,
  SENHA_DE_TESTE,
  type E2EContext,
} from '../test-app.helper.js';

const ROTA = '/api/v1/admin/users';

/** Um id que existe em NENHUM lugar — e que é um UUID v7 válido (senão o 404 viraria 400). */
const ID_INEXISTENTE = '0190a8b6-1234-7abc-9def-000000000999';

interface EntradaWire {
  entityId: string;
  version: number;
  operation: string;
}
interface PaginaWire {
  entries: EntradaWire[];
  nextCursor: string | null;
}

describe('E2E 18: histórico de usuário lido pelo admin do sistema', () => {
  let e2e: E2EContext;

  /**
   * O contador do e-mail — o que faz cada login cair num balde DIFFERENTE.
   *
   * ⚠️ O limitador de login é POR CONTA (`LIMITE_LOGIN_POR_MINUTO = 5`, tracker
   * `ip:email`) e o `cleanE2EDatabase` limpa o BANCO entre os testes — mas o
   * storage do throttler vive em memória, no processo do Nest, e o contador NÃO
   * é resetado. Com um e-mail FIXO, os logins deste arquivo caem no mesmo
   * balde e o último `it()` tomaria 429 no SETUP — vermelho por um motivo que
   * não é a asserção que ele mede. O mesmo motivo que o cenário 14 mede.
   */
  let contadorDeContas = 0;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e);
  });

  /**
   * Uma empresa com o seu DONO — pelo MESMO caminho que a tela usaria
   * (`POST /users` com `destino.tipo='empresa'`).
   *
   * O DONO nasce como `gerente` e com `isAdmin: true` no perfil DA EMPRESA:
   * é o ator que a escalada deste cenário mede.
   */
  async function criarEmpresaComDono(slug: string): Promise<{
    token: string;
    empresaId: string;
    headersDaEmpresa: Record<string, string>;
  }> {
    contadorDeContas += 1;
    const email = `dono-${slug}-${contadorDeContas}@projeto.test`;
    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Dona Da Empresa',
        email,
        senha: SENHA_DE_TESTE,
        destino: { tipo: 'empresa', nome: slug.toUpperCase(), slug },
      },
    });
    expect(cadastro.statusCode).toBe(201);

    const empresa = await e2e.ctx.prisma.tenant.findUniqueOrThrow({ where: { slug } });
    const token = await tokenDe(e2e.app, { email, senha: SENHA_DE_TESTE });
    return {
      token,
      empresaId: empresa.id,
      headersDaEmpresa: { authorization: `Bearer ${token}`, 'x-tenant-id': empresa.id },
    };
  }

  // ─────────── o ADMIN DO SISTEMA lê o histórico de QUALQUER pessoa ───────────

  it('o ADMIN DO SISTEMA lê o histórico de uma pessoa que não é dele', async () => {
    const alvo = await criarUsuarioAutenticado(e2e, {
      nome: 'Alvo',
      email: 'alvo-do-historico@b.com',
    });

    // ⚠️ SEM header de empresa: o bucket é o GLOBAL, e é o que abre o escopo
    // de SISTEMA na leitura. Com header, a leitura cairia no escopo da
    // empresa do ATOR — e a policy `history_leitura` só libera o que está no
    // escopo, o que devolveria uma lista VAZIA (e "vazia" parece "não tem
    // histórico").
    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history`,
    });

    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as PaginaWire;
    expect(corpo.entries.length).toBeGreaterThanOrEqual(1);
    // A entrada é o INSERT da pessoa — e o `entityId` é o ID DELA, provando
    // que a rota leu o histórico de OUTRA pessoa.
    expect(corpo.entries[0]?.entityId).toBe(alvo.id);
    expect(corpo.entries[0]?.operation).toBe('INSERT');
    expect(corpo.nextCursor).toBeNull();
  });

  it('o histórico do admin atravessa a EMPRESA — ele vê o que a RLS esconde do escopo de empresa', async () => {
    // A pessoa nasce numa EMPRESA (com o `destino`), e o histórico dela é
    // gravado no escopo da EMPRESA. O admin do sistema lê pelo bucket GLOBAL.
    contadorDeContas += 1;
    const email = `membro-da-empresa-${contadorDeContas}@projeto.test`;
    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Membro',
        email,
        senha: SENHA_DE_TESTE,
        destino: { tipo: 'empresa', nome: 'EMPRESA DO HISTORICO', slug: 'empresa-historico' },
      },
    });
    expect(cadastro.statusCode).toBe(201);
    const membro = JSON.parse(cadastro.body) as { id: string };

    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${membro.id}/history`,
    });

    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as PaginaWire;
    expect(corpo.entries.length).toBeGreaterThanOrEqual(1);
    expect(corpo.entries[0]?.entityId).toBe(membro.id);
  });

  // ─────────── o portão D2, medido na fronteira HTTP ───────────

  it('o DONO DE EMPRESA é recusado — ele tem isAdmin, mas na EMPRESA dele', async () => {
    const alvo = await criarUsuarioAutenticado(e2e, {
      nome: 'Alvo',
      email: 'alvo-recusado@b.com',
    });
    const { headersDaEmpresa } = await criarEmpresaComDono('acme');

    // ⚠️ O `PermissionsGuard` LIBERA este ator: o dono de uma empresa nova
    // recebe `listAllPermissions()`, e o perfil efetivo dele tem `isAdmin:
    // true`. Se o portão fosse a PERMISSÃO, ele leria o histórico de qualquer
    // pessoa.
    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history`,
      headers: headersDaEmpresa,
    });

    expect(res.statusCode).toBe(403);
    const corpo = JSON.parse(res.body) as { code: string; detail: string };
    // E o `detail` é que nomeia QUEM recusou: o `code` é `FORBIDDEN` para
    // qualquer 403, e o do `PermissionsGuard` é o MESMO.
    expect(corpo.code).toBe('FORBIDDEN');
    expect(corpo.detail).toContain('administrador do sistema');
  });

  it('o MESMO dono, SEM o header de empresa, é recusado pelo GUARD (o bucket global não o promove)', async () => {
    const alvo = await criarUsuarioAutenticado(e2e, {
      nome: 'Alvo',
      email: 'alvo-sem-header@b.com',
    });
    const { token } = await criarEmpresaComDono('acme');

    // ⚠️ SEM o `x-tenant-id`: o bucket é o GLOBAL, e é lá que mora o `isAdmin`
    // do seed. O perfil GLOBAL do dono é NULO — o `isAdmin: true` dele é o DA
    // EMPRESA, e não é o que a API olha.
    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    const corpo = JSON.parse(res.body) as { code: string; detail: string };
    // Aqui quem recusa é o `PermissionsGuard`: no bucket global o dono não tem
    // perfil nenhum, logo não tem `admin.manage-users`.
    expect(corpo.code).toBe('FORBIDDEN');
    expect(corpo.detail).toContain('permissão requerida ausente');
  });

  it('quem não tem NENHUMA permissão é recusado pelo guard', async () => {
    const alvo = await criarUsuarioAutenticado(e2e, {
      nome: 'Alvo',
      email: 'alvo-comum@b.com',
    });
    const comum = await criarUsuarioAutenticado(e2e, {
      nome: 'Ana Comum',
      email: 'ana-comum-historico@b.com',
    });

    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history`,
      headers: comum.headers,
    });

    expect(res.statusCode).toBe(403);
    const corpo = JSON.parse(res.body) as { code: string; detail: string };
    expect(corpo.code).toBe('FORBIDDEN');
    expect(corpo.detail).toContain('permissão requerida ausente');
  });

  // ─────────── a ordem, o cursor e a pessoa apagada ───────────

  it('a trilha vem da MAIS RECENTE para a mais antiga — e o cursor leva à página seguinte', async () => {
    const alvo = await criarUsuarioAutenticado(e2e, {
      nome: 'Alvo',
      email: 'alvo-ordem@b.com',
    });

    // A PESSOA se renomeia (a rota do dono é owner-only) — duas alterações,
    // para a trilha ter três versões.
    for (const [versao, nome] of [
      [1, 'Nome Dois'],
      [2, 'Nome Tres'],
    ] as const) {
      const res = await e2e.injetar({
        method: 'PATCH',
        url: `/api/v1/users/${alvo.id}`,
        payload: { novoNome: nome },
        headers: { ...alvo.headers, 'if-match': `W/"v${versao}"` },
      });
      expect(res.statusCode).toBe(200);
    }

    const primeira = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history?limit=2`,
    });

    expect(primeira.statusCode).toBe(200);
    const pagina1 = JSON.parse(primeira.body) as PaginaWire;
    // ⚠️ A ORDEM é descendente: a versão mais recente PRIMEIRO. A ordem
    // antiga (ascendente) punha a tela de exibir as 100 versões mais ANTIGAS e
    // cortava justamente as mais recentes.
    expect(pagina1.entries.map((e) => e.version)).toEqual([3, 2]);
    expect(pagina1.nextCursor).not.toBeNull();

    // E o CURSOR leva à página seguinte — que é a que ficou de fora.
    const segunda = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history?limit=2&cursor=${pagina1.nextCursor}`,
    });

    expect(segunda.statusCode).toBe(200);
    const pagina2 = JSON.parse(segunda.body) as PaginaWire;
    expect(pagina2.entries.map((e) => e.version)).toEqual([1]);
    expect(pagina2.nextCursor).toBeNull();
  });

  it('a pessoa APAGADA tem a trilha lida — o soft-delete não apaga a trilha', async () => {
    const alvo = await criarUsuarioAutenticado(e2e, {
      nome: 'Alvo Apagado',
      email: 'alvo-apagado@b.com',
    });

    const remocao = await e2e.injetar({
      method: 'DELETE',
      url: `/api/v1/users/${alvo.id}`,
      headers: { ...alvo.headers, 'if-match': 'W/"v1"' },
    });
    expect(remocao.statusCode).toBe(204);

    // ⚠️ Sem o `includeDeleted`, a pessoa apagada daria 404 — e a trilha de
    // quem SAIU seria inalcançável pela única rota que a lê, que é
    // exatamente o caso que a rota existe para servir.
    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history`,
    });

    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as PaginaWire;
    expect(corpo.entries.map((e) => e.operation)).toContain('DELETE');
  });

  it('o cursor de OUTRA pessoa é RECUSADO — e a resposta não diz se aquele id existe', async () => {
    const alvo = await criarUsuarioAutenticado(e2e, {
      nome: 'Alvo',
      email: 'alvo-cursor@b.com',
    });
    const outro = await criarUsuarioAutenticado(e2e, {
      nome: 'Outro',
      email: 'outro-cursor@b.com',
    });

    // O cursor do OUTRO — e a trilha dele precisa de mais de uma versão, para
    // o `nextCursor` existir (com uma versão só, a página é a última).
    for (const [versao, nome] of [
      [1, 'Outro Dois'],
      [2, 'Outro Tres'],
    ] as const) {
      const res = await e2e.injetar({
        method: 'PATCH',
        url: `/api/v1/users/${outro.id}`,
        payload: { novoNome: nome },
        headers: { ...outro.headers, 'if-match': `W/"v${versao}"` },
      });
      expect(res.statusCode).toBe(200);
    }

    const doOutro = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${outro.id}/history?limit=1`,
    });
    const pagina = JSON.parse(doOutro.body) as PaginaWire;
    const cursorAlheio = pagina.nextCursor;
    expect(cursorAlheio).not.toBeNull();

    // …e a trilha do alvo, paginada com ele: a resposta é 400 — a MESMA de
    // "o cursor não existe". O erro não diz se aquele id existe.
    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${alvo.id}/history?limit=1&cursor=${cursorAlheio}`,
    });

    expect(res.statusCode).toBe(400);
    const corpo = JSON.parse(res.body) as { code: string };
    expect(corpo.code).toBe('VALIDATION_ERROR');
  });

  // ─────────── pessoa inexistente ───────────

  it('pessoa inexistente → 404 (e não uma lista vazia)', async () => {
    const res = await e2e.injetar({
      method: 'GET',
      url: `${ROTA}/${ID_INEXISTENTE}/history`,
    });

    expect(res.statusCode).toBe(404);
    const corpo = JSON.parse(res.body) as { code: string };
    expect(corpo.code).toBe('USER_NOT_FOUND');
  });
});
