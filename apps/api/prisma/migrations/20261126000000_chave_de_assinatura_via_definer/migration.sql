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
-- que a aplicação saiba a senha do dono. Quem a chama precisa de `EXECUTE`
-- (e o papel que a chama é o de SISTEMA — ver a nota da 2ª revisão no fim
-- deste arquivo).
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
--
-- ⚠️ (issue #180, 2ª revisão) O `GRANT EXECUTE` ao `app_runtime` que estava
-- aqui é REVOGADO pela migration
-- `20261127000000_leitura_da_chave_fora_do_runtime`. MEDIDO: com ele, a
-- escalada era inteira — o runtime lia o segredo, assinava um corpo e
-- criava um `owner` numa empresa alheia. A assinatura só tem valor como
-- assinatura de um corpo que a APLICAÇÃO pediu, e o material que só ela tem é
-- a chave — que é exatamente o que o runtime não pode ler.
--
-- A aplicação lê a chave pelo papel de SISTEMA (a credencial elevada que ela
-- já carrega, #118), e MEDIDO: esse papel já insere membership direto — a
-- escalada que a assinatura impede é a do papel de RUNTIME, que é o que
-- serve as requisições.

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
