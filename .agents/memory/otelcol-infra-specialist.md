---
agent: otelcol-infra-specialist
scope: OTel Collector, receivers/exporters/processors, sampling, W3C propagation — auditoria
skill: .agents/skills/otelcol-audit/SKILL.md
---

# Memory: `otelcol-infra-specialist`

Memory file canônico. **Estado atual: stub inicial** (criado em 2026-10-06 junto com a v2.0 dos specialists de auditoria).

## Skill carregada

Carrega `.agents/skills/otelcol-audit/SKILL.md` quando a task é de auditoria
(valida schema, receivers/processors, sampling, W3C propagation, profiles
Compose, pinning de versão). A skill encapsula os passos shell; este arquivo
guarda estado entre execuções.

## Estado atual

- Agent file: `.agents/agents/otelcol-infra-specialist.md`
- Primeira aparição: v2.0 (escaneamento inicial)
- Findings emitidos até o momento: vide `~/.hermes/cron/output/findings-<ts>/findings.yaml`

## Convenções observadas

Este memory file deve ser atualizado pelo agent toda vez que ele produzir findings novos — em particular:

1. **Findings recorrentes** que indicam classe de bug sistemico
2. **Heurísticas** que funcionaram e devem virar regra
3. **Falsos positivos** conhecidos (para não relatar de novo)
4. **Cruzamentos** com outros agents (correlação entre findings de agents diferentes)
5. **Backlog de gaps** — coisas que o agent detectou mas ainda não foram corrigidas

Formato de entrada (a ser preenchido pelo agent):

```yaml
- date: 2026-10-06
  finding_id: <id>
  severity: P0|P1|P2
  outcome: <resolved|deferred|false-positive|recurred>
  lesson: <1-liner do que aprendemos>
```

## Triggers retroativos

Quando o agent produzir findings repetidos sobre o mesmo arquivo/location (>3x), isso é sinal de **classe de bug sistêmico** — abrir issue classificada como tal, não como finding isolado.
