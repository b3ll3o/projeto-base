# Plano — issue #149: os instrumentos (e as declarações) que a camada de binding ainda não tem

> Data: 2026-11-09 · Branch: `feat/issues-149-instrumentos-da-camada-de-binding`
> Issue: [#149](https://github.com/b3ll3o/projeto-base/issues/149) · PR: a abrir
> Origem: 5 achados (F1–F5) verificados no `main` @ `108e82a`.

## O que este plano é

A issue #149 lista **cinco pontos** que sobraram depois do PR #148. Cada um
deles é uma **lacuna declarada** — ou um controle que não existe, ou um
controle que existe e não é vigiado. Este plano fecha os cinco.

Nenhum deles é P0. Nenhum deles é estilo. Todos são, na linguagem do repo:
**regra sem instrumento é defeito** (AGENTS.md §1.2) e **doc que mente é
defeito P0** (mesma seção).

### O estado real que a análise mediu (e a issue não)

| Fato | Medido em |
|---|---|
| O `check-skill-coverage.ts` **não está em `main`** — ele chega com o PR #148, que está **OPEN** | `gh pr view 148` |
| `main` tem **21** wrappers de skill (não 29) e **3** wrappers de agent | `ls .claude/skills/*/SKILL.md \| wc -l` |
| **Já existem 2 divergências de conteúdo em `main`**: a skill `docker` e o agent `documentation-specialist` | `diff` wrapper↔canônico |
| O `preflight` de `main` está **VERMELHO**: 1 gate, 2 erros | `pnpm ci:preflight` → `EXIT=1` |
| O `check-memory-crystallization` roda **com o corpus da máquina** e acusa 2 memórias sem destinação | `.agents/runs/memory-triage.md` |
| A **metade repo-derivável** do mesmo gate está **verde**: 109 linhas, 0 alvo ausente, 0 âncora vencida | `findMissingTargets()` + `findStaleAnchors()` |
| As 4 exceções de dependência **continuam valendo** — o gate confirma 4/4 | `pnpm ci:preflight` |
| O total de advisories **mudou**: 43 → **41** (1 crítica, 3 altas, 32 moderadas, 5 baixas) | `pnpm audit --json \| jq '.metadata.vulnerabilities'` |

O achado F1 da issue diz "os 29 wrappers batem com o canônico". Isso é
verdade **na branch do PR #148** e falso em `main`: em `main` há 21 wrappers de
skill e 3 de agent, e **2 deles já divergiram** — o PR #147 trocou
`healthchecks via curl` por `healthchecks via node` no frontmatter canônico da
skill `docker` e **não tocou no wrapper**, e o agent `documentation-specialist`
perdeu as aspas duplas da `description`. Nenhum gate acusou, porque nenhum gate
comparava conteúdo. O instrumento que a issue pede já tem, portanto, um caso
real para pegar — e esse caso é o mesmo que a issue descreve como
"consequência real".

---

## As decisões que este plano toma

### D1 — A branch nasce de `main`, e o F1 vira um gate próprio

O PR #148 entrega o `check-skill-coverage` (a **existência** do wrapper, regra
`sem-binding`). Ele **não está em `main`** e o repo é trunk-based
([`git-workflow.md`](../../../.agents/specs/conventions/git-workflow.md)): toda
demanda nasce de `main` e chega por PR, sem empilhamento.

A issue aceita as duas formas: *"uma regra no `check-skill-coverage` (ou um
gate próprio)"*. Como `main` não tem aquele arquivo, o F1 vira
**`.tooling/scripts/ci/check-binding-canonico.ts`** — gate próprio, com
arquivo, spec, registro no preflight, linha no registro de dentes e linha no
catálogo humano. Ele é **independente** do #148: se o #148 mergear primeiro, os
dois convivem (existência × conteúdo); se este PR mergear primeiro, o #148
continua válido.

A comparação **não** é sobre o `check-skill-coverage` porque aquele gate mede
a **existência** do wrapper, e o #148 já o cobre.

### D2 — O F3 fecha pela **declaração**, não pelos 25 wrappers

A issue: *"decidir — ou fechar a cobertura, ou registrar a escolha como lacuna
declarada num lugar canônico"*. A escolha registrada hoje diz que só os
orquestradores e o dono da doc têm wrapper porque *"o frontmatter deles não tem
nada de específico do Claude Code"*.

**Essa justificativa é falsa, e o repo a mede.** MEDIDO: os **28** agents
canônicos declaram `tools:` — `task-manager` tem `tools: Read, Write`,
`code-reviewer` tem `tools: Read, Glob, Grep, Bash`. O `tools` governa o
comportamento de **todo** agent: sem ele, o subagent herda a pool inteira da
conversa, e o próprio `.claude/README.md:63` chama isso de *"um desvio
silencioso"*.

Então o motivo real do piloto é **ruído de descoberta** — 28 definições de agent
no contexto do Claude Code — e não segurança. Esse motivo é legítimo, mas
precisa estar escrito no **spec**, e não só no binding.

O plano **registra a escolha** (ADR-0008), corrige a justificativa falsa e
**não** cria 25 wrappers. Criar 25 wrappers seria desfazer uma decisão
deliberada do dono do repo por um achado de `severity:p2` — e o PR #148, que é
do mesmo dono, fechou a cobertura de **skills** (29/29) e deixou a de
**agents** parcial de propósito. Fechar a cobertura de agents aqui seria
inventar um escopo que a issue não pediu.

### D3 — O F4 fecha pela **divisão do escopo do gate**, não por versionar o corpus

A issue oferece: *"versionar o corpus (mesmo mínimo), ou declarar o gate como
humano no catálogo"*.

O corpus tem **161 arquivos / 655 KB** e vive em `$HOME`. Versioná-lo é
"decisão de outro tamanho" — como a própria
[`retrospective-capture.md`](../../../.agents/specs/conventions/retrospective-capture.md)
já diz. E o gate **já tem** a metade que o CI pode medir:
`findMissingTargets()` e `findStaleAnchors()` recebem só `repoRoot` + as linhas
do ledger, e rodam **verde hoje** (109 linhas, 0 erro).

O defeito é que o gate sai por `skipped` **antes** de chegar nelas — o corpus
ausente (situação do CI) mata a medição que o CI poderia fazer. O plano
**reordena**: o corpus ausente deixa de ser saída antecipada e vira
*"a metade do corpus não rodou"*; a metade repo-derivável roda nos **dois**
lugares. O CI passa a vigiar a **âncora** e o **alvo** do ledger — a parte do
§7.5 que é derivável do repo.

A reconciliação **corpus ↔ ledger** (a evaporação) continua camada 1 local, e
isso é **declarado no catálogo** com o motivo — que é a segunda metade da
mesma opção da issue.

### D4 — O F2 fecha com **um registro versionado + uma regra no gate que já existe**

O precedente que a issue nomeia (`excecoes-de-dependencias.json`) usa
`verificacao` **declarativa** — regex sobre paths versionados — e nunca shell
livre, porque o registro é versionado e um PR pode editá-lo.

Os 15 motivos **não são homogêneos**: 3 são de **ferramenta ausente** (`yq`),
6 são de **API externa** (GitHub), 1 é de **ref local**, 1 é de **banco**,
1 é de **Docker**, 1 é de **custo**, 1 é de **dependência de passo**, 1 é de
**efeito colateral** e 1 é de **recursão**. Nenhuma semântica única de
"ausência de padrão no repo" cobre os 15 com honestidade — e uma verificação
inventada para caber no molde seria o
[gate que prescreve o conserto errado](../../../.agents/specs/conventions/guard-classes.md).

A semântica que cobre os 15 com honestidade é outra: **o motivo continua
valendo se o bloco ainda usa a coisa que o motivo nomeia.** O motivo é uma
prosa no bloco; a verificação é uma **âncora** — o comando que o bloco roda e
que faz o skip existir. `yq -P ".services.$svc"` no motivo do `yq`;
`pnpm ci:preflight` no motivo da recursão; `gh issue create` no motivo da API.

Isso é **repo-derivável** (o bloco é um arquivo versionado), **sem shell**,
**sem efeito colateral**, e é a mesma forma dos outros registros de exceção do
repo: *exceção que não exclui mais nada é documentation lie*
([`documentacao.md` §6](../../../.agents/specs/conventions/documentacao.md),
[`check-test-set-covered`](../../../.tooling/scripts/ci/check-test-set-covered.ts)).

### D5 — O F5 fecha com a **medição refeita**, não com a remoção de exceções

As 4 exceções **continuam valendo** — o gate roda a `verificacao` de cada uma a
cada preflight e confirmou 4/4. Nenhuma pode sair da lista. O que envelheceu
foi o **número**: 43 advisories → **41**. A claim vive no registro versionado,
que é o dono do fato, e vai ser corrigida com a data de hoje e o comando que a
reproduz.

---

## As 6 ondas

### Onda 1 — F1: o gate que compara o wrapper com o canônico

**TDD: spec primeiro (RED), depois o gate (GREEN).**

1. `.tooling/scripts/ci/check-binding-canonico.spec.ts` (novo) — a spec fixa:
   - a comparação é **byte a byte**, da **linha inteira** (`name:` e
     `description:`);
   - `name` e `description` são **obrigatórios** no wrapper de skill;
   - `tools` é **obrigatório** no wrapper de agent (sem ele, o subagent herda
     a pool inteira — o desvio silencioso do `.claude/README.md:63`);
   - **todo campo** que o wrapper declara tem que bater com o canônico
     (é o que pega a re-serialização: aspas, aspasperdidas, vírgula, truncamento);
   - wrapper **sem canônico** é erro (o binding aponta para nada);
   - a mensagem traz **o arquivo e a linha divergente**;
   - a spec roda contra **os arquivos reais** do repo, não só contra fixture.
2. `.tooling/scripts/ci/check-binding-canonico.ts` (novo) — o gate.
3. **Consertar os 2 wrappers que divergem** (o gate entra vermelho, e o
   conserto é literal — a linha canônica vai para o wrapper, byte a byte):
   - `.claude/skills/docker/SKILL.md:3` — a `description` está com
     `healthchecks via curl`; a canônica (`.agents/skills/docker/SKILL.md:5`)
     diz `healthchecks via node (sem depender de pacote instalado)`;
   - `.claude/agents/documentation-specialist.md:3` — a `description` perdeu as
     aspas duplas da canônica.
4. **Registrar o gate** nos 4 lugares obrigatórios:
   `preflight-gates.ts` (`PREFLIGHT_CHECKS`), `preflight.ts` (mapa `RUNNERS`),
   o **registro de dentes** (`ci-defense-in-depth-dentes.md`) e o **catálogo
   humano** (§Tabela de Checks de `ci-defense-in-depth.md`) — o
   `check-teeth-registry` reconcilia os 4 e reprova se um faltar.
5. **Dente do gate**: o `check-skill-coverage` do #148 é o modelo de estrutura;
   o **diferencial** é o caso real — o gate novo acusa os 2 wrappers que já
   divergem em `main` (e o conserto os deixa verdes).

### Onda 2 — F2: `verificacao` por bloco `[gate: skip]`

1. `.tooling/scripts/ci/excecoes-de-skills-audit.json` (novo) — 15 entradas,
   uma por bloco `skip`, no formato do precedente:
   `{ skill, motivo, verificacao: { tipo: "no-bloco", padrao } }`.
   O `motivo` casa por **substring** do motivo capturado no bloco (o do
   `documentation-audit` ocupa 2 linhas e o registro guarda a 1ª); o `padrao`
   é a **âncora** — o comando que o bloco roda e que faz o skip existir.
2. `.tooling/scripts/ci/check-audit-skills.spec.ts` — a spec fixa as 4 regras:
   - **todo** bloco `skip` tem entrada no registro (skip sem verificação é
     dívida silenciosa);
   - **toda** entrada casa com **exatamente um** bloco real (entrada que não
     casa = a exceção não exclui nada; duas que casam = registro ambíguo);
   - a `verificacao` roda: a âncora tem que estar no corpo do bloco (o motivo
     parou de valer → reprova);
   - o `motivo` da entrada tem que continuar no motivo do bloco (o motivo
     mudou → o registro tem que mudar junto).
3. `.tooling/scripts/ci/check-audit-skills.ts` — a regra nova, no mesmo lugar
   onde o `skip` já é pulado (`check-audit-skills.ts:350`).
4. **Dente**: mutação — trocar o `padrao` de uma entrada por um que não casa
   derruba a spec; e um bloco `skip` **novo**, sem entrada, derruba a spec.

### Onda 3 — F1+F3: o registro canônico da camada de binding

1. `docs/adr/0008-camada-de-binding-do-claude-code.md` (novo) — o ADR:
   - **Contexto**: a pasta `.claude/` não é fonte de verdade; o que o Claude
     Code precisa é do *frontmatter*, e ele é copiado do canônico;
   - **Decisão 1 (F1)**: `name` e `description` são copiados como **linha
     inteira**, nunca re-serializados; `tools` é obrigatório no wrapper de
     agent; `type`/`version`/`updated` são deliberadamente não copiados nas
     skills;
   - **Decisão 2 (F3)**: a cobertura de agents é **parcial por decisão** — 3 de
     28, e o motivo é **ruído de descoberta**, não ausência de `tools` (que
     existe nos 28); o que vale é que um agent **sem** wrapper não é
     exposto ao Claude Code, e um agent **com** wrapper tem que ser fiel ao
     canônico — o que o gate passa a medir;
   - **Consequências**: o gate passa a ser a fonte; a lista de 3 é um fato
     versionado que o gate pode reconciliar depois.
2. `.claude/README.md` — a seção **"Nenhum gate compara wrapper com canônico"**
   (que hoje declara a lacuna) sai, e a **justificativa falsa** do piloto
   ("o frontmatter deles não tem nada de específico para o Claude Code") sai
   junto; os dois pontos passam a apontar para o ADR.
3. `docs/integrations/claude-code.md:36` — o exemplo do wrapper de agent ensina
   `description: Generic code reviewer (from .agents/agents/code-reviewer.md)`,
   que é **exatamente a re-serialização que o contrato proíbe**. Sai.

### Onda 4 — F4: o gate que para de ser um skip seco

1. `.tooling/scripts/ci/check-memory-crystallization.spec.ts` — a spec fixa:
   - **sem corpus**, o gate **não** sai por `skipped`: ele roda a metade
     repo-derivável (alvo + âncora) e reprova se ela errar;
   - **com corpus**, as 4 direções rodam, como hoje;
   - corpus de 0 com o diretório presente continua sendo **erro** (a classe 5
     do `guard-classes.md`).
2. `.tooling/scripts/ci/check-memory-crystallization.ts` — a reordenação: a
   saída antecipada por "diretório de memória ausente" vira "a metade do
   corpus não rodou", e as 2 direções repo-deriváveis passam a rodar **antes**
   dela.
3. `.agents/runs/memory-triage.md` — as **2 linhas** que faltam para as 2
   memórias sem destinação (`as-duas-camadas-precisam-medir-o-mesmo-valor`,
   `papel-postgres-e-do-cluster-nao-do-banco`). São decisões de destino, e o
   destino delas é o que o ledger guarda.
4. **O catálogo**: §Tabela de Checks de `ci-defense-in-depth.md`, o registro de
   dentes, e a convenção `retrospective-capture.md` passam a dizer o que
   passa a ser verdade — *a âncora e o alvo são medidos nos dois lados; a
   reconciliação com o corpus é camada 1 local, porque o corpus vive em
   `$HOME`*.

### Onda 5 — F5: a claim que envelheceu no registro de dependências

1. `.tooling/scripts/ci/excecoes-de-dependencias.json` — o `_comoUsar` passa a
   declarar a medição de **hoje** (41 advisories: 1 crítica, 3 altas, 32
   moderadas, 5 baixas — com o comando), e diz que **nenhuma** das 4 exceções
   pode sair da lista, porque as 4 `verificacao` continuam valendo.
2. Nenhuma exceção sai da lista — as 4 continuam com `motivo` e `verificacao`.

### Onda 6 — Verificação, revisão, PR

1. `pnpm ci:preflight` — **0 erro** (o baseline de `main` é 2).
2. `pnpm tooling:test` — a suíte do harness.
3. `pnpm ci:local` — o gate de 3 camadas do repo (lint, tipos, unit,
   cobertura, integração, e2e, boot).
4. Revisão adversarial do diff (2 rodadas, revisor ≠ implementador).
5. `git commit` + `git push` + PR com o corpo medido.

---

## O que a execução mudou neste plano

> MEDIDO 2026-11-09, depois de executar. O plano é o que foi **decidido**; esta
> seção é o que a execução **corrigiu** — e a revisão adversarial que o repo
> exige.

### 1. Erros do plano, corrigidos

| O que o plano dizia | O que é verdade | Correção |
|---|---|---|
| "**1** divergência de conteúdo em `main`" | São **2**: a skill `docker` e o agent `documentation-specialist` (que perdera as aspas da `description`) | §"O estado real" corrigido |
| "os 15 motivos **não são homogêneos**" | Confirmado — e é por isso que a verificação é `no-bloco` (a âncora do motivo no corpo do bloco), e não `ausencia` de padrão no repo | Mantido |
| "a regra de `skip` sem verificação" | São **5** regras, não 4: skip sem entrada · entrada que não casa · âncora que sumiu · motivo que mudou · registro ambíguo | Onda 2 atualizada |
| "o `check-audit-skills` mede os 15 blocos" | O gate lia o motivo (medindo o **comprimento**) e o **descartava** — `if (bloco.declaracao === 'skip') continue;` | Onda 2: a regra entra **no lugar do `continue`** |

### 2. Coisas que o plano não previu

- **O `check-audit-skills` não tinha bloco CLI.** `tsx
  .tooling/scripts/ci/check-audit-skills.ts` carregava o módulo e saía `0`
  sem medir nada — a armadilha que o repo chama de *gate sem bloco CLI roda
  como no-op*. O plano não tinha visto; a execução adicionou o bloco (6
  linhas).
- **"registro ausente → erro" tinha de ser condicional.** A primeira versão
  acusava o registro ausente mesmo em repo sem nenhum bloco `skip` — e a spec
  que monta um repo sintético ficou vermelha. A regra correta é: o registro é
  exigido **quando existe alguma exceção para verificar**.
- **Dois documentos bateram no teto de 300 linhas** (`.claude/README.md` e
  `retrospective-capture.md`) e foram condensados.
- **O `check-teeth-registry` lia a LINHA INTEIRA da §Tabela de Checks** — e o
  comentário do próprio arquivo diz que lê só a **primeira coluna**. A
  varredura da linha inteira é o que o comentário chama de "gate morto
  pareceria vivo". Medido: com ela, a linha do `check-binding-canonico`
  acusou `check-skill-coverage` (que chega com o PR #148 e ainda não está em
  `main`). **Corrigido**: a varredura passa a ser da primeira **célula** — o
  que continua pegando `` `review-routing` matrix lint ``, que tem o token no
  meio da célula. Um teste novo põe a regra.

### 3. O que a execução mediu

| Medida | Valor |
|---|---|
| Wrappers comparados pelo gate novo | **24** (21 skills + 3 agents), 0 divergência |
| Testes da spec do gate novo | **19**, com 5 mutações que caem (3, 2, 1, 1, 1) |
| Testes da spec do `check-audit-skills` | 24 → **34**, com 7 mutações que caem |
| Testes da spec do `check-memory-crystallization` | 33 → **36**, com 11 mutações que caem |
| Blocos `skip` reconciliados | **15** contra **15** entradas do registro |
| Memórias sem destinação (o vermelho de `main`) | **2 → 0** |
| Advisories | **43 → 41** (1 crítica, 3 altas, 32 moderadas, 5 baixas) |
| Diferenciais (árvore real plantada e restaurada) | **8 de 8**: wrapper com `description` re-serializada (mesmo valor, byte diferente) · wrapper com valor diferente · wrapper com campo que o canônico não declara · wrapper de skill com `tools` · registro com uma entrada a menos · `padrao` que não compila · âncora que não está no corpo |
| `pnpm ci:preflight` | 2 erros → **0** |
| `pnpm tooling:test` | **1295** testes verdes (402 + 893) |

---

## O que este plano NÃO faz

- **Não fecha a cobertura de agents** (D2) — a decisão é registrada, não
  desfeita.
- **Não versiona o corpus de memórias** (D3) — 161 arquivos / 655 KB é
  "decisão de outro tamanho", e a issue aceita a alternativa.
- **Não toca no `check-skill-coverage`** do PR #148 — o gate é outro, e os
  dois convivem.
- **Não reescreve o histórico** nem reabre o PR #147.
- **Não fecha a lacuna de `.claude/**` fora da matriz de review-routing**
  (`.claude/README.md:196`) — é outra pendência, e este PR toca `.claude/**`.

---

**Mantido por:** projeto-base contributors
