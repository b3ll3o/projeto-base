# Schema de Output — `e2e-specialist`

> O schema canônico de
> [`protocolos/outputs.md`](../../skills/agents-coordinate/protocolos/outputs.md),
> com o `output` que este ciclo produz. Declarado aqui para não pesar o
> arquivo do agent (teto de 300 linhas, `tamanho-e-revisao.md`).

```yaml
result:
  agent: e2e-specialist
  task_id: <id-do-dispatch>
  status: success | partial | failure

  output:
    audit:
      telas: 15
      fluxos: 21
      specs: 21
    plano: docs/superpowers/plans/2026-11-18-e2e-<slug>.md
    revisao_plano: { revisor: code-reviewer, rodadas: 2 }
    implementado:
      - fluxo: F22
        spec: apps/web/e2e/f22-<slug>.spec.ts
    verificacao:
      comando: "pnpm ci:local"
      resultado: "22 specs, 0 falhas"

  metadata:
    started_at: <ISO-8601>
    finished_at: <ISO-8601>
    files_touched: [...]
    files_read: [...]

  findings:
    - severity: blocker | major | minor | info
      category: bug | smell | security | perf | testability | style
      description: "..."
      location: { file, line }
      recommendation: "..."

  next_steps:
    - "..."
```

⚠️ **O `audit` declara o DENOMINADOR** — quantas telas, quantos fluxos,
quantos specs. "Não achei nada" e "não olhei" são respostas diferentes.

---

**Arquivo:** `.agents/agents/e2e-specialist/output-schema.md`
**Tipo:** Companion do agent `e2e-specialist` — o schema YAML de Outputs
