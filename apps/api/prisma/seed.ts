// apps/api/prisma/seed.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): seed do catálogo de profiles +
// atribuição de profile ao primeiro user. Defesas em profundidade:
//   - perfil 'admin' com TODAS as permissions do catalog
//   - perfil 'admin' com is_admin=true (bypass via guard)
//   - perfil 'viewer' sem permissions (deny-by-default baseline)
//   - primeiro user do DB recebe profile 'admin'
//
// Execução: `pnpm --filter @projeto/api exec tsx prisma/seed.ts`.

import { PrismaClient } from '@prisma/client';
import { listAllPermissions } from '../src/shared/auth/permissions-catalog.js';

/**
 * pt-BR (Fase 9 — RLS): o seed conecta como DONO, nunca pelo `DATABASE_URL`
 * da aplicação. O motivo é concreto: o seed cria perfis GLOBAIS
 * (`tenant_id IS NULL`, o bucket de sistema), e o papel `app_runtime` é
 * fail-closed — sem `app.tenant_id` ele não enxerga nem escreve nada nesse
 * bucket. Com `DATABASE_URL` apontando para o runtime, o seed "passaria"
 * escrevendo zero linhas.
 *
 * Por que falhar alto em vez de cair no `DATABASE_URL`: o conserto de quem não
 * ler este comentário seria um seed silenciosamente vazio, e o próximo
 * sintoma seria "o perfil admin não existe" — num ambiente de produção.
 */
const urlDoDono = process.env['DIRECT_DATABASE_URL'];
if (!urlDoDono) {
  throw new Error(
    'DIRECT_DATABASE_URL ausente: o seed escreve perfis GLOBAIS, que o papel de runtime (fail-closed) não enxerga. Rode com a conexão de DONO.',
  );
}

const prisma = new PrismaClient({ datasourceUrl: urlDoDono });

/**
 * Encontra (ou cria) um perfil GLOBAL.
 *
 * pt-BR (Fase 2 — tenancy, 2026-10-16): o `@unique` de `profiles.slug` foi
 * removido em favor de DOIS índices parciais em SQL puro, porque a D3 exige
 * que duas empresas tenham ambas um perfil "manager". `upsert({ where: { slug } })`
 * existia só enquanto `slug` era `@unique`; sem ele, `ProfileWhereUniqueInput`
 * não tem mais esse campo e o seed não compila.
 *
 * O índice global é `WHERE tenant_id IS NULL`, então o par que ele garante é
 * `(slug, tenantId: null)`. O Prisma tipa isso como `findFirst`, não como
 * `where` único — não há como escrever `upsert` aqui. O `update: {}` que o
 * antigo upsert fazia também era no-op, então devolver a linha existente
 * mantém a idempotência sem custar uma query.
 */
async function upsertPerfilGlobal(
  slug: string,
  name: string,
  isAdmin: boolean,
): Promise<{ id: string }> {
  const existente = await prisma.profile.findFirst({
    where: { slug, tenantId: null },
  });
  if (existente !== null) {
    return existente;
  }
  return prisma.profile.create({
    data: { slug, name, isAdmin, isSystem: true },
  });
}

async function main(): Promise<void> {
  console.log('Seed: criando profiles padrão...');

  // 1) perfil admin (is_admin=true + todas as permissions)
  const adminProfile = await upsertPerfilGlobal('admin', 'Administrador', true);

  // 2) Atribui todas as permissions do catalog ao admin
  const allKeys = listAllPermissions();
  for (const key of allKeys) {
    await prisma.authorization.upsert({
      where: {
        profileId_permissionKey: { profileId: adminProfile.id, permissionKey: key },
      },
      create: { profileId: adminProfile.id, permissionKey: key },
      update: {},
    });
  }
  console.log(`Seed: ${allKeys.length} permissions atribuídas ao profile 'admin'`);

  // 3) perfil viewer (deny-by-default; só o que for explicitamente dado)
  await upsertPerfilGlobal('viewer', 'Visualizador', false);

  // 4) Atribui 'admin' ao primeiro user (idempotente)
  const firstUser = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (firstUser !== null) {
    await prisma.user.update({
      where: { id: firstUser.id },
      data: { profileId: adminProfile.id },
    });
    console.log(`Seed: primeiro user (${firstUser.email}) virou admin.`);
  } else {
    console.log(
      'Seed: nenhum user no DB ainda — vincule ao profile via POST /api/v1/admin/users/:id/profile depois do primeiro signup.',
    );
  }

  console.log('Seed: OK.');
}

main()
  .catch((e) => {
    console.error('Seed FALHOU:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
