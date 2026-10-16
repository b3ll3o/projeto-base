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

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seed: criando profiles padrão...');

  // 1) perfil admin (is_admin=true + todas as permissions)
  const adminProfile = await prisma.profile.upsert({
    where: { slug: 'admin' },
    create: {
      slug: 'admin',
      name: 'Administrador',
      isAdmin: true,
      isSystem: true,
    },
    update: {},
  });

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
  await prisma.profile.upsert({
    where: { slug: 'viewer' },
    create: {
      slug: 'viewer',
      name: 'Visualizador',
      isAdmin: false,
      isSystem: true,
    },
    update: {},
  });

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
    console.log('Seed: nenhum user no DB ainda — vincule ao profile via POST /api/v1/admin/users/:id/profile depois do primeiro signup.');
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
