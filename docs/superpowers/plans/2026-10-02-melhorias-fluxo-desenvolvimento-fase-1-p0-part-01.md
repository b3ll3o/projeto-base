---
name: melhorias-fluxo-fase-1-p0-part-01
description: Fase 1 (P0) parte 1 — 2 tasks: gerar o state-snapshot canonico da demanda (exigido por state-aware-planning §4 e hoje inexistente) e corrigir os 6 links path:linha que deixam o ci:preflight vermelho.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-20261003T154334Z.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-1-p0-part-02.md
  - ../../fluxo-desenvolvimento.md
---

# Fase 1 (P0) — Parte 1: destravar o repositório

> **Pré-requisito:** `main` @ `5490de6` atualizada; branch
> `chore/melhorias-fluxo-desenvolvimento` criada a partir dela.
> **Próxima parte:** [F1-P0-P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-1-p0-part-02.md)
> **Agente responsável:** `stack-code-reviewer` (review) · `doc-sync` (pós-alteração).

**Por que P0 e por que só estas duas tasks.** `pnpm ci:preflight` está
**vermelho** hoje. Enquanto não ficar verde, **nenhum** commit é pushável
(`.husky/pre-push` roda o preflight com `exit 1`) e nenhum gate das fases
seguintes pode ser avaliado. A Fase 1 cabe em 2 tasks + 1 verificador porque
tudo o mais que este plano corrige **depende** do gate estar funcional.

---

## F1-T0 — Gerar o `state-snapshot` canônico da demanda (camada 0)

**Arquivos tocados**

- Create: `.agents/runs/state-snapshot-<ts>.md`

**Por que esta task existe — e por que é a primeira.**

A convenção [`state-aware-planning.md`](../../../.agents/specs/conventions/state-aware-planning.md)
é a camada 0 do pre-planner, e duas regras dela são **auto-aplicáveis** a este
plano:

1. **§4, "Plan gerado"** — todo plano em `docs/superpowers/plans/*.md` DEVE
   referenciar o `state-snapshot-<ts>.md` da demanda no frontmatter. Hoje só
   existe `state-snapshot-20260923T183938Z.md`, da demanda de telemetria —
   referenciá-lo seria mentira. Este plano não tem snapshot próprio: **gap de
   compliance do próprio plano**.
2. **§3, Passo 3** — `preflight_checks ≠ all_passed` ⇒ `proceed: false` e
   _"NÃO criar plano nem iniciar trabalho"_.

A segunda regra é a mais importante deste plano inteiro: **`pnpm ci:preflight`
está vermelho hoje (baseline B0)**, então a convenção literalmente proíbe
começar. A leitura honesta não é "a convenção não se aplica a plano de
correção" — é que **§F1-T1 destrava a condição de `proceed`**, e este snapshot
é o registro dessa condição. Sem ele, o plano começa numa violação de regra.

**Passos**

1. Rodar a skill [`state-aware-planning`](../../../.agents/skills/state-aware-planning/SKILL.md)
   e produzir o snapshot no schema canônico. O preflight medido agora:

   ```bash
   pnpm ci:preflight >/dev/null 2>&1; echo "EXIT=$?"   # → EXIT=1 (2 erros)
   ```

   Os gaps **do snapshot** não são os 21 deste plano — são os 3 da Fase 1:

   ```yaml
   demand: "melhorias-fluxo-desenvolvimento"
   base_commit: "5490de6"
   working_tree: clean
   preflight_checks: not_all_passed
   proceed: false
   gap_blocker: true
   gaps:
     - { id: G-001, categoria: cross-refs, severity: blocker,
         file: "docs/articles/vetor-grafos-fine-tuning-resumo.md",
         rationale: "6 links usam 'path:linha'; check-doc-refs.ts:81 faz target.split('#') e ':linha' vira parte do path",
         source: "pnpm ci:preflight (baseline B0)" }
     - { id: G-002, categoria: tooling,   severity: major,
         file: "apps/api/package.json",
         rationale: "script lint e stub 'exit 0'; 7 erros invisiveis",
         source: "cd apps/api && npx eslint . --config ./.eslintrc.js (B4/B5)" }
     - { id: G-003, categoria: docs,      severity: major,
         file: "AGENTS.md",
         rationale: "18 links de memoria saem do repositorio",
         source: "grep -c '(\.\./\.agents/memory/' AGENTS.md (B11)" }
   ```

   > Grave com timestamp real: `state-snapshot-<YYYYMMDD>T<HHMMSS>Z.md`
   > (mesmo formato de `20260923T183938Z`). Depois **atualize `state_snapshot:`**
   > no frontmatter dos 11 arquivos deste plano com o nome definitivo.

2. **Reavaliar `proceed` ao fim de §F1-T1** (quando o blocker cai): editar o
   snapshot para `proceed: true` / `gap_blocker: false`, ou registrar no
   Histórico por que G-002/G-003 (major, corretivos) não bloqueiam.

3. Commit:

   ```bash
   git add .agents/runs/state-snapshot-*.md
   git commit -m "chore(state-aware): snapshot canonico da demanda melhorias-fluxo-desenvolvimento

   state-aware-planning.md §4 exige que todo plano em docs/superpowers/plans/*.md
   referencie o state-snapshot da demanda. O unico existente (20260923T183938Z) e
   da demanda de telemetria — este plano nao tinha snapshot proprio, gap de
   compliance do proprio plano. §3 Passo 3 tambem se aplica: preflight vermelho
   (B0) implica proceed: false; F1-T1 destrava a condicao.

   G-001 blocker (6 links path:linha), G-002 e G-003 major.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
ls .agents/runs/state-snapshot-2026*10*02*.md
grep -c 'proceed:' .agents/runs/state-snapshot-2026*10*02*.md
```

**Output esperado:** 1 arquivo e `1`. `proceed` é `false` até §F1-T1 fechar,
`true` depois.

**Gate que valida:** a skill `state-aware-planning` na geração + revisão do PR.
**Nenhum script do repo consome o snapshot ainda** — o único consumidor
declarado é o frontmatter do plano (§4).

---

## F1-T1 — Corrigir os 6 links `path:linha` que deixam o preflight vermelho

**Arquivos tocados**

- Modify: `docs/articles/vetor-grafos-fine-tuning-resumo.md` (linhas 21, 23,
  152, 158, 210, 221)

**Contexto verificado.** `pnpm ci:preflight` executado agora em `main` @ `5490de6`:

```text
  • Cross-refs em docs... ✗
      docs/articles/vetor-grafos-fine-tuning-resumo.md: link para '../../.agents/agents/review-router.md:128' quebrado
      docs/articles/vetor-grafos-fine-tuning-resumo.md: link para '../../.agents/specs/conventions/specialist-routing.md:254' quebrado
❌ 2 erro(s) encontrado(s). Corrigir antes de push.
```

Só 2 são acusadas — **mas há 6** no arquivo, e as outras 4 estão **invisíveis
hoje** por causa do bug que §F2-T1 corrige:

```bash
grep -cE '\]\([^)]*\.md:[0-9]+\)' docs/articles/vetor-grafos-fine-tuning-resumo.md
```

```text
6
```

| # | Linha | Target | Linha citada |
|---|-------|--------|---------------|
| 1 | 21 | `../../.agents/specs/conventions/evals.md:14` | `source_article: Dennis Rojas…` |
| 2 | 23 | `../../.agents/specs/conventions/engineering-loop.md:21` | `source_article: Dennis Rojas…` |
| 3 | 152 | `../../.agents/specs/conventions/specialist-routing.md:19` | `## 1. PATH GLOBS` |
| 4 | 158 | `../../.agents/agents/review-router.md:128` | `2. **Classificação é determinística.**…` |
| 5 | 210 | `../../.agents/specs/conventions/specialist-routing.md:254` | `\| G3 \| P3 \| Demand keywords…` |
| 6 | 221 | `../../.agents/agents/specialist-router.md:5` | `tools: Read, Glob, Grep, Bash, Agent` |

**Causa raiz.** `check-doc-refs.ts:81` faz `const [filePath] = target.split('#')`
para remover a âncora. `:128` não é âncora, é sufixo: vira parte do path e
`fs.access` falha. **Os 6 alvos e as 6 linhas citadas existem** — todos
verificados acima.

Por que só 2 aparecem no erro: os links 1, 2, 3 e 6 têm label **100% inline-code**
(isto é, um label como `` `evals.md` ``), que §F2-T1 deixa de descartar. Corrigir
os 2 visíveis e deixar os 4 cria um estado que **piora** depois de §F2-T1.

> **Correção aplicada sobre a v1.0.0 deste plano:** ela corrigia só os links
> das linhas 158 e 210 e declarava a task completa. Os 4 restantes ficariam
> vermelhos assim que §F2-T1 entregasse a máscara.

**Decisão D1 (do índice).** O diretório está untracked (`git status --short` →
`?? docs/articles/`). O default é (a) versionar. Se a decisão for (b) deletar
ou (c) mover, esta task inteira é reescrita — mas o preflight **continua
vermelho** em qualquer uma das três, porque `docs/` é varrido em disco.

**Passos**

1. Dry-run:

   ```bash
   sed -E 's|(\.\./\.\./\.agents/[^)]*\.md):([0-9]+)|\1#L\2|g' \
     docs/articles/vetor-grafos-fine-tuning-resumo.md \
     | diff docs/articles/vetor-grafos-fine-tuning-resumo.md -
   ```

   **Output esperado:** 6 pares de linhas `<` / `>` — `path:linha` → `path#Llinha`.

2. Aplicar e versionar:

   ```bash
   sed -i -E 's|(\.\./\.\./\.agents/[^)]*\.md):([0-9]+)|\1#L\2|g' \
     docs/articles/vetor-grafos-fine-tuning-resumo.md
   grep -cE '\]\([^)]*\.md:[0-9]+\)' docs/articles/vetor-grafos-fine-tuning-resumo.md   # → 0
   ```

3. Verificar que o preflight ficou verde:

   ```bash
   out=$(pnpm ci:preflight 2>&1); st=$?
   printf '%s\n' "$out" | tail -3
   echo "EXIT=$st"
   ```

   **Output esperado:** `EXIT=0` e `✓ Todos os checks passaram.` (10/10).
   Baseline **B0**: `1` → `0`.

   > **Não** use `pnpm ci:preflight 2>&1 | tail -3; echo "EXIT=$?"` — nesse
   > formato `$?` é o status do `tail`, que é **sempre 0**, e o critério
   > passaria com o gate vermelho. Capturar antes do pipe, ou usar `set -o pipefail`.

4. Commit:

   ```bash
   git add docs/articles/vetor-grafos-fine-tuning-resumo.md
   git commit -m "fix(docs): 6 links path:linha -> path#Llinha (destrava ci:preflight)

   check-doc-refs.ts:81 faz target.split('#') para remover a ancora;
   ':128' nao e ancora, vira parte do path e quebra o fs.access. Os 6
   alvos existem (evals.md:14, engineering-loop.md:21, specialist-routing.md:19
   e :254, review-router.md:128, specialist-router.md:5).

   Sao 6, nao 2: 4 deles tem label 100% inline-code e so ficariam
   visiveis depois da mascara de F2-T1. Corrigir so os 2 hoje criaria um
   estado que piora na fase seguinte.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -cE '\]\([^)]*\.md:[0-9]+\)' docs/articles/vetor-grafos-fine-tuning-resumo.md
out=$(pnpm ci:preflight 2>&1); st=$?; printf '%s\n' "$out" | tail -2; echo "EXIT=$st"
```

**Output esperado:** `0` e `EXIT=0`. Baseline **B0**: `1` → `0`.

**Gate que valida:** `.husky/pre-push` roda `pnpm ci:preflight` com `exit 1` —
o push aborta se a task estiver incompleta.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
