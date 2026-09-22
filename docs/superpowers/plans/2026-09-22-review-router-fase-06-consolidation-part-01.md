# Review-Router — Fase 6: Consolidação

> **Parent plan:** [2026-09-22-review-router-plan.md](./2026-09-22-review-router-plan.md)
> **Spec:** [2026-09-22-review-router-design.md](../specs/2026-09-22-review-router-design.md)

**Fase 6: Consolidação**
**Tasks:** 6.1–6.3 (3 tasks)
**Entrega:** Retrospective-capture aplicado + bumps necessários (matriz v1.1, AGENTS.md, memory) + tag v1.5.0
**Validação:** Proposals da retrospective viraram tasks/PRs + tag criada + footer de versão atualizado

---

## Fase 6 — Consolidação

### Task 6.1: Rodar `retrospective-capture`

- [ ] **Step 1: Invocar skill**

```text
superpowers:retrospective-capture
```

Com contexto: rollout do review-router ao longo das Fases 1-5.

- [ ] **Step 2: Capturar proposals**

Skill retorna proposals filtradas (confidence ≥ 70).

- [ ] **Step 3: Criar tasks via task-manager**

Para cada proposal, criar task em `.agents/runs/`:

```yaml
- id: TASK-retro-router-NNN
  type: refactor
  priority: medium
  ...
```

### Task 6.2: Aplicar learnings

- [ ] **Step 1: Bump matrix se necessário**

Se proposals indicam gaps, criar PR com matriz v1.1:

```bash
gh pr create --base main --title "feat(agents): review-routing matrix v1.1 (learnings do rollout)" --body "..."
```

- [ ] **Step 2: Atualizar AGENTS.md / WORKFLOWS.md se estrutura mudou**

- [ ] **Step 3: Atualizar memory do review-router com learnings**

- [ ] **Step 4: PR final da Fase 6**

```bash
gh pr create --base main --title "chore(agents): review-router v1.1 consolidation (Fase 6)" --body "Aplicação de learnings do rollout."
```

### Task 6.3: Tag release

- [ ] **Step 1: Criar tag**

```bash
git tag -a v1.5.0 -m "review-router rollout completo (Fases 1-6)"
git push origin v1.5.0
```

- [ ] **Step 2: Atualizar footer de versão**

Em `.agents/specs/conventions/estrutura-e-versionamento.md`, adicionar linha:

```markdown
| v1.5.0 | 2026-09-22 | feat(agents): review-router rollout (Fases 1-6) |
```

- [ ] **Step 3: PR de bump footer**

```bash
gh pr create --base main --title "chore(monorepo): bump v1.5.0 footer" --body "..."
```

---

