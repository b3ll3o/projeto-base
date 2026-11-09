-- Migration: refresh_tokens — o REGISTRO que dá ao refresh token um `jti`
-- revogável (#132).
--
-- POR QUE ESTA TABELA EXISTE
--
-- Antes dela, o refresh token era um JWT stateless: o par access/refresh
-- saía da MESMA função, com o MESMO payload (`sub`, `email`, `typ`) e sem
-- `jti`. Não existia lista de revogação, nem logout no backend, nem
-- binding de sessão — um refresh token vazado valia por 7 dias e se
-- renovava sozinho, sem que nenhuma ação do titular o invalidasse.
--
-- A tabela é o que dá ao token uma IDENTIDADE (`jti`) que o servidor
-- conhece: um token presented whose `jti` está revogado é recusado, mesmo
-- que a assinatura HMAC esteja perfeita.
--
-- Ver `docs/adr/0007-refresh-token-revogavel.md`.

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------

-- `jti` é a PRIMARY KEY e não um `id` uuid: o identificador do token É o
-- `jti` (é o que o token carrega no payload e o que o logout revoga), e uma
-- segunda coluna de identidade seria outra maneira de dizer a mesma coisa.
--
-- `expires_at` é o `exp` do próprio token — a data que o JWT já carrega.
-- Ela existe para a PODA: sem ela, a tabela só cresce (uma linha por
-- login) e não há como distinguir "token expirado" de "token revogado".
-- ⚠️ As três colunas de tempo são INSTANTES ABSOLUTOS — e por isso são
-- `timestamptz`, e não `timestamp`. MEDIDO 2026-11-08: com `timestamp` (que é
-- a PAREDE DE RELÓGIO, sem fuso), a poda (`expires_at < now()`) compara um
-- instante UTC com um `timestamptz` convertido para o TimeZone DA SESSÃO — e
-- num banco à frente do UTC (RDS/Cloud SQL, ou `options=-c timezone=…`) ela
-- removia do registro tokens QUE AINDA VALIAM. O `timestamptz` compara
-- instantes, e a comparação passa a ser a mesma em qualquer fuso.
CREATE TABLE "refresh_tokens" (
    "jti" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("jti")
);

-- A consulta que "revoga os tokens da conta" (a detecção de replay) é por
-- `user_id` — e é a única que não é por `jti`.
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- A conta é a dona do token: apagar a conta (hard delete) apaga os tokens
-- dela. O usuário normal é soft-deleted (`users.deleted_at`), e o token
-- continua na tabela — o que é o certo: a revogação é o que corta a sessão,
-- e a conta apagada ainda tem sessão viva até o token expirar.
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Quem chega nesta tabela
-- ---------------------------------------------------------------------------
--
-- ⚠️ `ALTER DEFAULT PRIVILEGES` (das migrations `20261020000000` e
-- `20261027000001`) dá CRUD em toda tabela nova para `app_runtime` E para
-- `app_system`. MEDIDO num Postgres de verdade: uma tabela criada depois
-- das 15 migrations herdou `SELECT/INSERT/UPDATE/DELETE` dos dois papéis.
--
-- `app_runtime` é a credencial que a PRÓPRIA doc do repo classifica como
-- "a que mais vaza (está no env, em log, em mensagem de erro)". Com UPDATE
-- liberado, ela DESREVOGA qualquer refresh token — inclusive o token
-- roubado que disparou a detecção de replay. A revogação seria um controle
-- que a credencial mais exposta do sistema consegue desfazer.
--
-- O caminho de request (guard, controllers) NUNCA escreve nesta tabela:
-- login, refresh e logout falam com ela pela credencial de SISTEMA
-- (`comEscopoDeSistema`, `SYSTEM_DATABASE_URL`). E o DONO (a migration e o
-- `prepara-papeis.sh`) pode tudo.
REVOKE ALL ON refresh_tokens FROM PUBLIC;
REVOKE ALL ON refresh_tokens FROM app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO app_system;

-- ⚠️ SEM RLS, de propósito — e o motivo é o mesmo que impede a policy de
-- existir: o predicado de escopo do banco (`no_escopo_atual`) compara a
-- coluna com a EMPRESA (`app.tenant_id`), e a coluna daqui é o USUÁRIO.
-- Não há predicate que case as duas coisas, e uma policy que não filtra
-- nada é pior do que nenhuma: ela parece proteção.
--
-- O que a tabela guarda é metadado de sessão (`jti`, `revoked_at`,
-- `expires_at`) — o `jti` sozinho não autentica nada, porque o token é
-- assinado com o segredo do servidor. E o alcance real da tabela é o
-- `REVOKE` acima: só a credencial de sistema e o dono chegam nela.
