---
name: contract-docs-auditor-memory
description: Memória acumulada do agent contract-docs-auditor — auditor do pilar 4 do kit de documentação (OpenAPI, AsyncAPI condicional e ERD)
---

# Memória: `contract-docs-auditor`

> Arquivo de memória do agent `contract-docs-auditor`.

## Decisões Tomadas

### 2026-11-18 — O item condicional se mede pelo **gatilho**, não pela presença do arquivo

**Contexto:** O item 10 (AsyncAPI) é condicional: a §4 da convenção declara
o gatilho (`"bullmq" | "kafkajs" | "amqplib" | "@aws-sdk/client-sqs"` nos
`package.json`) e a não-aplicabilidade. O `docs/api/asyncapi.yaml` **não
existe** — e a §4 diz que em 2026-11-18 o repo não tem broker, com a fila
registrada como lacuna no `docs/system-design/dados.md` §3.

**Decisão:** O passo 3 mede o **gatilho** (quantos `package.json` casam) e a
**declaração** (a linha do item AsyncAPI na §4), e só então reporta o
estado do arquivo. O relatório diz `gatilho não dispara` — nunca "o AsyncAPI
falta".

**Consequências:** Em 2026-11-18 o passo mediu `gatilho não dispara (0
package.json com broker)` e a declaração presente. A regra da §4 cobra as
**duas direções**: se um dia alguém instalar o `bullmq`, o gatilho dispara, o
doc passa a ser exigido e a declaração tem que sair.

### 2026-11-18 — O model do Prisma tem dois nomes, e o doc do ERD usa o segundo

**Contexto:** No `schema.prisma` o model é `UserHistory`; a tabela é
`users_history` (`@@map`). O `docs/system-design/dados.md` **nunca** escreve
`UserHistory` — escreve `users_history`, e o ERD desenha `USER`,
`TENANT_MEMBERSHIP`, `REFRESH_TOKEN`. Procurar o model pelo nome do model
daria **0** para 6 dos 12 models e produziria 6 falsos positivos.

**Decisão:** O passo 2 extrai o par `(model, tabela)` do schema com `awk`
(`@@map` é a ponte) e aceita o doc que cite **qualquer um dos dois**. A
medição de 2026-11-18 foi **12 de 12 models citados**.

**Consequências:** Nenhum falso positivo de "model fora do ERD". O `awk` lê
o `@@map` do bloco do model — e o bloco fecha em `}`, que é o que
sincroniza o model com a sua tabela.

### 2026-11-18 — O `openapi.json` é artefato, e a auditoria confere **presença**, não frescor

**Contexto:** O item 9 é o único `artefato` do kit. O arquivo é gerado
(`openapi:export`), e o conteúdo dele é do `openapi-contract-specialist`
e do gate `check-openapi-contract`.

**Decisão:** O passo 1 mede **existência, versionamento e as três chaves**
(`"openapi"`, `"paths"`, `"components"`). Nada de frescor, nada de drift
DTO↔Prisma.

**Consequências:** Em 2026-11-18: `apps/api/openapi.json`, 22034 bytes,
**1 entrada no índice do git** (versionado — a assertiva é verificável), 3 de
3 chaves.

## Padrões Descobertos

- O `apps/api/openapi.json` **é versionado** (`git ls-files` devolve 1
  entrada). O `documentation-specialist` diz, no anti-padrão dele, que o
  artefato é gitignored — no estado medido em 2026-11-18, ele **está** no
  índice. A afirmação do anti-padrão envelheceu; a medição é que vale.
- `apps/api/src/modules/` tem **6** bounded contexts (auth, feature-flags,
  health, profiles, tenancy, users) e `docs/api/` tem **7** docs — o excedente
  é `users-migracoes.md`, que tem prefixo do BC (`users-`). Por isso o
  casamento do passo 4 aceita `bc` **e** `bc-*`.
- O `schema.prisma` tem **12** models; o `docs/system-design/dados.md` tem
  **1** `erDiagram` e cita os 12.
- Os 6 models sem FK (`users_history`, `users_archive`, `feature_flags`,
  `chaves_de_assinatura`, `refresh_tokens`, `idempotency_keys`) estão
  listados no §1.1 do doc de dados — com o motivo de cada um. É a parte do
  ERD que a auditoria mais deve reforçar, porque é a que o diagrama **não**
  mostra.
- A §4 da convenção registra a fila como lacuna no
  `docs/system-design/dados.md` §3 — a **fonte única** da não-aplicabilidade
  do AsyncAPI não é o próprio item 10, é o doc de dados.

## Lições Aprendidas

- ❌ **Procurar `UserHistory` no doc do ERD e reportar "model faltando".** O
  doc usa o nome da tabela; 6 de 12 models teriam dado falso negativo.
- ❌ **Concluir que o AsyncAPI está faltando porque o arquivo não existe.**
  Ele nasce com o gatilho; a medida é do gatilho.
- ❌ **Usar `grep -c '^model '` para casar o model no doc.** `User` casaria
  dentro de `users` e de `UserHistory` — a fronteira de palavra é o que
  separa "citou o model" de "citou outra coisa".
- ❌ **Rodar o gerador do OpenAPI dentro da auditoria.** Auditoria é
  read-only; gerar o artefato é escrita, e o passo `run` do gate é proibido de
  escrever.
- ❌ **Aceitar a afirmação "o `openapi.json` é gitignored" sem medir.** A
  medição de 2026-11-18 diz o contrário: 1 entrada no índice.

## Sugestões de Evolução

- [ ] Medir o **número de paths e de operações** do artefato e comparar com
      o número de rotas do controller — é o que o `check-openapi-contract`
      mede, e o número já pode entrar no relatório como contexto.
- [ ] Medir se o §1.1 do doc de dados cobre **todos** os models sem FK
      (hoje a cobertura é visual, não medida).
- [ ] Apontar no relatório qual **fonte** declara a não-aplicabilidade do
      AsyncAPI (hoje: §4 da convenção + §3 do doc de dados) — são dois lugares
      que precisam concordar.
