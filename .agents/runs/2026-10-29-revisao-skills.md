# Revisão das skills do projeto — 2026-10-29

> **Branch:** `feat/skill-find-skills` · **Base:** `origin/main` (`194d305`)
> **Origem:** pedido do usuário — (1) adicionar a skill `find-skills` (Vercel) ao
> projeto; (2) revisar **todas** as skills de `.agents/skills/`.
> **Método:** inventário mecânico das 23 skills que existiam na primeira passada
> (frontmatter, tamanho, idioma, links, órfãs) + **execução real** das procedures
> das skills de auditoria. A segunda passada (F12–F21) re-mediu **25** skills —
> a `documentation-audit` entrou pelo merge do #129 e escapou da primeira.
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

**O que foi medido:** as 7 skills de auditoria (`prisma-audit`,
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

## F12–F22 — a revisão do PR #140 revisou o PR #140

**Classe:** varied (o que sobrou no próprio PR) · **Status:** todas
`corrigidas` neste PR — cada uma com medição, correção e, quando dava,
instrumento.

O inventário acima cobriu 23 skills. A revisão do PR #140 (o próprio PR) rodou
o mesmo método por cima do que já tinha sido escrito — e achou 9 defeitos,
incluindo 3 nos consertos anteriores. O comando de cada um está no texto.

| # | Achado | Como se reproduz |
|---|---|---|
| F12 | a revisão cobriu **23 de 25** skills | `ls .agents/skills/*/SKILL.md \| wc -l` → 25 |
| F13 | a `documentation-audit` (do merge do #129) tinha **5 blocos sem declaração** | `grep -c '```bash' .agents/skills/documentation-audit/SKILL.md` |
| F14 | o passo 5.1 dela invoca o preflight → **recursão** se o gate a executar | `grep -A2 '5.1' .../documentation-audit/SKILL.md` |
| F15 | o conserto do F5 criou um `sed` de **janela negativa** | `sed -n "-6,14p" f` → `sed: invalid option -- '6'` |
| F16 | o gate lia o `>` de uma **comparação** como redirect | o gate acusou o próprio conserto do F15 |
| F17 | o gate não tinha **orçamento total** (pior caso 48 min vs 5 min do job) | `TIMEOUT_POR_PASSO_MS × 24` vs `timeout-minutes: 5` |
| F18 | o gate tratava um passo **morto** (código nulo) como aprovado | `exec.codigo === null` não estava na lista de erro |
| F19 | a mensagem de erro do gate ensinava o **formato antigo** da declaração | `grep '> \*\*Gate:'` → 3 lugares |
| F20 | a `find-skills` afirmava "24 skills e 27 agents" (o disco tem 25 e 28) | `ls .agents/agents/*.md \| wc -l` |
| F21 | `.agents/runs/findings-*/` **não é ignorado** — o `findings-orchestration` escreve lá | `git status` mostra `?? .agents/runs/findings-…/` |
| F22 | o README dizia **24 skills** (o disco tem 25) e a `find-skills` ficou **sem wrapper** no `.claude/` | `grep '24 skills' README.md` |

### F15 — o conserto do F5 criou um defeito novo

O passo 3.2 do `openapi-audit` ganhou uma janela de −10/+10 linhas em volta do
decorator de rota, para o matcher achar `@ApiOperation` perto dele. Mas
`sed -n "$((lineno-10)),..."` com `lineno < 10` gera um **início negativo**:

```
$ sed -n "-6,14p" arquivo
sed: invalid option -- '6'
```

**Medido:** o decorator de rota mais alto do repo está na linha **35** — então
o defeito era **latente**, não vivo: nenhum controller atual dispara. Mas
qualquer controller novo com a rota nas 10 primeiras linhas acusaria um
`@ApiOperation` faltando que **existe** (o contexto viria vazio).

**Correção:** a janela começa em 1 (`ini=$(( lineno > 10 ? lineno - 10 : 1 ))`).

### F16 — o gate acusou o próprio conserto (e tinha razão)

O conserto do F15 introduziu um `>` — o da comparação no ternário. O denylist
do gate, que casava QUALQUER `>`, leu como redirect para o arquivo `"10"` e
**recusou o conserto**. O defeito era do gate, não do conserto.

**Correção:** o que separa redirect de comparação é o **alvo**: um redirect
aponta para um caminho (`saida.txt`, `/tmp/x`, `$VAR`); uma comparação aponta
para um valor (`10`, `b`). O alvo precisa ter ponto, barra ou cifrão — e não
pode ser só um número.

### F17/F18 — o gate podia passar 48 min (o job tem 5)

O passo tinha timeout de 120 s e são 29 passos: pior caso de **48 min**, num
job de `preflight` que tem `timeout-minutes: 5` e roda com ~40 outros gates.
A falha apareceria como "o job estourou o tempo", não como "o passo travou".

**Correção:** 60 s por passo e um **orçamento total de 120 s** para o gate
inteiro; quando o orçamento acaba, o gate **para e reporta** onde parou — um
gate que sai em silêncio depois de rodar metade do que devia é pior do que um
gate que falha dizendo onde parou.

O F18 é o caso irmão: um passo que estoura o buffer do `spawn` (8 MB) morre
com **código nulo** — e código nulo não está na lista de sucesso, mas também
não é um código de crash. Sem guarda, o gate tratava o passo como aprovado
(a saída parcial é não vazia).

### F12/F13/F14 — a skill que entrou pelo merge do #129

O inventário rodou antes do merge do #129; a `documentation-audit` veio com ele
e **escapou da revisão**. Os 5 blocos dela estavam sem declaração — e o 5.1
invoca `pnpm ci:preflight`: dentro do gate seria **recursão** (o preflight
chama o gate, o gate chama a skill, a skill chama o preflight).

**Correção:** os 5 blocos declarados (4 `run`, o 5.1 `skip` com o motivo da
recursão, e o 5.2 — que era um segundo comando dentro do bloco do 5.1 — como
bloco próprio `run`), e a `documentation-audit` entrou na lista do gate, que a
spec passa a **prender em 7**. Uma skill de auditoria nova não entra mais no
repo sem ser auditada.

### F22 — a contagem que o próprio PR desatualizou, e o wrapper que faltava

O PR #140 adiciona uma skill — e por isso invalida a contagem do próprio
README, que passou a dizer "24 skills" com 25 no disco. E a `find-skills`, por
ser uma skill de **descoberta** (não carregada por nenhum agent — o AGENTS.md a
registra como "skill de descoberta"), é justamente a que **precisa** do wrapper
em `.claude/skills/`: é o que faz o Claude Code a descobrir.

O padrão do repo é claro: as skills que um agent carrega 1:1 (as de UI,
`multi-tenant-audit`, `learning-observation`) não têm wrapper; as de
descoberta, têm.

**Correção:** o wrapper da `find-skills` (30 linhas, `name`/`description`
copiados literalmente do frontmatter canônico, sem procedimento) e as contagens
do `.claude/README.md` (16 de 24 → **17 de 25**) e do `README.md` (24 → 25
skills).

### F21 — o artefato de máquina que o `git add -A` commitaria

O `findings-orchestration` (do #129) escreve em
`.agents/runs/findings-<timestamp>/` a cada execução do preflight. Não há
regra no `.gitignore` para esse caminho — e `.agents/runs/` guarda, por
convenção, **registros datados** que são versionados de propósito. O
resultado medido: rodar o preflight deixava `?? .agents/runs/findings-…/` no
`git status`, pronto para o próximo `git add -A`.

**Correção:** `.agents/runs/findings-*/` entra no `.gitignore` — o registro
datado é o `*.md` que o agent escreve com nome; a pasta é saída de máquina.

### F19/F20 — a documentação que ensina o formato errado

A mensagem de erro do gate ("declare antes do bloco: `> **Gate:** ...`")
ensinava o formato **antigo** — o parser só lê o marcador **dentro** do bloco.
Quem obedecesse a mensagem jamais passaria. O cabeçalho do gate e o relatório
do instrumento repetiam o mesmo erro.

O `find-skills` afirmava "`.agents/skills/` tem 24 skills e 27 agents" — o
disco tinha **25 e 28** (a contagem envelhece a cada skill nova). Agora o texto
diz 25 e 28 **com a data da medição**, e o comando para remedir.

## Inventário medido das 25 skills

`linhas` = `wc -l` do `SKILL.md` · `refs` = quantos arquivos (agents, skills,
`AGENTS.md`, `WORKFLOWS.md`) mencionam a skill · `fm` = campos do frontmatter.

| skill | linhas | fm | refs | notas |
|---|---|---|---|---|
| `agents-coordinate` | 149 | name, description | 2 | sem `version`/`updated`; sem cabeçalho |
| `ci-defense-in-depth` | 248 | + type, tools | 8 | sem `version`/`updated`; 48 linhas do teto |
| `ddd-hexagonal-validation` | 167 | name, description | 6 | sem `version`/`updated`; sem cabeçalho |
| `demand-archiving` | 195 | name, description | 2 | sem `version`/`updated`; sem cabeçalho |
| `documentation-audit` | 190 | name, version, updated, description | 1 | 5 blocos, todos declarados depois do F13 |
| `docker` | 210 | + version, updated | 16 | `description` com 418 chars |
| `docker-prod-audit` | 162 | + version, updated | 4 | — |
| `find-skills` | 161 | name, version, updated, description | 1 | criada neste PR; a contagem de skills envelhece (F20) |
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
