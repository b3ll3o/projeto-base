---
name: review-routing
description: Workflow completo para o controller invocar o review-router após implementer DONE. Cobre inputs, dispatch, interpretação do output, fix loop. Use em qualquer task pós-implementer.
---

# Skill: review-routing

> Quando invocar: após qualquer implementer (subagent) reportar DONE.

## Inputs necessários (do controller)

```yaml
task: { scope: "trivial|medium|large", description: "..." }
context:
  branch: { base: "main", head: "<branch>" }
  pr_number: <int>           # opcional
  implementer_output_path: ".agents/runs/<impl>-<n>.yaml"
```

## Passo 1: Pre-dispatch checks (controller)

```bash
# Working tree limpo? (warn se dirty em scope=trivial)
git status --porcelain

# Branch base existe?
git rev-parse --verify $BASE

# Matriz existe?
test -f .agents/specs/conventions/review-routing.md
```

Se qualquer check falhar, abortar antes de chamar router.

## Passo 2: Despachar router

```typescript
Agent(
  agent="review-router",
  prompt={inputs JSON + contexto da task}
)
```

## Passo 3: Interpretar output

Ler `.agents/runs/<timestamp>-review-<n>.yaml`. Validar schema:

- `reviewers_dispatched[]` não-vazio OU todos com `skipped: true` (e reasons documentados)
- `findings_aggregated.totals` presente
- `classification_evidence[]` presente (rastreabilidade)

## Passo 4: Triage (controller)

Para cada finding em `findings_aggregated`:

- `consensus: true` → geralmente IMPORTANT (confiança alta)
- `severity: blocker` → sempre BLOCKING
- `severity: major` → triagem manual
- `severity: minor` ou `info` → geralmente NICE-TO-HAVE

Se houver BLOCKING ou IMPORTANT → dispatch fix-implementer (Task 5: fix loop).

## Passo 5: Fix loop

```yaml
fix_task:
  scope: medium
  description: "Corrigir findings de review #<n>"
  target_findings: [...]    # IDs ou file:line
  review_run_id: <timestamp>-review-<n>
```

Após fix DONE, **re-despachar router** (re-rodar Task 1-5 com branch atualizada).

## Passo 6: Decidir avançar

- Se router retorna 0 BLOCKING/IMPORTANT → controller pode prosseguir
- Se ainda houver após 2 rounds de fix → escalar (humano ou task maior)

## Anti-padrões

- ❌ Pular router e dispatchar reviewers manualmente (perde rastreabilidade)
- ❌ Avançar com BLOCKING não tratado (viola `review-and-fix-after-each-task`)
- ❌ Re-despachar router sem fix (mesmo output esperado)
- ❌ Modificar matriz fora de PR (perde versionamento)

## Cross-refs

- [`.agents/agents/review-router.md`](../../agents/review-router.md)
- [`.agents/specs/conventions/review-routing.md`](../../specs/conventions/review-routing.md)
- Memory: [`two-stage-review-after-each-task`](../../../../home/leo/.claude/projects/-home-leo-Documentos-projetos-base/memory/two-stage-review-after-each-task.md), [`review-and-fix-after-each-task`](../../../../home/leo/.claude/projects/-home-leo-Documentos-projetos-base/memory/review-and-fix-after-each-task.md)