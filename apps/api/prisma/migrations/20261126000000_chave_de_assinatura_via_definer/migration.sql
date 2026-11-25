-- Migration: a chave de assinatura lida por uma função SECURITY DEFINER
-- (issue #180).
--
-- O QUE ELA FECHA
--
-- A assinatura do `criar_membership` precisa da chave de HMAC, e a chave mora
-- numa tabela que o papel de RUNTIME não lê (o `REVOKE` é de propósito: um
-- segredo num `env` está a um `SELECT` de distância de quem conseguir injetar
-- SQL). Até aqui, a aplicação lia a chave no BOOT com uma conexão de DONO
-- (superuser) — a URI vinha do `DIRECT_DATABASE_URL`, que o Compose entregava
-- ao container da api.
--
-- MEDIDO (issue #180): o processo Node da api carregava a credencial de DONO
-- no ambiente, e o próprio código a lia (`process.env['DIRECT_DATABASE_URL']`).
-- A precondição do desenho de isolamento — "o runtime NÃO tem o poder do
-- dono" — estava violada no processo que expõe a API: quem conseguisse ler o
-- `env` (SSRF reflexivo, path traversal em log, erro que imprima o env, ou
-- o comprometimento de qualquer dependência da imagem) obtinha a credencial
-- que ignora RLS por definição, e com ela TODAS as empresas.
--
-- A FUNÇÃO
--
-- Uma função `SECURITY DEFINER` roda com os privilégios do DONO (o papel que
-- a migration aplica), e por isso lê a tabela que o runtime não lê — sem
-- que a aplicação saiba a senha do dono. O runtime só precisa de
-- `EXECUTE`.
--
-- ⚠️ A tabela `chaves_de_assinatura` tem RLS **habilitada** e **sem**
-- `FORCE ROW LEVEL SECURITY` (decisão de 2026-10-18, migration
-- `20261020000005`): é o dono da tabela quem lê, e o dono não é filtrado pela
-- policy. Um `FORCE` aqui quebraria a própria função.
--
-- ⚠️ O `SECURITY DEFINER` é perigoso por definição (a função roda com o poder
-- do dono), e o que segura o risco é o ESCOPO dela: ela devolve UM segredo,
-- o de UM nome, e o `REVOKE ... FROM PUBLIC` + o `GRANT EXECUTE` para dois
-- papéis nomeados fecham quem pode chamar. O `search_path` fixo evita a
-- busca por objeto sequestrado (`search_path = public, pg_temp`).

CREATE OR REPLACE FUNCTION ler_chave_de_assinatura(p_nome TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resultado BYTEA;
BEGIN
    SELECT segredo INTO resultado FROM chaves_de_assinatura WHERE nome = p_nome;
    RETURN resultado;
END;
$$;

-- A função é do DONO (o papel que roda a migration — e o DONO é o papel que a
-- migration aplica, não um nome fixo), e o dono não é filtrado pela RLS da
-- tabela — por isso ela consegue ler a linha que o runtime não lê.

REVOKE ALL ON FUNCTION ler_chave_de_assinatura(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ler_chave_de_assinatura(TEXT) TO app_runtime;
GRANT EXECUTE ON FUNCTION ler_chave_de_assinatura(TEXT) TO app_system;
