-- Fase 4 (plano 2026-10-16-multi-tenant) — o elo que faltava na D4.
--
-- A Fase 2 criou `tenant_memberships` com `role` ('owner' | 'member') e nada
-- que dissesse QUAL PERFIL o usuário veste NAQUELA empresa. Sem esta coluna,
-- "perfil diferente por empresa" não é representável: o perfil efetivo vinha
-- de `users.profile_id`, que é global — a mesma conta em duas empresas
-- vestia o mesmo perfil nas duas.
--
-- SEM BACKFILL, por decisão medida e não por esquecimento
-- (`.agents/specs/conventions/migracao-de-dados.md` §1 e §3): `ADD COLUMN`
-- nullable está na linha "não" da tabela dos 3 passos, e um backfill exigiria
-- inventar um tenant de DESTINO para cada membership legada — que é decisão de
-- produto, não de engenharia. O §3 registra que não existe banco de produção
-- (nenhuma infra de deploy), então não há dado a preservar.
--
-- `NULL` = membership sem perfil atribuído, e é um estado legítimo: um
-- convite aceito entra como `member` e o admin da empresa atribui o perfil
-- depois. Ler isso como "perfil de sistema" seria inventar privilégio.

ALTER TABLE "tenant_memberships" ADD COLUMN "profile_id" UUID;

-- `ON DELETE RESTRICT`, e não `CASCADE`: o mesmo desenho de `users.profile_id`.
-- Um perfil em uso não pode sumir e deixar a membership apontando para o nada —
-- o admin reatribui antes de deletar. `ProfileUseCases.deletar` também conta
-- as memberships antes de chegar aqui, para devolver 409 em vez de 500.
ALTER TABLE "tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice separado (e não só o da FK): a Fase 4 consulta por
-- `(user_id, tenant_id)` — que o índice composto já cobre —, mas a contagem
-- "quantas memberships usam este perfil" (a trava de `deletar`) varre só por
-- `profile_id`, e sem índice ela é um seq scan sobre a tabela.
CREATE INDEX "tenant_memberships_profile_id_idx" ON "tenant_memberships"("profile_id");