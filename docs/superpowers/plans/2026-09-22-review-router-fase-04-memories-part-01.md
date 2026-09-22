# Review-Router — Fase 4: Atualização de memórias (router orquestra)

> **Parent plan:** [2026-09-22-review-router-plan.md](./2026-09-22-review-router-plan.md)
> **Spec:** [2026-09-22-review-router-design.md](../specs/2026-09-22-review-router-design.md)

**Fase 4: Atualização de memórias**
**Tasks:** 4.1–4.5 (5 tasks)
**Entrega:** 3 memórias reescritas (two-stage-review, review-and-fix, subagent-driven-development) + validação 3-5 tasks
**Validação:** Memórias citam router; 3-5 tasks reais rodadas com router; matriz ajustada se gaps detectados

---

## Fase 4 — Atualização de memórias (router orquestra)

### Task 4.1: Reescrever `two-stage-review-after-each-task.md`

**Files:**
- Modify: `~/.claude/projects/-home-leo-Documentos-projetos-base/memory/two-stage-review-after-each-task.md`

- [ ] **Step 1: Atualizar memória**

Substituir conteúdo por:

```markdown
---
name: two-stage-review-after-each-task
description: "review-router orquestra revisão pós-task (substitui two-stage ad-hoc); spec compliance + code quality são piso mínimo via router"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-09-22T...
---

## Router orquestra revisão pós-task

Desde 2026-09-22, a revisão pós-task é orquestrada pelo agent `review-router` (não mais decisão manual do controller).

**Fluxo:**

1. Implementer DONE → controller despacha `review-router`
2. Router classifica diff (paths + commit type + diff content)
3. Router consulta matriz `.agents/specs/conventions/review-routing.md`
4. Router aplica skip rules (ver matriz §4)
5. Router despacha N specialists em paralelo
6. Router agrega findings + detecta consensus
7. Router retorna YAML ao controller
8. Controller faz triage + dispatch fix se necessário

**Spec compliance + code quality:**

São **piso mínimo** (always-on) salvo skip rule explícito na matriz. Router decide se pula baseado em heurística (scope trivial, doc-only, etc.).

**Two-stage review vira caso particular:**

Quando router decide que apenas spec+quality rodam (todos os specialists pulados), o resultado é equivalente ao antigo two-stage. Router continua orquestrando; output segue mesmo formato.

**Cross-refs:**
- [[review-and-fix-after-each-task]] (triage canônico)
- [[subagent-driven-development-always]] (paralelização)
- [[reviewer-must-differ-from-implementer]] (fresh subagent)
- Spec: `docs/superpowers/specs/2026-09-22-review-router-design.md`
- Matriz: `.agents/specs/conventions/review-routing.md`
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/projects/-home-leo-Documentos-projetos-base/memory/two-stage-review-after-each-task.md
git commit -m "docs(memory): two-stage-review agora orquestrado por review-router"
```

### Task 4.2: Atualizar `review-and-fix-after-each-task.md`

**Files:**
- Modify: `~/.claude/projects/-home-leo-Documentos-projetos-base/memory/review-and-fix-after-each-task.md`

- [ ] **Step 1: Adicionar nota sobre router**

No início da memória, adicionar:

```markdown
> **Atualização 2026-09-22:** Review pós-task é orquestrada pelo agent `review-router` (ver [[two-stage-review-after-each-task]]). Controller continua dono do triage + fix dispatch.
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/projects/-home-leo-Documentos-projetos-base/memory/review-and-fix-after-each-task.md
git commit -m "docs(memory): review-and-fix cita review-router como orquestrador"
```

### Task 4.3: Atualizar `subagent-driven-development-always.md`

**Files:**
- Modify: `~/.claude/projects/-home-leo-Documentos-projetos-base/memory/subagent-driven-development-always.md`

- [ ] **Step 1: Adicionar router no fluxo de review**

Na seção "Paralelização mandatória", adicionar:

```markdown
4. **Review (via router):**
   - Após implementer, dispatch `review-router` (Agent tool)
   - Router classifica + despacha N specialists em paralelo
   - Controller faz triage + fix
   - Ver [[two-stage-review-after-each-task]]
```

- [ ] **Step 2: Commit**

```bash
git add ~/.claude/projects/-home-leo-Documentos-projetos-base/memory/subagent-driven-development-always.md
git commit -m "docs(memory): subagent-driven-development cita review-router"
```

### Task 4.4: Validar 3-5 tasks via router

- [ ] **Step 1: Identificar tasks reais**

Escolher 3-5 tasks pequenas recentes que ainda não foram mergeadas (ou usar re-análise de PRs já mergeados).

- [ ] **Step 2: Rodar router em cada uma**

Para cada task:
- `pnpm review:route --paths=... --matrix=...`
- Validar: reviewers corretos, latency, findings

- [ ] **Step 3: Documentar resultados**

Adicionar tabela em `.agents/runs/pilot-summary.md`:

| Task | Branch | Reviewers | Latency | Findings | Consensus |
|------|--------|-----------|---------|----------|-----------|
| ... | ... | ... | ... | ... | ... |

- [ ] **Step 4: Aplicar learnings na matriz se necessário**

Se algum glob/commit_type/diff_pattern não cobriu bem → bump `matrix_version` + PR.

### Task 4.5: PR da Fase 4

- [ ] **Step 1: pnpm ci:local**
- [ ] **Step 2: Push + PR**

```bash
git push
gh pr create --base main --title "docs(memory): router orquestra review (Fase 4)" --body "Atualiza memórias: two-stage-review, review-and-fix, subagent-driven-development. Router vira orquestrador canônico."
```

- [ ] **Step 3: Review + merge**

---

