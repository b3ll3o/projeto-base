---
agent: docker-prod-specialist
scope: hardening runtime, multi-stage, healthchecks, secrets, image pinning — auditoria
skill: .agents/skills/docker-prod-audit/SKILL.md
---

# Memory: `docker-prod-specialist`

Memory file canônico. **Estado atual: stub inicial** (criado em 2026-10-06 junto com a v2.0 dos specialists de auditoria).

## Skill carregada

Carrega `.agents/skills/docker-prod-audit/SKILL.md` quando a task é de auditoria
(hardening runtime, multi-stage, healthchecks, secrets, image pinning, signal
handling, `.dockerignore` estrito). A skill encapsula os passos shell; este
arquivo guarda estado entre execuções.

**Sobreposição intencional com `docker-specialist`:** este agent audita com lens
prod-readiness; o `docker-specialist` escreve Dockerfiles/Compose.

## Estado atual

- Agent file: `.agents/agents/docker-prod-specialist.md`
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
