-- apps/api/prisma/migrations/20261116000001_password_hash_reparo/
--
-- pt-BR (2026-11-16): as linhas de `users` cujo hash não é argon2id são
-- neutralizadas.
--
-- ── O QUE ESTA MIGRATION FAZ ───────────────────────────────────────────────
--
-- Para cada linha de `users` cujo `password_hash` não passa na função
-- `password_hash_is_valid_argon2id` (criada em `20261116000000`), grava um
-- envelope argon2id **novo, com digest aleatório**. A linha sobrevive; a
-- credencial dela deixa de existir.
--
-- ⚠️ POR QUE "NEUTRALIZAR" E NÃO APAGAR
--
-- Apagar a conta seria perda de dado: a auditoria (`users_history`,
-- `users_archive`), as memberships e a trilha de `tenants` apontam para ela.
-- O hash corrompido, por outro lado, **já não era uma credencial**: o VO
-- recusava o valor e o login respondia 500. A conta estava trancada antes
-- desta migration e continua trancada depois — o que muda é o código da
-- resposta: 500 (que vaza a existência da conta) vira 401 (a resposta genérica
-- que `InvalidCredentialsException` define).
--
-- ⚠️ POR QUE O DIGEST ALEATÓRIO
--
-- O valor novo é um envelope argon2id **válido** — é o que o VO exige, e é o
-- que faz a listagem voltar a ler a linha. O digest é aleatório, então
-- `argon2.verify` nunca encontra uma senha que corresponda: a conta está
-- trancada, e a próxima senha boa que alguém gravar por cima já passa pela
-- constraint.
--
-- O envelope tem o formato EXATO que a lib emite: salt de 16 bytes e digest de
-- 32 bytes, em base64 SEM preenchimento (`rtrim(..., '=')`), que é o que o
-- argon2 consegue decodificar. `gen_random_uuid()` é do CORE do Postgres 13+
-- (e não do `pgcrypto`), e `encode`/`decode` também — a migration não depende
-- de extensão nenhuma.
--
-- ── POR QUE UM `DO` BLOCK ───────────────────────────────────────────────────
--
-- Porque é ele que **diz quantas linhas foram reparadas**, e o número importa:
-- "9 linhas" é a assinatura de um banco que foi adulterado por fora da
-- aplicação, e o operador precisa saber que aquilo aconteceu. O `UPDATE` de
-- um `DO` block é UM comando — o que deixa o arquivo aplicável por
-- `$executeRawUnsafe` (o Prisma NÃO aceita dois comandos num prepared
-- statement), que é como o spec de integração aplica a migration de verdade.
--
-- ── O QUE ESTE REPARO NÃO FAZ ──────────────────────────────────────────────
--
-- Não mexe no `version`. O `version` é a sequência da trilha de auditoria
-- (`users_history` tem UNIQUE em `(entity_id, version)` e o aplicativo grava a
-- entrada com a versão nova): incrementá-lo aqui deixaria um BURACO na trilha
-- — a entrada `N+1` nunca existiu. O `updated_at` muda, que é o que o
-- backfill de papéis (`20261022000001`) também faz.

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
      'o reparo de users.password_hash exige a credencial do DONO da tabela: um papel sem BYPASSRLS não alcança as linhas e o reparo seria um no-op silencioso';
  END IF;

  UPDATE "users"
     SET "password_hash" = '$argon2id$v=19$m=65536,t=3,p=4$'
             || rtrim(
                  translate(
                    encode(
                      decode(replace(gen_random_uuid()::text, '-', ''), 'hex'),
                      'base64'
                    ),
                    E'\n',
                    ''
                  ),
                  '='
                )
             || '$'
             || rtrim(
                  translate(
                    encode(
                      decode(
                        replace(gen_random_uuid()::text, '-', '')
                        || replace(gen_random_uuid()::text, '-', ''),
                        'hex'
                      ),
                      'base64'
                    ),
                    E'\n',
                    ''
                  ),
                  '='
                ),
         "updated_at" = now()
   WHERE NOT password_hash_is_valid_argon2id("password_hash");

  GET DIAGNOSTICS reparadas = ROW_COUNT;

  RAISE NOTICE
    'password_hash: % linha(s) com hash fora do formato argon2id foram neutralizada(s).'
    , reparadas;
END $$;
