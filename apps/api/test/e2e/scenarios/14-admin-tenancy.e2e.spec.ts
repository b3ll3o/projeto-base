// apps/api/test/e2e/scenarios/14-admin-tenancy.e2e.spec.ts
//
// Cenário E2E 14: o INVENTÁRIO de tenancy do ADMIN DO SISTEMA.
//
//   GET /api/v1/admin/tenants → todas as empresas, com os seus membros
//   GET /api/v1/admin/users   → todos os usuários, com as suas empresas
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
//   - `PrismaAdminTenancyRepository` fora do `PrismaPersistenceModule` . DI
//   - o portão D2 fora da use case .............................. ESCALA
//
// A quarta é a que muda COMPORTAMENTO e a que nenhum outro arquivo mede: o
// `gerente` de uma empresa tem `isAdmin: true` no perfil efetivo DA EMPRESA
// DELE e `listAllPermissions()` no banco — logo o `PermissionsGuard` o LIBERA.
// Quem barra é o D2 (`tenantId === null && isAdmin`), dentro da use case.
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

const ROTA_EMPRESAS = '/api/v1/admin/tenants';
const ROTA_USUARIOS = '/api/v1/admin/users';

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

describe('E2E 14: inventário de tenancy (admin do sistema)', () => {
  let e2e: E2EContext;

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
    email: string;
    token: string;
    empresaId: string;
    headersDaEmpresa: Record<string, string>;
  }> {
    const email = `${slug}-dono@projeto.test`;
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

  it('GET /admin/tenants devolve as empresas do sistema, com os membros de cada uma', async () => {
    const { email, empresaId } = await criarEmpresaComDono('acme');

    const res = await e2e.injetar({ method: 'GET', url: ROTA_EMPRESAS });

    // 404 aqui = o controller não está em `controllers`, ou o módulo não está
    // no AppModule. 403 = o `PermissionsGuard` não rodou (cache frio).
    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as EmpresaWire[];

    const acme = corpo.find((e) => e.id === empresaId);
    expect(acme).toBeDefined();
    expect(acme?.nome).toBe('ACME');
    expect(acme?.slug).toBe('acme');
    // O MEMBRO: nome e e-mail. O `perfil` é o slug do perfil EFETIVO.
    expect(acme?.membros.map((m) => m.email)).toContain(email);
    expect(acme?.membros[0]?.nome).toBe('Dona Da Empresa');
    expect(acme?.membros[0]?.perfil).toBe('gerente');
  });

  it('GET /admin/users devolve os usuários do sistema, com as empresas a que pertencem', async () => {
    const { email, empresaId } = await criarEmpresaComDono('acme');

    const res = await e2e.injetar({ method: 'GET', url: ROTA_USUARIOS });

    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as UsuarioWire[];

    const dona = corpo.find((u) => u.email === email);
    expect(dona).toBeDefined();
    expect(dona?.empresas.map((e) => e.id)).toContain(empresaId);
    expect(dona?.empresas[0]?.nome).toBe('ACME');
    // ⚠️ E o INVERSO: a conta do admin do sistema não pertence a empresa
    // nenhuma, e mesmo assim é "todos os usuários" — uma lista montada pelas
    // empresas a esqueceria.
    const admin = corpo.find((u) => u.email === 'conta-de-sessao-e2e@projeto.test');
    expect(admin?.empresas).toEqual([]);
  });

  // ─────────── o portão D2, medido na fronteira HTTP ───────────

  it('o GERENTE de uma empresa é recusado — ele tem isAdmin, mas na empresa DELE', async () => {
    const { headersDaEmpresa } = await criarEmpresaComDono('acme');

    // ⚠️ O `PermissionsGuard` LIBERA este ator: o dono de uma empresa nova
    // recebe `listAllPermissions()`, e o perfil efetivo dele tem `isAdmin:
    // true`. Se o portão fosse a PERMISSÃO, ele leria a base INTEIRA.
    const res = await e2e.injetar({ method: 'GET', url: ROTA_EMPRESAS, headers: headersDaEmpresa });

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
      url: ROTA_USUARIOS,
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
      url: ROTA_EMPRESAS,
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
      url: ROTA_EMPRESAS,
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
    // a empresa nenhuma. Ver a empresa acima é o que prova que o escopo
    // aberto é o de SISTEMA, e não o da empresa do ator.
    const { empresaId } = await criarEmpresaComDono('acme');

    const res = await e2e.injetar({ method: 'GET', url: ROTA_EMPRESAS });

    expect(res.statusCode).toBe(200);
    const corpo = JSON.parse(res.body) as EmpresaWire[];
    expect(corpo.map((e) => e.id)).toContain(empresaId);
  });
});
