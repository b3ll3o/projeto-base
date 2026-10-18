-- Migration: Tenant, TenantMembership, Invitation + índices parciais de profiles
--
-- pt-BR (Fase 2 do plano 2026-10-16-multi-tenant). DDD/H1-H6.
--
-- ORDEM IMPORTA (decisão D3): `profiles_slug_key` é UNIQUE GLOBAL hoje. Dois
-- índices parciais SOMADOS a ele não produziriam a customização por empresa —
-- enquanto ele estiver de pé, duas empresas não podem ter ambas um perfil
-- "manager". Por isso o DROP vem ANTES dos CREATE INDEX.
--
-- SEM BACKFILL, deliberadamente. Não existe banco de produção neste repo (ver
-- G-004 no state-snapshot); um backfill exigiria inventar um tenant padrão, que
-- é decisão de produto e não de engenharia. `users.profile_id` fica como está:
-- a Fase 4 muda o caminho de leitura, não o dado. Ver
-- `.agents/specs/conventions/migracao-de-dados.md` §3.
--
-- SEM RLS, deliberadamente. RLS no Postgres é deny-by-default: sem
-- `SET LOCAL app.current_tenant` TODA query volta vazia. Ligar aqui quebraria
-- a aplicação inteira em silêncio até a Fase 3, que é quem produz o contexto.

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

-- CriaTable "tenants"
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CriaTable "tenant_memberships"
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CriaTable "invitations"
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 2. Coluna + FKs
-- ---------------------------------------------------------------------------

-- profiles.tenant_id: NULL = perfil global (o caso do seed do #97).
ALTER TABLE "profiles" ADD COLUMN "tenant_id" UUID;

-- profiles_slug_global_uniq (abaixo) exige este índice para o WHERE da FK.
CREATE INDEX "profiles_tenant_id_idx" ON "profiles"("tenant_id");

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Unicidade da D3 — o ponto inteiro desta migration
-- ---------------------------------------------------------------------------

-- tenants.slug é GLOBAL entre empresas (identificador de URL). Já existia no
-- schema como @unique, então materializa aqui.
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- D4: uma conta pode estar em N empresas, mas só UMA vez em cada.
CREATE UNIQUE INDEX "tenant_memberships_user_id_tenant_id_key"
    ON "tenant_memberships"("user_id", "tenant_id");

CREATE INDEX "tenant_memberships_tenant_id_idx" ON "tenant_memberships"("tenant_id");
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- Um convite por (empresa, email). O banco RECUSA o segundo insert (P2002) —
-- ele não renova prazo nenhum. "Reenviar" (atualizar `expiresAt` da linha
-- existente) é comportamento do código de convite, que é da Fase 4 e ainda não
-- existe; escrever aqui que o índice faz isso descreveria algo que ninguém
-- entrega. A coluna líder é `tenant_id`, então uma busca só por `email` não usa
-- este índice — se a Fase 4 precisar dela, é um índice novo, não este.
CREATE UNIQUE INDEX "invitations_tenant_id_email_key" ON "invitations"("tenant_id", "email");
CREATE INDEX "invitations_tenant_id_idx" ON "invitations"("tenant_id");

-- DERRUBA o UNIQUE global ANTES de criar os parciais (ordem da D3).
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_slug_key";

-- Dois índices parciais, porque as duas regras têm escopos diferentes:
--   - global  (tenant_id IS NULL):        o "admin" do seed é único, como sempre
--   - por tenant (tenant_id IS NOT NULL): cada empresa tem o seu "manager"
--
-- Por que NÃO `@@unique([tenantId, slug])`: no Postgres NULL != NULL, então dois
-- perfis de sistema com tenant_id NULL e o mesmo slug passariam, e o seed
-- duplicaria "admin" em silêncio. `UNIQUE NULLS NOT DISTINCT` (PG 15+) resolveria,
-- mas os parciais já expressam as duas regras sem depender da versão do PG.
CREATE UNIQUE INDEX "profiles_slug_global_uniq"
    ON "profiles"("slug") WHERE "tenant_id" IS NULL;

CREATE UNIQUE INDEX "profiles_tenant_slug_uniq"
    ON "profiles"("tenant_id", "slug") WHERE "tenant_id" IS NOT NULL;