# `feature-mode` — Implementar Nova Funcionalidade

> Workflow detalhado referenciado por [`.agents/WORKFLOWS.md`](../WORKFLOWS.md).

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

**Variações por stack:**

- Backend NestJS → usar `backend-feature` (inclui lens DDD/Hexagonal + Zod)
- Frontend Next.js → usar `frontend-feature` (inclui lens RSC/Tailwind)
- Cross-stack → este workflow com explicitação de camadas

**Referências cruzadas:**

- Handoff estruturado: [`.agents/skills/agents-coordinate/SKILL.md`](../skills/agents-coordinate/SKILL.md)
- TDD: [`.agents/specs/conventions/tdd.md`](../specs/conventions/tdd.md)
- State-aware (camada 0): [`state-aware-planning.md`](./state-aware-planning.md)
- Engineering Loop: [`feedback-to-spec.md`](./feedback-to-spec.md) fecha o ciclo com aprendizados