-- apps/api/prisma/migrations/20261020000004_membership_insert_via_definer/
--
-- pt-BR (Fase 10+, 2026-10-17): o `INSERT` em `tenant_memberships` é a porta
-- por onde se FABRICA a credencial que toda a RLS de `users` mede.
--
-- MEDIDO no Postgres 16, contra o container do spec (RED):
--
--   SET ROLE app_runtime;
--   SET app.tenant_id = '<ACME>';
--   SELECT name FROM users;
--     → [alice]
--   INSERT INTO tenant_memberships (user_id, tenant_id) VALUES ('<BRUNO>', '<ACME>');
--   SELECT name FROM users;
--     → [alice, bruno]     ← escalada consumada
--
-- POR QUE EXISTE O FURO
-- `usuario_no_escopo(alvo)` (20261020000001 §1) é
--   EXISTS (SELECT 1 FROM tenant_memberships m
--            WHERE m.user_id = alvo AND m.tenant_id::text = escopo_atual())
-- — a membership É a credencial. E `memberships_insercao` (20261020000000) é
--   WITH CHECK (no_escopo_atual(tenant_id, false))
-- — o `user_id` é dado do cliente e NINGUÉM confere. Logo o atacante escreve a
-- credencial que o guarda exige, e o guarda abre. Elevate-self: a linha que a
-- POLICY de escrita produz é a linha que a POLICY de leitura mede. O
-- `000000` §4.2 já mediu a mesma classe em `users` (UPDATE para perfil global
-- admin); aqui a credencial nem precisa ser falsificada, basta criá-la.
--
-- POR QUE REVOKE E NÃO UM PREDICADO NA POLICY
-- A §4.2 do `000000` nomeia as duas saídas. A (a) — `EXISTS` sobre outra
-- tabela — é a que `usuario_no_escopo` usa, e aqui ela é IMPOSSÍVEL, não
-- custosa: dentro da policy, ler `invitations` roda sob a RLS do ATACANTE, e o
-- aceite de convite (o caminho legítimo do passo 1) acontece numa transação que
-- acabou de CONSUMIR a linha que a policy procuraria. E o outro caminho
-- legítimo (`provisionarEmpresaPropria`) não tem convite nenhum — a empresa
-- acabou de nascer na mesma transação. Não existe predicado que separe "owner
-- criando o primeiro admin" de "membro adicionando um desconhecido": para o
-- banco as duas linhas são idênticas. Fica a (b), que o `000000` já chama de
-- "o caminho curto".
--
-- ⚠️ POR QUE O REVOKE SOZINHO NÃO FECHAVA (medido, primeira versão)
-- Com `REVOKE INSERT` + uma função `SECURITY DEFINER` SEM assinatura, a escalada
-- continuava inteira: bastava chamar a função com o `user_id` alheio. MEDIDO
-- contra o container do spec, como `app_runtime`:
--
--   SET app.tenant_id = '<ACME>';
--   SELECT criar_membership('<BRUNO>', '<ACME>');
--   SELECT name FROM users;   → [alice, bruno]
--
-- Troquei a porta, não fechei a parede: a função é `SECURITY DEFINER` e o
-- `p_user_id` é do chamador, então ela é exatamente o `INSERT` que eu tinha
-- revogado, com um caminho mais curto. É o teste `🟢` da 1ª versão que fazia
-- essa escalada aparecer como VERDE.
--
-- POR QUE ASSINATURA E NÃO UM FATO NO BANCO (as três saídas, medidas)
-- Tudo que o banco poderia conferir e que *não* está ao alcance do atacante
-- foi medido e reprovado antes de ir para a assinatura:
--
--   (a) GUC `app.actor_id` — QUALQUER papel com direito de escrita escreve com
--       `set_config(..., true)`, que é o mesmo caminho de `app.tenant_id`, já
--       documentado como não assinado neste PR. Não é um fato, é uma declaração.
--   (b) `EXISTS invitation` — o atacante EMITE a própria convite
--       (`POST /tenants/:id/invitations`) e depois se auto-convida. Além disso o
--       token vive EM CLARO no banco (`invitations.token`) e volta na resposta
--       HTTP (`tenancy-invitations.controller.ts:71`), ou seja, nunca foi
--       segredo: possession do token não prova posse do e-mail.
--   (c) `xmin`/`ctid` da própria escrita — o atacante faz o `UPDATE` dele mesmo
--       no escopo `'*'` e o rastro vira indistinguível do legítimo.
--
-- Sobra a assinatura: o único material que o atacante não alcança é o que a
-- aplicação carrega em memória. É o caminho curto apontado pelo `000000` §4.2,
-- e é o mesmo motivo pelo qual o `JWT_SECRET` é segredo.
--
-- O FORMATO DO CORPO ASSINADO é
--   user_id \n tenant_id \n role \n profile_id
-- com `role` normalizado por `COALESCE(...,'member')` e `profile_id` como texto
-- (vazio quando nulo). Os separadores existem para que nenhuma permutação dos
-- quatro campos produza o mesmo corpo — sem eles, `(a, b, c, d)` e
-- `(a, b\0c, d)` colidirem é o tipo de bug que só aparece em produção. A
-- aplicação replica o formato em `assinatura-de-membership.ts`.
--
-- ⚠️ `SECURITY DEFINER` é uma exceção deliberada à doutrina do `000001` §1 e
-- do `000000` §4.2, que evitam a RLS na travessia. A razão é a mesma que torna
-- a alternativa (a) impossível: a credencial que autoriza esta escrita não é
-- legível sob a RLS de quem escreve. E a exposição é mínima — a função grava
-- UMA linha em `tenant_memberships`, sem `UPDATE` nem `DELETE`, e o
-- `search_path` é fixado.
--
-- A policy `memberships_insercao` da 20261020000000 NÃO é removida. Ela vira
-- inerte para o runtime (o privilégio não chega lá), e é essa a segunda linha
-- de defesa: se alguém conceder INSERT de volta, a policy ainda barra. defesa
-- em profundidade sem custo — a policy já existe.

-- `pgcrypto` dá `hmac`. Já é extensão do contrib e a imagem
-- `postgres:16-alpine` a traz; o `IF NOT EXISTS` cobre o banco que já a tem.
--
-- ⚠️ `hmac()` saiu do core no PostgreSQL 11 e a `pgcrypto` só publica a
-- assinatura `(bytea, bytea, text)` — a variante `(text, bytea, text)` foi
-- removida. MEDIDO: escrever `hmac(v_corpo, segredo, 'sha256')` direto dá
-- `42883 function hmac(text, bytea, unknown) does not exist`. O
-- `convert_to(…, 'UTF8')` é o que satisfaz a assinatura; e ele é necessário de
-- qualquer jeito, porque a comparação é byte a byte com o `digest('hex')` do
-- Node, e não há charset implícito entre `text` do Postgres e string UTF-8 da
-- aplicação.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A chave vive numa tabela que só o DONO lê. É essa leitura — e não o
-- SQLSTATE — que dá sentido à assinatura: um atacante com injeção de SQL roda
-- como `app_runtime`, e sem esta revogação ele leria o segredo junto com a
-- função e assinaria o que quisesse. MEDIDO: com a tabela legível, o teste
-- `🔴 a assinatura é o que separa` continuaria verde e o
-- `🔴 app_runtime não lê a chave` ficaria vermelho.
CREATE TABLE chaves_de_assinatura (
  nome    text PRIMARY KEY,
  segredo bytea NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- O segredo é de 32 bytes (`gen_random_bytes(32)`), não de 64: 32 bytes é o
-- tamanho de chave do HMAC-SHA256. Guardar hex dobraria o tamanho sem
-- adicionar entropia nenhuma.
INSERT INTO chaves_de_assinatura (nome, segredo)
VALUES ('membership', gen_random_bytes(32))
ON CONFLICT (nome) DO NOTHING;

-- O `PUBLIC` do Postgres inclui a concessão padrão de toda tabela nova, então o
-- `REVOKE` explícito vem logo depois do `CREATE`. Sem ele, `app_runtime`
-- herdaria `SELECT` por `pg_default_acl` — o mesmo mecanismo que o
-- `20261020000000` §default-privileges usa para as tabelas do schema, e que
-- MEDIDO concede `arwd` ao papel de runtime.
REVOKE ALL ON chaves_de_assinatura FROM PUBLIC;
REVOKE ALL ON chaves_de_assinatura FROM app_runtime;

REVOKE INSERT ON tenant_memberships FROM app_runtime;

-- ⚠️ O corpo assinado é montado em UM SÓ LUGAR, `v_corpo`, e as duas metades
-- — o `INSERT` e a conferência — leem dele. Escrever a concatenação duas vezes
-- (uma para assinar, outra para inserir) é como a forma divergiria sem nenhum
-- teste notar: os testes assinam do lado Node e conferem do lado Postgres, e um
-- separador a mais no SQL deixaria o onboarding inteiro em 42501, que é o tipo
-- de falha que só aparece em produção.
--
-- ⚠️ E o formato é COMO CONTAGEM, não separador. A primeira versão deste arquivo
-- usava `\n` entre os campos, com a justificativa de que assim nenhuma permutação
-- colidiria. MEDIDO: a justificativa é FALSA. Um valor de campo que contém o
-- próprio separador produz o mesmo corpo —
--   corpo('a\nb', 'c', 'member', null) == corpo('a', 'b', 'c\nmember', '')
-- e o teste que cravava a propriedade (`assinatura-de-membership.spec.ts`,
-- "os separadores impedem que permutações colidam") ficou VERMELHO ao ser
-- escrito. A colisão é hoje inofensiva porque `user_id`, `tenant_id` e
-- `profile_id` são `uuid` — o cast rejeita `\n` antes da conferência — e só
-- `role` é texto livre; ainda assim, "inofensiva porque os outros três campos
-- happens to não conter o separador" é exatamente o tipo de BENIGN AGORA que a
-- próxima coluna textual torna BENIGN NUNCA MAIS. O prefixo `<bytes>:` é
-- ambíguo por construção: nenhum corpo de um par pode ser o corpo do outro.
--
-- `octet_length`, não `length`: `length()` conta CARACTERES e a aplicação conta
-- BYTES (`Buffer.byteLength`). Os dois só coincidem em ASCII — o que é o caso de
-- todo UUID e de toda role até alguém inventar uma role com acento. E o
-- `::text` é obrigatório, não estilo: `ARRAY[...]` exige tipo homogêneo e
-- MEDIDO sem o cast a migration morre com
-- `42804 ARRAY types integer and text cannot be matched`.
CREATE OR REPLACE FUNCTION corpo_de_membership(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_role       text,
  p_profile_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_to_string(ARRAY[
           octet_length(v.u)::text, ':', v.u,
           octet_length(v.t)::text, ':', v.t,
           octet_length(v.r)::text, ':', v.r,
           octet_length(v.p)::text, ':', v.p
         ], '')
    FROM (
      SELECT p_user_id::text AS u,
             p_tenant_id::text AS t,
             COALESCE(p_role, 'member') AS r,
             COALESCE(p_profile_id::text, '') AS p
    ) v;
$$;

CREATE OR REPLACE FUNCTION criar_membership(
  p_user_id     uuid,
  p_tenant_id   uuid,
  p_role        text DEFAULT 'member',
  p_profile_id  uuid DEFAULT NULL,
  p_assinatura  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_corpo text;
  v_esperado text;
BEGIN
  v_corpo := corpo_de_membership(p_user_id, p_tenant_id, p_role, p_profile_id);

  SELECT encode(
           hmac(convert_to(v_corpo, 'UTF8'), segredo, 'sha256'),
           'hex'
         )
    INTO v_esperado
    FROM chaves_de_assinatura
   WHERE nome = 'membership';

  -- ⚠️ A comparação é em texto e o resultado é o que decide. Uma
  -- `IF v_esperado IS DISTINCT FROM p_assinatura` aceitaria `NULL`: `hmac` sobre
  -- segredo `NULL` devolve `NULL`, e `NULL = NULL` é `NULL`, que o `IF` trata
  -- como falso — a função passaria e gravaria. O `IS DISTINCT FROM` pega o
  -- `NULL` dos dois lados; o `coalesce` ainda cobre o caso em que a linha da
  -- chave sumiu (comparar com `NULL` seria "diferente", o que é a resposta
  -- correta para chave ausente, mas o erro tem que dizer isso).
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'chave de assinatura ausente para membership' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_assinatura, '') IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'assinatura invalida para tenant_memberships' USING ERRCODE = '42501';
  END IF;

  -- ⚠️ `id`, `created_at` e `updated_at` são preenchidos AQUI, e não pelo
  -- Prisma: o `@default(uuid())` do schema é gerado no CLIENTE, e a coluna no
  -- banco é `"id" UUID NOT NULL` SEM default (medido). Um `INSERT` cru que
  -- liste só as 4 colunas de negócio morre com 23502 not_null_violation —
  -- que é o que aconteceu na primeira versão desta função, com 500 em todo o
  -- onboarding. `gen_random_uuid()` é o mesmo default que o resto do schema
  -- já usa (`users_history`, `users_archive`, `profiles`).
  --
  -- ⚠️ NÃO HÁ `EXISTS` sobre `p_user_id` nem sobre `p_tenant_id` nesta função,
  -- e o `INSERT` abaixo é cru. O que impede o vínculo órfão são as FKs —
  -- `tenant_memberships_user_id_fkey` e `tenant_memberships_tenant_id_fkey`,
  -- declaradas na migration `20261017000000_tenant_membership_invitation`
  -- (linhas 78-83), **OUTRO arquivo**. Um `p_user_id` inventado morre em
  -- `23503` mesmo que a assinatura passasse. Isto está registrado porque um
  -- `.sql` que se lê sozinho parece aceitar `p_user_id` arbitrário: quem
  -- soltar as FKs tira a segunda barreira sem deixar sinal no código.
  --
  -- As demais barreiras, todas independentes: a assinatura (a chave está em
  -- `chaves_de_assinatura`, sem `SELECT` para `app_runtime`), o
  -- `REVOKE INSERT ... FROM app_runtime` (`20261020000004:133`), e o
  -- `@@unique([userId, tenantId])` do schema, que impede vínculo duplicado.
  INSERT INTO tenant_memberships (
    id, user_id, tenant_id, role, profile_id, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    p_user_id,
    p_tenant_id,
    COALESCE(p_role, 'member'),
    p_profile_id,
    now(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- `SECURITY DEFINER` com `EXECUTE` liberado para `PUBLIC` (o default do
-- Postgres) é a forma canônica de transformar a função em privilégio público:
-- qualquer papel que tenha `USAGE` no schema chamaria a gravação. O `REVOKE`
-- vem primeiro.
REVOKE ALL ON FUNCTION corpo_de_membership(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION criar_membership(uuid, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION corpo_de_membership(uuid, uuid, text, uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION criar_membership(uuid, uuid, text, uuid, text) TO app_runtime;