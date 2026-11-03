# Revisão das skills do projeto — 2026-10-29

> **Branch:** `feat/skill-find-skills` · **Base:** `origin/main` (`194d305`)
> **Origem:** pedido do usuário — (1) adicionar a skill `find-skills` (Vercel) ao
> projeto; (2) revisar **todas** as skills de `.agents/skills/`.
> **Método:** inventário mecânico das 23 skills (frontmatter, tamanho, idioma,
> links, órfãs) + **execução real** das procedures das skills de auditoria.
> Um item só entra aqui **medido**: o comando, a data e o número.

## TL;DR

| # | Achado | Classe | Veredito | Destino |
|---|---|---|---|---|
| F1 | `graphify`: 739 linhas, em inglês, **0 referências** (órfã), 10 arquivos vendorizados | conformance + dívida | `viva` | decisão do usuário: adaptar ou remover |
| F2 | `check-version-footers` media **4 de 6** footers — e o drift já tinha acontecido | gate incompleto | **corrigido neste PR** | gate 4 → 6 + spec + mutação |
| F3 | `release-versioning-audit` passo 4.1: a regex não casa → **saída vazia** | procedimento morto | **corrigido neste PR** | regex = a do workflow |
| F4 | `release-versioning-audit` passo 6: lê a versão errada + acusa drift falso + só olha 1 de 6 | procedimento falso-positivo | **corrigido neste PR** | os 6 arquivos, e "à frente da tag" |
| F5 | `openapi-audit` passo 2: diff entre formatos diferentes (100 linhas de ruído) + premissa falsa | procedimento falso-positivo | **corrigido neste PR** | nomes normalizados + aliases declarados |
| F6 | `updated` mente em 2 skills | metadado falso | **corrigido neste PR** | data real do último commit |
| F7 | 10 skills sem `version`/`updated` | consistência | `viva` | sem regra que obrigue — propor |
| F8 | 11 skills sem o cabeçalho `Quem invoca`/`Quando invocar` | consistência | `viva` | sem regra que obrigue — propor |
| F9 | 6 `description` com mais de 400 caracteres | custo de contexto | `viva` | sem teto declarado |
| F10 | `findings-orchestration` a 2 linhas do teto de 300 | limite | `viva` | observação |
| F11 | **Nenhum instrumento roda as procedures das skills de auditoria** | defesa geral | **fechada** (instrumento no PR #141) | `check-audit-skills` executa os passos declarados |

---

## F1 — `graphify`: órfã, grande e em inglês

**Classe:** conformance (3 convenções) · **Severidade:** média · **Status:** `viva`

### O que foi medido

```bash
$ wc -l .agents/skills/graphify/SKILL.md
739 .agents/skills/graphify/SKILL.md
$ wc -l .agents/skills/graphify/references/query.md
317 .agents/skills/graphify/references/query.md
```

Contra [`tamanho-e-revisao.md`](../specs/conventions/tamanho-e-revisao.md):
"Arquivos Markdown (`.md`) DEVEM ter no máximo **300 linhas**" — e "Agents,
skills e workflows seguem a mesma regra". O `SKILL.md` está em **2,5×** o teto e
`references/query.md` em 317.

Contra [`idioma.md`](../specs/conventions/idioma.md): "pt-BR é o idioma padrão e
obrigatório". O arquivo inteiro é em inglês — o cabeçalho é
`# /graphify` / "Turn any folder of files into a navigable knowledge graph".

**Órfã (medido):** nenhuma referência de fora do próprio diretório.

```bash
$ grep -rl '\bgraphify\b' .agents/agents/ .agents/skills/*/SKILL.md AGENTS.md
(sem resultado)
```

O critério é o mesmo que o gate `check-agent-routing-coverage` aplica aos
agents — o cabeçalho dele diz: "Se um agent existe mas nunca é roteado, ele é
órfão: ninguém dispara a skill dele, e o gate detecta isso." A skill órfã
existe, o critério existe, **o gate não olha skills** (só agents).

São 10 arquivos vendorizados (7 `references/`, `.graphify_version`, o
`SKILL.md`). O precedente do repo para repositório externo é adaptation, não
cópia — o commit `e8ed335` diz: "Três repositórios externos de skill de UI
viram 5 skills **adaptadas — não vendorizadas**".

### Veredito

**Decisão do usuário**: adaptar (pt-BR + ≤300 linhas + cabeçalho) ou remover.
Não removi nem adaptei — a remoção apaga trabalho de terceiros sem o dono
decidir, e a adaptação de 739+317 linhas em inglês é um PR próprio.

---

## F2 — `check-version-footers` media 4 de 6 footers, e o drift já tinha acontecido

**Classe:** gate incompleto · **Severidade:** média · **Status:** **corrigido neste PR**

### O que foi medido

O repo tem **seis** arquivos com footer de versão; o gate media **quatro**:

| arquivo | rótulo | versão antes | no gate? |
|---|---|---|---|
| `docs/MONOREPO.md` | `**Versão do documento:**` | 1.12.0 | ✅ |
| `docs/STACK.md` | `**Versão da stack:**` | 1.12.0 | ✅ |
| `docs/TEMPLATE_USAGE.md` | `**Versão do documento:**` | 1.12.0 | ✅ |
| `.agents/specs/conventions/estrutura-e-versionamento.md` | `**Versão da convenção:**` | 1.12.0 | ✅ |
| `AGENTS.md` | `**Versão do documento:**` | **1.13.0** | ❌ |
| `README.md` | `**Versão:**` | 1.12.0 | ❌ |

O `AGENTS.md` foi para `1.13.0` no merge do #116 (`404a245`) e **os quatro
canônicos ficaram em `1.12.0`** — e o gate, que existe exatamente para
impedir divergência, ficou verde. É a mesma classe do #126 (um arquivo que
não está na lista não é atualizado) **reincidindo dentro do gate que a
fecha**.

### Correção

`FOOTERS_DE_VERSAO` passou de 4 para 6 (o gate mede os seis agora), a spec
prende o número (`toBe(6)` + os dois nomes novos), e a mutação prova:

```text
# só o AGENTS.md divergir
ok=false
  - Os footers de versão divergem (#126): docs/MONOREPO.md=1.14.0, …,
    AGENTS.md=1.13.0, README.md=1.14.0.
```

---

## F3 — `release-versioning-audit` passo 4.1: a regex não casa com nada

**Classe:** procedimento morto · **Status:** **corrigido neste PR**

### O que foi medido

O passo 4.1 existe para "verificar o que o workflow lê". A regex pedia **dois**
caracteres entre "Vers" e "o" — e "Versão" tem **um** (o "ã"):

```bash
$ grep -oE "Vers..o do documento.*[0-9]+\.[0-9]+\.[0-9]+" docs/MONOREPO.md
(vazio)
```

O workflow real usa `\*\*Versão do documento:\*\* [0-9]+\.[0-9]+\.[0-9]+`, que
casa. O passo **não mediava nada** — e quem o executasse veria uma saída
vazia e passaria por cima. A regex agora é a do workflow.

---

## F4 — `release-versioning-audit` passo 6: lia a versão errada e acusava drift falso

**Classe:** procedimento falso-positivo · **Status:** **corrigido neste PR**

### O que foi medido

Dois defeitos no mesmo passo:

**(1) lia o número errado.** `grep -oE "[0-9]+\.[0-9]+\.[0-9]+" docs/MONOREPO.md | tail -1`
pega a **última** versão do arquivo inteiro — e a tabela de histórico fica
**depois** do footer:

```bash
$ grep -oE "[0-9]+\.[0-9]+\.[0-9]+" docs/MONOREPO.md | tail -1
1.12.0          # <- linha 296 (tabela), não o footer (linha 277 = 1.14.0)
```

**(2) comparava doc com tag**, o que acusa drift no estado **normal**: antes do
release a doc está sempre à frente da tag. Rodado no tree consistente:

```text
✗ DRIFT: docs declaram 1.12.0, tag é 1.11.0
```

— num momento em que os seis arquivos concordavam. E o passo só olhava **1 dos
6** arquivos, o mesmo furo do F2.

**Correção:** extrai a versão do **footer** dos **seis** arquivos e compara com
a tag pela direção certa ("à frente", não "igual"). Rodado agora:

```text
docs/MONOREPO.md=1.14.0 … README.md=1.14.0
✓ docs (1.14.0) à frente da tag (1.11.0) — estado normal pré-release
```

---

## F5 — `openapi-audit` passo 2: diff de formatos diferentes e premissa falsa

**Classe:** procedimento falso-positivo · **Status:** **corrigido neste PR**

### O que foi medido

O passo comparava o lado do DTO (`arquivo: campo: tipo;`) com o lado do
Prisma (`campo`) — **formatos diferentes**. O diff acusava 100 linhas e a
regra escrita ("DTO deve ser subset — campos em DTO que não existem em Prisma
= finding DRIFT") era **incapaz de ser lida**: as duas pontas nunca se
encontram.

E a premissa é **falsa neste codebase**: a API expõe campos que não são coluna,
por design. Medido, os 13 campos de DTO ausentes do Prisma:

| grupo | campos |
|---|---|
| alias do schema | `nome`→`name`, `senhaHash`→`passwordHash` |
| só na API | `accessToken`, `refreshToken`, `expectedVersion`, `isDeleted`, `limit`, `nextCursor`, `perfilEfetivo`, `agora`, `novoEmail`, `novoNome`, `senha` |

**Nenhum é erro** — e o passo, como estava, reportaria 13 findings falsos em
toda auditoria (ou seria ignorado, e aí não mede nada).

**Correção:** os dois lados normalizados para o nome do campo, e uma lista
declarada de aliases + campos só-da-API: o que sobra é o drift real. Rodado
agora: **vazio** (nenhum drift), em vez de 13 falsos.

---

## F6 — `updated` mente em 2 skills

**Classe:** metadado falso · **Status:** **corrigido neste PR**

| skill | declarava | reality |
|---|---|---|
| `multi-tenant-audit` | `updated: 2026-10-16` | arquivo **criado** em 2026-10-18 (`176c5f2`) — a data antecede o próprio arquivo |
| `prisma-audit` | `updated: 2026-10-08` | modificado em 2026-10-13 (`e8ed335`, +40/−8) |

Corrigido para a data real do último commit.

---

## F7/F8/F9/F10 — consistência (observações, não violações)

Nenhuma destas é violação de convenção: **não existe regra que as obrigue**.
Levo como pontos para a conversa, não como defeito.

- **F7 — 10 skills sem `version`/`updated`:** `agents-coordinate`,
  `ddd-hexagonal-validation`, `demand-archiving`, `graphify`,
  `learning-observation`, `retrospective-capture`, `review-routing`,
  `specialist-routing`, `state-aware-planning` (4 delas trazem `type:`/`tools:`
  no lugar). As outras 13 declaram os dois campos.
- **F8 — 11 skills sem o cabeçalho `Quem invoca`/`Quando invocar`:** é o padrão
  de 13 das 23 (e o `AGENTS.md` §3.2 usa "Quem invoca" como coluna), mas não é
  regra escrita.
- **F9 — 6 `description` acima de 400 caracteres** (`multi-tenant-audit` 500,
  `ui-craft` 468, `ui-modes` 443, `ui-break` 423, `docker` 418,
  `ui-review` 402). A description é paga a cada carga da skill; o teto de 60
  caracteres é do `hermes-agent`, não deste repo.
- **F10 — `findings-orchestration` com 298 linhas**, contra o teto de 300.

---

## F11 — o instrumento que falta: nada roda as procedures das skills de auditoria

**Classe:**defesa em profundidade (doença de fundo) · **Status:** `viva`

**O que foi medido:** as 5 skills de auditoria (`prisma-audit`,
`openapi-audit`, `otelcol-audit`, `docker-prod-audit`,
`release-versioning-audit`) são **procedimentos shell determinísticos**. Nada
no CI os executa. Consequência medida: **três dos passos que rodei estavam
quebrados** (F3, F4, F5) — e nada reclamou, porque a skill só quebra quando
alguém a executa, e ninguém a executa há semanas.

A doutrina do repo já diz isso: *"Regra sem instrumento é defeito"* e
*"regra que só existe em prosa é defeito"* ([`guard-classes.md`](../specs/conventions/guard-classes.md)).
As skills de auditoria são a versão em prosa dessa regra — e o F3/F4/F5 é a
prova de que ela precisa do mesmo tratamento.

**Recomendação (não implementada aqui):** um gate que **execute** os passos
mecânicos das skills de auditoria — o mesmo formato dos gates que já existem
(`check-*` com `ok/errors` e uma spec que prende o denominador). O
`check-version-footers` já cobre parte do `release-versioning-audit` (F2); o
passo 6 da skill e o gate medem a mesma classe por caminhos diferentes, e a
divergência entre os dois é o que produziu o drift que ninguém viu.

---

## Inventário medido das 23 skills

`linhas` = `wc -l` do `SKILL.md` · `refs` = quantos arquivos (agents, skills,
`AGENTS.md`, `WORKFLOWS.md`) mencionam a skill · `fm` = campos do frontmatter.

| skill | linhas | fm | refs | notas |
|---|---|---|---|---|
| `agents-coordinate` | 149 | name, description | 2 | sem `version`/`updated`; sem cabeçalho |
| `ci-defense-in-depth` | 248 | + type, tools | 8 | sem `version`/`updated`; 48 linhas do teto |
| `ddd-hexagonal-validation` | 167 | name, description | 6 | sem `version`/`updated`; sem cabeçalho |
| `demand-archiving` | 195 | name, description | 2 | sem `version`/`updated`; sem cabeçalho |
| `docker` | 210 | + version, updated | 16 | `description` com 418 chars |
| `docker-prod-audit` | 162 | + version, updated | 4 | — |
| `findings-orchestration` | 298 | + version, updated | 3 | **2 linhas do teto** |
| `graphify` | **739** | name, description | **0** | **F1** — órfã, inglês, >300 |
| `learning-observation` | 167 | + type | 2 | sem `version`/`updated`; sem cabeçalho |
| `motion` | 203 | + version, updated | 8 | — |
| `multi-tenant-audit` | 181 | + version, updated | 2 | `description` com 500 chars; `updated` corrigido |
| `openapi-audit` | 143 | + version, updated | 4 | **F5** corrigido |
| `otelcol-audit` | 150 | + version, updated | 4 | — |
| `prisma-audit` | 172 | + version, updated | 4 | `updated` corrigido |
| `release-versioning-audit` | 176 | + version, updated | 4 | **F3/F4** corrigidos |
| `retrospective-capture` | 180 | + type | 7 | sem `version`/`updated`; sem cabeçalho |
| `review-routing` | 98 | name, description | 9 | sem `version`/`updated`; sem cabeçalho |
| `specialist-routing` | 123 | name, description | 8 | sem `version`/`updated`; sem cabeçalho |
| `state-aware-planning` | 274 | + type | 3 | sem `version`/`updated`; sem cabeçalho |
| `ui-break` | 244 | + version, updated | 8 | `description` com 423 chars |
| `ui-craft` | 190 | + version, updated | 9 | `description` com 468 chars |
| `ui-modes` | 121 | + version, updated | 7 | `description` com 443 chars |
| `ui-review` | 123 | + version, updated | 9 | `description` com 402 chars |

## O que NÃO foi verificado

- A **prosa** e o critério editorial de cada skill: não há como medir "o passo
  3 está bem escrito". Verifiquei **procedimento** (comando que roda) e
  **conformance** (frente às convenções), não qualidade de texto.
- As 4 skills de UI e as de agente (`agents-coordinate`, `review-routing`,
  `specialist-routing`) foram lidas no formato, não reexecutadas: os passos
  delas dependem de navegador e de dispatch de agent.
- `docker-prod-audit` e `otelcol-audit` exigem Docker/Collector no ar — não
  rodados neste ambiente.
