---
agent: finding-orchestrator
scope: orquestração de scan paralelo, agregação de findings, dedup, abertura de issues
skill: .agents/skills/findings-orchestration/SKILL.md
---

# Memory: `finding-orchestrator`

Memory file canônico. **Estado atual: stub inicial** (criado em 2026-10-06 junto com a v2.0 dos specialists de auditoria).

## Skill carregada

Carrega `.agents/skills/findings-orchestration/SKILL.md` em todo scan
(pre-flight `gh auth`, despacho paralelo de 8 specialists, agregação com
severity, dedup contra issues abertas, abertura de issues P0/P1 com labels
canônicos, persistência de relatório). A skill encapsula o processo completo;
este arquivo guarda estado entre execuções.

## Política crítica

- `gh auth status` é pré-condição bloqueante. Sem auth → aborta; user autentica fora.
- Token GitHub NUNCA no chat (política persistente do Hermes).
- P2 nunca vira issue — só relatório.
- Cap `open_issue_limit` (default 10) é lei; top-N por severity.
- Labels são criados idempotentemente via `gh label create --force` antes de aplicar.

## Learnings

### 2026-10-08 — primeiro dry-run

RC=0, 12 labels criados (5 `agent:*` + 3 `severity:*` + 4 `type:*`).
Bug do `set -e` + glob `apps/*/domain/` (zero matches) corrigido em
`~/.hermes/scripts/findings-scan.sh` linhas 107-113
(`set +e; find | xargs | wc -l; set -e; true`).

## Estado atual

- Agent file: `.agents/agents/finding-orchestrator.md`
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
