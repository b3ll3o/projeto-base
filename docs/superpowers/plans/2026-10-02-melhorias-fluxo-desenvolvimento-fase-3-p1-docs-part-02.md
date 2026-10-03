---
name: melhorias-fluxo-fase-3-p1-docs-part-02
description: Fase 3 (P1 docs) parte 2 — 3 tasks: corrigir as 8 linhas de git-workflow.md que apresentam agents de prosa como status checks, alinhar os footers de versao de 1.5.0 para 1.9.0 (restaurando o auto-tagging) e trocar o noop silencioso do release-template por ::warning::. Fecha a Fase 3.
version: 1.1.0
updated: 2026-10-02
maintainer: doc-writer
state_snapshot: .agents/runs/state-snapshot-<ts>.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-3-p1-docs-part-01.md
---

# Fase 3 (P1 docs) — Parte 2: a barreira de merge e o auto-tagging

> **Pré-requisito:** [F3-P1-P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-3-p1-docs-part-01.md) completa.
> **Agente responsável:** `doc-writer` (redação) · `code-reviewer` (revisão).

---

## F3-T3 — Corrigir as 8 linhas de `git-workflow.md` que apresentam agents como status checks

**Arquivos tocados**

- Modify: `.agents/specs/conventions/git-workflow.md` — linhas `23`, `34`,
  `112-114`, `157-159`, `169`

**Contexto verificado.** O documento lista 3 status checks obrigatórios que
**não existem como jobs** e que **nada despacha**:

```bash
grep -nE '(tdd-enforcer|code-reviewer|markdown-size-check)' \
  .agents/specs/conventions/git-workflow.md | cut -d: -f1 | tr '\n' ' '
# → 23 112 113 114 157 158 159 169
grep -rn 'tdd-enforcer\|code-reviewer' .github/workflows/ .husky/
# → (vazia): nenhum hook ou workflow despacha nenhum dos dois
```

São **8 linhas** (baseline **B14**). `:112-114` não usam backtick — um `grep`
ancorado no cercado só acha **5** e deixa 3 sem dono; por isso o padrão do
verificador (§F1-T2) casa o **nome nu**. Só `stack-code-reviewer` é despachado
por hook e CI (`.husky/pre-commit:19`, `review-stack.yml:24`) e pela matriz de
routing (`review-routing.md:22-48`). O agente `git-workflow-enforcer`, prometido
na `:169`, não existe (`ls .agents/agents/` → sem match).

Os jobs reais (`.github/workflows/ci.yml`) são `preflight` (`:12`, sempre),
`quality` (`:33`, sempre, `needs: preflight` na `:34`) e `docker-build-prod`
(`:67`, `if: github.event_name == 'pull_request'` na `:68`).

E `git-workflow.md:34` afirma que *"branch protection + status checks"*
**impõem** a regra — contradito pelo ruleset ativo
(`gh api repos/b3ll3o/projeto-base/rulesets/23853096 --jq '.rules[].type'`
→ `deletion`, `non_fast_forward`, `pull_request` — **sem
`required_status_checks`**, e com `"required_approving_review_count": 0`).

> A afirmação de `:169` — *"`tdd-enforcer` é despachado em todo PR"* — é
> **falsa**, e o agente que ela promete não existe. É a afirmação falsa de maior
> consequência do plano: um agent que leia `git-workflow.md` conclui que `main`
> é Merge-Quality-gated. A estratégia de 3 camadas documentada é **telemetria
> e costume**, não barreira.

**Passos**

1. `:34` — reclassificar a afirmação. A tabela existe para distinguir *"o que o
   GitHub impõe"* de *"o que é convenção"* (é o que o `:28-30` anuncia), e a
   3ª coluna de `:34` diz **Impõe** sem lastro. Trocar a célula:

   ```diff
   -| Tronco único e sempre integrável | … | **Impõe**: branch protection + status checks |
   +| Tronco único e sempre integrável | … | **Parcial**: só o PR obrigatório (veja nota) |
   ```

   E acrescentar **nota de rodapé** logo abaixo da tabela:

   > **Nota.** O ruleset ativo (`23853096`) tem apenas `deletion`,
   > `non_fast_forward` e `pull_request` — **sem `required_status_checks`** e com
   > `required_approving_review_count: 0`. O que impede commit vermelho em
   > `main` é o `pre-push` local (burlável com `--no-verify`) mais a revisão do
   > PR, não o GitHub. Fechar a barreira de verdade é decisão do owner — **D2**
   > (§F4-T3).

2. `:23` — trocar os nomes fantasma pelos jobs reais:

   ```diff
   - - ✅ **OBRIGATÓRIO** checks verdes (`tdd-enforcer`, `code-reviewer`, size-check)
   + - ✅ **OBRIGATÓRIO** checks verdes do `ci.yml`: `preflight` e `quality`
   ```

3. `:112-114` e `:157-159` — as duas listas passam a `preflight` e `quality`.
   Em `:112-114` o bloco é o passo *"Aguardar checks + revisão"*; em
   `:157-159` é a lista de *status checks* a configurar no branch protection.

   > **Não** promover `docker-build-prod` a check required: ele é condicional
   > (`ci.yml:67-68`) e não roda em push `feat/**` — exigir um contexto que
   > não existe naquele caminho trava o merge para sempre. `quality` tem
   > `needs: preflight`, então gateia os dois transitivamente.

4. `:169` — **reescrever a frase inteira**, não apagar a 2ª cláusula:

   ```diff
   -`tdd-enforcer` é despachado em todo PR. Em breve, `git-workflow-enforcer` validará
   -se o PR está abrindo para `main` a partir de branch válida.
   +Os gates que realmente rodam em todo PR são o job `preflight` (que executa
   +`pnpm ci:preflight`) e o job `quality`. Nada despacha automaticamente o agent
   +`tdd-enforcer` nem o `code-reviewer`: quem os invoca é o operador, ou a matriz
   +de routing (`review-routing.md`), que despacha `stack-code-reviewer` +
   +specialists. Nenhum agente valida hoje se o PR abre para `main` a partir de
   +branch válida.
   ```

   > **Correção sobre a v1.0.0:** ela propunha "remover a 2ª frase". Isso
   > deixaria `` `tdd-enforcer` `` na linha, e `grep -cE` daria `1`, não `0` —
   > o critério não fecharia. Além disso a 1ª frase também é falsa.

5. Commit:

   ```bash
   git add .agents/specs/conventions/git-workflow.md
   git commit -m "fix(git-workflow): 8 linhas apresentam agents de prosa como status checks

   ':34' afirmava que 'branch protection + status checks' IMPOEM 'main nunca
   recebe commit vermelho'. O ruleset ativo (23853096) tem apenas deletion/
   non_fast_forward/pull_request: sem required_status_checks e com
   required_approving_review_count 0. A estrategia de 3 camadas e telemetria,
   nao barreira — fechar de verdade e do owner (D2).

   ':23', ':112-114' e ':157-159' listavam 3 status checks (tdd-enforcer,
   code-reviewer, markdown-size-check) que nao existem como jobs: sao agents
   de prosa e markdown-size-check nem existe. Nenhum hook ou workflow os
   despacha — so stack-code-reviewer. Troca por preflight e quality;
   docker-build-prod fica de fora porque so roda em PR (ci.yml:67-68) e
   exige-lo travaria merge vindo de push feat/**.

   ':169' reescrita inteira: afirmava que tdd-enforcer 'e despachado em todo
   PR' e prometia um 'git-workflow-enforcer' inexistente. Impacto: um agent
   que leia este doc concluia que main e Merge-Quality-gated.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -cE '(tdd-enforcer|code-reviewer|markdown-size-check)' \
  .agents/specs/conventions/git-workflow.md
```

**Output esperado:** `0`. Baseline **B14**: `8` → `0`.

**Gate que valida:** revisão do PR + `checkDocRefs` (§F2-T2 cobre
`.agents/specs/`; esta task só acrescenta links internos legítimos).

---

## F3-T4 — Alinhar os footers de versão: `1.5.0` → `1.9.0`

**Arquivos tocados**

- Modify: `docs/MONOREPO.md:262` (footer) + nova linha no Histórico (após `:276`)
- Modify: `docs/STACK.md:135` (footer) + nova linha no Histórico (após `:149`)

**Contexto verificado — o auto-tagging está inerte.**

```bash
grep -n '^\*\*Versão do documento' docs/MONOREPO.md   # → 262: 1.5.0
grep -n '^\*\*Versão da stack'  docs/STACK.md        # → 135: 1.5.0
git tag --sort=-v:refname | head -1                   # → v1.8.0
```

O footer de `MONOREPO.md` está em `1.5.0`; o Histórico do **mesmo arquivo** vai
até `1.7.0` (`:276`), o de `STACK.md` até `1.7.0` (`:149`); a última tag do repo
é `v1.8.0`. Baseline **B13**. E `release-template.yml:84-86` faz
`if git rev-parse … refs/tags/v1.5.0; then exists=true; … "noop."`

Como **`v1.5.0` existe**, `exists=true` é sempre verdade e o step *"Criar
annotated tag + push"* (condicionado a `exists == 'false'`, `:91`) **nunca
roda**: todo push em `main` que toque `docs/MONOREPO.md` é um **noop silencioso
com run verde**. A `v1.8.0` foi criada via `workflow_dispatch` com
`inputs.version` — o caminho que **ignora** o footer.

> **Atenção — alinhar para `1.8.0` seria PIOR.** `v1.8.0` já existe, então o
> noop se repetiria com um run que **parece** release bem-sucedida (*"Versão
> alvo: v1.8.0"*, step de criação *skipped*). O footer tem que apontar para a
> **próxima versão não publicada**: `1.9.0`.

**Passos**

1. `docs/MONOREPO.md:262` — `**Versão do documento:** 1.5.0` → `1.9.0`, e
   acrescentar `| \`1.9.0\` | <descrição desta fase> |` no topo da tabela de
   Histórico (após `:276`).
2. `docs/STACK.md:135` — `**Versão da stack:** 1.5.0` → `1.9.0`, e a mesma
   linha de Histórico (após `:149`).
3. **Replay do regex exato do workflow** (`release-template.yml:64-65`) — ver
   *Critério de aceite*. O `+ set -euo pipefail` do step faz o
   `git rev-parse` com `-q` e match ausente sair `1`; o `|| true` do `:65` é
   só no `grep` do footer. Daí o `echo $?` vir logo depois do comando, sem
   pipeline no meio.

4. Commit:

   ```bash
   git add docs/MONOREPO.md docs/STACK.md
   git commit -m "fix(release): footers regredidos (1.5.0) tiravam o auto-tagging do ar

   O footer de docs/MONOREPO.md:262 estava em 1.5.0, o Historico do mesmo
   arquivo ia ate 1.7.0 (:276) e a ultima tag era v1.8.0. Como v1.5.0 ja
   existe, o step de idempotencia (release-template.yml:80-88) resolvia
   sempre exists=true e 'Criar annotated tag + push' (:91) nunca rodava: todo
   push em main que tocasse MONOREPO.md era um noop silencioso, com run
   verde. A v1.8.0 foi criada via workflow_dispatch, que ignora o footer.

   Alinha para 1.9.0 (proxima nao publicada) e NAO para 1.8.0, que ja existe
   e repetiria o noop com aparencia de sucesso. STACK.md:135 tinha o mesmo
   drift. Nao se cria footer em estrutura-e-versionamento.md: post-merge-release.md
   nao o exige, e um 4o lugar para divergir seria o oposto do objetivo.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -oE '\*\*Versão do documento:\*\* [0-9.]+' docs/MONOREPO.md | grep -oE '[0-9.]+$'
grep -oE '\*\*Versão da stack:\*\* [0-9.]+' docs/STACK.md | grep -oE '[0-9.]+$'
git rev-parse --verify --quiet refs/tags/v1.9.0; echo "EXIT=$?"
```

**Output esperado:** `1.9.0`, `1.9.0`, `EXIT=1`. Baseline **B13**: `1.5.0` → `1.9.0`.

**Gate que valida:** o próprio `release-template.yml` — o merge em `main`
dispara o workflow e o run deve mostrar `Versão alvo: v1.9.0` com o step de
criação **não** skipped.

---

## F3-T5 — Trocar o noop silencioso do release por um `::warning::` explícito

**Arquivos tocados**

- Modify: `.github/workflows/release-template.yml:84-86` (ramo `exists=true`)

**Contexto verificado.** A idempotência foi confundida com *correctly
idempotent*: ela evita duplicar tag, mas **pula trabalho legítimo em silêncio**,
e as execuções verde-noop que sustentaram o bug não deixavam rastro. **Escopo:**
aviso, **não** `exit 1` — o workflow dispara em qualquer mudança em
`docs/MONOREPO.md` (`:31-32`), então um hard-fail quebraria edições documentais
de rotina. O hard-fail de drift real é **D2** (§F4-T3).

**Passos**

1. No step *"Verificar se tag já existe (idempotência)"* (`:80`), no ramo
   `exists=true` (`:84-86`), acrescentar 1 linha:

   ```yaml
   echo "::warning::Tag ${{ steps.version.outputs.tag }} já existe. Nada foi criado — se o footer regrediu, o bump não saiu."
   ```

2. **Não** usar `::error::` nem `exit 1`, e **não** adicionar o aviso no caminho
   `workflow_dispatch`, onde noop é esperado por design.

3. Commit:

   ```bash
   git add .github/workflows/release-template.yml
   git commit -m "fix(release): noop idempotente vira ::warning:: explicito

   A idempotencia evita duplicar tag, mas tambem pula trabalho legitimo em
   silencio, e as execucoes verde-noop que sustentaram o bug nao deixavam
   rastro (v1.8.0 foi criada via workflow_dispatch). Aviso, nao exit 1: o
   workflow dispara em qualquer mudanca em docs/MONOREPO.md e um hard-fail
   quebraria edicoes documentais de rotina.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c '::warning::' .github/workflows/release-template.yml
```

**Output esperado:** `1` (hoje `0`). O gate real é o run do workflow após o
merge da §F3-T4.

---

## Critério de saída da Fase 3

```bash
out=$(pnpm format:check 2>&1); st=$?; echo "FORMAT_EXIT=$st"
out=$(pnpm ci:preflight 2>&1); st=$?; echo "PREFLIGHT_EXIT=$st"
bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -cE '^✓ F3-'
```

**Output esperado:** `FORMAT_EXIT=0`, `PREFLIGHT_EXIT=0` e `5` — as **5**
tasks da Fase 3 (F3-T1 … F3-T5), uma linha `✓` cada.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
