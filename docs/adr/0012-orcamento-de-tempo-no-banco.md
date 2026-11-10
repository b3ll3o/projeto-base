# ADR-0012: Orçamento de tempo no banco (`statement_timeout` do papel)

- **Status:** Aceito
- **Data:** 2026-11-10
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [ADR-0004](./0004-tenancy-multi-empresa.md) · [ADR-0010](./0010-system-design-canonico.md)
- **ADR anterior:** [0011-idempotencia-de-escrita.md](./0011-idempotencia-de-escrita.md)

## Contexto

O [system design](./../system-design/README.md) mediu uma lacuna e a
escreveu em [`operacao.md` §6](../system-design/operacao.md):

> | API → banco | **nenhum** | não há `statement_timeout` no papel de runtime — a query espera o Postgres desistir |
>
> **Lacuna:** sem timeout na API, um `SELECT` lento segura a conexão do pool
> até o Postgres desistir. A correção é um `statement_timeout` no papel de
> runtime — decisão de infra, e por isso **ADR novo**.

MEDIDO em 2026-11-10, no Postgres 16 local, antes da migration:

```text
$ psql -U app_runtime -c 'SHOW statement_timeout'
 statement_timeout
------------------
 0            ← 0 = SEM LIMITE
```

O preço do "sem limite" é concreto, e ele está no **limite de escala** que o
próprio system design aponta (`operacao.md` §7): *"o limite é o **pool** de
conexões do Postgres"*. Uma query lenta segura uma conexão do pool; pool
esgotado é a API inteira esperando.

Duas leituras erradas que o ADR precisa fechar:

- **Não é `lock_timeout`.** O `statement_timeout` conta o tempo **total**
  da statement — a espera por lock está dentro dele. Um `lock_timeout`
  separado mediria outra coisa (só a espera), e a query que trava por CPU
  ficaria sem teto.
- **Não é o prazo da transação do Prisma.** O default do Prisma para
  transação interativa é `timeout: 5000` / `maxWait: 2000` — e ele é
  **implícito** (ninguém o escreve). Ele cobre a transação, e **não** a
  query avulsa fora de `$transaction`.

## Decisão

### 1. O orçamento é do PAPEL, e vale `8s`

`ALTER ROLE app_runtime SET statement_timeout = '8s'` — e o mesmo para o
`app_system` (o bucket de sistema: login, refresh, logout e a idempotência
falam com o mesmo banco).

O número tem **um dono**: `STATEMENT_TIMEOUT_DO_PAPEL`, em
`apps/api/src/shared/infrastructure/prisma/papel-de-runtime.ts`. A migration
é SQL e não lê TypeScript — e o `papel-de-runtime.spec.ts` reconcilia os
dois, pelo mesmo mecanismo que reconcilia o tamanho mínimo da senha de
papel.

### 2. Por que 8 s

O orçamento precisa ficar **abaixo** do timeout do cliente web (10 s — o
fallback de `apps/web/lib/api-client.ts`), para a API responder com erro
**antes** de o cliente desistir; e **acima** do prazo de transação
interativa do Prisma (5 s), que é o que corta a transação primeiro.

### 3. A mudança é uma MIGRATION

`20261110000000_statement_timeout_do_papel` — e ela roda com a credencial
do **dono** (`directUrl` = `DIRECT_DATABASE_URL`), que é superuser na imagem
oficial.

O papel é do **cluster**, não do banco: o `ALTER ROLE ... SET` grava em
`pg_db_role_setting`, e vale para **todos** os bancos do cluster. MEDIDO
2026-11-10: o valor sobrevive a `DROP DATABASE` e a restart do container, e
aplica-se a **sessões novas** (uma sessão já aberta mantém o valor antigo).

O `ALTER ROLE` de um papel que **não existe** falha — e uma migration que
falha trava todas as seguintes. Por isso o `DO $$ … $$` que só age quando
o papel existe, o mesmo padrão das migrations de papel do repo.

### 4. O DONO não fica com o orçamento da API

O orçamento é do papel, e não do banco: uma migration longa (criar índice,
backfill) precisa poder rodar sem ser cortada pela metade. O spec de
integração afirma os dois lados: `app_runtime` e `app_system` com `8s`, e o
dono **sem** o orçamento da API.

### 5. O `prepara-papeis.sh` não anula o orçamento

A senha do papel é aplicada pelo `prepara-papeis.sh`, **depois** do
`migrate deploy` (é a ordem do ENTRYPOINT). MEDIDO 2026-11-10: um
`ALTER ROLE ... SET` **sobrevive** a um `ALTER ROLE ... LOGIN PASSWORD` — os
dois são atributos independentes do mesmo papel.

## Consequências

### O que mudou

- Toda sessão do `app_runtime` e do `app_system` tem **8 s** por statement.
- Uma query lenta deixa de segurar a conexão do pool: o Postgres cancela
  a statement, e a conexão volta para o pool.

### O preço, declarado

- **O papel é do cluster.** O orçamento vale para todos os bancos daquele
  cluster — inclusive os que a API não usa. É o mesmo preço que a
  [ADR-0007](./0007-refresh-token-revogavel.md) já registra para a senha do
  papel.
- **Precisa de superuser (ou `CREATEROLE` + `ADMIN`).** Num Postgres
  gerenciado (RDS/Cloud SQL) onde o papel de migration não é superuser, a
  migration morre com `permission denied to alter role`. O aviso já está
  em `apps/api/.env.example` — e ele vale para esta migration também.
- **A sessão que já estava aberta antes da migration não muda.** O valor é
  de sessão nova. O boot do container abre sessão nova — mas um `psql` já
  aberto antes da migration continua sem o orçamento.
- **8 s é uma escolha, não uma verdade.** Uma query legítima que passe de
  8 s passa a falhar. O número é do papel: mudá-lo é uma nova migration.

### O que NÃO mudou

- O prazo de transação do Prisma (5 s) — é outro mecanismo, e ele continua
  valendo.
- O timeout do cliente web (10 s) — é o contrato do cliente, e ele não
  conhece o orçamento do banco.
- A RLS, o escopo e as credenciais: nada mudou.

## Alternativas rejeitadas

- **`lock_timeout`.** Mede só a espera por lock — a query que trava por CPU
  ou por I/O ficaria sem teto, que é o caso comum do "SELECT lento".
- **A URI com `options=-c statement_timeout=…`.** Funciona (MEDIDO), mas
  tira a URI de todo o resto da governança do papel: a senha, o `LOGIN` e o
  `NOLOGIN` são atributos do papel, e o orçamento passaria a ser um
  accidents de configuração — visível em dois lugares (a URI e a
  migration).
- **No `prepara-papeis.sh`.** O script já escreve atributo de papel com a
  credencial do dono — e é por isso que ele seria um caminho legítimo. Mas
  ele roda no **boot**, e o atributo ficaria só na máquina que rodou o
  boot: um banco provisionado fora do entrypoint ficaria sem orçamento.
  A migration é versionada e vale para todo banco.
- **`idle_in_transaction_session_timeout` junto.** Seria um segundo número
  com dono, sem caso medido: o prazo de transação do Prisma (5 s) já cobre
  a transação parada.

## Ver Também

- [`../system-design/operacao.md` §6](../system-design/operacao.md) — a
  lacuna que esta ADR fecha.
- [`../system-design/operacao.md` §7](../system-design/operacao.md) — o
  pool como limite de escala.
- [ADR-0004](./0004-tenancy-multi-empresa.md) — os papéis do banco.
- [ADR-0007](./0007-refresh-token-revogavel.md) — o precedente do papel
  como entidade do cluster.
