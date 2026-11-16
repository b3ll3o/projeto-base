-- apps/api/prisma/migrations/20261116000003_user_id_funcao/
--
-- pt-BR (2026-11-16): o id da conta ganha um DONO no banco.
--
-- ── O QUE ESTA MIGRATION FAZ ───────────────────────────────────────────────
--
-- Cria a função `user_id_is_uuid_v7(uuid)` — a regra "este id é um UUID v7"
-- escrita em SQL, para o BANCO saber o que o aplicativo sabe.
--
-- ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
--
-- A mesma classe de defeito do hash, no campo vizinho. O value object
-- `UserId` (`users/domain/value-objects/user-id.vo.ts`) aceita um id só se ele
-- casar com
--
--   /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i
--
-- — ou seja, **versão 7** (o `UserId.create()` só gera v7; o `randomUUID()` do
-- Node, que gera v4, é recusado). E o banco não tinha NENHUMA restrição: a
-- coluna `users.id` é `uuid`, e um uuid v4 passa por ela sem resistência.
--
-- O resultado foi medido em 2026-11-16 no banco local: 9 linhas de `users` com
-- id **v4**, gravadas por fora da aplicação. Uma delas quebrava a listagem
-- inteira — o VO `UserId` recusa o id na hidratação, e a recusa sobe como
-- `UserValidationException`, que o mapper HTTP traduz para **400**. Um 400
-- que diz "o identificador precisa ser um UUID v7 válido" para um cliente que
-- não mandou id nenhum é o status mentindo sobre onde está o defeito.
--
-- ── POR QUE UMA FUNÇÃO ─────────────────────────────────────────────────────
--
-- A regra aparece em DOIS lugares do banco: no `WHERE` do reparo
-- (`20261116000004`) e na CHECK constraint (`20261116000005`). Duas cópias
-- divergem em silêncio, e a divergência aparece como "o `migrate deploy`
-- falhou". É a exigência da convenção `dry.md` — *o fato tem UM dono*.
--
-- O dono NO BANCO é esta função; o dono NA APLICAÇÃO é o `UserId`; e o spec
-- `apps/api/src/modules/users/infrastructure/persistence/invariantes-da-conta-no-banco.integration.spec.ts`
-- é o INSTRUMENTO que amarra os dois.
--
-- ⚠️ `~*` (case-insensitive) e não `~`: o VO usa a flag `i`. As duas regras
-- precisam concordar no MESMO conjunto de valores, senão a divergência aparece
-- como um 500 na leitura.
--
-- ⚠️ O PARÂMETRO é `text`, e não `uuid` — e é a diferença entre uma regra
-- que espelha a do VO e uma que a aproxima:
--
--   • com `uuid`, o texto que não é uuid LEVANTA (`22P02`) em vez de
--     devolver o veredito — e o Postgres canonicaliza o que entra: um uuid
--     sem hifens virava o formato canônico e a função devolvia `true` para um
--     valor que o VO recusa (o VO exige os hifens);
--   • com `text`, a função responde SIM ou NÃO para QUALQUER entrada, no
--     mesmo domínio do VO (uma string), e a forma canônica é exigida — que é
--     a regra do VO.
--
-- A CHECK constraint chama a função com `("id"::text)`: a coluna `users.id` é
-- `uuid`, e o `::text` devolve a forma CANÔNICA (com hifens, em minúsculas) —
-- que é exatamente o valor que a aplicação lê.
--
-- ⚠️ `IMMUTABLE` é o que permite usar a função em ÍNDICE e em coluna gerada
-- (MEDIDO no Postgres 16: `CREATE INDEX` com função VOLATILE é recusado com
-- "functions in index expression must be marked IMMUTABLE"). Em CHECK
-- constraint o Postgres ACEITA uma função volátil — mas o valor de uma
-- constraint precisa ser ESTÁVEL, e uma função que mudasse de resultado
-- entre duas leituras da mesma linha faria a constraint mentir.
-- O operador de regex é imutável.

CREATE OR REPLACE FUNCTION user_id_is_uuid_v7(p_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$',
    false
  )
$$;
