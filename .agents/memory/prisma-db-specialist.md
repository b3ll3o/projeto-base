---
agent: prisma-db-specialist
scope: schema Prisma, migrations, N+1, audit fields, lens DDD/H1-H6 — auditoria
skill: .agents/skills/prisma-audit/SKILL.md
---

# Memory: `prisma-db-specialist`

Memory file canônico. **Estado atual: stub inicial** (criado em 2026-10-06 junto com a v2.0 dos specialists de auditoria).

## Skill carregada

Carrega `.agents/skills/prisma-audit/SKILL.md` quando a task é de auditoria
(mapeia schema, valida lens DDD/H1-H6, detecta N+1, audita audit fields).
A skill encapsula os passos shell + dedup + persistência; este arquivo de
memória guarda estado entre execuções.

## Estado atual

- Agent file: `.agents/agents/prisma-db-specialist.md`
- Primeira aparição: v2.0 (escaneamento inicial)
- Findings emitidos até o momento: vide `.agents/runs/findings-<ts>/findings.yaml`

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

## Decisões Tomadas

- **2026-10-16 — a regra de migração de dados sai do agent e vira convenção.** O
  anti-padrão "sempre 3 passos: add nullable, backfill, drop" vivia só aqui (na
  linha 160 do agent), sem arquivo em `conventions/` — gap G-003 do
  `state-snapshot-20261017T000011Z`. Promovido para
  [`conventions/migracao-de-dados.md`](../specs/conventions/migracao-de-dados.md),
  registrada nos dois índices (`AGENTS.md §6` + `conventions/README.md`). O agent
  agora aponta para lá: **este arquivo é a fonte, o agent é o consumidor.**
  Ganho colateral: a convenção acrescenta o caso que faltava — **quando não há
  backfill a fazer** (medir antes de inventar fixture).

## Triggers retroativos

Quando o agent produzir findings repetidos sobre o mesmo arquivo/location (>3x), isso é sinal de **classe de bug sistêmico** — abrir issue classificada como tal, não como finding isolado.
