# `bugfix-mode` — Corrigir Bug

> Workflow detalhado referenciado por [`.agents/WORKFLOWS.md`](../WORKFLOWS.md).

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

**Quando usar:**

- Bug reprodutível com steps claros
- Bug com teste de regressão viável
- Bug que afeta fluxo principal

**Quando NÃO usar:**

- Hotfix crítico em produção (usar `hotfix/` branch + PR com label `hotfix`)
- Bug de configuração (sem mudança de código)
- Bug em lib upstream (criar issue + workaround)

**Pós-fix obrigatório:**

- Dispara `retrospective-mode` se duração > 30min ou ≥ 2 arquivos afetados
- Atualiza memory de specialists relevantes