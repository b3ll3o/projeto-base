---
name: engineering-loop-03-test
version: 1.0
updated: 2026-09-30
description: "Fase 3 do Engineering Loop — Test. Lista Evals implementados (7 tipos), evidência TDD Red→Green→Refactor e coverage local. Gate do CI."
phase: 03-test
gate: true (bloqueia merge se coverage < 80% ou Evals falhando)
owner: test-writer
related:
  - ../../../conventions/engineering-loop.md
  - ../../../conventions/evals.md
  - ../../../conventions/tdd.md
  - ../../../conventions/cobertura-testes.md
  - ./02-implement.md
usage: |
  Copie para specs/<NNN>-<feature>/engineering-loop/03-test.md
  Preencha ao rodar a suíte de testes antes de abrir PR.
---

# Fase 03 — Test

> **Propósito:** provar que os Evals da spec passam e a cobertura agregada da spec está ≥ 80% (gate CI universal). Materializa o TDD Red→Green→Refactor em evidência reproduzível.

## 1. Spec origem

- [`../spec.md`](../spec.md)
- [`../evals/`](../evals/) (7 tipos canônicos)
- [`./02-implement.md`](./02-implement.md)

## 2. Evals implementados

| Tipo            | Arquivo de Eval                                          | Status atual (pending/red/green) | Owner            |
|-----------------|----------------------------------------------------------|----------------------------------|------------------|
| Domain          | [`../evals/domain.evals.yaml`](../evals/domain.evals.yaml) | `<ex: green>`                  | test-writer      |
| Architecture    | [`../evals/architecture.evals.yaml`](../evals/architecture.evals.yaml) | `<ex: green>` | stack-code-reviewer |
| Contract        | [`../evals/contract.evals.yaml`](../evals/contract.evals.yaml) | `<ex: green>`              | test-writer      |
| Integration     | [`../evals/integration.evals.yaml`](../evals/integration.evals.yaml) | `<ex: green>`         | test-writer      |
| Regression      | [`../evals/regression.evals.yaml`](../evals/regression.evals.yaml) | `<ex: green>`            | test-writer      |
| Security        | [`../evals/security.evals.yaml`](../evals/security.evals.yaml) | `<ex: green>`                | security-auditor |
| Observability   | [`../evals/observability.evals.yaml`](../evals/observability.evals.yaml) | `<ex: advisory>`       | telemetry-specialist |

## 3. TDD Red→Green→Refactor — evidência

<!-- Para cada Eval implementado, cite o teste que prova o ciclo. -->

| Eval ID    | RED (commit)  | GREEN (commit) | REFACTOR (commit) |
|------------|---------------|----------------|-------------------|
| EVAL-D-001 | `<abc123>`    | `<def456>`     | `<ghi789>`        |
| EVAL-I-001 | `<jkl012>`    | `<mno345>`     | (não aplicável)   |

## 4. Cobertura local

```bash
# Comando para reproduzir
pnpm --filter <app> test --coverage --collectCoverageFrom='src/<bc>/**/*.ts'
```

| Métrica       | Valor       | Threshold | Status |
|---------------|-------------|-----------|--------|
| Lines         | `<ex: 87%>` | ≥ 80%     | ✅      |
| Branches      | `<ex: 81%>` | ≥ 75%     | ✅      |
| Functions     | `<ex: 89%>` | ≥ 80%     | ✅      |

## 5. Suites executadas

```bash
# Comando para reproduzir
pnpm --filter <app> test
```

- **Unit:** `<ex: 24 specs, 24 passed, 0 failed>`
- **Integration:** `<ex: 8 specs, 8 passed, 0 failed>`
- **Contract (Pact/OpenAPI):** `<ex: 5 specs, 5 passed>`
- **Architecture (ArchUnit):** `<ex: 3 rules, 3 passed>`
- **E2E:** `<ex: 2 scenarios, 2 passed>`

## 6. Falhas conhecidas (transparência)

<!-- Liste falhas pré-existentes NÃO relacionadas a esta spec. Convenção: não bloquear merge. -->

- `<ex: TEST-LEGACY-001 — apps/api/src/legacy/foo.spec.ts — pré-existente, fix em spec-099>`

## 7. Saída esperada (handoff para fase 04)

- [ ] Tabela §2 com todos os Evals em `green` ou `advisory`
- [ ] Tabela §3 com RED+GREEN para cada Eval Domain/Integration
- [ ] §4 cobertura ≥ 80% lines
- [ ] §5 0 failed em todas as suites
- [ ] §6 transparente sobre falhas pré-existentes

---

**Próxima fase:** [`04-review.md`](./04-review.md)
