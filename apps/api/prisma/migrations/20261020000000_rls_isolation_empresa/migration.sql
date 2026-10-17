-- apps/api/prisma/migrations/20261020000000_rls_isolation_empresa/migration.sql
--
-- pt-BR (Fase 9 — RLS, 2026-10-17): o isolamento de empresa no BANCO.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Até aqui o isolamento entre empresas era só de aplicação: um `where` num
-- repositório, uma guarda num use case. MEDIDO nesta campanha, o dono de uma
-- empresa listava, renomeava, apagava e injetava permissão em perfil de empresa
-- vizinha — a Fase 8 fechou por código, mas a tabela continuava acessível a
-- qualquer sessão que escrevesse no schema. RLS é a segunda linha: ela vale
-- mesmo quando o código de aplicação erra.
--
-- ATENCAO: A MIGRATION NAO E O QUE PROTEGE — A CONEXAO E.
-- O dono do schema ignora RLS por padrao (ele e dono das tabelas), e superuser
-- ignora por construcao. Sem `FORCE ROW LEVEL SECURITY` (deliberado: as
-- migrations e o seed precisam escrever em tudo), as policies so valem para quem
-- conecta por um papel COMUM — que e o que `app_runtime` e. Por isso a
-- aplicacao conecta por ele e as migrations continuam no dono.
--
-- ATENCAO: `SENHA_DE_RUNTIME_DEV` e `PAPEL_DE_RUNTIME` existem em duas copias
-- (esta e `apps/api/src/shared/infrastructure/prisma/papel-de-runtime.ts`),
-- porque migration nao le env. `papel-de-runtime.spec.ts` compara as duas: se
-- alguem trocar num lado so, o spec fica vermelho.

-- ─────────────────────────── 1. O papel de runtime ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime
      LOGIN
      PASSWORD 'app_runtime_dev'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

-- `NOBYPASSRLS` e `NOSUPERUSER` sao o que a fase inteira existe para garantir: o
-- papel de runtime NAO pode ver o que a policy proibe. As duas propriedades sao
-- conferidas pelo primeiro `it()` de `prisma-rls.integration.spec.ts`, e e por
-- isso que aquele teste vem antes dos outros.

-- ─────────────────────────── 2. Permissoes do papel ───────────────────────────
--
-- SELECT/INSERT/UPDATE/DELETE e nada mais. `TRUNCATE` fica de fora de proposito:
-- `cleanDatabase` trunca pelo DONO, e um papel de runtime com TRUNCATE poderia
-- apagar a base inteira por uma tabela.

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- Tabelas futuras (as proximas migrations) entram sem precisar lembrar disto.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- ─────────────────────── 3. O escopo, em um lugar so ───────────────────────

-- O parametro de sessao que carrega a empresa. `'*'` e o bucket de SISTEMA (o
-- admin global e o seed). AUSENTE ou vazio e FAIL-CLOSED: `nullif` transforma
-- string vazia em NULL, e a funcao abaixo recusa tudo quando o escopo e NULL.
CREATE OR REPLACE FUNCTION escopo_atual() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')
$$;

-- `alvo` = `tenant_id` da linha (ou `tenants.id`), `aceita_global` = se a
-- operacao e de LEITURA, para a qual o bucket de sistema (`tenant_id IS NULL`)
-- pode ser visto.
--
-- ATENCAO: A comparacao e por TEXTO, nao por uuid, e isso e deliberado:
-- `escopo_atual()` pode valer `'*'`, e `'*'::uuid` estoura. Um `OR` NAO
-- garante short-circuit no Postgres (o planner reordena), entao comparar em uuid
-- transformaria a policy num `ERROR: invalid input syntax for type uuid`
-- justamente no caminho de leitura do admin. O custo e nao usar o indice de
-- `tenant_id`; a query da aplicacao ja filtra por empresa, e a policy e a
-- segunda linha.
--
-- O `IS NOT NULL` da primeira condicao e o fail-closed: sem ele,
-- `no_escopo_atual(NULL, true)` devolveria TRUE para perfil global com o escopo
-- ausente — e "sem escopo" leria o bucket de sistema, que e o oposto do que a
-- ausencia deve significar.
--
-- O `COALESCE` existe por uma MEDICAO, nao por estilo: com alvo NULL e
-- `aceita_global = false`, o `OR` produz NULL (`NULL = 'uuid'` e NULL, e
-- `false AND ...` e false), e a funcao devolvia NULL em vez de false. Dentro de
-- `USING`/`WITH CHECK` isso nao muda nada — so `true` passa — e por isso os
-- 10 testes de comportamento seguiam verdes com a funcao devolvendo NULL. Mas a
-- funcao promete boolean, e um NULL lido como "verdadeiro" por quem a reusar e
-- exatamente o tipo de armadilha que o fail-closed veio evitar. MEDIDO em
-- `prisma-rls.integration.spec.ts`: `global_escrito` voltou `null` onde a
-- segunda assertion exigia `false`.
CREATE OR REPLACE FUNCTION no_escopo_atual(alvo uuid, aceita_global boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    escopo_atual() IS NOT NULL
    AND COALESCE(
      escopo_atual() = '*'
      OR alvo::text = escopo_atual()
      OR (aceita_global AND alvo IS NULL),
      false
    )
$$;

-- ─────────────────────────── 4. As policies ───────────────────────────

-- 4.1 `profiles` — o bucket de sistema e LEGIVEL mas nao e ESCREVIVEL de dentro
-- de uma empresa. Essa assimetria e a escalada da Fase 8 fechada no banco: a
-- guarda `exigePerfilDoEscopo` faz isso na aplicacao, e a policy faz o mesmo
-- para qualquer codigo futuro que nao passe por ali.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_leitura ON profiles FOR SELECT
  USING (no_escopo_atual(tenant_id, true));

CREATE POLICY profiles_insercao ON profiles FOR INSERT
  WITH CHECK (no_escopo_atual(tenant_id, false));

CREATE POLICY profiles_atualizacao ON profiles FOR UPDATE
  USING (no_escopo_atual(tenant_id, true))
  WITH CHECK (no_escopo_atual(tenant_id, false));

CREATE POLICY profiles_remocao ON profiles FOR DELETE
  USING (no_escopo_atual(tenant_id, true));

-- 4.2 `tenants` — a empresa E a linha. INSERT liberado e o cadastro (D5): abrir
-- a propria empresa acontece sem escopo nenhum, e a sessao que faz isso e a
-- mesma que vai abrir sessao dentro da empresa recem-criada.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_leitura ON tenants FOR SELECT
  USING (no_escopo_atual(id, false));

CREATE POLICY tenants_insercao ON tenants FOR INSERT
  WITH CHECK (true);

CREATE POLICY tenants_atualizacao ON tenants FOR UPDATE
  USING (no_escopo_atual(id, false))
  WITH CHECK (no_escopo_atual(id, false));

CREATE POLICY tenants_remocao ON tenants FOR DELETE
  USING (no_escopo_atual(id, false));

-- 4.3 `tenant_memberships` e `invitations` — `tenant_id` NOT NULL, entao nao ha
-- bucket global para ler: escopo e alvos sao a mesma coisa.
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY memberships_leitura ON tenant_memberships FOR SELECT
  USING (no_escopo_atual(tenant_id, false));
CREATE POLICY memberships_insercao ON tenant_memberships FOR INSERT
  WITH CHECK (no_escopo_atual(tenant_id, false));
CREATE POLICY memberships_atualizacao ON tenant_memberships FOR UPDATE
  USING (no_escopo_atual(tenant_id, false))
  WITH CHECK (no_escopo_atual(tenant_id, false));
CREATE POLICY memberships_remocao ON tenant_memberships FOR DELETE
  USING (no_escopo_atual(tenant_id, false));

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_leitura ON invitations FOR SELECT
  USING (no_escopo_atual(tenant_id, false));
CREATE POLICY invitations_insercao ON invitations FOR INSERT
  WITH CHECK (no_escopo_atual(tenant_id, false));
CREATE POLICY invitations_atualizacao ON invitations FOR UPDATE
  USING (no_escopo_atual(tenant_id, false))
  WITH CHECK (no_escopo_atual(tenant_id, false));
CREATE POLICY invitations_remocao ON invitations FOR DELETE
  USING (no_escopo_atual(tenant_id, false));

-- 4.4 `authorizations` — a tabela que NAO tem `tenant_id`, e por isso a mais
-- perigosa do RBAC: e onde mora `users.delete`.
--
-- A policy atravessa a relacao em vez de duplicar a coluna: o `EXISTS` sobre
-- `profiles` e executado com a RLS DAQUELA TABELA tambem aplicada (a policy nao
-- e SECURITY DEFINER), entao o perfil da GLOBEX ja e invisivel aqui e o
-- `no_escopo_atual` dentro dele e a segunda checagem. Duplicar `tenant_id` em
-- `authorizations` seria a alternativa, e e o que a Fase 10 teria de fazer se
-- algum dia a policy precisasse ser mais barata que uma subconsulta.
ALTER TABLE authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY authorizations_leitura ON authorizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND no_escopo_atual(p.tenant_id, true)
    )
  );

CREATE POLICY authorizations_insercao ON authorizations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND no_escopo_atual(p.tenant_id, false)
    )
  );

CREATE POLICY authorizations_atualizacao ON authorizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND no_escopo_atual(p.tenant_id, true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND no_escopo_atual(p.tenant_id, false)
    )
  );

CREATE POLICY authorizations_remocao ON authorizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND no_escopo_atual(p.tenant_id, true)
    )
  );

-- ─────────────────────── 5. O que NAO tem policy, e por que ───────────────────────
--
-- `users`, `users_history` e `users_archive` NAO tem `tenant_id`: a identidade e
-- global por desenho (D4 — uma conta, N empresas). A policy que as protegeria
-- seria "o usuario precisa ser membro da empresa do escopo", que e um join
-- quantificado com `tenant_memberships` — ciclico e caro, e o filtro de
-- `deletedAt`/`profile` ja vive na aplicacao. Fica declarado aqui para que a
-- ausencia seja uma DECISAO e nao um esquecimento.