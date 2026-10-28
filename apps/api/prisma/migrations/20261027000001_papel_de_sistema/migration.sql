-- 20261027000001_papel_de_sistema/migration.sql
--
-- #118: o bucket de SISTEMA deixa de ser um valor de GUC e passa a ser um PAPEL.
--
-- ⚠️ O QUE ESTA MIGRATION FECHA
--
-- MEDIDO (issue #118): uma sessão `app_runtime` — a credencial que a
-- APLICAÇÃO usa em tempo de execução — que faz
--
--   SET app.tenant_id = '*';
--
-- enxerga TODOS os usuários de TODAS as empresas. O `NOBYPASSRLS` impede o
-- papel de *pular* a policy; não impede o papel de *escolher* o valor do GUC.
--
-- A raiz é estrutural: **com uma credencial só, qualquer coisa que a sessão
-- possa escolher, o atacante escolhe.** A sessão escolhe o GUC. A sessão NÃO
-- escolhe o `current_user` — esse vem da credencial.
--
-- Logo o que concede o bucket de sistema tem de ser a CREDENCIAL, e não um
-- valor que a sessão escreve. O `'*'` continua sendo o valor que a
-- aplicação escreve (o código não muda de forma), mas ele deixa de ser um
-- disjunto da policy: quem concede passa a ser `current_user = 'app_system'`.
--
-- Uma sessão `app_runtime` com o GUC em `'*'` passa a ver:
--   - nada de outras empresas (o bucket de sistema exige a credencial);
--   - o bucket GLOBAL (`alvo IS NULL`), quando a policy aceita.
--
-- E `app_runtime` NÃO é membro de `app_system` — se fosse, um `SET ROLE`
-- bastaria e o furo voltaria pela porta dos fundos.
--
-- ⚠️ POR QUE UM PAPEL NOVO, E NÃO REUSAR O DONO
--
-- O dono do schema (`DIRECT_DATABASE_URL`) é superuser: ele ignora RLS por
-- construção. Dar ao runtime o poder do dono seria trocar um furo de
-- ESCOPO por um furo de PRIVILÉGIO. `app_system` é um papel comum —
-- `NOSUPERUSER`, `NOBYPASSRLS` — que o banco distingue do runtime pela
-- policy, e é a MESMA sessão, o MESMO GUC e as MESMAS tabelas. A diferença
-- é a credencial, e só ela.
--
-- A senha dos dois papéis NÃO está nesta migration — uma migration não lê
-- env, e foi por isso que a senha do `app_runtime` ficou versionada em texto
-- puro (`PASSWORD 'app_runtime_dev'`). O setup (o entrypoint do container e
-- o helper de testcontainers) aplica a senha a partir de `DATABASE_URL` e de
-- `SYSTEM_DATABASE_URL`, que são variáveis de ambiente.

-- ─────────────────────────── 1. A senha some do papel de runtime ───────────────────────────
--
-- ⚠️ A migration ANTIGA (`20261020000000`) criou o papel COM a senha em texto
-- puro (`PASSWORD 'app_runtime_dev'`). Num banco que já rodou aquela
-- migration, o papel continua EXISTINDO — e a senha continua valendo. Por isso
-- o novo estado é FORÇADO aqui, e não só descrito: sem este `ALTER ROLE`, um
-- banco novo (que roda as duas migrations em sequência) nasceria com a senha
-- do repositório em uso.
--
-- `NOLOGIN` tira a senha do papel: ele existe, mas não consegue entrar sem
-- senha. Quem aplica a senha é o setup, a partir de `DATABASE_URL`.
ALTER ROLE app_runtime NOLOGIN;

-- ─────────────────────────── 2. O papel de sistema ───────────────────────────
--
-- `NOLOGIN`: a senha é aplicada pelo setup, a partir do ambiente. A
-- migration cria o papel; ela não sabe a senha.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_system') THEN
    CREATE ROLE app_system
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

-- Os MESMOS privilégios do `app_runtime`. A diferença entre os dois papéis é
-- a CREDENCIAL, não a lista de tabelas — e é por isso que `app_system` não
-- pode ler o que `app_runtime` não lê: quem decide é a policy.
GRANT USAGE ON SCHEMA public TO app_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_system;

-- ⚠️ As FUNÇÕES `SECURITY DEFINER` que o caminho de SISTEMA usa.
--
-- MEDIDO no CI (2026-10-27): com o bucket de sistema aberto na credencial de
-- sistema, a transação de sistema passa a rodar como `app_system` — e ela
-- perdeu o `EXECUTE` em `criar_membership`, que a migration
-- `20261020000004` dá APENAS a `app_runtime`. O sintoma: "permission denied
-- for function criar_membership" em 26 dos 30 testes de integração do
-- onboarding.
--
-- O papel de sistema FAZ o mesmo trabalho que o de runtime (é o mesmo bucket),
-- então ele precisa das mesmas permissões de função. E a tabela do segredo
-- (`chaves_de_assinatura`) NÃO entra aqui: ela é lida DENTRO da função
-- `SECURITY DEFINER`, que roda como o dono.
GRANT EXECUTE ON FUNCTION corpo_de_membership(uuid, uuid, text, uuid) TO app_system;
GRANT EXECUTE ON FUNCTION criar_membership(uuid, uuid, text, uuid, text) TO app_system;

-- ⚠️ A TABELA DO SEGREDO NÃO ENTRA. O `GRANT ... ON ALL TABLES` acima
-- pega `chaves_de_assinatura` — e ela guarda o segredo da assinatura da
-- membership, que a migration `20261020000004` revoga de `PUBLIC` **e** de
-- `app_runtime` (a linha 131). Dar SELECT dela ao papel de SISTEMA seria
-- devolver a escalada que aquele `REVOKE` tirou do caminho: quem tem a
-- credencial de sistema leria o segredo e forjaria a assinatura de qualquer
-- membership.
--
-- O papel de sistema não precisa dela: o segredo é lido DENTRO da função
-- `SECURITY DEFINER`, que roda como o dono.
REVOKE ALL ON chaves_de_assinatura FROM app_system;

-- ⚠️ O SQL EXECUTADO NÃO TEM PONTO-E-VÍRGULA: dentro do `format(...)` o `;`
-- fecharia a instrução e o `)` que fecha a chamada ficaria órfão — o Postgres
-- responde "mismatched parentheses at or near ';'". MEDIDO no CI (2026-10-27):
-- a migration falhou com P3018 e 42601 por causa disso.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_system'
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_system'
  );
END
$$;

-- ─────────────────────────── 2. As funções de escopo ───────────────────────────
--
-- As três funções que concediam o bucket de sistema pelo GUC passam a
-- concedê-lo pela CREDENCIAL. O `escopo_atual() IS NOT NULL` continua: uma
-- sessão sem escopo definido é fail-closed, e isso não muda.

-- `no_escopo_atual(alvo, aceita_global)` — a função da tabela `tenants`.
CREATE OR REPLACE FUNCTION no_escopo_atual(alvo uuid, aceita_global boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    escopo_atual() IS NOT NULL
    AND COALESCE(
      current_user = 'app_system'
      OR alvo::text = escopo_atual()
      OR (aceita_global AND alvo IS NULL),
      false
    )
$$;

-- `usuario_no_escopo(alvo)` — a função da tabela `users`.
CREATE OR REPLACE FUNCTION usuario_no_escopo(alvo uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    escopo_atual() IS NOT NULL
    AND COALESCE(
      current_user = 'app_system'
      OR EXISTS (
        SELECT 1 FROM tenant_memberships m
        WHERE m.user_id = alvo AND m.tenant_id::text = escopo_atual()
      ),
      false
    )
$$;

-- `perfil_do_escopo(alvo)` — o `profile_id` que uma escrita está gravando.
CREATE OR REPLACE FUNCTION perfil_do_escopo(alvo uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    escopo_atual() IS NOT NULL
    AND COALESCE(
      current_user = 'app_system' OR alvo IS NULL
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = alvo AND no_escopo_atual(p.tenant_id, false)
      ),
      false
    )
$$;

-- ─────────────────────────── 3. A policy de inserção ───────────────────────────
--
-- `users_insercao` exigia `escopo_atual() = '*'` — ou seja, exigia um GUC que
-- a sessão escrevia. Com a credencial, ela exige a credencial.
DROP POLICY IF EXISTS users_insercao ON users;
CREATE POLICY users_insercao ON users FOR INSERT
  WITH CHECK (current_user = 'app_system' AND perfil_do_escopo(profile_id));
