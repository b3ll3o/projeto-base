// apps/api/prisma/seed.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): seed do catálogo de profiles +
// atribuição de profile ao primeiro user. Defesas em profundidade:
//   - perfil 'admin' com TODAS as permissions do catalog
//   - perfil 'admin' com is_admin=true (bypass via guard)
//   - perfil 'viewer' sem permissions (deny-by-default baseline)
//   - primeiro user do DB recebe profile 'admin'
//
// Execução (MEDIDO 2026-10-20 — o comando do host NÃO funciona, sai 1):
//   docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T \
//     -w /repo/apps/api api pnpm exec tsx prisma/seed.ts
// Do host o seed nem chega ao passo 4: ele importa `PrismaClient` direto e não
// carrega `apps/api/.env` (o `ConfigModule.forRoot()` está no bootstrap do Nest,
// que o seed não entra), então `DIRECT_DATABASE_URL` fica `undefined` e o
// `throw` lá embaixo mata o processo. No container a URL chega pelo
// `env_file: .env.production` e o NODE_ENV pelo overlay dev. Ver `docs/como-rodar.md` §1.7.

import { PrismaClient } from '@prisma/client';
import { decisaoDoAdminLocal } from '../src/shared/auth/decisao-do-admin-local.js';
import { listAllPermissions } from '../src/shared/auth/permissions-catalog.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/security/argon2-password-hasher.js';
import { UserId } from '../src/modules/users/domain/value-objects/user-id.vo.js';

/** Credencial de DEV — nunca de produção (ver o guard no passo 4). */
const ADMIN_LOCAL_EMAIL = 'admin@admin.com';
const ADMIN_LOCAL_SENHA = 'Admin@123';

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
// `?? ''` e não só o guard: `main()` é função DECLARADA (hoisted), e o TS não
// carrega o narrowing do `const` do escopo do módulo para dentro dela. Sem o
// `?? ''`, `new URL(urlDoDono)` no passo 4 é `string | undefined` e o
// `tsc --noEmit` reprova. O `if` abaixo continua sendo o que aborta — `''` e
// `undefined` caem no mesmo ramo.
const urlDoDono = process.env['DIRECT_DATABASE_URL'] ?? '';
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

  // 4) Usuário admin LOCAL (idempotente). Senha fixa de propósito: é o mesmo
  //    espírito da senha `projeto:projeto` do `docker-compose.dev.yml` — credencial
  //    de DEV, conhecida por quem leu o repositório. Ela está em texto puro aqui,
  //    então o guard é `=== 'development'` e não `!== 'production'`: ausente,
  //    `staging` ou `prod` (sem "uction") criariam um admin de bypass total num
  //    banco de produção. Mesmo padrão default-deny do `JWT_SECRET` no ADR-0002.
  //
  //    O CI não roda o seed, então estes dois são os únicos controles — e o
  //    segundo não é opcional. `NODE_ENV` e `DIRECT_DATABASE_URL` vêm de fontes
  //    que ninguém reconcilia: o overlay `docker-compose.dev.yml:5` FORÇA
  //    `NODE_ENV: development`, mas a `DIRECT_DATABASE_URL` deste seed não está
  //    no overlay — ela chega pelo `env_file: .env.production` do compose base
  //    (`docker-compose.yml:101`). Apontar aquele arquivo para um Postgres remoto
  //    deixaria o modo em `development` e o destino em produção, e o passo 4
  //    criaria lá um admin de senha pública, TODAS as permissions, conectando
  //    como DONA (o papel que ignora RLS). Chegar o host é o que fecha isso;
  //    MEDIDO 2026-10-20: o host do comando documentado é `postgres`, de onde vem
  //    o nome da lista.
  // A decisão saiu para `src/shared/auth/decisao-do-admin-local.ts` porque
  // `prisma/` não tem um único `*.spec.ts` e o projeto `unit` do Vitest só
  // enxerga `src/` — a tabela de destinos e o default-deny do modo estavam sem
  // nenhum teste. Ela tem TRÊS saídas, e não duas: `ignorar` deixa o passo 5
  // seguir, `recusar` mata o processo.
  const decisao = decisaoDoAdminLocal(process.env['NODE_ENV'], urlDoDono);
  if (decisao === 'criar') {
    const adminLocal = await prisma.user.findUnique({
      where: { email: ADMIN_LOCAL_EMAIL },
    });
    if (adminLocal === null) {
      await prisma.user.create({
        data: {
          id: UserId.create().value,
          email: ADMIN_LOCAL_EMAIL,
          name: 'Administrador',
          passwordHash: await new Argon2PasswordHasher().hash(ADMIN_LOCAL_SENHA),
          profileId: adminProfile.id,
        },
      });
      console.log(`Seed: usuário admin local ${ADMIN_LOCAL_EMAIL} criado.`);
    } else if (adminLocal.deletedAt !== null) {
      // Três estados, três mensagens. Filtrar `deletedAt` no `findFirst` não
      // resolvia: `email` é `@unique` e a linha apagada segue ocupando o
      // índice, então o `create` estourava P2002 e matava o passo 5. Sem este
      // ramo, o seed passava mudo e o login falhava com InvalidCredentials.
      console.log(
        `Seed: ${ADMIN_LOCAL_EMAIL} está soft-deleted (deleted_at=${adminLocal.deletedAt.toISOString()}) — não recriado. Restaure a linha ou use outro e-mail.`,
      );
    } else {
      console.log(`Seed: usuário admin local ${ADMIN_LOCAL_EMAIL} já existe.`);
    }
  } else if (decisao === 'recusar') {
    // Silêncio aqui seria o pior dos dois mundos: o passo 5 seguiria promoting e
    // o seed fecharia "OK" sem nenhum admin para logar. Recusa explícita, no
    // mesmo espírito do `throw` de `DIRECT_DATABASE_URL` ausente lá em cima.
    //
    // O `try` do host não é decoração: `recusar` também é a saída quando a URL
    // NÃO parseia, e aí `new URL(...).hostname` lançaria um TypeError por cima
    // do motivo real. Na prática o passo 1 morre antes (MEDIDO), mas a
    // mensagem que nomeia o destino não pode depender disso.
    let host = '(URL ilegível)';
    try {
      host = new URL(urlDoDono).hostname;
    } catch {
      // segue com o rótulo acima
    }
    throw new Error(
      `Seed recusado: NODE_ENV=development, mas DIRECT_DATABASE_URL aponta para ${host}, que não é local. O admin local tem senha pública e TODAS as permissions — ele é de DEV.`,
    );
  }

  // 5) Atribui 'admin' ao primeiro user (idempotente)
  //    `deletedAt: null` é obrigatório: sem ele o `findFirst` pode escolher uma
  //    linha APAGADA (o passo 4 acima avisa que `admin@admin.com` pode estar
  //    soft-deleted), escrever `profileId` nela e logar "virou admin" — conta que
  //    não autentica (`auth.use-cases` recusa `isDeleted()`), num seed que
  //    fecha "OK". Mesmo bug do passo 4, uma linha abaixo.
  const firstUser = await prisma.user.findFirst({
    where: { deletedAt: null },
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
