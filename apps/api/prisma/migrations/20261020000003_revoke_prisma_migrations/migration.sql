-- apps/api/prisma/migrations/20261020000003_revoke_prisma_migrations/
--
-- pt-BR (Fase 10+, 2026-10-17): `GRANT ... ON ALL TABLES IN SCHEMA public`
-- alcança `_prisma_migrations` tanto quanto alcança as tabelas de negócio.
--
-- MEDIDO no Postgres 16, com o SQL abaixo, contra `projeto-base-pg-local`:
--
--   SELECT table_name, string_agg(DISTINCT privilege_type, ',')
--     FROM information_schema.table_privileges
--    WHERE grantee = 'app_runtime' AND table_schema = 'public'
--    GROUP BY table_name ORDER BY table_name;
--
--   _prisma_migrations | DELETE,INSERT,SELECT,UPDATE
--   authorizations     | DELETE,INSERT,SELECT,UPDATE
--   ... (as outras 7 tabelas de negócio)
--
-- As 8 tabelas de negócio estão protegidas pela RLS das migrations
-- `20261020000000`, `20261020000001` e `20261020000002` — nenhuma delas precisa
-- de `REVOKE` para a garantia valer. `_prisma_migrations` NÃO tem RLS (o Prisma
-- a cria fora do schema do negócio), então é a única das 9 onde o `DELETE`
-- concedido NÃO encontra nenhuma trava pelo lado do banco.
--
-- O QUE ISSO ABRE: o papel da aplicação — o mesmo que roda em cada requisição —
-- pode apagar o registro de migrations. O efeito não é vazar dado de usuário; é
-- INTEGRIDADE: o Prisma passaria a achar que uma migration foi aplicada sem ter
-- sido, e a próxima `migrate deploy` pode reaplicar schema fora de ordem.
--
-- POR QUE `REVOKE ALL` E NÃO SÓ `DELETE`: nenhum verbo aqui é necessário em
-- runtime. `migrate deploy` e `db seed` rodam com `directUrl`, que é o DONO da
-- tabela, e o dono não é afetado por `REVOKE` de um papel. Se algum dia o papel
-- precisar de leitura para diagnóstico, o caminho é o dono — que já tem.
--
-- ⚠️ Este `REVOKE` não quebra a subida: a migration roda pelo dono, e
-- `docker compose up` continua executando `prisma migrate deploy`
-- (apps/api/Dockerfile, ENTRYPOINT) com `DIRECT_DATABASE_URL`.
--
-- ⚠️ (issue #183, prisma-N1-001) O `REVOKE` é guardado por-existing, porque
-- o statement cru NÃO é idempotente: `REVOKE ALL ON _prisma_migrations` numa
-- base onde a tabela não existe levanta
-- `ERROR: relation "_prisma_migrations" does not exist` (MEDIDO no Postgres 16).
-- E a base onde a tabela NÃO existe é justamente o **shadow database** que o
-- `prisma migrate dev` cria para replayar as migrations antes de compará-las
-- com o schema — lá o Prisma não cria a tabela `_prisma_migrations` (ela é
-- do banco ALVO). Consequência medida: `prisma migrate dev` morria com
-- P3006/P1014 ("Migration `20261020000003_revoke_prisma_migrations` failed to
-- apply cleanly to the shadow database"), e o caminho oficial de criação de
-- migration ficava indisponível para todo desenvolvedor.
--
-- O guard NÃO afrouxa a garantia: onde a tabela existe (o banco de produção e
-- o de desenvolvimento), o `REVOKE` efetivo continua valendo — o bloco só
-- pula o statement quando não há o que revogar.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '_prisma_migrations') THEN
    EXECUTE 'REVOKE ALL ON _prisma_migrations FROM app_runtime';
  END IF;
END $$;
