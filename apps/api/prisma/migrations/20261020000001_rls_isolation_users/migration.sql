-- ─────────────────── Fase 10 — RLS de `users`, a tabela sem `tenant_id` ───────────────────
--
-- A §5 da migration anterior deixou `users`, `users_history` e `users_archive`
-- sem policy, e o texto dizia que a ausência era "cíclica e cara". A ausência
-- era uma decisão; a consequência medida não era o que o texto vendia, e ela
-- estava registrada como ⚠️ no próprio arquivo. Esta migration fecha `users`.
--
-- MEDIDO 2026-10-17 contra `projeto-base-pg-local`, sessão `app_runtime`
-- (`rolsuper=f`, `rolbypassrls=f`) com escopo de empresa VÁLIDA e transação
-- commitada — a mesma sondagem que rodou contra a §5:
--
--   [A] count(*) FROM users                      → 3 de 3   (vê todo mundo)
--   [B] count(password_hash) FROM users           → 3        (hash cross-tenant)
--   [C] UPDATE SET profile_id=<admin global>      → UPDATE 1 (promovia alheio)
--   [D] UPDATE SET password_hash=…                → UPDATE 1 (reescrevia senha)
--   [E] INSERT … profile_id=<admin global>        → INSERT 1  (nasce admin)
--   [F] DELETE                                   → DELETE 1  (apagava alheio)
--
-- Nenhum dos seis depende de lixo no GUC: um escopo de empresa bem formado
-- basta. E [E] é o mais caro de todos — `is_admin` no catálogo de permissões é
-- BYPASS TOTAL do `PermissionsGuard`, não atalho entre permissões.
--
-- O desenho é o inverso do das outras 5 tabelas: aqui não existe `tenant_id`
-- para comparar, e o vínculo é a `membership`. Por isso as funções abaixo são
-- as duas do §3 reusadas com outro alvo, mais uma (`usuario_no_escopo`) que é o
-- join que a §5 chamava de "cíclico e caro". Ele é caro e é o que impede a
-- escalada — as duas coisas eram verdade ao mesmo tempo.

-- ─────────────────────────── 1. As duas funções novas ───────────────────────────

-- O usuário `alvo` está no escopo? Três disjuntos, na ordem em que a decisão
-- foi tomada:
--
--   1. sem escopo definido → FALSE. É o fail-closed que a §3 já aplica a
--      `no_escopo_atual`, repetido aqui porque `usuario_no_escopo` é o que toda
--      policy de `users` chama. Sessão sem escopo não lê ninguém.
--   2. escopo `'*'` → TRUE. O bucket de sistema (admin global e seed) enxerga
--      e escreve em todo mundo, como nas outras tabelas.
--   3. caso contrário → o `EXISTS` em `tenant_memberships`.
--
-- O `EXISTS` NÃO usa `SECURITY DEFINER`, pela mesma razão documentada na §4.2:
-- com ele, a RLS de `tenant_memberships` não valeria na travessia. Sem ele, o
-- filtro ainda funciona e ainda falha para o lado seguro — membership fora do
-- escopo não é visível, logo o `EXISTS` é falso e o usuário some. Se um dia o
-- filtro de `tenant_memberships` mudar, esta função falha fechada.
--
-- A comparação é por TEXTO, como em `no_escopo_atual`: `escopo_atual()` pode
-- valer `'*'`, e `'*'::uuid` estoura. O disjunto 2 trata isso, e um `OR` não
-- garante short-circuit no Postgres — o planner reordena.
CREATE OR REPLACE FUNCTION usuario_no_escopo(alvo uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    escopo_atual() IS NOT NULL
    AND COALESCE(
      escopo_atual() = '*'
      OR EXISTS (
        SELECT 1 FROM tenant_memberships m
        WHERE m.user_id = alvo AND m.tenant_id::text = escopo_atual()
      ),
      false
    )
$$;

-- O `profile_id` que uma escrita está gravando pertence ao escopo?
--
-- `NULL` é aceito de propósito: TODOS os caminhos legítimos de criação gravam
-- `profile_id: null` — medido em `prisma-tenant-onboarding.repository.ts` (as
-- duas escritas) e é o que `User.criar` produz. Sem este disjunto, `POST /users`
-- e os dois caminhos de onboarding quebram no primeiro insert.
--
-- O que NÃO é aceito é um `profile_id` de fora: aqui a comparação passa pela
-- `profiles`, então o alvo é o `tenant_id` do perfil — que é a propriedade real
-- ("o perfil pertence à empresa do escopo"), não uma comparação com o id.
CREATE OR REPLACE FUNCTION perfil_do_escopo(alvo uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    escopo_atual() IS NOT NULL
    AND COALESCE(
      escopo_atual() = '*' OR alvo IS NULL
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = alvo AND no_escopo_atual(p.tenant_id, false)
      ),
      false
    )
$$;

-- ─────────────────────────── 2. As policies ───────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_leitura ON users FOR SELECT
  USING (usuario_no_escopo(id));

-- `WITH CHECK` (não `USING`): o que se decide aqui é o estado NOVO da linha.
--
-- ⚠️ SEM o `escopo_atual() IS NULL` que a primeira versão tinha. Era uma
-- brecha com nome: uma sessão que esqueceu de definir o escopo — exatamente o
-- bug que o `set_config(..., true)` local previne em todo o resto — ganhava
-- INSERT irrestrito, e o [E] acima voltaria a passar. Fail-closed também aqui:
-- o cadastro público não abre sessão vazia, abre sessão de SISTEMA (`'*'`).
CREATE POLICY users_insercao ON users FOR INSERT
  WITH CHECK (escopo_atual() = '*' AND perfil_do_escopo(profile_id));

-- Os dois lados importam e valem coisas diferentes: `USING` decide se a linha
-- ATUAL é alcançável (o `UPDATE` cross-tenant morre aqui — [C] e [D]); o
-- `WITH CHECK` decide se o valor NOVO é admissível (o `profile_id` não pode
-- virar admin global — [C] pelo outro lado). Um `USING (…, true)` aqui
-- repetiria o furo de `aceita_global` que a §4.1 já corrigiu.
CREATE POLICY users_atualizacao ON users FOR UPDATE
  USING (usuario_no_escopo(id))
  WITH CHECK (usuario_no_escopo(id) AND perfil_do_escopo(profile_id));

-- `DELETE` não tem `WITH CHECK`: o `USING` é a ÚNICA condição. Foi
-- exatamente o que a §4.1 documentou e o que o commit `5553ee3` corrigiu em 4
-- policies — aqui nasce certo, e o teste de `DELETE` é o que impede que o
-- conserto vire "banco inútil com tudo verde".
CREATE POLICY users_remocao ON users FOR DELETE
  USING (usuario_no_escopo(id));

-- ─────────────────── 3. O que esta migration NÃO fecha ───────────────────
--
-- `users_history` e `users_archive` seguem SEM policy (`relrowsecurity = false`
-- nas duas, MEDIDO). O motivo não é o da §5 ("sem tenant_id") e sim o de desenho
-- que a Fase 10 escolheu não mexer: `PrismaAuditService` grava e lê os dois em 6
-- métodos (`record`, `listHistory`, `getHistoryEntry`, `archive`, `listArchive`,
-- `getArchiveEntry`), nenhum deles em `comEscopo`/`abrirEscopo`, e dar escopo a
-- eles é um segundo desenho (e uma segunda superfície de código), não um
-- adiamento.
--
-- MEDIDO 2026-10-17 com a sessão `app_runtime`, escopo da ACME e transação
-- commitada, semeando um snapshot COM A MESMA FORMA que a produção grava
-- (`toUserOutput`, `dto/user.output.ts:27`):
--
--   users_history (todas) .............. 2
--   users_history (linhas da GLOBEX) .. 1     ← leitura cross-tenant CONFIRMADA
--   users_archive  (todas) ............. 2
--   users_archive  (linhas da GLOBEX) . 1     ← idem
--   users_history com hash no snapshot . 0
--
-- ⚠️ CORREÇÃO DE UMA AFIRMAÇÃO ANTERIOR DESTA MESMA SEÇÃO. A primeira versão
-- deste texto dizia que "`passwordHash` está lá, e está em CÓPIA, inclusive das
-- versões antigas de uma conta que já teve a senha trocada". Isso é FALSO, e a
-- medição que o refuta é simples: `snapshot` é `toUserOutput(user)`
-- (`user-use-cases.ts:283` e `:338`), e `toUserOutput` devolve `id, nome, email,
-- profileId, createdAt, updatedAt, version, deletedAt, isDeleted` — sem hash
-- nenhum. `PrismaAuditService` grava `input.snapshot` VERBATIM (linhas 51, 112
-- e 119), então o que não entra na DTO também não entra no snapshot.
--
-- O número que o texto anterior queria dar era 2 de 2 — e era o meu próprio
-- fixture: a spec de medição semeava `passwordHash` dentro do snapshot, ou
-- seja, media a spec, não o sistema. Semear com a forma real devolve 0.
--
-- O QUE SOBRA É REAL, e é isto que fica declarado: metadado de PII de QUALQUER
-- conta — nome, email, `profile_id`, timestamps, e a trilha de `version` e
-- `changed_by` de cada escrita — alcançável por qualquer sessão `app_runtime`,
-- inclusive de outra empresa, porque nenhuma das duas tabelas filtra. Um
-- histórico de auditoria também não some: `users_archive` guarda o que o
-- soft-delete apagou da tabela.
--
-- ───── ⚠️ E ISSO NÃO É SÓ METADADO: é a credencial que falta para a escalada
--
-- A redação anterior desta seção parava no "metadado de PII", e isso subdeclara
-- por uma ordem de grandeza o que a ausência entrega. `users_history.entity_id`
-- é o **uuid do usuário** — `user-use-cases.ts` grava `entityId: ev.aggregateId`
-- (o id do agregado `User`), então toda conta que já foi mutada tem o id ali.
-- E `app_runtime` tem `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` (concedido
-- na §1 da migration `20261020000000`). A cadeia inteira:
--
--   1. sessão `app_runtime` com escopo da ACME lê `users_history` (sem RLS) e
--      tira o `entity_id` de um usuário da GLOBEX;
--   2. `INSERT INTO tenant_memberships (user_id = <o alheio>, tenant_id = <acme>)`
--      — e `memberships_insercao` é `WITH CHECK (no_escopo_atual(tenant_id, false))`:
--      ela confere SÓ o `tenant_id`, nunca o `user_id`;
--   3. a partir daí `usuario_no_escopo(<o alheio>)` vale TRUE sob ACME, porque a
--      membership que o passo 2 acabou de criar é a própria coisa que a função
--      mede;
--   4. o [B] e o [D] do cabeçalho — ler o `password_hash` alheio e reescrever a
--      senha alheia — passam.
--
-- ⚠️ O passo 2 é D4 funcionando, não um defeito dele: sob "1 conta, N empresas",
-- a empresaconvida legitimamente alguém que já tem conta em outra casa, e esse
-- INSERT tem de passar. O banco não tem como distinguir "convite válido" de
-- "uuid que eu li da tabela de auditoria da outra empresa" — oissive é o token,
-- e token não é coisa que RLS expresse. **Por isso o elo que falta fechar é o
-- passo 1**, não o passo 2: enquanto `users_history` e `users_archive` não
-- filtrarem, elas são um diretório de uuids de usuário cross-tenant.
--
-- Isto é declarado aqui, e não em prosa de PR, porque é o que a §5 era: uma
-- ausência que precisa ser uma DECISÃO. Abrir com `prisma-audit.service.ts`
-- num refactor próprio, medindo antes e depois como a §5 mandou medir — e o
-- que esse refactor tem que resolver primeiro é que `AuditContextProps`
-- (`audit-context.vo.ts:16`) carrega `actorId, correlationId, source, timestamp`
-- e **não tem `tenantId`**: sem empurrar o escopo até ele, qualquer policy
-- nova nessas tabelas derruba a auditoria DEPOIS do commit.
--
-- E o aviso que a §5 deixou para quem for abrir: `PrismaAuditService` roda FORA
-- da transação que escreveu o usuário (`user-use-cases.ts:221-223` fecha a
-- transação antes de `emitAuditForEvents`). Se essas tabelas ganharem policy
-- amanhã, a auditoria passa a falhar DEPOIS do commit — o estado muda e o log
-- não. Por isso o refactor tem que mexer nos DOIS lados, ou em nenhum.