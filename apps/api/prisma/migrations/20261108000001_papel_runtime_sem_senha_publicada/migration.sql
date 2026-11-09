-- Migration: o papel `app_runtime` perde a senha que a migration anterior
-- publicava (#133).
--
-- ⚠️ POR QUE ESTA MIGRATION EXISTE, E POR QUE ELA NÃO É OPCIONAL
--
-- A migration `20261020000000_rls_isolation_empresa` criou o papel
-- `app_runtime` com uma senha em TEXTO PURO, versionada no repositório. A
-- `20261027000001_papel_de_sistema` põe o papel em `NOLOGIN` — e isso NÃO
-- limpa a senha.
--
-- MEDIDO num Postgres de verdade, depois de aplicar as 15 migrations:
--
--   SELECT rolcanlogin, rolpassword IS NOT NULL FROM pg_authid
--    WHERE rolname = 'app_runtime';
--    rolcanlogin | rolpassword
--   -------------+-------------
--    f           | t
--
-- O hash SCRAM continuava em `pg_authid`. `NOLOGIN` impede o LOGIN; não
-- apaga o segredo. E a senha publicada continuava valendo em qualquer banco
-- onde o `prepara-papeis.sh` não tivesse rodado — que é todo banco
-- provisionado por fora do entrypoint do container.
--
-- `PASSWORD NULL` apaga o hash. É o que fecha o furo: a senha publicada
-- deixa de autenticar em QUALQUER banco — e não só nos bancos novos.
--
-- A ROTAÇÃO completa é o passo seguinte, e ele é de fora do banco: o
-- `prepara-papeis.sh` aplica a senha real, lida do ambiente, logo depois do
-- `migrate deploy` (é a ordem do ENTRYPOINT do container). Depois desta
-- migration, e antes do script, o papel fica sem senha — e o runbook
-- (`docs/como-rodar.md` §1.2.1) avisa disso, como já avisa do
-- `prisma migrate reset`.
--
-- ⚠️ ESTA MIGRATION PRECISA DE SUPERUSER (ou de CREATEROLE + membro do
-- papel). O mesmo privilégio que a `20261020000000` exigia para o
-- `CREATE ROLE` — e o mesmo aviso do `apps/api/.env.example` vale para
-- quem roda em Postgres gerenciado (RDS/Cloud SQL), onde o papel de
-- migration não é superuser.
--
-- ⚠️ POR QUE O `ALTER ROLE` VAI DENTRO DE UM `DO $$ … $$`
--
-- O `ALTER ROLE` de um papel que NÃO EXISTE falha: `ERROR: role "app_runtime"
-- does not exist` (MEDIDO no Postgres 16, 2026-11-09). E uma migration que
-- falha TRAVA todas as migrations seguintes — o schema-engine aborta em
-- `detect_failed_migrations` e não chega na próxima. O papel `app_runtime` é
-- criado pela `20261020000000_rls_isolation_empresa`, e a ordem normal das
-- migrations garante que ele existe quando esta roda.
--
-- Mas a ordem normal não é o ÚNICO mundo: um banco provisionado fora dela
-- (ou um `migrate resolve` que pulou a criação do papel) chega aqui sem
-- `app_runtime` — e aí a migration morre. O banco fica travado para sempre,
-- e a senha publicada continua valendo nele: exatamente o furo que esta
-- migration existe para fechar.
--
-- O padrão é o MESMO do `CREATE ROLE` guardado da
-- `20261027000001_papel_de_sistema`: a instrução só roda quando o papel
-- existe. Sem o papel, não há hash publicado para apagar — e a migration
-- passa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    ALTER ROLE app_runtime NOLOGIN PASSWORD NULL;
  END IF;
END
$$;
