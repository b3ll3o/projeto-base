-- apps/api/prisma/migrations/20261022000001_papel_gerente_legado/
--
-- pt-BR (onboarding de empresa, 2026-10-22): o PAPEL da membership mudou de
-- nome, e o dado já gravado ficou com o nome VELHO.
--
-- O QUE MUDOU
-- `tenancy.use-cases.ts` exige `role = 'gerente'` para convidar alguém, e o
-- `provisionarEmpresaPropria` que existia em `main` gravava `role = 'owner'`.
-- Sem este backfill, a empresa criada ANTES do rename fica com o dono de
-- papel `'owner'`: `findRole` devolve `'owner'`, a comparação com `'gerente'`
-- falha, e o dono recebe 403 ao convidar — o MESMO dono que antes podia, e
-- que a empresa sem dono não pode substituir. Um rename de VALOR que quebra
-- dado gravado é a linha "RENAME COLUMN que quebra dado já gravado" da
-- convenção `migracao-de-dados.md` §1, e a resposta dela é o backfill.
--
-- ⚠️ O QUE ESTE BACKFILL NÃO FAZ (e é de propósito)
-- Ele NÃO troca o PERFIL. A empresa legada continua com o perfil `admin` que
-- o `provisionarEmpresaPropria` antigo criou (`slug = 'admin'`, `isAdmin`),
-- e não recebe o trio `gerente`/`coordenador`/`funcionario` do catálogo novo.
-- Vestir o catálogo numa empresa que já existe é outra mudança — ela cria
-- perfis e re-aponta memberships — e o texto do PR declara essa parte como
-- pendência, com a razão. Aqui o que volta é o DIREITO: o dono volta a
-- poder convidar.
--
-- POR QUE É SEGURO
--
-- 1. `tenant_memberships.role` é TEXT, sem CHECK e sem enum (veja
--    `apps/api/prisma/schema.prisma`), e a função `criar_membership` grava o
--    texto que recebe — não há restrição no banco que proíba `'gerente'`.
--
-- 2. A assinatura HMAC da membership é conferida na HORA do INSERT (dentro
--    de `criar_membership`), e NÃO há coluna que a guarde: a tabela é
--    `(id, user_id, tenant_id, role, profile_id, created_at, updated_at)`.
--    Trocar o texto do papel não invalida assinatura nenhuma.
--
-- 3. A RLS não atrapalha: `tenant_memberships` tem `ENABLE ROW LEVEL
--    SECURITY` SEM `FORCE` (deliberado — ver
--    `20261020000000_rls_isolation_empresa`, que registra por que), e a
--    migration roda como DONO da tabela, que é quem as policies não alcançam.
--
-- IDEMPOTENTE: `WHERE role = 'owner'` não casa linha nenhuma na segunda
-- execução, e a migration só roda uma vez por banco de qualquer jeito.

UPDATE "tenant_memberships"
   SET "role" = 'gerente',
       "updated_at" = now()
 WHERE "role" = 'owner';
