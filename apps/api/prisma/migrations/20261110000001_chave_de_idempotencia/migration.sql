-- Migration: idempotency_keys — o REGISTRO da chave de idempotência de
-- escrita (conformidade do system design, 2026-11-10).
--
-- A lacuna que ela fecha está em `docs/system-design/dados.md` §6:
--
--   "a lacuna real, escrita com precisão: não é 'o re-execute duplica a
--   linha' — é que **retry não é seguro**. Um cliente que repete por timeout
--   NÃO TEM COMO SABER se a primeira gravou, e recebe 409 no lugar de 201."
--
-- Ver `docs/adr/0011-idempotencia-de-escrita.md`.

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
--
-- O par (`key`, `actor`) é a PRIMARY KEY: a chave é do CLIENTE (o header
-- `Idempotency-Key`) e ela é escopada pelo ATOR — a chave de uma conta não
-- vale para outra. Um `id` uuid seria outra maneira de dizer a mesma coisa.
--
-- `status` e `response` são NULL enquanto a operação não termina: é a
-- diferença entre "a chave está reservada" (em voo) e "a resposta está
-- guardada" (replay).
--
-- `response` guarda a resposta INTEIRA: o corpo (`body`) e os headers que a
-- aplicação escreveu (`headers` — o `ETag` do `POST /users`). O replay repõe
-- os dois, ou a resposta do retry não seria a mesma da original.
--
-- `expires_at` é o que permite a PODA: sem ela, a tabela só cresce.
--
-- ⚠️ As colunas de tempo são INSTANTES ABSOLUTOS — `timestamptz`, e não
-- `timestamp`. MEDIDO 2026-11-08 (ADR-0007): com `timestamp` (a parede do
-- relógio, sem fuso), a poda compara um instante UTC com um valor convertido
-- para o TimeZone DA SESSÃO — e num banco à frente do UTC ela remove
-- registros QUE AINDA VALEM.
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key","actor")
);

-- A poda é por `expires_at` — e é a única consulta que não vai pela chave.
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- ---------------------------------------------------------------------------
-- 2. Quem chega nesta tabela
-- ---------------------------------------------------------------------------
--
-- ⚠️ `ALTER DEFAULT PRIVILEGES` (das migrations `20261020000000` e
-- `20261027000001`) dá CRUD em toda tabela nova para `app_runtime` E para
-- `app_system`. MEDIDO num Postgres de verdade: uma tabela criada depois
-- das 15 migrations herdou `SELECT/INSERT/UPDATE/DELETE` dos dois papéis.
--
-- A resposta guardada aqui é PII de outra empresa — o corpo do `POST /users`
-- tem nome, e-mail e id. `app_runtime` é a credencial que a PRÓPRIA doc do
-- repo classifica como "a que mais vaza (está no env, em log, em mensagem
-- de erro)", e a RLS é o que impede que ela leia a base de outra empresa.
-- Uma tabela SEM RLS e legível pelo runtime seria a PRIMEIRA brecha desse
-- controle — e ela existiria por causa de um recurso opcional.
--
-- O caminho de request fala com ela pela credencial de SISTEMA
-- (`comEscopoDeSistema`, `SYSTEM_DATABASE_URL`) — o mesmo caminho do
-- `refresh_tokens`. E o DONO (a migration e o `prepara-papeis.sh`) pode
-- tudo.
-- ⚠️ O `REVOKE` NÃO É GUARDADO, e é DELIBERADO.
--
-- O `ALTER ROLE` do migration irmão (`20261110000000`) vai dentro de um
-- `DO $$ … IF EXISTS (pg_roles) … $$`, porque um `ALTER ROLE` de papel
-- inexistente FALHA — e uma migration que falha trava todas as seguintes.
--
-- Aqui é o contrário: o `REVOKE` de um papel inexistente também falha, e
-- GUARDÁ-lo faria a coisa errada em silêncio — sem o `REVOKE`, a tabela
-- ficaria com o CRUD que o `ALTER DEFAULT PRIVILEGES` dá a `app_runtime`, e
-- a credencial que o repo classifica como "a que mais vaza" passaria a LER
-- a resposta guardada (que é PII de outra empresa). Falhar alto e travar a
-- cadeia é o preço; falhar baixo e abrir a tabela é o furo.
--
-- Os papéis são criados pelas migrations `20261020000000` (runtime) e
-- `20261027000001` (sistema), ambas ANTERIORES a esta — a ordem normal
-- garante que eles existem.
REVOKE ALL ON idempotency_keys FROM PUBLIC;
REVOKE ALL ON idempotency_keys FROM app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO app_system;

-- ⚠️ SEM RLS, de propósito — e o motivo é o mesmo do `refresh_tokens`: o
-- predicado de escopo do banco (`no_escopo_atual`) compara a coluna com a
-- EMPRESA (`app.tenant_id`), e a coluna daqui é o ATOR do pedido. Não há
-- predicate que case as duas coisas, e uma policy que não filtra nada é
-- pior do que nenhuma: ela parece proteção.
--
-- O alcance real da tabela é o `REVOKE` acima: só a credencial de sistema e
-- o dono chegam nela.
