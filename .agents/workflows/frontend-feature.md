# `frontend-feature` — Implementar Feature no Frontend Next.js

> Workflow detalhado. Trigger e composição resumidos em [`WORKFLOWS.md`](../WORKFLOWS.md).

**Trigger:** "criar página X", "implementar rota Y no Next.js", "adicionar componente Z"

**Composição:** sequential (4 estágios)

```text
NEXTJS-SPECIALIST → TEST-WRITER → CODE-REVIEWER → TDD-ENFORCER
```

## Handoff

```yaml
nextjs-specialist → test-writer:
  task: "Escrever testes para página/componente Next.js (unit com Vitest + e2e com Playwright)"
  context: ["apps/web/app/", "apps/web/components/"]
  expected_output:
    test_files: ["./component.test.tsx", "./page.e2e-spec.ts"]
  success_criteria:
    - "Server Components testados quando relevantes"
    - "Playwright cobre fluxo crítico (login, navegação, ação)"

nextjs-specialist → code-reviewer (após implementação):
  task: "Revisar RSC vs. Client, data fetching, performance"
  context: ["diff"]
  expected_output:
    findings: [...]
  success_criteria:
    - "'use client' justificado em todos os pontos"
    - "Data fetching server-side quando possível (sem useEffect + fetch)"
    - "Lighthouse ≥ 90 em Performance, A11y, Best Practices, SEO"

code-reviewer → tdd-enforcer:
  task: "Validar TDD no histórico"
  context: ["git log"]
  expected_output:
    tdd_compliant: bool
  success_criteria:
    - "Coverage ≥ 80%"
    - "TDD estritamente seguido"
```

## Quando Usar

- Criar nova rota/página
- Adicionar Server Action para mutação
- Criar componente reutilizável em `packages/ui`
- Integrar com API backend NestJS
- Configurar autenticação em rota protegida
- Decidir entre Server Component e Client Component

## Referências

- Agent: [`.agents/agents/nextjs-specialist.md`](../agents/nextjs-specialist.md)
- Stack: [`docs/STACK.md`](../../docs/STACK.md) §3 (Frontend)
- Monorepo: [`docs/MONOREPO.md`](../../docs/MONOREPO.md) §9 (Quando adicionar app)

---

**Mantido por:** projeto-base contributors
