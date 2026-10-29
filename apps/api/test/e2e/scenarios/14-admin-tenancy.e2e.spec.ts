// apps/api/test/e2e/scenarios/14-admin-tenancy.e2e.spec.ts
//
// Cenário E2E 14: o INVENTÁRIO de tenancy do ADMIN DO SISTEMA.
//
//   GET /api/v1/admin/tenancy → as empresas com os seus membros E os usuários
//                                com as suas empresas
//
// POR QUE ESTE ARQUIVO EXISTE, e por que é e2e e não unitário
//
// `admin-tenancy.controller.spec.ts` chama os handlers com `new` e um stub:
// nenhum GUARD roda, o MODULE GRAPH não existe e a ROTA não é consultada.
// `prisma-admin-tenancy.repository.integration.spec.ts` prova a query, mas
// instancia o repositório DIRETO — nunca passa pelo container.
//
// São as mesmas 3 mutações cegas que o cenário 13 (feature-flags) fecha, e
// elas continuam cegas aqui:
//
//   - `AdminTenancyController` fora de `controllers` ............ 404
//   - `ProfilesModule` fora dos imports do `TenancyModule` ...... DI quebrado
//   - `PrismaAdminTenancyRepository` fora do `TenancyModule` ... DI quebrado
//   - o portão D2 fora da use case .............................. ESCALA
//
// A quarta é a que muda COMPORTAMENTO e a que nenhum outro arquivo mede: o
// `gerente` de uma empresa tem `isAdmin: true` no perfil efetivo DA EMPRESA
// DELE e `listAllPermissions()` no banco — logo o `PermissionsGuard` o LIBERA.
// Quem barra é o D2 (`tenantId === null && isAdmin`), dentro da use case.
//
// ⚠️ 2026-10-29 (revisão do PR #127): a rota era DUAS (`/admin/tenants` e
// `/admin/users`) e virou UMA. O motivo é o invariante do próprio repositório
// — "as DUAS listas precisam contar a mesma história" — que duas rotas HTTP
// não conseguem garantir: duas rotas são dois requests, e cada request é uma
// transação, e as duas lidas em instantes diferentes.
//
// ⚠️ Sem cabeçalho `// FLUXO:` — igual aos cenários `01`-`13`. O inventário
// de fluxos (`.agents/specs/conventions/e2e-playwright.md`) é um artefato de
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

const ROTA_INVENTARIO = '/api/v1/admin/tenancy';

interface MembroWire {
  id: string;
  nome: string;
  email: string;
  role: string;
  perfil: string | null;
}
interface EmpresaWire {
  id: string;
  nome: string;
  slug: string;
  membros: MembroWire[];
}
interface EmpresaDoUsuarioWire {
  id: string;
  nome: string;
  slug: string;
  role: string;
  perfil: string | null;
}
interface UsuarioWire {
  id: string;
  nome: string;
  email: string;
  empresas: EmpresaDoUsuarioWire[];
}
interface InventarioWire {
  empresas: EmpresaWire[];
  usuarios: UsuarioWire[];
}

describe('E2E 14: inventário de tenancy (admin do sistema)', () => {
  let e2e: E2EContext;

  /**
   * O contador do e-mail — o que faz cada login cair num balde DIFFERENTE.
   *
   * ⚠️ O porquê está no `emailDaConta`, logo abaixo.
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
   * O e-mail da conta — ÚNICO a cada chamada.
   *
   * ⚠️ O e-mail precisa ser DIFERENTE a cada chamada, e o motivo é medido
   * (revisão do PR #127, 2026-10-29): o limitador de login é POR CONTA
   * (`LIMITE_LOGIN_POR_MINUTO = 5`, `ttl: 60_000`, e o tracker é
   * `` `${ip}:${email}` ``). Com o e-mail derivado de um slug FIXO, os 5
   * `it()` deste arquivo logavam a MESMA conta 5 vezes — o 5º login consumia
   * a ÚLTIMA cota, e o spec ficaria vermelho no SETUP (por um motivo que não
   * é a asserção que ele mede) no dia que um `it()` novo aparecesse, ou com um
   * `--retry=1` do Vitest.
   *
   * ⚠️ A correção NÃO é subir o limite: `auth.controller.ts` diz exatamente
   * que "subir o teto para a suíte passar seria trocar o controle de
   * segurança pela conveniência do teste" — e o cenário `09-rate-limit` é o
   * que mede esse controle. A correção é cada login cair num balde diferente.
   */
  function emailDaConta(slug: string): string {
    contadorDeContas += 1;
    return `${slug}-dono-${contadorDeContas}@projeto.test`;
  }

  /**
   * Uma empresa com o seu DONO — pelo MESMO caminho que a tela usaria
   * (`POST /users` com `destino.tipo='empresa'`).
   *
   * O DONO nasce como `gerente` e com `isAdmin: true` no perfil DA EMPRESA:
   * é o ator que a escalada deste cenário mede.
   */
  async function criarEmpresaComDono(slug: string): Promise<{
    email: string;
    token: string;
    empresaId: string;
    headersDaEmpresa: Record<string, string>;
  }> {
    const email = emailDaConta(slug);
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
      email,
      token,
      empresaId: empresa.id,
      headersDaEmpresa: { authorization: `Bearer ${token}`, 'x-tenant-id': empresa.id },
    };
  }

  // ─────────── a rota existe e o ADMIN DO SISTEMA vê a base ───────────

  it('GET /admin/tenancy devolve as empresas com os membros E os usuários com as empresas', async () => {
    const { email, empresaId } = await criarEmpresaComDono('acme');

    const res = await e2e.injetar({ method: 'GET', url: ROTA_INVENTARIO });

    // 404 aqui = o controller não está em `controllers`, ou o módulo não está
    // no AppModule. 403 = o `PermissionsGuard` não rodou (cache frio).
    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as InventarioWire;

    const acme = corpo.empresas.find((e) => e.id === empresaId);
    expect(acme).toBeDefined();
    expect(acme?.nome).toBe('ACME');
    expect(acme?.slug).toBe('acme');
    // O MEMBRO: nome e e-mail. O `perfil` é o slug do perfil EFETIVO.
    expect(acme?.membros.map((m) => m.email)).toContain(email);
    expect(acme?.membros[0]?.nome).toBe('Dona Da Empresa');
    expect(acme?.membros[0]?.perfil).toBe('gerente');

    // E a OUTRA direção, na MESMA resposta: as duas listas saem do mesmo
    // instante — e é por isso que elas viajam juntas.
    const dona = corpo.usuarios.find((u) => u.email === email);
    expect(dona).toBeDefined();
    expect(dona?.empresas.map((e) => e.id)).toContain(empresaId);
    expect(dona?.empresas[0]?.nome).toBe('ACME');
  });

  it('a conta do admin do sistema aparece — ela não pertence a empresa nenhuma', async () => {
    await criarEmpresaComDono('acme');

    const res = await e2e.injetar({ method: 'GET', url: ROTA_INVENTARIO });

    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as InventarioWire;

    // ⚠️ E o INVERSO: a conta do admin do sistema não pertence a empresa
    // nenhuma, e mesmo assim é "todos os usuários" — uma lista montada pelas
    // empresas a esqueceria.
    const admin = corpo.usuarios.find((u) => u.email === 'conta-de-sessao-e2e@projeto.test');
    expect(admin?.empresas).toEqual([]);
  });

  // ─────────── o portão D2, medido na fronteira HTTP ───────────

  it('o GERENTE de uma empresa é recusado — ele tem isAdmin, mas na empresa DELE', async () => {
    const { headersDaEmpresa } = await criarEmpresaComDono('acme');

    // ⚠️ O `PermissionsGuard` LIBERA este ator: o dono de uma empresa nova
    // recebe `listAllPermissions()`, e o perfil efetivo dele tem `isAdmin:
    // true`. Se o portão fosse a PERMISSÃO, ele leria a base INTEIRA.
    const res = await e2e.injetar({
      method: 'GET',
      url: ROTA_INVENTARIO,
      headers: headersDaEmpresa,
    });

    expect(res.statusCode).toBe(403);
    const corpo = JSON.parse(res.body) as { code: string; detail: string };
    // E o `detail` é que nomeia QUEM recusou: o `code` é `FORBIDDEN` para
    // qualquer 403, e o do `PermissionsGuard` é o MESMO.
    expect(corpo.code).toBe('FORBIDDEN');
    expect(corpo.detail).toContain('administrador do sistema');
  });

  it('o MESMO gerente, SEM o header de empresa, é recusado pelo GUARD (o bucket global não o promove)', async () => {
    const { token } = await criarEmpresaComDono('acme');
    // ⚠️ SEM o `x-tenant-id`: o bucket é o GLOBAL, e é lá que mora o `isAdmin`
    // do seed. O perfil GLOBAL do gerente é NULO — o `isAdmin: true` dele é o DA
    // EMPRESA, e não é o que a API olha.
    const res = await e2e.injetar({
      method: 'GET',
      url: ROTA_INVENTARIO,
      headers: { authorization: `Bearer ${token}` },
    });

    // Recusado — e por um portão DIFERENTE do caso com o header. Aqui quem
    // recusa é o `PermissionsGuard`: no bucket global o gerente não tem perfil
    // nenhum, logo não tem `admin.manage-users`, e o guard barra ANTES de a
    // use case (e o D2) ser chamada.
    //
    // ⚠️ MEDIDO 2026-10-27: a EXPECTATIVA deste teste era o `detail` do D2, e
    // o que chegou foi o do guard. A expectativa estava errada, e a
    // propriedade real é mais forte: o gerente é recusado nos DOIS baldes —
    // com o header pelo D2, sem o header pelo guard. Nenhum caminho o deixa
    // ler a base.
    expect(res.statusCode).toBe(403);
    const corpo = JSON.parse(res.body) as { code: string; detail: string };
    expect(corpo.code).toBe('FORBIDDEN');
    expect(corpo.detail).toContain('permissão requerida ausente');
  });

  it('quem não tem NENHUMA permissão é recusado pelo guard — e o `detail` é outro', async () => {
    const comum = await criarUsuarioAutenticado(e2e, {
      nome: 'Ana Comum',
      email: 'ana-comum@projeto.test',
    });

    const res = await e2e.injetar({
      method: 'GET',
      url: ROTA_INVENTARIO,
      headers: comum.headers,
    });

    expect(res.statusCode).toBe(403);
    const corpo = JSON.parse(res.body) as { code: string; detail: string };
    // ⚠️ O `code` é o MESMO `FORBIDDEN` do D2 — e o `detail` é o que separa
    // "a permissão faltou" de "você não é o administrador do sistema".
    expect(corpo.code).toBe('FORBIDDEN');
    expect(corpo.detail).toContain('permissão requerida ausente');
    expect(corpo.detail).not.toContain('administrador do sistema');
  });

  // ─────────── o escopo: o bucket de SISTEMA, e nunca o header ───────────

  it('X-Tenant-Id -> 403 TENANT_MEMBERSHIP_REQUIRED (o header é capacidade do cliente)', async () => {
    const res = await e2e.injetar({
      method: 'GET',
      url: ROTA_INVENTARIO,
      headers: { 'x-tenant-id': '0190a8b6-0000-7000-8000-00000000ffff' },
    });

    expect(res.statusCode).toBe(403);
    const corpo = JSON.parse(res.body) as { code: string };
    // Não é o `FORBIDDEN` de D2: o ator nem chegou ao portão. É o guard que
    // recusou a EMPRESA que o cliente afirmación.
    expect(corpo.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  it('a lista atravessa empresas: o admin vê a empresa que NÃO é dele', async () => {
    // A conta de sessão do harness é o admin do SISTEMA — e ela não pertence
    // a empresa nenhuma. Ver a empresa abaixo é o que prova que o escopo
    // aberto é o de SISTEMA, e não o da empresa do ator.
    const { empresaId } = await criarEmpresaComDono('acme');

    const res = await e2e.injetar({ method: 'GET', url: ROTA_INVENTARIO });

    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as InventarioWire;
    expect(corpo.empresas.map((e) => e.id)).toContain(empresaId);
  });

  // ─────────── a cota de login é POR CONTA ───────────

  it('cada login deste spec cai num balde DIFERENTE — a cota é por conta', () => {
    // ⚠️ O DENTE DA MARGEM. O limitador de login é POR CONTA
    // (`LIMITE_LOGIN_POR_MINUTO = 5`, tracker `ip:email`), e o `cleanE2EDatabase`
    // limpa o BANCO entre os testes — mas o storage do throttler é em memória
    // no processo do Nest, e o contador NÃO é resetado.
    //
    // Com o e-mail derivado de um slug FIXO, os `it()` deste arquivo logavam a
    // MESMA conta: MEDIDO (revisão do PR #127), os 5 logins saíram com
    // `x-ratelimit-remaining: 4 → 3 → 2 → 1 → 0` — o 5º consumia a ÚLTIMA
    // cota, e um `it()` novo (ou um `--retry=1`) deixaria o spec vermelho no
    // SETUP, por um motivo que não é a asserção que ele mede.
    //
    // Este teste afirma a PROPRIEDADE: o MESMO slug dá e-mails diferentes —
    // logo, baldes diferentes, e a margem é sempre a mesma.
    expect(emailDaConta('acme')).not.toBe(emailDaConta('acme'));
  });
});
