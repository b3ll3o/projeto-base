-- apps/api/prisma/migrations/20261116000000_password_hash_funcao/
--
-- pt-BR (2026-11-16): o hash da senha ganha um DONO no banco.
--
-- ── O QUE ESTA MIGRATION FAZ ───────────────────────────────────────────────
--
-- Cria a função `password_hash_is_valid_argon2id(text)` — a regra "este valor
-- é um hash argon2id" escrita em SQL, para o BANCO saber o que o aplicativo
-- sabe.
--
-- ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
--
-- Até 2026-11-16 a regra vivia em UM lugar só: o value object `PasswordHash`
-- (`apps/api/src/modules/users/domain/value-objects/password-hash.vo.ts`). Ele
-- valida o formato — mas SÓ NA LEITURA. O banco aceitava qualquer texto em
-- `users.password_hash`, e 9 linhas com o valor `'x'` provaram que isso não
-- era teórico:
--
--   • a listagem de usuários hidrata TODAS as linhas da página no VO; uma
--     linha inválida derrubava a página INTEIRA com 500 (`/users` e
--     `/admin/users` mostravam "Não foi possível carregar a lista");
--   • o login de uma conta com hash corrompido respondia 500 em vez de 401 —
--     e 500 vs 401 é um oráculo de existência de conta, que é exatamente o
--     que `InvalidCredentialsException` existe para fechar.
--
-- ── POR QUE UMA FUNÇÃO, E NÃO A REGRA ESCRITA DUAS VEZES ───────────────────
--
-- A regra precisa aparecer em DOIS lugares do banco: no `WHERE` do reparo
-- (migration `20261116000001`) e na CHECK constraint
-- (`20261116000002`). Escrevê-la duas vezes cria duas fontes de verdade para a
-- mesma regra — e a divergência entre elas é SILENCIOSA: uma linha que o
-- reparo não pegou faria o `migrate deploy` falhar na constraint, tarde demais
-- para o dado. É a exigência da convenção `dry.md` — *o fato tem UM dono*.
--
-- A função é o dono NO BANCO. O VO é o dono NA APLICAÇÃO. E o spec
-- `apps/api/src/modules/users/infrastructure/persistence/invariantes-da-conta-no-banco.integration.spec.ts`
-- é o INSTRUMENTO que amarra os dois: ele passa o mesmo corpus pelos dois lados
-- e afirma a implicação "o banco aceitou ⟹ o VO aceita" — que é o que garante
-- que a listagem não volta a quebrar.
--
-- ── A REGRA, E POR QUE ELA É MAIS ESTRITA QUE O VO ──────────────────────────
--
-- O VO aceita o envelope PHC do argon2id com os parâmetros `m`, `t` e `p` em
-- QUALQUER ordem, e aceita parâmetros extras desde que sejam `nome=número`.
-- A função é MAIS ESTRITA em dois pontos, e a direção é a segura — o banco
-- recusa ANTES de a aplicação ler:
--
--   1. os parâmetros têm de ser EXATAMENTE `m`, `t` e `p` (em qualquer ordem).
--      O VO aceitaria `keyid=123`; o banco não. Detectar o parâmetro repetido
--      exigiria um subquery, e CHECK constraint não aceita subquery — por isso
--      a lista de permissões é explícita, com as SEIS ordens possíveis.
--   2. o valor tem de ter no máximo 512 caracteres, como o VO.
--
-- ⚠️ O `coalesce(..., false)` é o que faz o veredito ser BINÁRIO. Sem ele, um
-- `NULL` devolveria `NULL` — e em uma CHECK constraint `NULL` significa "a
-- linha PASSA". A regra tem de responder sim ou não.
--
-- ⚠️ `IMMUTABLE` é o que permite usar a função em ÍNDICE e em coluna gerada
-- (MEDIDO no Postgres 16: `CREATE INDEX` com função VOLATILE é recusado com
-- "functions in index expression must be marked IMMUTABLE"). Em CHECK
-- constraint o Postgres ACEITA uma função volátil — mas o valor de uma
-- constraint precisa ser ESTÁVEL, e uma função que mudasse de resultado
-- entre duas leituras da mesma linha faria a constraint mentir. A função é de
-- fato imutável: só `length`, o operador de regex e `substring`, que não
-- dependem de estado nenhum.

CREATE OR REPLACE FUNCTION password_hash_is_valid_argon2id(p_valor text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    length(p_valor) <= 512
    AND p_valor ~ '^\$argon2id\$v=[0-9]+\$[^$]+\$[^$]+\$[^$]+$'
    AND substring(p_valor from '^\$argon2id\$v=[0-9]+\$([^$]*)\$')
        ~ (
            '^(m=[0-9]+,t=[0-9]+,p=[0-9]+'
            || '|m=[0-9]+,p=[0-9]+,t=[0-9]+'
            || '|t=[0-9]+,m=[0-9]+,p=[0-9]+'
            || '|t=[0-9]+,p=[0-9]+,m=[0-9]+'
            || '|p=[0-9]+,m=[0-9]+,t=[0-9]+'
            || '|p=[0-9]+,t=[0-9]+,m=[0-9]+)$'
          ),
    false
  )
$$;
