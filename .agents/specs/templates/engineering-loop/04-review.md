---
name: engineering-loop-04-review
version: 1.0
updated: 2026-09-30
description: "Fase 4 do Engineering Loop — Review. Captura findings por reviewer (code-reviewer, stack-code-reviewer, security-auditor), status por finding e decisões de arquitetura registradas. Gate do PR."
phase: 04-review
gate: true (PR bloqueado enquanto houver finding BLOCKING/IMPORTANT aberto)
owner: code-reviewer + stack-code-reviewer + security-auditor (paralelo via review-router)
related:
  - ../../../conventions/engineering-loop.md
  - ../../../conventions/evolucao-agents.md
  - ../../../../.agents/agents/review-router.md
  - ./03-test.md
usage: |
  Copie para specs/<NNN>-<feature>/engineering-loop/04-review.md
  Preencha durante/após o review paralelo (antes de mergear PR).
---

# Fase 04 — Review

> **Propósito:** consolidar todos os findings dos reviewers paralelos, seu status e decisões arquiteturais registradas durante o review. Gate do PR — só mergeia quando 0 BLOCKING/IMPORTANT abertos.

## 1. Spec origem

- [`../spec.md`](../spec.md)
- [`./03-test.md`](./03-test.md)
- **PR:** `<#NNN>` — `<url>`

## 2. Reviewers acionados

<!-- Lista dos reviewers despachados (manual ou via review-router). -->

- [ ] `code-reviewer` (qualidade geral + spec)
- [ ] `stack-code-reviewer` (lens DDD/Hexagonal — D11)
- [ ] `security-auditor` (OWASP — se escopo toca auth/payments/secrets)
- [ ] `tdd-enforcer` (ciclo Red→Green→Refactor respeitado)
- [ ] `review-router` (auto-classificação de diff)

## 3. Findings por reviewer

### 3.1 code-reviewer

| ID    | Severity   | Resumo                                    | Status      | Fix commit |
|-------|------------|-------------------------------------------|-------------|------------|
| CR-001| IMPORTANT  | `<ex: n+1 query em getUserById>`          | `<open>`    | `<...>`    |
| CR-002| NICE       | `<ex: extrair magic number para constante>`| `<deferred>`| (não aplic.) |

### 3.2 stack-code-reviewer (lens D11)

| ID    | Severity   | Resumo                                    | Status      | Fix commit |
|-------|------------|-------------------------------------------|-------------|------------|
| D11-001| BLOCKER   | `<ex: domain/ importa infrastructure/>`  | `<open>`    | `<...>`    |
| D11-002| NICE      | `<ex: enrich entity com audit field updatedBy>`| `<fixed>` | `<...>`    |

### 3.3 security-auditor (se aplicável)

| ID    | Severity   | Resumo                                    | Status      | Fix commit |
|-------|------------|-------------------------------------------|-------------|------------|
| SEC-001| BLOCKER   | `<ex: SQL injection em raw query>`        | `<open>`    | `<...>`    |

### 3.4 tdd-enforcer

| ID    | Severity   | Resumo                                    | Status      | Fix commit |
|-------|------------|-------------------------------------------|-------------|------------|
| TDD-001| BLOCKER   | `<ex: <use-case> sem teste de regressão>` | `<open>`    | `<...>`    |

## 4. Status consolidado

| Severity    | Abertos | Fixed | Deferred | Total |
|-------------|---------|-------|----------|-------|
| BLOCKER     | `<0>`   | `<n>` | `<0>`     | `<n>` |
| IMPORTANT   | `<0>`   | `<n>` | `<0>`     | `<n>` |
| NICE        | `<n>`   | `<n>` | `<n>`     | `<n>` |

**Gate do PR:** merge APENAS quando BLOCKER=0 e IMPORTANT=0.

## 5. Decisões de arquitetura registradas

<!-- Decisões tomadas durante o review que merecem virar ADR ou memory. -->

- **ADR-XXXX:** `<título>` → registrada em `docs/architecture/adr/`
- **MEMORY:** `<agent> — decisão: ...>` → atualizada em `.agents/memory/<agent>.md`
- **PROPOSAL:** `<proposal T1/T2/T3 com confidence ≥ 70>` → capturada em retro

## 6. Cross-refs com code review

- Findings detalhados: comments no PR `#<NNN>` ou em `.agents/runs/<ts>-review-<n>.yaml`
- Review-routing output: `.agents/runs/<ts>-review-<n>.yaml`

## 7. Saída esperada (handoff para fase 05)

- [ ] Tabela §4 com BLOCKER=0 e IMPORTANT=0
- [ ] §5 com ≥ 1 decisão registrada (se houver)
- [ ] PR `#<NNN>` aprovado + mergeado
- [ ] `04-review.md` commitada no PR final

---

**Próxima fase:** [`05-observe.md`](./05-observe.md) (pós-merge)
