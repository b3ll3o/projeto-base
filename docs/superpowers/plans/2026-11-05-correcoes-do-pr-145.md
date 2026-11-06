# Plano — correções do PR #145 (4 skills de terceiro + o gate `check-merge-markers`)

> Branch: `feat/skills-de-terceiros-adaptadas` · Base: `origin/main` (`027095b`) · Head: `0d5ac9f`
> Data: 2026-11-05 · Estado inicial: worktree limpo, preflight **0 erro**, `pnpm tooling:test` **719/719**
> Revisão publicada: [#issuecomment-6668691919](https://github.com/b3ll3o/projeto-base/pull/145#issuecomment-6668691919)

## §1 O que este plano corrige

A revisão do PR #145 achou defeitos em **dois grupos**: o gate novo e as 4 skills
novas. Cada item abaixo foi **reproduzido** (comando + saída), não inferido.

### Grupo A — o gate `check-merge-markers` (código)

| # | Defeito | Evidência | Gravidade |
|---|---|---|---|
| A1 | **Falha aberto**: `git` indisponível ⇒ `{ok:true, errors:[]}` **sem `skipped`** ⇒ o painel imprime o mesmo `✓` de uma varredura completa | `checkMergeMarkers({repoRoot:'/tmp/nogit'})` → `ok=true skipped=undefined` | P0 |
| A2 | **44 arquivos versionados fora do escopo**: a allowlist de 12 extensões pula `.sql`, `.prisma`, `Dockerfile`, `.husky/*`, `.dockerignore` | repo temporário com marcador em `x.prisma`/`y.sql`/sem extensão → gate acusa **só** o `.ts` de controle | P0 (doc que mente) + cobertura |
| A3 | **O `=======` de heading setext vira falso positivo** quando o `<<<<<<< ` não é fechado (o bloco "grudado" envenena o resto do arquivo) | `'<<<<<<< HEAD\nmeio\n\n# Título\n=======\n'` → 2 achados, o 2º é o underline legítimo | P1 |
| A4 | **`git ls-files` sem `--deduplicate`** devolve o path 3× num conflito real (3 estágios) → o mesmo achado sai 3 vezes | `git merge` real → `git ls-files` = `f.md` ×3; gate = **9** erros em vez de 3 | P1 |
| A5 | **O gate dispara no fonte dele mesmo** (classe 3): o exemplo do JSDoc é byte-a-byte o que o gate caça; só não dispara por acidente de formatação (` * `) | JSDoc dedentado → gate acusa o próprio `check-merge-markers.ts` | P1 |
| A6 | **BOM esconde o 1º marcador** (`readFileSync` não remove BOM) | conteúdo com BOM → o `<<<<<<<` de abertura **não** é detectado | P2 |
| A7 | **`git ls-files` devolve path relativo ao `repoRoot`** ⇒ com `repoRoot` = subdiretório o gate mede **menos** e não diz | `repoRoot='<repo>/.tooling'` → 0 erros, com marcador em `docs/x.md` invisível | P2 |
| A8 | **Erro de leitura engolido**: arquivo versionado ilegível (deleção não staged, symlink quebrado) → `catch { continue }` sem diagnóstico | idem — o gate não diz nada | P2 |

### Grupo B — a linha de dentes do gate (registro)

| # | Defeito | Evidência | Gravidade |
|---|---|---|---|
| B1 | O nível declarado é **`mutação`**, mas a prova descrita é literalmente o que a legenda do mesmo arquivo chama de **`diferencial`** (plantar no repo real e afirmar vermelho). O próprio arquivo tem o precedente (`check-dockerfile-hardening`, 2026-10-16). | `dentes.md:83` vs legenda `:19-20` | P0 |
| B2 | O número "**3 achados**" **não tem comando** que o reproduza — contra `AGENTS.md §1.2` item 4 | as outras 42 linhas dão comando rodável; esta dá prosa | P0 |

### Grupo C — a doc que a branch tocou (e a deixou mentindo)

| # | Defeito | Evidência | Gravidade |
|---|---|---|---|
| C1 | `AGENTS.md:142` afirma *"única relação 1:N do repo"* — a branch criou a **segunda** (o `orchestrator` com 2 skills) | 1 agent com skills em `main` → **2** em `HEAD` | P0 |
| C2 | `find-skills/SKILL.md:28` diz *"`.agents/skills/` tem **25** skills"* — o disco tem **29**; a branch adicionou exatamente as 4 que faltam | `ls .agents/skills/*/SKILL.md` + `wc -l` = 29 | P0 |
| C3 | `find-skills/SKILL.md` §5.1 (passo 5) e §8 mandam registrar em **`AGENTS.md §5`** — §5 é *"Workflows Padrão"*; o índice de skills é **§3.2** | `grep -n '^## §'` → §5 = linha 191; a nota de skills = linha 159 (§3.2) | P0 |
| C4 | `README.md:21` diz *"medidas do disco em **2026-10-29**"*; o rodapé que a branch reescreveu diz *"re-medido do disco em **2026-11-03**"* — duas datas para as mesmas contagens. Em `main` as duas diziam 2026-10-29: **a branch criou a contradição**. | `git show origin/main:README.md` | P0 |
| C5 | `.claude/README.md:265` diz *"# skills: 16"*; o comando ao lado devolve **21**. A branch atualizou **três** outros números da mesma file e deixou este. | `ls .claude/skills \| wc -l` = 21 | P0 |
| C6 | `dentes.md:32` diz *"MEDIDO na tabela: **23** linhas = **21** mutação + …"* — a tabela tem **44** (42 mutação + 1 diferencial + 1 controle positivo). A branch **acrescentou** uma linha a essa tabela sem re-medir. | contagem por coluna | P0 |
| C7 | `ci-defense-in-depth.md:140` diz *"a tabela de dentes (**36 linhas**…)"* e *"os **nove** comandos de mutação"* — a tabela tem 44 e o irmão (`dentes.md:99`) diz **onze**. Duas files do mesmo repo discordando. | `grep -c '^# [0-9]*)'` = 11 | P0 |
| C8 | `dentes.md:32` e `ci-defense-in-depth.md:140` — a contagem da própria file | (mesma linha que C6/C7) | P0 |
| C9 | O `AGENTS.md §6` **não lista** `ci-defense-in-depth-pendencias-fechadas.md`, que está no índice irmão — e o `AGENTS.md:250` afirma *"Os dois índices são o mesmo índice"* | 23 rows no §6 vs 24 no README | P0 |
| C10 | `review-routing.md:32` mapeia o `ux-design-specialist` → **5** skills; o agent agora carrega **7** | a matriz não foi atualizada no mesmo PR | P1 |
| C11 | A compactação do `AGENTS.md` perdeu a cláusula *"— é carregada por ele, **não o substitui**"* (não sobrevive em lugar nenhum do repo) | `grep -rn "não o substitui"` → 0 | P2 |

### Grupo D — as 4 skills novas

| # | Defeito | Evidência | Gravidade |
|---|---|---|---|
| D1 | `handoff` afirma *"usa esse formato — não inventa outro"* e publica um **formato diferente**: perde `code_snippets` e `prior_outputs` (campos **estáveis** desde v1.0.0 em `dispatch.md`), inventa 2 campos, e troca o tipo de `success_criteria[]` e `on_failure{}` por prosa | `dispatch.md:75-84` vs `handoff/SKILL.md:29-56` | P0 (quebra o contrato de `AGENTS.md §1`) |
| D2 | `agent-browser` diz *"**Quem invoca:** … e o `code-reviewer`"* — mas `code-reviewer.md` **não lista nenhuma skill**. E o wrapper `.claude/skills/agent-browser/` diz **um** agent, o canônico diz **dois**. | `grep -n "skills/" .agents/agents/code-reviewer.md` → 0 | P0 |
| D3 | A memória do `ux-design-specialist` afirma que as 2 skills *"cobrem o upstream inteiro **sem repetir**"* — as **12** house rules do `ui-craft` têm contrapartida 1-a-1 em `design-taste-frontend/references/house-rules.md` | tabela lado a lado | P0 |
| D4 | `agent-browser` manda `npm i -g agent-browser` — **rede + escrita fora do repo**, exatamente o que o passo 1 da §5.1 (adicionado por esta branch) manda auditar; e a skill **não tem fallback** quando a CLI não está instalada (precedente: `graphify/SKILL.md:76`) | `grep -n "fallback\|não está instalad" agent-browser/SKILL.md` → vazio | P1 |
| D5 | `agent-browser` inventa um 2º jeito de subir a app (`pnpm --filter @projeto/api dev`), divergindo do runbook canônico (`pnpm dev`, `docs/como-rodar.md` §1.4) | os dois textos | P2 |
| D6 | `design-taste-frontend` **trunca** a citação do `ui-craft` (pula "Num site de marketing o `h1` pode ser `8vw`." e a oração final) e a apresenta como literal | `SKILL.md:30-32` vs `ui-craft/SKILL.md:22-24` | P2 |
| D7 | Denominador do estudo inconsistente: *"247 sites"* (house-rules + agent) vs *"248 coletados… 247 carregaram; **246** foram remedidos"* — as porcentagens foram medidas sobre 246 | `inspecao-e-pesquisa.md:197-200` | P2 |
| D8 | Palavras em inglês na prosa pt-BR (viola `idioma.md`): `principle`, `pictures` (×4), `plainly`, `declares`, `photograph hero`, `critique` (×3), `one-pager` (×2), `house rules` (×13) | arquivo:linha | P2 |
| D9 | `agent-browser` lista skills do upstream que **não existem neste stack** (`electron`, `slack`, `vercel-sandbox`, `agentcore`) | `SKILL.md:56-63` | P3 |

## §2 A regra que decide o formato do conserto

O repo mede **doc que mente** como P0 (`AGENTS.md §1.2`, `documentacao.md §1`) e
`dry.md` exige **UM dono por fato**. Logo, para cada defeito há duas saídas —
corrigir o **código** ou corrigir a **doc** — e o critério é:

> **A doc descreve o comportamento que o código DEVE ter, ou o código faz o que a
> doc promete?** A doc é a especificação; o código é a implementação.

E, quando os dois são possíveis: **corrige-se o que é falso, e o fato vai para o
dono canônico** (`dry.md`).

- **A1** → **código**: o gate tem de distinguir *"não mediu"* de *"mediu e não achou"*.
  Precedente exato: `check-doc-size.ts` (`listarMarkdown` ⇒ `null`; `checkDocSize`
  ⇒ `skipped:true` + `reason`).
- **A2** → **código**: a doc diz "qualquer arquivo de texto versionado"; o código
  varre 12 extensões. A doc é a spec ⇒ o gate varre todo texto.
- **A3, A4, A5, A6, A7, A8** → **código**: são bugs do gate.
- **B1, B2** → **registro**: o rótulo e o comando estão errados.
- **C1–C11** → **doc**: são afirmações falsas em arquivos que a branch tocou.
- **D1** → **código (a skill)**: o formato publicado contradiz o contrato que
  `AGENTS.md §1` torna obrigatório.
- **D2** → **doc**: o "Quem invoca" aponta para um agent que não carrega a skill.
- **D3** → **doc**: a afirmação "sem repetir" é falsa.
- **D4, D5, D6, D7, D8, D9** → **a skill**.

## §3 Conserto, tarefa por tarefa

> **Status em 2026-11-05 (após a execução):** T1–T13 aplicadas. As correções
> da revisão adversarial estão marcadas com ⚠️ dentro de cada tarefa.
>
> **⚠️ Segunda revisão adversarial (2026-11-05, depois da execução):** 5 furos
> novos foram abertos e **corrigidos** — todos medidos, não inferidos:
>
> | # | Furo | Correção |
> |---|---|---|
> | R1 | `git ls-files --full-name` muda o **formato** do path, não o **escopo** — com `repoRoot` = subdiretório o gate media só a subárvore | pathspec `:/` (traz a árvore inteira) + spec com o marcador **fora** do subdiretório |
> | R2 | `git cat-file --batch` responde `<sha> missing` (sem tamanho) e o parser **desalinhava** — o arquivo seguinte era lido do byte errado e o gate saía **verde** | o offset avança pelo tamanho declarado; `missing` não tem corpo → o gate se declara `skipped` |
> | R3 | `git diff-files` **omite** os arquivos com `assume-unchanged`/`skip-worktree` — o gate passava verde | `git ls-files -v` traz esses arquivos (tag ≠ `H`) |
> | R4 | A contagem de dentes dizia "42 mutação" — a soma não fechava (42+2+1 = 45 ≠ 44) | **41** mutação (41+2+1 = 44 ✓) |
> | R5 | 2 das 7 mutações declaradas **não reproduziam** (o `--deduplicate` não existe no código; o `raizDoRepo` não é observável) | a linha declara só as **6** que caem, todas medidas |
>
> E uma otimização que **foi tentada e revertida**: ler o índice só onde ele
> diverge do disco (`git diff-files`). Ela quebrava 6 specs — `diff-files`
> lista só mudança **não staged**, então um arquivo recém-staged (index ≠ HEAD)
> não aparece em lugar nenhum e o gate deixava de ver o marcador que o
> `git commit` publicaria. **O índice é lido inteiro.**

> Ordem **TDD** (convenção `tdd.md`): para cada regra de código, primeiro o
> teste que **fala** (RED), depois o conserto (GREEN), depois a revisão.

### T1 — A1 + A8: o gate declara o que não mediu

`check-merge-markers.ts`:
1. `arquivosVersionados` ⇒ `string[] | null`: `null` quando o `git` não roda
   **ou** quando a lista sai vazia (mesma semântica de `listarMarkdown`).
2. `checkMergeMarkers`: `null` ⇒ `{ ok:true, errors:[], skipped:true, reason:'…' }`.
3. A leitura do arquivo que falha (A8) deixa de sumir: vira **`advisory`** (o
   `CheckResult` tem o campo, e `linhasDoRelato` o imprime) — é verdade sobre a
   própria medição, não defeito no objeto medido.

Spec: repo sem git ⇒ `skipped===true` + `reason` não-vazio; repo com git e lista
vazia ⇒ idem; arquivo versionado ilegível ⇒ `advisory` nomeando o arquivo.

### T2 — A2 + A3 + A6: o gate vira todo texto versionado, e o bloco não envenena

1. **Sai a allowlist de extensões.** A regra passa a ser: *é arquivo de texto?*
   — heurístico do git (byte NULO nos primeiros 8000 bytes ⇒ binário).
   Medido: **0 binários**, **69,5 MB**.
2. Some `ehExtensaoVarrida`; entra `ehArquivoDeTexto`.
3. **A3**: o separador `=======` só conta se o bloco foi **aberto e fechado**.
   O `<<<<<<< ` que nunca fecha **não** deixa a flag ligada.
4. **A6**: o BOM é removido antes da varredura.
5. A **linha da convenção** passa a dizer o que o código faz — **escopo real**:
   "todo arquivo de texto versionado, **fora das 2 categorias isentas**"
   (`docs/superpowers/**` e `.agents/runs/**` — 221 dos 1229 arquivos).

⚠️ **Custo medido:** o gate lê o índice (~220 ms) **e** o disco — mas o disco
só quando ele **pode** divergir do índice (`git diff-files` + `git ls-files -v`: **~10 ms** num repo
com 1229 versionados) ou quando o índice está unmerged (conflito aberto). ⇒ **~435 ms** no repo real (3 rodadas; o gate antigo dava ~370 ms —
  o custo marginal é o índice, não o disco).
`docs/flows/**` são 61,3 MB de HTML gerado (176 arquivos) — 88% do volume, mas
**já eram lidos** antes (`.html` estava na allowlist), então o custo marginal
é pequeno. O preflight leva ~11 s.

Spec: marcador em `.sql` ⇒ acusado; em `.prisma` ⇒ acusado; em arquivo **sem
extensão** ⇒ acusado; `<<<<<<< ` sem fechar + heading setext ⇒ **só** o
`<<<<<<< ` é acusado; BOM + marcador ⇒ acusado.

### T3 — A4 + A7 + A5 + A8: o gate lê índice E disco, mede o repo inteiro, e não se autodeclara

> ⚠️ **Correção do plano (revisão adversarial de 2026-11-05):** a primeira
> versão deste plano dizia que o gate leria **só o índice**. Isso é **falso**:
> num `git merge` real, o índice tem os 3 estágios (base/ours/theirs — **sem
> marcador**) e o marcador só existe no **disco**. Ler só o índice deixaria
> passar o caso que o gate existe para pegar. E ler só o disco deixa passar o
> arquivo **staged** com marcador e depois apagado (que o `git commit`
> publicaria com o marcador dentro — MEDIDO). **Por isso o gate lê os dois.**

1. **A4 + A7**: `git ls-files -s -z --full-name` — `-z` mata o quoting de
   path não-ASCII, `--full-name` dá paths relativos à **raiz** (com
   `repoRoot` = subdiretório, sem isso o gate mediria a subárvore), e o
   **stage** distingue o arquivo normal (0) do unmerged (1/2/3) — o mesmo
   path aparece 3× e o gate conta **uma vez**.
2. **A8 (P0, não P2)**: o gate lê o **blob do índice** (`git cat-file
   --batch`) — é o que o `git commit` publica — **e** o **disco**, onde mora o
   conflito não resolvido. Blob ilegível ⇒ `advisory` (não silêncio).
3. **A5**: o exemplo do JSDoc deixa de ser byte-a-byte o que o gate caça
   (marcadores **partidos** — 7 → 4), e a spec fixa que o gate não se acusa.

Spec: conflito real de `git merge` ⇒ **3** erros (não 9); `repoRoot` = subdir ⇒
acha o marcador em `docs/x.md`; arquivo staged com marcador e apagado do disco
⇒ **acusado**; o fonte do gate não se acusa.

### T4 — B1 + B2: a linha de dentes diz a prova certa

`ci-defense-in-depth-dentes.md`, linha do `check-merge-markers`:
- nível: `mutação` → **`diferencial`** (a prova é plantar no repo real);
- a célula do comando recebe o **comando rodável** que reproduz os 3 achados
  (o modelo é a linha do `check-dockerfile-hardening`);
- a contagem de linhas do §1 fica coerente (T5).

### T5 — C6 + C7: as contagens de dentes voltam a bater

`dentes.md:32` ⇒ **44 linhas de gate = 42 mutação + 2 diferencial + 0 controle
negativo + 1 controle positivo + 0 desconhecidas** — **com data e comando**
(`grep -cE '^\| `' …`): as 44 linhas são as que começam por `| \``; 42 delas
nomeiam um gate `check-*`, as 2 outras são `review-routing` matrix lint e
`turbo-redirect-differential`.
`ci-defense-in-depth.md:140` ⇒ *"a tabela de dentes (**44 linhas**…)"* e *"os
**onze** comandos de mutação"* (bate com `dentes.md:99`).

⚠️ **Ordem:** T5 lê o estado **pós-T4** (T4 muda 1 mutação → diferencial, e
a mutação do `check-merge-markers` é a que vira diferencial).

### T6 — C1 + C11: o `AGENTS.md` (300/300 — correção **neutra em linhas**)

1. *"Skills de UI (**única** relação 1:N do repo)"* ⇒ *"a **maior** relação
   1:N do repo"*, e o bloco passa a nomear o `orchestrator` como o segundo
   agente com skills.
2. Repõe *"— é carregada por ele, **não o substitui**"* (1 linha).
3. ⚠️ O arquivo está em **300/300**. Qualquer linha a mais reprova o
   `check-doc-size`. A correção tem de ser **liquida**: ou as frases substituem
   outras no mesmo bloco, ou o bloco se compacta.

### T7 — C2 + C3: a `find-skills` (o próprio protocolo da branch)

1. *"`.agents/skills/` tem **25** skills"* ⇒ **29**.
2. §5.1 passo 5 e §8: *"`AGENTS.md §5`"* ⇒ *"`AGENTS.md §3.2`"* (§5 é
   "Workflows Padrão"; o índice de skills é §3.2 — é o que a row `1.15.0` do
   histórico usa: *"Índice: `AGENTS.md §3.2` (nota nova) + `§5`"*).
3. ⚠️ A `find-skills` é uma skill ≤ 300 linhas — cabe.

### T8 — C4 + C5: as datas e contagens dos READMEs

1. `README.md:21` ⇒ *"medidas do disco em **2026-11-03**"* (bate com o rodapé
   que a branch reescreveu).
2. `.claude/README.md:265` ⇒ *"# skills: **21**"*.

### T9 — C9 + C10: os dois índices e a matriz de roteamento

1. `AGENTS.md §6` ganha a linha de `ci-defense-in-depth-pendencias-fechadas.md`
   (a afirmação *"Os dois índices são o mesmo índice"* tem de ser verdadeira).
   ⚠️ Consome **1 linha** do `AGENTS.md` — T6 tem de liberar a linha.
2. `review-routing.md:32` ⇒ o `ux-design-specialist` passa a mapear as **7**
   skills (as 5 + `design-taste-frontend` + `agent-browser`).
3. `conventions/README.md:20-21` ⇒ as contagens (`31` arquivos, `24` no índice).

### T10 — D1: o `handoff` publica o formato canônico

`handoff/SKILL.md` §1 passa a publicar o formato de `agents-coordinate` §2.3 /
`dispatch.md`: `Task` / `Context` (`files`, `code_snippets`, `prior_outputs`,
`constraints`) / `Expected Output` / `Success Criteria` / `On Failure`, e a
seção `## Suggested skills` + `## Artefatos` passa a ser declarada como **delta
declarado** (não "o formato é o canônico"). O `## Contexto` volta a usar os
nomes de campo estáveis.

### T11 — D2 + D3: o dono e a afirmação "sem repetir"

1. `agent-browser/SKILL.md` §"Quem invoca" ⇒ só o `ux-design-specialist` (que é o
   agent que a carrega). O wrapper `.claude/skills/agent-browser/` já diz um —
   os dois passam a concordar.
2. A memória do `ux-design-specialist` deixa de dizer *"cobrem o upstream inteiro
   **sem repetir**"* e passa a dizer o que é verdade: as house rules são
   **compartilhadas** entre as duas metades, com o mesmo upstream como origem.

### T12 — D4 + D5 + D9: o `agent-browser` (auditoria, runbook, escopo)

1. §2 ganha o **registro da auditoria** que a §5.1 (desta branch) exige:
   origem, licença, e o que a skill pede (rede + escrita fora do repo), com o
   **fallback** declarado (precedente `graphify/SKILL.md:76`): sem a CLI
   instalada, o agent segue sem ela — é um **upgrade**, nunca um bloqueio.
2. §"a app precisa estar de pé" passa a apontar o **runbook canônico**
   (`docs/como-rodar.md` §1.4 — `pnpm dev`) em vez de inventar um 2º jeito.
3. A lista de skills do upstream perde as que **não existem neste stack**
   (`electron`, `slack`, `vercel-sandbox`, `agentcore`).

### T13 — D6 + D7 + D8: as frases que mentem ou estão em inglês

1. `design-taste-frontend/SKILL.md` ⇒ a citação do `ui-craft` passa a ser
   **íntegra** (ou marcada com elipse).
2. O denominador do estudo passa a ser **246** (o das medições) nos 3 lugares
   que dizem 247/248.
3. As palavras em inglês na prosa ⇒ pt-BR (`principle`→princípio,
   `pictures`→imagens, `plainly`→diretamente, `declares`→declara,
   `photograph hero`→herói em foto, `critique`→crítica, `one-pager`→página única,
   `house rules`→regras da casa).

## §4 O que NÃO entra (e por quê)

- **`||` residual na tabela de versões** — veio do **#129** (`b436a88`), está
  **fora** de todo hunk desta branch (verificado por `git diff -U0 … | grep '^@@'`:
  hunks em 101, 105-109, 131, 132; a linha é a 125) e é uma **tabela
  versionada**, não um marcador de conflito. Dívida pré-existente, com dono.
- **Rows de histórico ausentes** em `docs/MONOREPO.md` / `STACK.md` /
  `TEMPLATE_USAGE.md` (terminam em 1.14.0 / 1.14.0 / 1.12.0) e a row `1.8.0`
  faltando na tabela da convenção — **pré-existente**, não introduzido aqui.
- **O `check-doc-claims` cobre só os 6 docs de API** — os números de README,
  `.claude/README.md` e `dentes.md` **não são cobertos por gate**. É dívida do
  repo (o `find-skills` §5.1 a nomeia), não deste PR.
- **A duplicação das 12 house rules entre `ui-craft` e `design-taste-frontend`**
  — é conteúdo de adaptação, não erro. O que se corrige é a **afirmação**
  "sem repetir" (D3). Reescrever as 6 references para eliminar a repetição é
  decisão de design da skill, não correção do PR.

## §5 Verificação

| # | Comando | Esperado |
|---|---|---|
| V1 | `pnpm ci:preflight` | **0 erro** |
| V2 | `pnpm tooling:test` | **737** (era 719; +18 specs do gate) |
| V3 | `pnpm ci:local` | verde (Camada 1 inteira) — **requer Docker/Postgres** |
| V3b | `pnpm format:check` + `tsc --noEmit -p .tooling/tsconfig.json` | verde |
| V4 | mutação: plantar o bloco do #143 na árvore | **3** achados nomeando arquivo e linha |
| V5 | mutação: git indisponível | `skipped===true` + `reason` |
| V6 | mutação: marcador em `.sql`/`.prisma`/sem extensão | acusado |
| V7 | mutação: `git merge` real | **3** erros (não 9) |
| V8 | `wc -l AGENTS.md` | ≤ 300 |
| V9 | contar as rows `check-` da tabela de dentes | **44** rows = 41 mutação + 2 diferencial + 1 controle positivo (= a contagem declarada) |
| V10 | `git status --porcelain` | só as mudanças do plano |

## §6 Riscos

- **A2 amplia o escopo do gate** de 12 extensões para ~1.200 arquivos: medido
  **~435 ms** (o gate antigo dava ~370 ms), e o gate já roda no preflight
  (~11 s). **Medir de novo** depois.
- **A2 pode acusar arquivo que hoje passa**: verificado — **0** dos 1.229
  arquivos versionados têm marcador no início da linha. O conjunto que passa
  hoje continua passando.
- **T6/T9 mexem num arquivo no teto de linhas** (300/300): qualquer linha a
  mais reprova o `check-doc-size`.
- **Conflito de versão com o PR #144** (que bumpara para `1.19.0`): este plano
  **não** mexe na versão. Se o #144 entrar primeiro, este PR renumera para
  `1.20.0`.

> **Rebase (2026-11-05, depois da escrita deste plano):** o #144 entrou na
> `main` e este PR foi rebaseado por cima dele. A versão foi **renumerada
> para `1.20.0`** — a `1.19.0` é do #144 (`start local`) — e a linha `1.18.0`
> da tabela de histórico virou `1.20.0` nos 4 docs que a carregam (o plano já
> previa isso: *"se o #144 entrar primeiro, este PR renumera para `1.20.0`"*).
> A linha **V2** acima vale para a **baseline do PR** (719 → 737, +18 specs do
> gate); no topo da branch rebased o total é **832/832** (`pnpm tooling:test`),
> porque o #144 trouxe as specs dele. O resto de V1–V10 foi re-medido depois do
> rebase: preflight **0 erro** · `pnpm tooling:test` **832/832** ·
> `pnpm format:check` verde · `tsc --noEmit` verde · `AGENTS.md` em **300/300**.
