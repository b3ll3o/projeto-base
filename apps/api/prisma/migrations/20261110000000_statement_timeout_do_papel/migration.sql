-- Migration: os papéis do banco ganham um ORÇAMENTO DE TEMPO
-- (conformidade do system design, 2026-11-10).
--
-- O QUE ELA FECHA
--
-- `docs/system-design/operacao.md` §6 afirmava:
--
--   | API → banco | **nenhum** | não há `statement_timeout` no papel de
--   runtime — a query espera o Postgres desistir |
--
-- Sem orçamento, um `SELECT` lento segura a conexão do pool até o Postgres
-- desistir — e o pool é o limite de escala da API (`operacao.md` §7: "o
-- limite é o pool de conexões do Postgres").
--
-- POR QUE 8s, E NÃO OUTRO NÚMERO
--
-- O orçamento precisa ficar ABAIXO do timeout do cliente web (10 s — o
-- fallback de `apps/web/lib/api-client.ts`), para a API responder com erro
-- ANTES de o cliente desistir; e ACIMA do prazo de transação interativa do
-- Prisma (5 s, o default documentado em `escopo.ts`), que é o que corta a
-- transação primeiro.
--
-- ⚠️ O NÚMERO TEM UM DONO: `STATEMENT_TIMEOUT_DO_PAPEL`, em
-- `apps/api/src/shared/infrastructure/prisma/papel-de-runtime.ts`. O
-- `papel-de-runtime.spec.ts` RECONCILIA os dois — a migration é SQL, e não
-- lê TypeScript.
--
-- ⚠️ POR QUE OS DOIS PAPÉIS
--
-- `app_runtime` é a credencial do tráfego da API; `app_system` é a do bucket
-- de sistema (login, refresh, logout e a idempotência). As duas falam com o
-- mesmo banco, e as duas carregam uma query lenta da mesma forma.
--
-- ⚠️ O PAPEL É DO CLUSTER, NÃO DO BANCO: o `ALTER ROLE` vale para TODOS os
-- bancos do cluster. É o mesmo mecanismo — e o mesmo preço — que a ADR-0007
-- registra para a senha do papel.
--
-- ⚠️ ESTA MIGRATION PRECISA DE SUPERUSER (ou de CREATEROLE + membro do
-- papel). O mesmo privilégio que a `20261020000000` exigia para o
-- `CREATE ROLE` — e o mesmo aviso do `apps/api/.env.example` vale para quem
-- roda em Postgres gerenciado (RDS/Cloud SQL), onde o papel de migration
-- não é superuser.
--
-- ⚠️ POR QUE O `ALTER ROLE` VAI DENTRO DE UM `DO $$ … $$`
--
-- O `ALTER ROLE` de um papel que NÃO EXISTE falha: `ERROR: role "app_runtime"
-- does not exist`. E uma migration que falha TRAVA todas as migrations
-- seguintes — o schema-engine aborta em `detect_failed_migrations` e não
-- chega na próxima. O papel `app_runtime` é criado pela
-- `20261020000000_rls_isolation_empresa`, e a ordem normal das migrations
-- garante que ele existe quando esta roda.
--
-- Mas a ordem normal não é o ÚNICO mundo: um banco provisionado fora dela
-- (ou um `migrate resolve` que pulou a criação do papel) chega aqui sem
-- `app_runtime` — e aí a migration morre. O padrão é o MESMO do
-- `CREATE ROLE` guardado da `20261027000001_papel_de_sistema` e do
-- `ALTER ROLE` guardado da `20261108000001`: a instrução só roda quando o
-- papel existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    ALTER ROLE app_runtime SET statement_timeout = '8s';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_system') THEN
    ALTER ROLE app_system SET statement_timeout = '8s';
  END IF;
END
$$;
