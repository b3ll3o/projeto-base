# Review-Router — Fase 2: Catalogação (router descobrível)

> **Parent plan:** [2026-09-22-review-router-plan.md](./2026-09-22-review-router-plan.md)
> **Spec:** [2026-09-22-review-router-design.md](../specs/2026-09-22-review-router-design.md)

**Fase 2: Catalogação**
**Tasks:** 2.1–2.3 (3 tasks)
**Entrega:** Router descobrível via AGENTS.md §3 + WORKFLOWS.md
**Validação:** `pnpm ci:preflight` verde (cross-refs OK) + 1 PR

---

## Fase 2 — Catalogação (router descobrível)

### Task 2.1: Atualizar AGENTS.md §3 com router

**Files:**
- Modify: `.agents/agents/AGENTS.md`

- [ ] **Step 1: Ler AGENTS.md §3 atual**

```bash
sed -n '/## §3/,/## §4/p' .agents/agents/AGENTS.md | head -50
```

- [ ] **Step 2: Adicionar linha do router**

Em `.agents/agents/AGENTS.md`, na tabela §3 (catálogo de agents), adicionar:

```markdown
| **review-router** | [`.agents/agents/review-router.md`](./review-router.md) | Orquestrador de revisão (agent pendente — Fase 3) | Classifica diff e dispara reviewers em paralelo |
```

(Nota: o link estará quebrado até Fase 3; aceitável — Fase 2 só adiciona ao catálogo para discoverability.)

- [ ] **Step 3: Validar referências**

```bash
pnpm ci:preflight
```

Expected: verde (check-doc-refs detecta o link quebrado se configurado; se quebrar, ajustar para nota "arquivo pendente").

- [ ] **Step 4: Commit**

```bash
git add .agents/agents/AGENTS.md
git commit -m "docs(agents): catalogar review-router em AGENTS.md §3 (pendente Fase 3)"
```

### Task 2.2: Atualizar WORKFLOWS.md

**Files:**
- Modify: `.agents/WORKFLOWS.md`

- [ ] **Step 1: Adicionar entrada de workflow**

Em `.agents/WORKFLOWS.md`, adicionar nova seção:

```markdown
## Workflow: review-routing

> Orquestrador de revisão pós-task. Despacha specialists baseado em classificação de diff.

**Status:** Pendente (Fase 3) — agent `review-router` ainda não existe.

**Triggers:** Manual (controller invoca após implementer DONE).

**Responsável:** review-router agent.

**Inputs:** task{scope}, branch{base,head}, implementer_output_path.

**Outputs:** `.agents/runs/<timestamp>-review-<n>.yaml` com classification + reviewers_dispatched + findings_aggregated.

**Cross-refs:**
- [`.agents/agents/review-router.md`](./agents/review-router.md) (a criar em Fase 3)
- [`.agents/specs/conventions/review-routing.md`](./specs/conventions/review-routing.md) (criado em Fase 1)
- [`.agents/skills/review-routing/SKILL.md`](./skills/review-routing/SKILL.md) (a criar em Fase 3)
```

- [ ] **Step 2: Validar**

```bash
pnpm ci:preflight
```

Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add .agents/WORKFLOWS.md
git commit -m "docs(workflows): adicionar review-routing (pendente Fase 3)"
```

### Task 2.3: PR da Fase 2

- [ ] **Step 1: pnpm ci:local**

```bash
pnpm ci:local
```

Expected: verde.

- [ ] **Step 2: Push + PR**

```bash
git push
gh pr create --base main --title "docs(agents): catalogar review-router (Fase 2)" --body "Adiciona review-router a AGENTS.md §3 e WORKFLOWS.md. Sem mudança funcional — apenas discoverability."
```

- [ ] **Step 3: Review + merge**

Após aprovação: `gh pr merge --squash`.

---

