---
name: spec
version: 1.0
updated: 2026-09-30
maintainer: agent-architect
description: "Template canônico de Spec de feature — implementa a estrutura Intent → Business Rules → Acceptance Criteria → Contracts → Evals → Plan → Tasks definida pela convenção `evals.md` (frameworl canônico de Evals)."
related:
  - ../conventions/evals.md
  - ../conventions/state-aware-planning.md
  - ../conventions/tdd.md
  - ../conventions/retrospective-capture.md
usage: |
  Copie este arquivo para specs/<NNN>-<feature>/spec.md e preencha cada seção.
  Remova os comentários <!-- ... --> após preencher.
  Mantenha BR-XXX e AC-XXX enumerados sequencialmente.
source_article: Dennis Rojas (Tech na Prática, 2026-09-15) §"SDD: especificação antes da implementação"
---

# Spec — `<NNN>-<feature-name>`

> **Template version:** 1.0 (2026-09-30) · **Mantido por:** `agent-architect` · **Convenções:** [`evals.md`](../conventions/evals.md), [`state-aware-planning.md`](../conventions/state-aware-planning.md)

## 1. Intent

<!-- Resuma em 2-5 linhas o QUE esta feature faz e POR QUE. Sem entrar em COMO. -->

**Feature:** `<feature-name>`
**Slug:** `<NNN>-<feature-name>` (kebab-case, zero-padded, ex: `005-send-pix`)
**Owner:** `<github-handle-do-spec-author>`
**State-snapshot de origem:** `.agents/runs/state-snapshot-<TS>.md`
**Bounded Context(s):** `<ex: Pix, Accounts>`

## 2. Business Rules

<!-- Regras de negócio enumeradas. Cada BR-XXX será referenciada por AC-XXX e por Eval-XXX. -->

- **BR-001** —
- **BR-002** —
- **BR-003** —
- **BR-004** —
- **BR-005** —
- **BR-006** —
- **BR-007** —

## 3. Acceptance Criteria

<!-- Cada AC referencia ≥1 BR e declara qual(is) Eval(s) a cobre(m). Ver convenção evals.md §5. -->

- **AC-001** (BR-001) — <descrição>
  - eval: [`EVAL-D-XXX`](./evals/domain.evals.yaml)
  - manual: false
- **AC-002** (BR-002) — <descrição>
  - eval: [`EVAL-D-XXX`](./evals/domain.evals.yaml), [`EVAL-I-XXX`](./evals/integration.evals.yaml)
  - manual: false
- **AC-003** (BR-003) — <descrição>
  - eval: [`EVAL-D-XXX`](./evals/domain.evals.yaml)
  - manual: false

## 4. Data Model

<!-- Descreva schema Prisma, migrations, invariantes. Liste caminhos de arquivo. -->

### Entidades

- `<EntityName>` (`apps/api/src/<bounded-context>/domain/entities/<entity>.entity.ts`)
  - campos: `id, ...`
  - invariantes: `<ex: balance >= 0>`

### Schema Prisma

<!-- Cole o trecho de schema.prisma que esta feature introduz/altera. -->

```prisma
model ExampleEntity {
  id        String   @id @default(uuid())
  // ...
  createdAt DateTime @default(now())
}
```

### Migrations

- `<NNNN>_create_<entity>.sql` (gerada por `prisma migrate dev`)

## 5. Contracts

### 5.1 API (REST / GraphQL)

<!-- Para cada endpoint, descreva request/response. Link para contracts/api.md se longo. -->

| Method | Path                      | Auth      | Body                  | Response (2xx)          | Errors (4xx/5xx)               |
|--------|---------------------------|-----------|-----------------------|--------------------------|--------------------------------|
| POST   | `/api/v1/<resource>`      | Bearer    | `{ field: type }`     | `201 { id: uuid }`       | `400 VALIDATION`, `409 CONFLICT`|

**Spec OpenAPI:** [`./contracts/api.md`](./contracts/api.md)

### 5.2 Events (Kafka / RabbitMQ / etc.)

| Topic              | Schema (Avro/JSON) | Producer        | Consumer        | Evals                  |
|--------------------|--------------------|-----------------|-----------------|------------------------|
| `<topic>.created`  | `./contracts/events.md` | `<bc>` | `<bc>`  | `EVAL-C-XXX` (Contract)|

**Spec AsyncAPI:** [`./contracts/events.md`](./contracts/events.md)

## 6. Evals

> **Framework:** ver [`../conventions/evals.md`](../conventions/evals.md) §2 (7 tipos) e §3 (path conventions).

Declarar todos os Evals desta spec. **Regra 1:1:** cada AC deve ter ≥1 Eval. Tipos esperados (preencher conforme aplicável):

- `evals/domain.evals.yaml` — Domain Evals (BR/AC do use case)
- `evals/architecture.evals.yaml` — Architecture Evals (fronteiras DDD)
- `evals/contract.evals.yaml` — Contract Evals (API/events conforme spec §5)
- `evals/integration.evals.yaml` — Integration Evals (ponta-a-ponta, Bounded Contexts)
- `evals/regression.evals.yaml` — Regression Evals (bugs anteriores conhecidos)
- `evals/security.evals.yaml` — Security Evals (OWASP, secrets, auth)
- `evals/observability.evals.yaml` — Observability Evals (traces, metrics, logs)

**Template de cada arquivo** está em [`../conventions/evals.md`](../conventions/evals.md) §3 (bloco YAML).

## 7. Plan

<!-- Visão macro: fases, ordem de execução, agents envolvidos. Detalhamento atômico em tasks.md. -->

### Fases

1. **F1 — Domain layer** (owner: `nestjs-specialist`) — entities + value objects + domain services
2. **F2 — Application layer** (owner: `nestjs-specialist`) — use cases + ports
3. **F3 — Infrastructure layer** (owner: `nestjs-specialist`) — Prisma repository + controllers
4. **F4 — Domain + Integration Evals** (owner: `test-writer`) — TDD Red → Green → Refactor
5. **F5 — Architecture Evals** (owner: `stack-code-reviewer`) — ArchUnit rules
6. **F6 — Contract + Security Evals** (owner: `test-writer` + `security-auditor`)
7. **F7 — Observability Evals** (owner: `telemetry-specialist`) — OTel assertions

### Composição

- **Sequential** dentro de cada fase
- **Parallel** entre F4 e F5 (independentes)
- **Gating:** `code-reviewer` ao final de cada fase

## 8. Tasks

<!-- Decomposição atômica: cada task cabe em 1 agent. Ver WORKFLOWS.md `feature-mode`. -->

- [ ] **T-001** — `<descrição atômica>` (agent: `nestjs-specialist`, depends_on: [])
- [ ] **T-002** — `<descrição atômica>` (agent: `nestjs-specialist`, depends_on: [T-001])
- [ ] **T-003** — `<descrição atômica>` (agent: `test-writer`, depends_on: [T-002])
- [ ] **T-004** — `<descrição atômica>` (agent: `stack-code-reviewer`, depends_on: [T-003])
- [ ] **T-005** — `<descrição atômica>` (agent: `code-reviewer`, depends_on: [T-003, T-004])

## 9. Out of Scope

<!-- Liste explicitamente o que NÃO está nesta spec. Previne escopo creep. -->

- `<ex: não inclui retry automático de Pix — spec separada>`
- `<ex: não inclui UI mobile — apenas API>`

## 10. Open Questions

<!-- Dúvidas em aberto que PRECISAM ser respondidas antes da fase de implementação. -->

- [ ] `<ex: qual o timeout aceitável para Pix out? 5s ou 30s?>`
- [ ] `<ex: como tratar idempotency-key duplicada em janela de 24h?>`

## 11. Cross-references

- Bounded Contexts: [`docs/domain/bounded-contexts.md`](../../../docs/domain/bounded-contexts.md)
- Context Map: [`docs/domain/context-map.md`](../../../docs/domain/context-map.md)
- ADRs: [`docs/architecture/adr/`](../../../docs/architecture/adr/)
- State-snapshot: `.agents/runs/state-snapshot-<TS>.md`
- Plan detalhado: [`./plan.md`](./plan.md)
- Tasks detalhadas: [`./tasks.md`](./tasks.md)

---

<!-- markdownlint-disable MD025 -->
# Checklist de Revisão (`tamanho-e-revisao.md`)
<!-- markdownlint-enable MD025 -->

- [ ] Business Rules enumeradas (BR-001 ...)
- [ ] Acceptance Criteria com referência a BR
- [ ] Cada AC com ≥1 Eval declarado (regra 1:1 — ver `evals.md` §5)
- [ ] Data Model com schema Prisma + invariantes
- [ ] Contracts (API + Events) com tabela de endpoints/topics
- [ ] Evals declarados nos 7 arquivos canônicos (quando aplicável)
- [ ] Plan em fases com composition (sequential/parallel) explícita
- [ ] Tasks com agent + depends_on
- [ ] Out of Scope preenchido
- [ ] Open Questions respondidas antes da implementação
- [ ] Cross-refs preenchidas (Bounded Contexts, Context Map, ADRs, state-snapshot)
- [ ] State-snapshot da demanda referenciado no frontmatter `state_snapshot_of_origin`

**Mantido por:** projeto-base contributors · **Licença:** MIT
