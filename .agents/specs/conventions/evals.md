---
name: evals
version: 1.0
updated: 2026-09-30
maintainer: agent-architect
description: "Framework canônico de Evals (Domain, Architecture, Contract, Integration, Regression, Security, Observability) — institui onde moram, quem é dono, como são escritos e como viram parte verificável do fluxo SDD/Engineering Loop do projeto-base."
related:
  - ./state-aware-planning.md
  - ./tdd.md
  - ./ci-defense-in-depth.md
  - ./retrospective-capture.md
  - ../templates/spec.md
  - ../../../docs/articles/vibe-coding-sdd-engineering-loop-mapping.md
source_article: Dennis Rojas (Tech na Prática, 2026-09-15) §"Evals: a spec precisa ser verificável"
---

# Convenção: `evals` (framework canônico de Evals)

> pt-BR: define **o que é um Eval**, **quais tipos existem**, **onde mora cada um** no repositório, **quem é dono**, e como Evals se integram ao SDD/Engineering Loop do projeto-base. Inspirada em Dennis Rojas (*Tech na Prática*, 15/09/2026) e adaptada ao catálogo de agents já existente.

## §0. Origem da regra

O mapping file ([`docs/articles/vibe-coding-sdd-engineering-loop-mapping.md`](../../../docs/articles/vibe-coding-sdd-engineering-loop-mapping.md)) lista **Evals** como conceito central do artigo de Dennis Rojas. Hoje o projeto-base cobre Eval indiretamente via:

- `tdd.md` (Red→Green→Refactor) — cobre Domain + parte de Integration
- `stack-code-reviewer` (lens D11 DDD/Hexagonal) — cobre Architecture
- `ci-defense-in-depth.md` (7 checks estruturais) — cobre drift, **não** semântica
- `security-auditor` (OWASP) — cobre Security
- `telemetry-specialist` (OpenTelemetry) — cobre Observability (instrumentação, não Eval)

Esses cobrem ~4 dos 7 tipos. Falta um **framework unificado** que:

1. Defina os 7 tipos de forma canônica
2. Diga **onde mora cada Eval** no repositório
3. Defina **quem é dono** (specialist que cria / agent que verifica)
4. Defina **como Evals se relacionam com Acceptance Criteria** (Spec → AC → Evals)
5. Defina **como falhar** (gate vs advisory)

Esta convenção preenche esse gap. É **camada 1 do Engineering Loop** (depois do state-aware-planning camada 0, antes do specialist-router).

## §1. Definição canônica

> **Spec** = comportamento esperado
> **Eval** = evidência automatizável de que o comportamento foi respeitado

**Eval ≠ teste unitário tradicional**, embora possa ser implementado como um. Características obrigatórias:

1. **Declarativo** — escrito antes da implementação (SDD); evolui junto da spec
2. **Verificável** — roda em CI (gate) ou local (advisory)
3. **Rastreável** — referencia ID da spec (`BR-001`, `AC-003`) e ID do Eval (`EVAL-D-001`)
4. **Não-negociável quando gate** — falhar bloqueia merge
5. **Possui dono** — um specialist do catálogo é responsável por mantê-lo

## §2. Os 7 tipos canônicos

| Tipo            | Pergunta que responde                                                   | Implementação típica                          | Gate?     | Owner                          |
|-----------------|-------------------------------------------------------------------------|-----------------------------------------------|-----------|--------------------------------|
| **Domain**      | As business rules (BR-XXX) são respeitadas?                             | `*.use-case.spec.ts`, fixtures de domínio    | **GATE**  | `test-writer`                  |
| **Architecture**| As fronteiras (DDD, Bounded Contexts, hexagonal) são respeitadas?        | `archunit/*.spec.ts`, dependency rules       | **GATE**  | `stack-code-reviewer` (D11)    |
| **Contract**    | O contrato público (API/events) bate com a spec?                       | Pact, OpenAPI schema validation, AsyncAPI     | **GATE**  | `test-writer` + `nestjs-specialist` |
| **Integration** | Componentes colaboram ponta-a-ponta?                                    | Testcontainers (Postgres, Redis, Kafka)       | **GATE**  | `test-writer`                  |
| **Regression**  | Bugfix anterior continua corrigido + features anteriores não quebraram? | Suite de regressão rotulada por spec-fonte    | **GATE**  | `test-writer`                  |
| **Security**    | OWASP Top 10 + secrets + supply chain estão OK?                         | SAST, SCA, secret-scan, OWASP rules           | **GATE**  | `security-auditor`             |
| **Observability**| Sinais essenciais (traces, metrics, logs) estão emitidos corretamente? | OTel collector assertion, metric presence     | advisory  | `telemetry-specialist`         |

> **Atenção:** o `coverage ≥ 80%` do `cobertura-testes.md` continua sendo o gate universal **agregado**. Evals adicionam **gates semânticos** (cada tipo acima), não substituem cobertura.

## §3. Onde mora cada Eval

Path canônico por spec:

```text
specs/<NNN>-<feature>/
├── spec.md                 # Spec + business rules + acceptance criteria
├── research.md             # Estado-da-arte, alternativas descartadas
├── data-model.md           # Schema, migrations, invariantes
├── contracts/
│   ├── api.md              # OpenAPI / REST / GraphQL contract
│   └── events.md           # AsyncAPI / Kafka topics contract
├── evals/
│   ├── domain.evals.yaml   # Lista de EVAL-D-XXX (declarativos)
│   ├── architecture.evals.yaml
│   ├── contract.evals.yaml
│   ├── integration.evals.yaml
│   ├── regression.evals.yaml
│   ├── security.evals.yaml
│   └── observability.evals.yaml
├── plan.md                 # Plano de implementação (steps + tasks)
└── tasks.md                # Tasks atômicas (cada uma → 1 agent)
```

Cada `<tipo>.evals.yaml` lista Evals daquele tipo. Formato canônico:

```yaml
- id: EVAL-D-001
  br: BR-001                    # business rule origem
  ac: AC-001                    # acceptance criterion origem
  type: domain
  title: "Conta inexistente falha com 404"
  given: "Account(id=missing) não existe no repositório"
  when: "UseCase.execute({ accountId: 'missing' })"
  then: "deve lançar NotFoundException com mensagem 'ACCOUNT_NOT_FOUND'"
  severity: blocker             # blocker | major | minor
  owner: test-writer
  implementation_hint: "apps/api/src/users/use-cases/get-user.spec.ts"
  status: pending               # pending | red | green | flaky
```

## §4. Quem cria, quem verifica, quem é dono

| Fase do fluxo         | Quem cria Evals      | Quem verifica       | Quem é dono ao longo do tempo |
|-----------------------|----------------------|---------------------|-------------------------------|
| **Spec writing**      | `analista-requisitos` (futuro) / `orchestrator` | n/a (criação)       | spec author                   |
| **Planejamento**      | `nestjs-specialist` / `nextjs-specialist` / stack specialist | `code-reviewer`     | specialist da stack            |
| **TDD Red**           | `test-writer`        | `test-writer` (RED) | `test-writer`                 |
| **TDD Green**         | specialist da stack  | `test-writer` (GREEN)| specialist da stack           |
| **Review paralelo**   | n/a                  | `stack-code-reviewer`, `code-reviewer`, `review-router` | reviewer que flagou |
| **CI gate**           | n/a                  | CI (`pnpm test`, `pnpm lint:arch`, `pnpm lint:security`) | n/a (automático) |
| **Engineering Loop**  | `retrospective-capture` (T2 bugfix) | `retrospective-mode` | spec author (próxima spec) |

## §5. Acceptance Criteria ↔ Evals (regra 1:1)

Toda Acceptance Criterion (`AC-XXX` em `spec.md`) DEVE ter **pelo menos 1 Eval** correspondente. A relação é 1:1 ou 1:N (uma AC coberta por N Evals).

Exceção: ACs puramente **exploratórias** (ex.: "verificar UX com 5 usuários") podem não ter Eval automatizável — nesse caso devem ser marcadas como `eval: manual` no YAML do AC.

```yaml
- id: AC-001
  br: BR-001
  description: "GET /users/:id retorna 200 quando conta existe"
  eval: [EVAL-D-001, EVAL-I-001]   # 2 Evals cobrem este AC
  manual: false

- id: AC-007
  br: BR-007
  description: "UX do fluxo de onboarding avaliada por 5+ usuários"
  eval: []
  manual: true                     # sem Eval automatizável
```

## §6. Como falhar (gate vs advisory)

| Severidade do Eval | Comportamento no CI                            |
|--------------------|------------------------------------------------|
| `blocker`          | Bloqueia merge; PR é reprovada                 |
| `major`            | Bloqueia merge se regressão                    |
| `minor`            | Reporta mas **não** bloqueia merge             |
| `advisory`         | Reporta, log-only, **não** bloqueia            |

Default sugerido:

- **Domain, Architecture, Contract, Integration, Regression, Security** → `blocker` por padrão
- **Observability** → `advisory` por padrão (instrumentação não falha o build)

## §7. Relação com convenções existentes

| Convenção existente                  | Como interage com Evals                                          |
|--------------------------------------|------------------------------------------------------------------|
| [`tdd.md`](./tdd.md)                 | TDD Red→Green é **uma** forma de implementar Evals (Domain/Integration) |
| [`state-aware-planning.md`](./state-aware-planning.md) | Cobertura agregada do state-snapshot inclui eval-gate status     |
| [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) | Layer 2 (preflight CI) executa eval-checks de Architecture/Security; Layer 3 (quality CI) roda Domain/Integration |
| [`cobertura-testes.md`](./cobertura-testes.md) | Coverage ≥ 80% é o **gate universal**; Evals adicionam gates semânticos por tipo |
| [`retrospective-capture.md`](./retrospective-capture.md) | T2 (bugfix > 30min) **sempre** abre Eval de Regression na spec corrigida |
| [`evolucao-agents.md`](./evolucao-agents.md) | Novo tipo de Eval → gap_detected → cria novo specialist ou expande existente |

## §8. Template de Spec (referência)

A estrutura `specs/<feature>/` é concretizada pelo template [`../templates/spec.md`](../templates/spec.md). Toda nova spec DEVE usar o template.

## §9. Critérios de aceite da própria convenção

A convenção `evals` está **ativa e obrigatória** quando:

- [x] `evals.md` publicado em `.agents/specs/conventions/`
- [x] `spec.md` template publicado em `.agents/specs/templates/`
- [x] AGENTS.md §6 referencia esta convenção
- [x] Pelo menos 1 workflow (`backend-feature`, `frontend-feature`, `feature-mode`) cita esta convenção
- [ ] Pelo menos 1 spec real do projeto usa o template (gap atual — não havia specs até esta versão)

## §10. Cross-references

- Mapping com artigo: [`docs/articles/vibe-coding-sdd-engineering-loop-mapping.md`](../../../docs/articles/vibe-coding-sdd-engineering-loop-mapping.md) §1
- Source article: [`docs/articles/vibe-coding-sdd-engineering-loop.md`](../../../docs/articles/vibe-coding-sdd-engineering-loop.md) §"Evals: a spec precisa ser verificável"
- WORKFLOWS: [`.agents/WORKFLOWS.md`](../../WORKFLOWS.md) → `feature-mode`, `backend-feature`, `frontend-feature`
- Agents: [`test-writer`](../../agents/test-writer.md), [`stack-code-reviewer`](../../agents/stack-code-reviewer.md), [`security-auditor`](../../agents/security-auditor.md), [`telemetry-specialist`](../../agents/telemetry-specialist.md), [`review-router`](../../agents/review-router.md)

## §11. Histórico de Versões

| Versão | Data       | Mudança                                                                                                              |
|--------|------------|----------------------------------------------------------------------------------------------------------------------|
| 1.0    | 2026-09-30 | Lançamento inicial — framework de 7 tipos, path conventions, gate rules, integração com WORKFLOWS e convenções existentes |
