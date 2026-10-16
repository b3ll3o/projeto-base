-- pt-BR (#93.1 — RBAC, 2026-10-16): adiciona o agregado de
-- autorização por funcionalidade. 3 tabelas:
--   - profiles (perfil = conjunto de autorizações)
--   - authorizations (perfil X tem permissão Y)
--   - users.profile_id (FK para Profile)
--
-- Profile NÃO tem soft-delete: é config de admin. Hard delete com
-- proteção via countUsersWithProfile antes + FK ON DELETE RESTRICT.
-- O seed (prisma/seed.ts) cria os perfis padrão + atribui 'viewer'
-- como default para usuários existentes.

-- 1) Cria a tabela profiles
CREATE TABLE "profiles" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX "profiles_slug_idx" ON "profiles"("slug");

-- 2) Cria a tabela authorizations
CREATE TABLE "authorizations" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "permission_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    UNIQUE("profile_id", "permission_key")
);
CREATE INDEX "authorizations_profile_id_idx" ON "authorizations"("profile_id");
CREATE INDEX "authorizations_permission_key_idx" ON "authorizations"("permission_key");

-- 3) Adiciona users.profile_id (nullable, Restrict no delete)
ALTER TABLE "users" ADD COLUMN "profile_id" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_profile_id_idx" ON "users"("profile_id");

-- 4) Comentários para legibilidade
COMMENT ON TABLE "profiles" IS 'RBAC: agregado de papel (conjunto de autorizações). is_admin = bypass total. is_system = protegido contra DELETE.';
COMMENT ON TABLE "authorizations" IS 'RBAC: relação (perfil TEM permissão). permission_key é a string canônica em permissions.catalog.ts.';
COMMENT ON COLUMN "users"."profile_id" IS 'RBAC: profile atribuído ao user. Null = sem permissões (deny-by-default).';
