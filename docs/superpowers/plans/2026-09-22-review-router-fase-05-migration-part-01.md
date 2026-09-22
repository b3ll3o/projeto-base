# Review-Router — Fase 5: Migração completa (todos workflows)

> **Parent plan:** [2026-09-22-review-router-plan.md](./2026-09-22-review-router-plan.md)
> **Spec:** [2026-09-22-review-router-design.md](../specs/2026-09-22-review-router-design.md)

**Fase 5: Migração completa**
**Tasks:** 5.1–5.7 (7 tasks)
**Entrega:** 5 workflows atualizados (backend-feature, frontend-feature, ci-defense-mode, release-mode, retrospective-mode) + 1 sprint de produção
**Validação:** Métricas P95 < 90s, FP rate < 10%, reviewer utilization ≥ 60% em tasks medium+

---

## Fase 5 — Migração completa (todos workflows)

### Task 5.1-5.5: Adicionar passo router em cada workflow

Para cada workflow abaixo, seguir o mesmo padrão da Task 3.4:

- [ ] **Task 5.1:** `.agents/workflows/backend-feature.md` — adicionar passo "Despachar review-router"
- [ ] **Task 5.2:** `.agents/workflows/frontend-feature.md` — idem
- [ ] **Task 5.3:** `.agents/workflows/ci-defense-mode.md` — idem (router pode ter lens específico)
- [ ] **Task 5.4:** `.agents/workflows/release-mode.md` — idem (release bump toca monorepo+docs)
- [ ] **Task 5.5:** `.agents/workflows/retrospective-mode.md` — idem (retrospectivas podem envolver mudanças amplas)

Para cada:
1. Localizar seção "Implementer Done"
2. Inserir passo router (mesmo template da Task 3.4)
3. Commit individual por workflow
4. pnpm ci:preflight

- [ ] **Task 5.6: PR da Fase 5**

```bash
git push
gh pr create --base main --title "feat(workflows): review-router em todos os workflows (Fase 5)" --body "Migração completa. 5 workflows atualizados."
```

### Task 5.7: 1 sprint de produção (validação)

- [ ] **Step 1: Habilitar router em produção**

Confirmar `REVIEW_ROUTER_ENABLED=true` (default).

- [ ] **Step 2: Monitorar métricas (1 sprint)**

Acompanhar em `.agents/runs/INDEX.md`:
- Latência P50/P95/P99
- Reviewers dispatched por task
- False positive rate (via triage do controller)
- Consensus rate

- [ ] **Step 3: Documentar em pilot-summary.md**

Adicionar métricas do sprint.

- [ ] **Step 4: PR com métricas**

Se houver ajustes na matriz, fazer PR com bump `version`.

---

