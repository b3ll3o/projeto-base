# `backend-feature` — Implementar Feature no Backend NestJS

> Workflow detalhado. Trigger e composição resumidos em [`WORKFLOWS.md`](../WORKFLOWS.md).

**Trigger:** "criar endpoint X", "implementar módulo Y no NestJS", "adicionar CRUD de Z"

**Composição:** sequential (4 estágios)

```text
NESTJS-SPECIALIST → TEST-WRITER → CODE-REVIEWER → TDD-ENFORCER
```

## Handoff

```yaml
nestjs-specialist → test-writer:
  task: "Escrever testes para módulo NestJS X (unit do service + e2e do controller)"
  context: ["apps/api/src/module-x/", "padrões do módulo"]
  expected_output:
    test_files: ["./module-x.service.spec.ts", "./module-x.controller.e2e-spec.ts"]
  success_criteria:
    - "Testes falham antes da implementação (TDD red)"
    - "DTOs validados nos testes de controller"

nestjs-specialist → code-reviewer (após implementação):
  task: "Revisar camadas (Controller/Service/Repository) + DI"
  context: ["diff do módulo"]
  expected_output:
    findings: [...]
  success_criteria:
    - "Controller magro (zero lógica de negócio)"
    - "Repository abstrai Prisma (sem entidade crua em service)"
    - "DTOs validados via ValidationPipe global"

code-reviewer → tdd-enforcer:
  task: "Validar ciclo Red → Green → Refactor no histórico de commits"
  context: ["git log <base>..<head>"]
  expected_output:
    tdd_compliant: bool
  success_criteria:
    - "Coverage ≥ 80% em todas as métricas"
    - "TDD estritamente seguido"
```

## Quando Usar

- Adicionar novo endpoint REST
- Criar feature module NestJS
- Adicionar integração com Prisma
- Configurar Swagger para novo módulo
- Adicionar autenticação/autorização em endpoint

## Referências

- Agent: [`.agents/agents/nestjs-specialist.md`](../agents/nestjs-specialist.md)
- Stack: [`docs/STACK.md`](../../docs/STACK.md) §2 (Backend)
- Monorepo: [`docs/MONOREPO.md`](../../docs/MONOREPO.md) §9 (Quando adicionar app)

---

**Mantido por:** projeto-base contributors
