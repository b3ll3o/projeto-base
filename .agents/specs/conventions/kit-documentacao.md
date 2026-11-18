---
name: kit-documentacao
itens: 14
version: 1.0
updated: 2026-11-18
maintainer: documentation-specialist
description: "Convenção do kit completo de documentação moderna (Docs as Code) — os 5 pilares, os 14 itens, o doc canônico de cada um, o specialist dono, o auditor responsável e o gate que cobra. Um item do kit sem doc canônico é lacuna nomeada; um doc que mente é defeito P0."
---

# Convenção: `kit-documentacao`

> pt-BR: institui o **kit completo de documentação moderna** como obrigação
> do repo, com **um specialist dono por item** e **um auditor por pilar**. Não
> é "boa prática" — é a mesma obrigação de um schema de banco: se o código
> muda e o doc não, o repo tem um bug.

## §1. O que é o kit

O kit cobre o ciclo de vida inteiro de um software em **5 pilares** e **14
itens**. Cada item tem:

1. **um doc canônico** — um lugar, declarado na matriz §2;
2. **um specialist dono** — o agent que escreve e mantém aquele doc;
3. **um auditor** — o agent que verifica, sem escrever.

A regra do repo continua valendo: **o fato tem UM dono**
([`dry.md`](./dry.md)). O specialist escreve; o auditor mede. Nenhum dos dois
é o `documentation-specialist`, que continua sendo o dono da **matriz** e do
**conjunto** — não o dono de cada item.

### O que isto **não** é

- Não é "escrever 14 documentos". É **14 lugares com dono**, e o gate mede
  se o lugar existe, tem as seções mínimas e é indexado.
- Não é um plano de conteúdo: um PRD que não responde ao problema do usuário
  não é um PRD, é um formulário.
- Não substitui a convenção [`documentacao.md`](./documentacao.md) — esta
  cuida da **unidade de código → doc**; esta cuida do **kit → doc**.

## §2. A matriz — item → doc canônico → dono → auditor

> **Esta tabela é a fonte da verdade.** O gate
> [`check-doc-kit`](../../../.tooling/scripts/ci/check-doc-kit.ts) a lê
> **por nome de coluna** e mede cada linha. Mudar a tabela exige mudar o gate
> no mesmo PR — senão o gate mente sobre o que cobra.
>
> **Formato das células** (o gate parseia assim):
>
> | Célula | Formato | Significado |
> |---|---|---|
> | `Doc canônico` | um caminho, ou um glob (`*.md`) | o arquivo (ou a família) que o item exige |
> | `Tipo` | `arquivo` · `familia` · `artefato` | como o gate mede (ver §3) |
> | `Âncoras` | `âncora`; `âncora` | o mínimo que o doc tem que conter: heading (começa com `#`) ou chave literal |
> | `Índice` | um caminho, ou `—` | quem lista as instâncias do item (se houver) |
> | `Condição` | `obrigatório` · `condicional` | se o item nasce sempre ou depende (§4) |
>
> A §4 tem 3 colunas a mais — **Padrão**, **Controle positivo** e **Não
> aplicável declarado** — e o gate reconcilia o **Padrão** com o comando
> `grep -lE` da própria §4: as duas cópias têm que ser o mesmo padrão.

### §2.1 Pilar 1 — Porta de Entrada e Onboarding

| # | Item | Doc canônico | Tipo | Âncoras | Índice | Condição | Specialist | Auditor |
|---|---|---|---|---|---|---|---|---|
| 1 | README (A Vitrine) | `README.md` | arquivo | `## O que é`; `## Como executar localmente`; `## Documentação` | — | obrigatório | `readme-specialist` | `onboarding-docs-auditor` |
| 2 | CONTRIBUTING (Guia de Contribuição) | `CONTRIBUTING.md` | arquivo | `## Padrão de commits`; `## Fluxo de branches`; `## Code Review`; `## Estilo de código` | — | obrigatório | `contributing-specialist` | `onboarding-docs-auditor` |
| 3 | Glossário de Domínio | `GLOSSARY.md` | arquivo | `## Termos do domínio`; `## Como usar este glossário` | — | obrigatório | `glossary-specialist` | `onboarding-docs-auditor` |

### §2.2 Pilar 2 — Visão Macro e Arquitetura

| # | Item | Doc canônico | Tipo | Âncoras | Índice | Condição | Specialist | Auditor |
|---|---|---|---|---|---|---|---|---|
| 4 | HLD / Overview | `docs/system-design/README.md` | arquivo | `## §1. Ordem de leitura`; `## §3. Os 8 princípios`; `## §4. Como um aplicativo derivado estende isto` | — | obrigatório | `hld-specialist` | `architecture-docs-auditor` |
| 5 | Diagramas C4 | `docs/system-design/contexto.md` | arquivo | `## §1. C4 — Nível 1: o contexto`; `## §2. C4 — Nível 2: os contêineres` | — | obrigatório | `c4-specialist` | `architecture-docs-auditor` |

### §2.3 Pilar 3 — Planejamento e Decisões

| # | Item | Doc canônico | Tipo | Âncoras | Índice | Condição | Specialist | Auditor |
|---|---|---|---|---|---|---|---|---|
| 6 | PRD / One-Pager | `docs/prd/0001-projeto-base.md` | arquivo | `## Problema`; `## Objetivo de negócio`; `## Métricas de sucesso` | `docs/prd/README.md` | obrigatório | `prd-specialist` | `decision-docs-auditor` |
| 7 | TDR / RFC | `docs/tdr/0001-system-design-canonico.md` | arquivo | `## Proposta`; `## Riscos`; `## Segurança`; `## Rollout`; `## Revisão` | `docs/tdr/README.md` | obrigatório | `tdr-specialist` | `decision-docs-auditor` |
| 8 | ADR | `docs/adr/*.md` | familia | `## Contexto`; `## Decisão`; `## Consequências` | `docs/agents/domain.md` | obrigatório | `adr-specialist` | `decision-docs-auditor` |

### §2.4 Pilar 4 — Contratos e Interfaces

| # | Item | Doc canônico | Tipo | Âncoras | Índice | Condição | Specialist | Auditor |
|---|---|---|---|---|---|---|---|---|
| 9 | OpenAPI / Swagger | `apps/api/openapi.json` | artefato | `"openapi"`; `"paths"`; `"components"` | — | obrigatório | `openapi-doc-specialist` | `contract-docs-auditor` |
| 10 | AsyncAPI | `docs/api/asyncapi.yaml` | arquivo | `asyncapi`; `channels`; `messages` | — | condicional | `asyncapi-specialist` | `contract-docs-auditor` |
| 11 | ERD / Data Dictionary | `docs/system-design/dados.md` | arquivo | `## §1. O modelo`; `erDiagram` | — | obrigatório | `erd-specialist` | `contract-docs-auditor` |

### §2.5 Pilar 5 — Operação, Evolução e Confiabilidade

| # | Item | Doc canônico | Tipo | Âncoras | Índice | Condição | Specialist | Auditor |
|---|---|---|---|---|---|---|---|---|
| 12 | Runbooks / Playbooks | `docs/runbooks/*.md` | familia | `## §1.` | — | obrigatório | `runbook-specialist` | `operations-docs-auditor` |
| 13 | Post-Mortems | `docs/post-mortems/README.md` | arquivo | `## O template`; `### Linha do tempo`; `### Causa raiz`; `### Ações` | — | obrigatório | `postmortem-specialist` | `operations-docs-auditor` |
| 14 | CHANGELOG | `CHANGELOG.md` | arquivo | `## [Unreleased]`; `### Adicionado`; `### Corrigido`; `### Quebras de compatibilidade` | — | obrigatório | `changelog-specialist` | `operations-docs-auditor` |

## §3. Como o gate mede cada tipo

| Tipo | O que é o doc canônico | O que o gate exige |
|---|---|---|
| `arquivo` | um arquivo | existe, tem ≥ 1 linha de conteúdo e contém **todas** as âncoras |
| `familia` | um glob (`docs/adr/*.md`) | o glob casa ≥ 1 arquivo e **cada arquivo do glob** contém **todas** as âncoras |
| `artefato` | um arquivo **gerado** e versionado | existe e contém **todas** as âncoras. O **frescor** do artefato contra o código é de outro gate (o `check-openapi-contract`, para o OpenAPI) — este gate não o mede, e não promete |

**A âncora é um heading, não um texto solto.** A âncora que começa com `#`
casa com uma linha de heading **igual** a ela; se o último caractere da âncora
não for letra ou dígito, ela casa também com um heading que **começa** por
ela (o `## §1.` casa com `## §1. Ambiente 2 — ...`). A âncora que **não**
começa com `#` é literal (`erDiagram` dentro do diagrama, `"paths"` dentro do
JSON). ⚠️ `## Contexto` **não** casa com `## Contexto do Negocio` — a
comparação por `includes` aceitaria, e o gate passaria por um doc que não tem
a seção.

O **número de itens** é declarado no **frontmatter** desta convenção
(`itens: 14`), e o gate compara a contagem da matriz com a declaração — um
kit que cresce em silêncio é a classe 1 de `guard-classes.md`.

Além das âncoras, o gate exige, para todo item:

- **o índice existe** (quando a coluna `Índice` não é `—`) e **cita o doc
  canônico** — a citação é um **link** (`[texto](caminho)`) ou um **code
  span** (`` `arquivo.md` ``). A menção do nome em prosa **não** cita: o índice
  que não lista o que existe é índice de ficção;
- **o specialist e o auditor existem** em `.agents/agents/` — um item sem dono
  é um item que ninguém repara.

## §4. Itens condicionais — e a declaração de não-aplicabilidade

Um item condicional **nasce com o seu gatilho**. Antes do gatilho, ele não é
"faltando": é **não aplicável**, e a não-aplicabilidade é **declarada** — a
mesma doutrina de [`documentacao.md`](./documentacao.md) §5 (exceção
declarada, nunca inferida).

| Item | Gatilho | Sonda (glob) | Padrão | Controle positivo | Não aplicável declarado |
|---|---|---|---|---|---|
| AsyncAPI | item 10 do kit — existe canal assíncrono (broker de mensageria ou emissor de evento) | `package.json`; `apps/*/package.json`; `packages/*/package.json` | `"bullmq":\|"kafkajs":\|"amqplib":\|"@aws-sdk/client-sqs":\|"@nestjs/microservices":\|"amqp-connection-manager":\|"@cloudamqp/amqp-client":\|"nats":\|"@google-cloud/pubsub":` | `"name":` | **sim** — em 2026-11-18: o repo não tem broker; a fila está registrada como lacuna em [`docs/system-design/dados.md`](../../../docs/system-design/dados.md) §3 |

A **sonda** é um glob de arquivos e o **padrão** é uma expressão regular: o
gatilho disparou se **algum** arquivo da sonda casa com o padrão. As duas
colunas são o comando que reproduz a medição — o `\|` da tabela markdown é o
**escape do pipe**, e o comando real usa o pipe cru:

```bash
# os TRÊS globs da coluna Sonda — o comando tem que varrer todos, senão um
# broker adicionado num app passaria (o `grep` da raiz não o vê)
grep -lE '"bullmq":|"kafkajs":|"amqplib":|"@aws-sdk/client-sqs":|"@nestjs/microservices":|"amqp-connection-manager":|"@cloudamqp/amqp-client":|"nats":|"@google-cloud/pubsub":' \
  package.json apps/*/package.json packages/*/package.json
```

> O padrão casa a **chave da dependência** (com o dois-pontos), e não o nome
> solto: um `"keywords": ["bullmq"]` no `package.json` não é um broker, e não
> pode disparar o gatilho.

> O gate aplica o padrão ao **conteúdo** do arquivo (a regex casa em qualquer
> ponto) e o `grep` casa **por linha** — para padrão de dependência, as duas
> formas coincidem.

**Uma sonda que NÃO mede é erro.** O gate acusa "a sonda do gatilho não mede"
e **exige o doc** — porque "não disparou" é justamente o estado que autoriza
o item a não ter doc. Uma sonda cega que degradasse para "não disparou"
deixaria o item sem doc **para sempre**, com o gate verde. A sonda é cega em
três casos:

1. o **padrão** não compila;
2. a **sonda** não casa **nenhum** arquivo (um glob com o sufixo digitado
   errado esconde o broker real);
3. o **controle positivo** não casa em nenhum arquivo da sonda — é o caso mais
   comum: um padrão que **compila e não casa nada** é indistinguível de "não há
   broker". O controle positivo é um padrão que **tem que casar** (o
   `"name":` de todo `package.json`), e é o que separa "não há broker" de
   "a sonda está cega".

O gate cobra as **três direções**:

1. o gatilho **dispara** e o doc não existe → **erro**;
2. o gatilho **não dispara** e a não-aplicabilidade **não está declarada** →
   **erro** (o item sumiu em silêncio);
3. a não-aplicabilidade está declarada e o gatilho **dispara** → **erro** (a
   declaração parou de valer — é a "documentation lie" do
   `check-doc-coverage`, pelo outro lado).

## §5. Os gates

| Gate | Classe | Mede | Falha quando |
|---|---|---|---|
| `check-doc-kit` | **Cobertura do kit** | os 14 itens têm doc canônico, âncoras, índice, dono, o auditor do pilar, a skill e a contagem — e os condicionais nas **três direções** | falta doc, falta âncora, falta índice, falta dono, auditor trocado, skill inexistente, contagem divergente, condição sem declaração |
| `check-audit-skills` | **Procedimento** | os blocos `run` das skills de auditoria do kit rodam e passam | um passo quebra ou imprime `✗` |

O `check-doc-kit` reconcilia **duas** tabelas desta convenção: a **§2** (item
→ doc → âncoras → dono) e a **§5.1** (pilar → auditor → skill). O auditor de
um item tem que ser o do **pilar dele**, e a skill de auditoria do pilar tem
que **existir** — sem isso, as duas tabelas divergem em silêncio.

O `check-doc-kit` **não** mede frescor do texto, qualidade da prosa nem
acerto do quadrante Diátaxis — ver §6.

### §5.1 Os auditores do kit

Cada pilar tem **um** auditor, e cada auditor carrega **uma** skill de
processo determinístico. A skill é o **processo**; o agent é o **papel** —
a separação é a mesma dos specialists de stack.

| Pilar | Itens | Auditor | Skill de auditoria |
|---|---|---|---|
| 1 — Onboarding | 1, 2, 3 | `onboarding-docs-auditor` | `onboarding-docs-audit` |
| 2 — Arquitetura | 4, 5 | `architecture-docs-auditor` | `architecture-docs-audit` |
| 3 — Decisões | 6, 7, 8 | `decision-docs-auditor` | `decision-docs-audit` |
| 4 — Contratos | 9, 10, 11 | `contract-docs-auditor` | `contract-docs-audit` |
| 5 — Operação | 12, 13, 14 | `operations-docs-auditor` | `operations-docs-audit` |

## §6. O que o gate **não** mede (e é humano)

- **Frescor do texto.** O gate vê se a âncora existe, não se a frase ainda
  diz a verdade. Quem pega o resto é o `doc-sync` (reativo) e a auditoria do
  `documentation-specialist`.
- **Qualidade da prosa.** "Claro" não é propriedade mecânica.
- **Quadrante Diátaxis.** Julgamento editorial.
- **Se o PRD responde ao problema certo.** O gate vê as seções; se elas
  dizem o que é para dizer, isso é leitura de produto.

Dizer que o gate cobre frescor **todo** seria a classe 1 de
[`guard-classes.md`](./guard-classes.md) — condição inalcançável.

## §7. Quando NÃO aplicar

- **Histórico**: `docs/superpowers/plans/**` e `.agents/runs/**` — o TDR é
  medido pelo **template e pela instância viva**, não pelo arquivo de plano.
- **App derivado**: o kit é do `projeto-base`; o app derivado tem o **seu**
  kit — ele **ajusta a matriz** (o doc canônico do item 6 é o PRD do app, não
  o do template) e o `docs/system-design/extensao.md` §4 item 13 diz o que ele
  confere.
- **Documento de terceiro/vendor**: `.agents/skills/graphify/**`.

## §8. Quem é responsável

| Papel | Responsabilidade |
|---|---|
| `documentation-specialist` | dono da matriz §2 e da auditoria transversal |
| `kit-documentacao` (esta convenção) | a fonte da verdade dos 14 itens |
| `<item>-specialist` (14) | escreve e mantém o doc do item |
| `<pilar>-docs-auditor` (5) | mede os itens do pilar sem escrever |
| `check-doc-kit` | o instrumento da cobertura do kit |

## §9. Cross-references

- Convenção vizinha: [`documentacao.md`](./documentacao.md) ·
  [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) ·
  [`dry.md`](./dry.md) · [`guard-classes.md`](./guard-classes.md) ·
  [`idioma.md`](./idioma.md)
- Gate: `.tooling/scripts/ci/check-doc-kit.ts`
- Índice de convenções: [`README.md`](./README.md)
- Índice de agentes: [`AGENTS.md`](../../../AGENTS.md) §3

## §10. Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-11-18 | Criação. Os 5 pilares, os 14 itens, a matriz (§2), os tipos medidos (§3), os itens condicionais e a declaração de não-aplicabilidade (§4), os gates (§5) e os auditores por pilar (§5.1). |
