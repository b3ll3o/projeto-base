# Workflow: `ci-defense-mode` — Blindagem/Auditoria do CI

> Workflow reutilizável para adicionar novo check preflight, auditar a
> estratégia de defense-in-depth do CI, ou debugar drift estrutural
> detectado em CI. Detalhes completos em
> [`.agents/specs/conventions/ci-defense-in-depth.md`](../specs/conventions/ci-defense-in-depth.md)
> e skill [`.agents/skills/ci-defense-in-depth/SKILL.md`](../skills/ci-defense-in-depth/SKILL.md).

---

## Trigger

- "adicionar check preflight"
- "blindar CI"
- "auditar pipeline CI"
- "debugar drift estrutural"

## Composição

Sequential 3 estágios:

```text
MONOREPO-SPECIALIST  →  CI-DEFENSE-IN-DEPTH (skill)  →  CODE-REVIEWER
```

## Handoffs

```yaml
monorepo-specialist → ci-defense-in-depth (skill):
  task: "Diagnosticar pipeline atual e propor checks faltantes"
  context: [".tooling/scripts/ci/", ".github/workflows/ci.yml", ".agents/specs/conventions/ci-defense-in-depth.md"]
  expected_output: { gaps: [...], recommended_checks: [...] }
  success_criteria: "Lista de checks ativos vs gaps do padrão de 3 camadas"

ci-defense-in-depth (skill) → code-reviewer:
  task: "Implementar novo check preflight via TDD (red→green→refactor)"
  context: ["template CheckResult compartilhado", "fixtures herméticas via fs.mkdtemp"]
  expected_output: { check_ts: "...", check_spec_ts: "...", orchestrator_updated: bool }
  success_criteria: "Check segue CheckResult + testes passam + registrado em preflight.ts"

code-reviewer → final:
  task: "Validar que check não duplica lógica existente e respeita performance budget"
  context: ["diff do novo check", "outros checks em .tooling/scripts/ci/"]
  expected_output: { approved: bool, findings: [...] }
  success_criteria: "0 duplicação; check roda em ≤ 5s; preflight.ts importa corretamente"
```

### Passo Pós-Implementer: Despachar review-router

Após implementer reportar DONE:

1. Validar inputs (skill `review-routing` Passo 1)
2. Despachar `review-router` via Agent tool
3. Aguardar output em `.agents/runs/<timestamp>-review-<n>.yaml`
4. Triage conforme skill (Passo 4)
5. Se BLOCKING/IMPORTANT → dispatch fix-implementer (Passo 5)
6. Re-rodar router após fix
7. Avançar quando router retornar 0 BLOCKING/IMPORTANT

## Quando usar

- Adicionar novo check preflight (cross-refs, tsconfig drift, eslint drift, etc.)
- Auditar saúde do pipeline (todos os checks ativos seguem o padrão de 3 camadas?)
- Debugar drift estrutural detectado em CI (qual camada falhou?)

## Quando NÃO usar

- Corrigir bug de aplicação (use `bugfix-mode`)
- Validar arquitetura de código (use `ddd-hexagonal-validation`)
- Mudança que não envolve CI (use workflow regular da stack)

## Critérios de Done

- [ ] Novo check segue template `CheckResult` (`{ ok: boolean; errors: string[] }`)
- [ ] Fixture hermética via `fs.mkdtemp(os.tmpdir(), '<check>-')`
- [ ] Code-block-aware parsing para checks em markdown (state machine fenced/inline/indented)
- [ ] Spec ao lado do script (`<check>.spec.ts`)
- [ ] Registrado em `.tooling/scripts/ci/preflight.ts`
- [ ] Cross-refs em docs validados (`pnpm ci:preflight` passa)
- [ ] CI verde (4/4 checks)

## Cross-references

- [`.agents/specs/conventions/ci-defense-in-depth.md`](../specs/conventions/ci-defense-in-depth.md)
- [`.agents/skills/ci-defense-in-depth/SKILL.md`](../skills/ci-defense-in-depth/SKILL.md)
- [`.agents/specs/conventions/git-workflow.md`](../specs/conventions/git-workflow.md) §Pre-Push Quality Gate
- [`.agents/specs/conventions/cobertura-testes.md`](../specs/conventions/cobertura-testes.md) §CI Defense in Depth
- [`.agents/specs/conventions/tdd.md`](../specs/conventions/tdd.md) (ciclo Red→Green→Refactor)
