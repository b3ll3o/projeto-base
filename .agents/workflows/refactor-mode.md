# `refactor-mode` — Refatoração Incremental

> Workflow detalhado referenciado por [`.agents/WORKFLOWS.md`](../WORKFLOWS.md).

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

**Disparo adicional (v1.5+):**

Após `refactorer` finalizar, `review-router` é invocado para classificar o diff e despachar `stack-code-reviewer` se houver mudança em `apps/`, `packages/` ou `tooling/` que toque boundaries DDD/Hexagonal.

**Quando usar:**

- Code smells detectados (complexidade ciclomática, god class, etc.)
- Aplicação de padrão arquitetural (ex: extrair porta, mover para shared)
- Preparação para nova feature (limpar terreno)

**Quando NÃO usar:**

- Refatoração que muda comportamento (usar `feature-mode`)
- Mudança cosmética trivial (typo, rename — usar PR direto)