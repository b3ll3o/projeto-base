# WORKFLOWS.md — Fluxos Genéricos Pré-Configurados

> Workflows reutilizáveis baseados no padrão `agents:coordinate`. Cada workflow define uma sequência (ou composição) de agents que pode ser disparada por trigger.

---

## Índice de Workflows

### Genéricos

| ID | Trigger | Tipo | Agents |
|----|---------|------|--------|
| `feature-mode` | "implementar X" | sequential | orchestrator → explorer → test-writer → code-reviewer → tdd-enforcer |
| `bugfix-mode` | "corrigir bug" | sequential | orchestrator → explorer → test-writer → code-reviewer → tdd-enforcer |
| `refactor-mode` | "refatorar" | sequential | refactorer → test-writer → code-reviewer → tdd-enforcer |
| `security-mode` | "auditoria segurança" | sequential | security-auditor → code-reviewer |
| `docs-mode` | "documentar" | sequential | doc-writer → code-reviewer |
| `task-mode` | "todo / tarefa" | single | task-manager |
| `explore-mode` | "como funciona X?" | single | explorer |
| `review-mode` | "revisar PR / código" | single | code-reviewer + tdd-enforcer |
| `release-mode` | "preparar release X.Y.Z" | sequential | doc-writer → code-reviewer → task-manager |
| `ci-defense-mode` | "blindar CI / auditar pipeline" | sequential | monorepo-specialist → ci-defense-in-depth → code-reviewer |
| `retrospective-mode` | "capturar aprendizados / post-mortem" | sequential | explorer → retrospective-capture → doc-writer (+ task-manager) |
| `review-routing` | _(pendente Fase 3)_ | sequential | review-router → specialists (auto-dispatched via matriz) |
| `specialist-routing` | specialist-router | sequential | router → controller (decide planejar ou bloquear) |

### Por Stack (workflows detalhados em `.agents/workflows/`)

| ID | Trigger | Tipo | Agents | Detalhe |
|----|---------|------|--------|---------|
| `backend-feature` | "implementar endpoint NestJS" | sequential | nestjs-specialist → test-writer → code-reviewer → tdd-enforcer | [`.agents/workflows/backend-feature.md`](./workflows/backend-feature.md) |
| `frontend-feature` | "criar página/rota Next.js" | sequential | nextjs-specialist → test-writer → code-reviewer → tdd-enforcer | [`.agents/workflows/frontend-feature.md`](./workflows/frontend-feature.md) |
| `monorepo-change` | "adicionar/mover pacote ou app" | sequential | monorepo-specialist → code-reviewer | [`.agents/workflows/monorepo-change.md`](./workflows/monorepo-change.md) |

---

## `feature-mode` — Implementar Nova Funcionalidade

**Trigger:** "implementar X", "criar feature Y", "adicionar Z"

**Composição:** sequential (4 estágios)

```text
┌─────────────────┐
│   ORCHESTRATOR  │  Decompõe feature em tasks
└────────┬────────┘
         ▼
┌─────────────────┐
│    EXPLORER     │  Mapeia código existente, padrões a seguir
└────────┬────────┘
         ▼
┌─────────────────┐
│   TEST-WRITER   │  Escreve testes primeiro (TDD)
└────────┬────────┘
         ▼
┌─────────────────┐
│  CODE-REVIEWER  │  Revisa implementação final
└─────────────────┘
```

**Handoff entre agents:**

```yaml
orchestrator → explorer:
  task: "Mapear módulo X e identificar padrões para feature Y"
  context: ["src/module-x/", "docs/architecture.md"]
  expected_output: { files: [...], patterns: [...], dependencies: [...] }
  success_criteria: "Lista de arquivos relevantes + padrões identificados"

explorer → test-writer:
  task: "Criar testes para feature Y seguindo padrões do módulo X"
  context: ["padrões descobertos pelo explorer"]
  expected_output: { test_files: [...], coverage_target: 80 }
  success_criteria: "Testes falham antes da implementação (TDD red)"

test-writer → code-reviewer:
  task: "Revisar implementação + testes"
  context: ["diff completo"]
  expected_output: { approved: bool, findings: [...] }
  success_criteria: "Nenhum finding blocker; coverage ≥ 80%"
```

---

## `bugfix-mode` — Corrigir Bug

**Trigger:** "corrigir bug", "resolver issue #N", "X não funciona"

**Composição:** sequential (4 estágios, com loop até reproduction)

```text
ORCHESTRATOR → EXPLORER → TEST-WRITER (escreve repro test) → CODE-REVIEWER
                                                       ↑          │
                                                       └──────────┘ (loop se repro falhar)
```

**Handoff:**

```yaml
orchestrator → explorer:
  task: "Reproduzir bug e identificar causa raiz"
  context: ["descrição do bug", "logs", "issue tracker link"]
  expected_output: { repro_steps: [...], root_cause: string, affected_files: [...] }

explorer → test-writer:
  task: "Escrever teste de regressão que reproduz o bug"
  context: ["repro_steps do explorer"]
  expected_output: { failing_test: "..." }
  success_criteria: "Teste falha antes do fix; passa depois"

test-writer → code-reviewer:
  task: "Revisar fix + teste de regressão"
  context: ["diff do fix", "teste de regressão"]
```

---

## `refactor-mode` — Refatoração Incremental

**Trigger:** "refatorar", "simplificar código", "aplicar pattern X"

**Composição:** sequential (3 estágios, TDD-driven)

```text
REFACTORER → TEST-WRITER (garante testes existentes) → CODE-REVIEWER
```

**Princípio:** NUNCA refatorar sem testes. Se não houver, `test-writer` cria primeiro.

**Handoff:**

```yaml
refactorer → test-writer:
  task: "Verificar cobertura de testes do código a refatorar"
  context: ["arquivos a refatorar"]
  expected_output: { coverage: number, missing_tests: [...] }
  success_criteria: "Coverage ≥ 80% ANTES de iniciar refatoração"

test-writer → code-reviewer:
  task: "Revisar refatoração preservando comportamento"
  context: ["diff da refatoração", "testes que devem continuar passando"]
  expected_output: { behavior_preserved: bool, findings: [...] }
  success_criteria: "Todos os testes existentes continuam verdes"
```

---

## `security-mode` — Auditoria de Segurança

**Trigger:** "auditoria segurança", "verificar OWASP", "revisar auth/payments"

**Composição:** sequential (2 estágios)

```text
SECURITY-AUDITOR → CODE-REVIEWER
```

**Foco do security-auditor:**

- OWASP Top 10 (A01:2021 a A10:2021)
- Supply chain (dependências desatualizadas, vulneráveis)
- Secrets em código (.env, hardcoded credentials)
- Validação de input / output encoding
- Autenticação / autorização / sessão
- Criptografia em trânsito e repouso

**Handoff:**

```yaml
security-auditor → code-reviewer:
  task: "Revisar findings de segurança com lens de impacto real"
  context: ["lista de findings do security-auditor"]
  expected_output: { severity_classification: {...}, exploitability: {...} }
  success_criteria: "Findings classificados por CVSS ou OWASP risk rating"
```

---

## `docs-mode` — Documentação

**Trigger:** "documentar", "gerar README", "escrever ADR"

**Composição:** sequential (2 estágios)

```text
DOC-WRITER → CODE-REVIEWER
```

**Foco do doc-writer:**

- Linguagem clara e concisa
- Exemplos de código sempre que possível
- Diagramas para fluxos complexos
- Manter atualizado com mudanças de código (refs cruzadas)

---

## `task-mode` — Gestão de Tarefas

**Trigger:** "todo", "tarefa", "criar task", "atualizar backlog"

**Composição:** single agent

```text
TASK-MANAGER
```

**Output:**

```yaml
- id: TASK-001
  title: ...
  status: todo | in_progress | done
  priority: low | medium | high | critical
  assignee: ...
  dependencies: [...]
  acceptance_criteria: [...]
```

---

## `explore-mode` — Exploração Read-Only

**Trigger:** "como funciona X?", "onde fica Y?", "explorar módulo Z"

**Composição:** single agent (read-only)

```text
EXPLORER
```

**Saída típica:**

- Mapa de arquivos relevantes
- Diagrama de dependências
- Padrões arquiteturais identificados
- Pontos de extensão

---

## `review-mode` — Revisão de Código

**Trigger:** "revisar PR", "revisar diff", "code review"

**Composição:** single agent

```text
CODE-REVIEWER
```

**Categorias de findings:**

- 🐛 **Bugs** — comportamento incorreto, edge cases, race conditions
- ⚠️ **Smells** — design ruim, complexidade ciclomática alta, naming
- 🔒 **Segurança** — vulnerabilidades, validação faltando, secrets
- ⚡ **Performance** — complexidade algorítmica, queries N+1, memory leaks
- 🧪 **Testabilidade** — cobertura baixa, testes frágeis, mocks excessivos
- 📐 **Estilo** — convenções do projeto, formatação

---

## `release-mode` — Bump de Versão do Template

**Trigger:** "preparar release", "bumpar versão X.Y.Z", "tag release" · **Composição:** sequential (3 estágios)

```text
DOC-WRITER → CODE-REVIEWER → TASK-MANAGER
```

```yaml
doc-writer → code-reviewer:{success_criteria:"versão bumped+CHANGELOG+0 cross-ref quebrada"} | code-reviewer → task-manager:{success_criteria:"nenhum finding blocker;checklist pronto"} | task-manager → final:{success_criteria:"tag X.Y.Z publicada+checklist 100%"}
```

**Quando usar:** mudanças breaking/features desde última tag · milestone (MVP/GA/v2.0.0) · backlog maduro.
**Quando NÃO usar:** hotfix urgente (`bugfix-mode` + tag manual) · bump interno ad-hoc · dep upstream (Renovate/Dependabot).
**Detalhes:** [`.agents/workflows/release-mode.md`](./workflows/release-mode.md) · spec: [`.agents/specs/conventions/post-merge-release.md`](./specs/conventions/post-merge-release.md)

## `review-routing` — Orquestrador de Revisão Pós-Task

> Despacha specialists baseado em classificação de diff.

**Status:** Pendente (Fase 3) — agent `review-router` ainda não existe.

**Triggers:** Manual (controller invoca após implementer DONE).

**Responsável:** review-router agent.

**Inputs:** `task{scope}`, `branch{base,head}`, `implementer_output_path`.

**Outputs:** `.agents/runs/<timestamp>-review-<n>.yaml` com classification + reviewers_dispatched + findings_aggregated.

**Cross-refs:**

- `.agents/agents/review-router.md` _(a criar em Fase 3)_
- `.agents/specs/conventions/review-routing.md` _(criado em Fase 1)_
- `.agents/skills/review-routing/SKILL.md` _(a criar em Fase 3)_

## `specialist-routing` — Orquestrador de Demanda Pré-Planning

> Classifica demanda (keywords + paths + scope) via matriz canônica e despacha specialists em paralelo.

**Trigger:** Demanda com escopo técnico definido (qualquer task exceto housekeeping trivial ou documentação isolada).

**Responsável:** Controller (operador) invoca `specialist-router` via Agent tool.

**Inputs:** `task{description, scope}`, `context{paths, branch}`.

**Outputs:** `.agents/runs/<timestamp>-specialist-<n>.yaml` com `classification` + `specialists_dispatched` + `plans_aggregated` + `gap_detected` + `suggested_specialist`.

**Comportamento resumido:**

1. Pre-dispatch checks (matriz canônica + agent + convenção `evolucao-agents`)
2. Escrever temp files (`.agents/runs/<ts>-demand.txt` + `<ts>-paths.txt`)
3. Despachar `specialist-router` via Agent tool
4. Interpretar YAML de output
5. Triage: se `gap_detected: true` → dispatch `agent-architect`; senão prosseguir
6. Integrar `plans_aggregated` com workflow `writing-plans`

**Detalhes:** [`.agents/workflows/specialist-routing.md`](./workflows/specialist-routing.md) · skill: [`.agents/skills/specialist-routing/SKILL.md`](./skills/specialist-routing/SKILL.md)

**Cross-refs:**

- [`.agents/agents/specialist-router.md`](./agents/specialist-router.md)
- [`.agents/specs/conventions/specialist-routing.md`](./specs/conventions/specialist-routing.md) — matriz canônica
- [`.agents/memory/specialist-router.md`](../memory/specialist-router.md)
- [`.agents/specs/conventions/evolucao-agents.md`](./specs/conventions/evolucao-agents.md) — regra gap_detected

## `retrospective-mode` — Captura de Aprendizados Pós-Atividade

**Trigger:** "capturar aprendizados" / "retrospectiva" / "post-mortem" · plano ≥3 tasks · bugfix > 30min · 1ª adoção de skill · **Composição:** sequential + task-manager paralelo no final

```yaml
explorer → retrospective-capture:{success_criteria:"diff+memories+≥3 events"} | retrospective-capture → doc-writer:{success_criteria:"0 proposals conf<70;result file ≤300 linhas"} | doc-writer + task-manager (paralelo):{success_criteria:"proposals → memory/PR/backlog"}
```

**Quando usar:** T1 implementação grande · T2 bugfix não-trivial · T3 adoção de novo padrão. **Quando NÃO usar:** typo fix · dep bump · merge conflict · doc-only trivial.
**Detalhes:** [`retrospective-mode.md`](./workflows/retrospective-mode.md) · skill: [`retrospective-capture/SKILL.md`](./skills/retrospective-capture/SKILL.md) · spec: [`retrospective-capture.md`](./specs/conventions/retrospective-capture.md)

## Workflows por Stack

- [`backend-feature`](./workflows/backend-feature.md) — implementar endpoint NestJS
- [`frontend-feature`](./workflows/frontend-feature.md) — criar página/rota Next.js
- [`monorepo-change`](./workflows/monorepo-change.md) — adicionar/mover pacote ou app

## Customização

Para criar um workflow customizado: defina `trigger`, escolha a `composição` (sequential/parallel/hierarchical), liste os `agents` em ordem, defina os `handoffs` (task, context, expected_output, success_criteria), adicione entrada na tabela acima, e documente em `.agents/workflows/<id>.md` se for complexo.

**Mantido por:** projeto-base contributors  **Versão do padrão:** 1.0
