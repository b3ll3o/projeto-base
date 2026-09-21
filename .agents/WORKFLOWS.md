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

## Workflows por Stack

Os 3 workflows abaixo são detalhados em arquivos próprios:

- [`backend-feature`](./workflows/backend-feature.md) — implementar endpoint NestJS
- [`frontend-feature`](./workflows/frontend-feature.md) — criar página/rota Next.js
- [`monorepo-change`](./workflows/monorepo-change.md) — adicionar/mover pacote ou app

---

## Customização

Para criar um workflow customizado:

1. Defina o **trigger** (palavras-chave ou evento)
2. Escolha a **composição** (sequential / parallel / hierarchical)
3. Liste os **agents** na ordem de despacho
4. Defina os **handoffs** (task, context, expected_output, success_criteria)
5. Adicione uma entrada na tabela acima
6. Documente em `.agents/workflows/<id>.md` se for complexo

---

**Mantido por:** projeto-base contributors
**Versão do padrão:** 1.0
