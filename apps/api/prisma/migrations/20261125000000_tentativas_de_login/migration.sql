-- Migration: login_tentativas — o CONTADOR de tentativas de login por conta
-- (issue #182, sec-N1-002).
--
-- O QUE ELA FECHA
--
-- O limite de login que existia era por `(IP, e-mail)` — o balde do
-- `@Throttle` do controller. O NIST SP 800-63B sugere 5 tentativas de
-- autenticação por conta, e esse número nunca se aplicava a uma conta só:
-- MEDIDO no guard real do `@nestjs/throttler`, 10 IPs distintos × 5
-- tentativas contra a MESMA conta → 50 de 50 permitidas. E o mesmo IP
-- distribuía as tentativas por 1000 e-mails (spraying), porque cada e-mail
-- tinha balde próprio.
--
-- Esta tabela é o CONTADOR POR CONTA: a chave é o e-mail NORMALIZADO
-- (trim + toLowerCase — a mesma normalização do cadastro e do login), e a
-- janela é de 15 minutos. A partir de 5 falhas, a conta é recusada até a
-- janela expirar — e um login bem-sucedido ZERA o contador.
--
-- POR QUE TABELA E NÃO MEMÓRIA
--
-- O repo não tem Redis (`apps/api/package.json` sem `ioredis`), e memória de
-- processo não serviria: ela perde no restart (e o restart é o que o atacante
-- quer) e não é compartilhada entre réplicas — duas instâncias do mesmo
-- serviço teriam dois contadores, e o limite seria o dobro do que é.
--
-- POR QUE A CREDENCIAL DE SISTEMA, E NÃO A DE RUNTIME
--
-- O login acontece ANTES de existir empresa: não há header de tenant, e a
-- busca do usuário é no bucket de SISTEMA (`findByEmail(email, null)` →
-- `escopoDoTenant(null)` → `'*'`). O contador vive no mesmo caminho — e a
-- credencial que o repo classifica como "a que mais vaza" (a de RUNTIME) não
-- alcança esta tabela.
--
-- ⚠️ A tabela tem `email` e NÃO tem `tenant_id`, e por isso NÃO tem RLS: o
-- predicado de escopo do banco (`no_escopo_atual`) compara a coluna com a
-- EMPRESA (`app.tenant_id`), e aqui a coluna é a CONTA. Não há policy que
-- case as duas — e uma policy que não filtra nada é pior do que nenhuma.
-- O alcance real da tabela é o `REVOKE` abaixo.
--
-- ⚠️ O `REVOKE` NÃO É GUARDADO, e é DELIBERADO (a mesma razão da migration
-- `20261110000001_chave_de_idempotencia`): um `REVOKE` de papel inexistente
-- falha, e falhar alto trava a cadeia de migrations — é melhor do que
-- abrir a tabela em silêncio.

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
--
-- A chave é o e-mail NORMALIZADO: o login normaliza o e-mail antes de
-- procurar a conta (`Email.create`), e o contador tem de contar a MESMA
-- conta — senão `Joao@Example.com` e `joao@example.com` teriam baldes
-- separados e o limite por conta seria meio limite.
--
-- `tentativas` é o contador dentro da janela. `janela_iniciada_em` é o
-- começo da janela: quando ela expira, o contador ZERA (e a próxima falha
-- começa uma janela nova). `ultima_tentativa_em` é o instante da última
-- falha — é o que a auditoria lê para dizer "quando foi a última tentativa".
--
-- As colunas de tempo são INSTANTES ABSOLUTOS — `timestamptz`, e não
-- `timestamp` (ADR-0007): a janela é comparada com `now()`, e um relógio de
-- parede sem fuso deslocaria a comparação em horas.
CREATE TABLE "login_tentativas" (
    "email" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "janela_iniciada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_tentativa_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tentativas_pkey" PRIMARY KEY ("email")
);

-- A PODA é por `janela_iniciada_em`: sem ela, a tabela só cresce — e cada
-- e-mail que já falhou uma vez fica para sempre.
CREATE INDEX "login_tentativas_janela_iniciada_em_idx" ON "login_tentativas" ("janela_iniciada_em");

-- ---------------------------------------------------------------------------
-- 2. Quem chega nesta tabela
-- ---------------------------------------------------------------------------
REVOKE ALL ON login_tentativas FROM PUBLIC;
REVOKE ALL ON login_tentativas FROM app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON login_tentativas TO app_system;
