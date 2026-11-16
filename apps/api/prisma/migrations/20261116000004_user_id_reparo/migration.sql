-- apps/api/prisma/migrations/20261116000004_user_id_reparo/
--
-- pt-BR (2026-11-16): as contas cujo id não é um UUID v7 ganham um id novo.
--
-- ── O QUE ESTA MIGRATION FAZ ───────────────────────────────────────────────
--
-- Para cada linha de `users` cujo `id` não passa em `user_id_is_uuid_v7`
-- (criada em `20261116000003`), gera um UUID v7 novo e troca o id.
--
-- ⚠️ POR QUE TROCAR E NÃO APAGAR
--
-- O id é a identidade da conta, e a conta tem dado ao redor: memberships,
-- refresh tokens, histórico e arquivo de auditoria. Apagar a linha levaria
-- tudo junto.
--
-- Por isso o caminho é REPARAR o id, e o reparo tem que carregar junto o que
-- aponta para ele. São DOIS grupos:
--
--   • as COLUNAS COM FK (`tenant_memberships.user_id` e
--     `refresh_tokens.user_id`) têm `ON UPDATE CASCADE` — o banco propaga
--     sozinho;
--   • as REFERÊNCIAS SOLTAS não têm FK, e são atualizadas aqui: o
--     `users_history.entity_id`, o `users_archive.entity_id`, o
--     `idempotency_keys.actor`, as colunas de auditoria (`users.created_by`,
--     `users.updated_by`, `users.deleted_by`, `users_history.changed_by`,
--     `users_archive.deleted_by`) e o `id` DENTRO dos snapshots JSONB
--     (`users_history.snapshot`, `users_archive.snapshot`,
--     `idempotency_keys.response`) — que é o corpo que a API devolve.
--
-- ⚠️ A assinatura HMAC da membership NÃO é um problema aqui: ela é conferida
-- no INSERT, dentro de `criar_membership`
-- (`20261020000004_membership_insert_via_definer`), e NÃO é gravada em coluna
-- nenhuma — `tenant_memberships` não tem coluna de assinatura. Trocar o
-- `user_id` não a invalida; o que a invalidaria é gravar a membership por
-- outro caminho que não passe pela função.
--
-- O UUID v7 novo é montado aqui: 48 bits de timestamp em milissegundos
-- (big-endian), o nibble de versão `7`, a variante `10xx` e o resto aleatório
-- — no mesmo formato do `generateUuidV7()` do `UserId`
-- (`users/domain/value-objects/user-id.vo.ts`). O `gen_random_uuid()` é do
-- CORE do Postgres 13+, e o seu nibble de variante já é `10xx`.
--
-- ⚠️ POR QUE UM `DO` BLOCK
--
-- Porque o reparo precisa do MAPA `id antigo → id novo` em VARIOS statements,
-- e o mapa precisa ser o MESMO em todos. Uma tabela temporária carrega o
-- mapa; um `DO` block é o que permite usá-la nas atualizações — e ele é UM
-- comando, o que deixa o arquivo aplicável por `$executeRawUnsafe` (o Prisma
-- NÃO aceita dois comandos num prepared statement), que é como o spec de
-- integração aplica a migration de verdade.
--
-- ⚠️ O QUE ESTE REPARO NÃO FAZ
--
-- Não mexe no `version` (a sequência da trilha de auditoria: incrementá-lo
-- deixaria um buraco — a entrada `N+1` nunca existiu), e não mexe no
-- `created_at` (a data de criação é a data em que a conta nasceu, não a data em
-- que o id foi consertado).

DO $$
DECLARE
  reparadas integer;
BEGIN
  -- ⚠️ O reparo exige a credencial do DONO da tabela. Um papel sem
  -- BYPASSRLS não alcança as linhas sob RLS — o `UPDATE` afetaria ZERO
  -- linhas, SEM ERRO, e a migration ficaria marcada como aplicada sem ter
  -- reparado nada. O `ADD CONSTRAINT` seguinte falharia depois, com um
  -- "violated by some row" que não aponta para a causa. Falhar aqui, com o
  -- motivo, é o que evita a caça ao fantasma.
  IF NOT EXISTS (
         SELECT 1
           FROM pg_class c
          WHERE c.oid = to_regclass('users')
            AND pg_get_userbyid(c.relowner) = current_user
       )
     AND NOT EXISTS (
         SELECT 1
           FROM pg_roles
          WHERE rolname = current_user
            AND (rolsuper OR rolbypassrls)
       ) THEN
    RAISE EXCEPTION
      'o reparo de users.id exige a credencial do DONO da tabela: um papel sem BYPASSRLS não alcança as linhas e o reparo seria um no-op silencioso';
  END IF;

  CREATE TEMPORARY TABLE rekey_de_user ON COMMIT DROP AS
  SELECT u.id AS id_antigo,
         (
           lpad(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0')
           || '7'
           || substr(replace(gen_random_uuid()::text, '-', ''), 14, 3)
           || substr(replace(gen_random_uuid()::text, '-', ''), 17, 16)
         )::uuid AS id_novo
    FROM users u
   WHERE NOT user_id_is_uuid_v7(u.id);

  UPDATE users u
     SET id = r.id_novo,
         updated_at = now()
    FROM rekey_de_user r
   WHERE u.id = r.id_antigo;

  -- O `ROW_COUNT` é lido AQUI, e não no fim: `GET DIAGNOSTICS` fala da última
  -- instrução executada, e as duas atualizações seguintes (histórico e
  -- arquivo) contariam as linhas delas — o número que o operador quer ler é o
  -- de CONTAS rekeyadas.
  GET DIAGNOSTICS reparadas = ROW_COUNT;

  UPDATE users_history h
     SET entity_id = r.id_novo
    FROM rekey_de_user r
   WHERE h.entity_id = r.id_antigo;

  UPDATE users_archive a
     SET entity_id = r.id_novo
    FROM rekey_de_user r
   WHERE a.entity_id = r.id_antigo;

  -- `idempotency_keys.actor` é o id da conta em TEXTO, e não tem FK. Um
  -- replay atribuído a um id que não existe mais seria uma resposta servida
  -- para o ator errado — então ele viaja com o rekey.
  UPDATE idempotency_keys k
     SET actor = r.id_novo::text
    FROM rekey_de_user r
   WHERE k.actor = r.id_antigo::text;

  -- As colunas de auditoria da PRÓPRIA tabela `users`: quem criou, quem
  -- alterou e quem apagou a linha é outra conta — e o id delas é o mesmo
  -- id de usuário.
  UPDATE users u
     SET created_by = r.id_novo
    FROM rekey_de_user r
   WHERE u.created_by = r.id_antigo;

  UPDATE users u
     SET updated_by = r.id_novo
    FROM rekey_de_user r
   WHERE u.updated_by = r.id_antigo;

  UPDATE users u
     SET deleted_by = r.id_novo
    FROM rekey_de_user r
   WHERE u.deleted_by = r.id_antigo;

  UPDATE users_history h
     SET changed_by = r.id_novo
    FROM rekey_de_user r
   WHERE h.changed_by = r.id_antigo;

  UPDATE users_archive a
     SET deleted_by = r.id_novo
    FROM rekey_de_user r
   WHERE a.deleted_by = r.id_antigo;

  -- O `id` DENTRO dos snapshots JSONB. O snapshot é o que a API devolve em
  -- `GET /users/{id}/history` e no arquivo de auditoria — e o `response` da
  -- chave de idempotência é o corpo de um `POST /users` que um replay serve
  -- depois. Um snapshot com o id VELHO é uma resposta que cita uma conta que
  -- não existe mais.
  --
  -- ⚠️ O `jsonb_set` NÃO cria a chave que não existe (`create_missing` é
  -- `false` por padrão): um snapshot sem `id` fica como está, e um snapshot
  -- cujo `id` é outro id (o de outra conta) não é tocado — o `WHERE` só casa
  -- o id que este reparo trocou.
  UPDATE users_history h
     SET snapshot = jsonb_set(h.snapshot, '{id}', to_jsonb(r.id_novo::text))
    FROM rekey_de_user r
   WHERE h.snapshot ->> 'id' = r.id_antigo::text;

  UPDATE users_archive a
     SET snapshot = jsonb_set(a.snapshot, '{id}', to_jsonb(r.id_novo::text))
    FROM rekey_de_user r
   WHERE a.snapshot ->> 'id' = r.id_antigo::text;

  UPDATE idempotency_keys k
     SET response = jsonb_set(k.response, '{id}', to_jsonb(r.id_novo::text))
    FROM rekey_de_user r
   WHERE k.response ->> 'id' = r.id_antigo::text;

  RAISE NOTICE
    'users.id: % conta(s) com id fora do formato UUID v7 receberam um id novo (memberships e refresh tokens acompanharam por ON UPDATE CASCADE).'
    , reparadas;
END $$;
