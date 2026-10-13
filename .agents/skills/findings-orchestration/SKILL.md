---
name: findings-orchestration
version: 1.1
updated: 2026-10-13
description: "Processo de orquestração de findings — pre-flight gh auth, coleta issues abertas para dedup, despacho paralelo de 8 specialists, agregação com severity, abertura de issues via `gh` com labels canônicos, persistência de relatório. Carregado por `finding-orchestrator` (agent). Use para escaneamento semanal automatizado ou on-demand."
---

# Skill: findings-orchestration

> **Quem invoca:** `finding-orchestrator` (papel, princípios, política de labels ficam no agent; este arquivo é só o **processo executável**).
>
> **Quando invocar:** cron semanal (sextas 02:00 UTC), pré-tag, on-demand ("rode auditoria", "gere relatório de findings").

## Pré-condições

- `gh` autenticado (`gh auth status`)
- Repo no cwd (`$REPO`, default = diretório de trabalho do agent)
- `.agents/runs/` gravável (destino dos artefatos)
- **Política:** NUNCA aceitar token GitHub no chat. Se `gh` falha, abortar e pedir intervenção do user.

## Inputs (do controller)

```yaml
task:
  description: "<escaneamento/revisão periódica>"

context:
  scope: "weekly|on-demand|pre-release"
  since_sha: "<prev-tag-or-sha>"  # opcional; sem = HEAD~7d
  open_issue_limit: 10            # máx de issues abertas por scan
  specialists:                    # opcional; sem = os 8 padrão
    - prisma-db-specialist
    - openapi-contract-specialist
    - otelcol-infra-specialist
    - docker-prod-specialist
    - release-versioning-specialist
    - code-reviewer
    - security-auditor
    - doc-sync
```

## Passo 1 — Pre-flight (BLOQUEANTE)

```bash
# 1.1 gh autenticado?
gh auth status || {
  echo "❌ gh NÃO autenticado. Abortando."
  echo "Política: NUNCA aceitar token no chat."
  echo "User precisa: gh auth login"
  exit 4
}

# 1.2 Repo no cwd?
REPO="${REPO:-$PWD}"
test -d "$REPO/.agents/runs" || { echo "❌ não é o repo esperado (sem .agents/runs em $REPO)"; exit 5; }
```

## Passo 2 — Gerar artefatos de pre-flight + labels

Não existe script externo para isto: os dois passos são estes comandos. Os
artefatos vão para `.agents/runs/findings-<ts>/` — dentro do repo, então
sobrevive a sandbox e é versionável.

```bash
TS=$(date -u +%Y-%m-%dT%H%M%SZ)
REPORT_DIR=".agents/runs/findings-$TS"
mkdir -p "$REPORT_DIR"

# 2.1 Base de dedup: issues abertas
gh issue list --state open --json number,title,labels,createdAt \
  --limit 200 > "$REPORT_DIR/open-issues.json"

# 2.2 Mapa AS-IS da stack (o que cada specialist vai ler)
{
  echo "# AS-IS map — $TS"
  echo "## Árvore de código"
  git ls-files 'apps/*/**' 'packages/*/**' | head -80
  echo "## Migrations"
  git ls-files 'apps/api/prisma/migrations/*'
} > "$REPORT_DIR/as-is-map.md"

# 2.3 Métricas pré-scan
git log --oneline -20 > "$REPORT_DIR/stats.md"
```

**Labels canônicas (idempotentes).** As 12 já existem no repo — criado em
2026-09-23. Este passo é `create --force`, então reexecutar corrige drift sem
duplicar. Cores e descrições abaixo foram lidas de `gh label list` em
2026-10-13.

```bash
# agent:<specialist> — 5
for a in prisma-db docker-prod openapi-contract otelcol-infra release-versioning; do
  gh label create "agent:$a-specialist" --color 0E8A16 \
    --description "Finding do $a-specialist" --force
done
# severity:* — 3
gh label create severity:p0 --color B60205 --description "Crítico — bloqueia produção" --force
gh label create severity:p1 --color D93F0B --description "Alto — impacto mensurável" --force
gh label create severity:p2 --color FBCA04 --description "Médio — cosmético ou teórico" --force
# type:* — 4
gh label create type:bug        --color B60205 --description "Bug confirmado" --force
gh label create type:drift      --color D93F0B --description "Drift estrutural cross-doc/config" --force
gh label create type:gap        --color FBCA04 --description "Lacuna vs convenção/ADR" --force
gh label create type:regression --color B60205 --description "Regressão vs versão anterior" --force
```

## Passo 3 — Despachar specialists em paralelo

Despachar **em paralelo**, cada um carregando a skill de processo do §0 da
[matriz de review-routing](../../specs/conventions/review-routing.md):

| Subagent | Skill | Escopo |
|---|---|---|
| `prisma-db-specialist` | `prisma-audit` | schema, migrations, N+1, audit fields |
| `openapi-contract-specialist` | `openapi-audit` | spec OpenAPI, drift DTO↔Prisma |
| `otelcol-infra-specialist` | `otelcol-audit` | collector, sampling, propagação |
| `docker-prod-specialist` | `docker-prod-audit` | hardening, healthchecks, secrets |
| `release-versioning-specialist` | `release-versioning-audit` | drift docs↔semver↔commits |
| `code-reviewer` | — | review geral do repo |
| `security-auditor` | — | supply-chain + secrets |
| `doc-sync` | — | drift docs↔código |

Todos recebem o `as-is-map.md` do Passo 2 como `context` e devolvem a lista
canônica de findings. Sem `context.specialists`, são estes 8.

## Passo 4 — Agregar findings

Concatenar a lista de findings de cada subagent e recalcular a severity final
(ninguém passa direto): **P0** se 2+ agents confirmam, ou bloqueia produção, ou
CVE crítica; **P1** se 1 agente + impacto mensurável; **P2** se cosmético ou
teórico.

## Passo 5 — Detectar duplicação contra issues abertas

Para cada finding P0/P1, cruzar com `open-issues.json` (Passo 2) por três chaves:
mesmo `location` (file:line), mesmo título (fuzzy, Levenshtein ≥ 0.85) e label
`agent:<specialist>` em ambos. Havendo match, marcar `duplicate_of: <número>`;
sem match, `action: open_new_issue`.

## Passo 6 — Decidir ações

```yaml
# Policy: cada finding gera uma decisão
- if severity in [P0, P1] and not f.duplicate_of:
    action: open new issue
    body_template: |
      ## <f.title>

      **Severity**: <f.severity>
      **Specialist**: <f.specialist>
      **Location**: <f.location>

      ### Causa-raiz
      <f.cause>

      ### Impacto
      <f.impact>

      ### Evidência
      <f.evidence>

      ### Correção sugerida
      <f.fix>

      ### Critérios de aceite
      - [ ] <critério verificável 1>
      - [ ] <critério verificável 2>

      ---
      _Issue aberta automaticamente por `finding-orchestrator` (escaneamento <scope>)._
      _Specialist: <f.specialist> | run: <ts>_
    labels: ["agent:<f.specialist>", "severity:<p0|p1>", "type:<bug|drift|gap|regression>"]

- if severity in [P0, P1] and f.duplicate_of:
    action: comment on existing issue
    body: |
      🔄 **Update do `finding-orchestrator`** — finding ainda válido em <ts>.
      <1-liner do que mudou desde última detecção>
      _Re-validate: closing this requires <critério>._

- if severity == P2:
    action: skip issue, only in report
```

## Passo 7 — Aplicar cap de issues abertas

Ordenar as findings candidatas a abrir por severity (P0 > P1) e, se passarem de
`open_issue_limit` (default 10), manter só o top-N. As excedentes viram
`action: "skipped (cap)"` e aparecem no report — nunca são silenciosamente
descartadas.

## Passo 8 — Abrir issues via `gh`

```bash
for f in findings_to_open:
  gh issue create \
    --title "$f.title" \
    --body "$f.body_template" \
    --label "agent:$f.specialist" \
    --label "severity:$f.severity" \
    --label "type:$f.type"
done
```

## Passo 9 — Comentar em duplicatas

```bash
for f in findings_duplicates:
  gh issue comment "$f.duplicate_of" --body "$f.comment_body"
done
```

## Passo 10 — Persistir relatório

```bash
# $TS e $REPORT_DIR vêm do Passo 2 — não recalcular: dois timestamps
# diferentes no mesmo scan deixam o relatório fora do diretório de artefatos.
mkdir -p "$REPORT_DIR"

# YAML raw (machine-readable)
cat > "$REPORT_DIR/findings.yaml" <<YAML
summary:
  ts: $TS
  scope: <scope>
  gh_auth: valid
  specialists_run: 8
findings:
  total: N
  p0: X
  p1: Y
  p2: Z
opened_issues: [...]
commented_issues: [...]
skipped_cap: [...]
raw: [...]   # todos os findings
YAML

# Markdown summary (human-readable)
cat > "$REPORT_DIR/report.md" <<MD
# Findings — $TS

## Resumo
- Scope: <scope>
- Specialists executados: 8
- Findings totais: N
- P0: X | P1: Y | P2: Z
- Issues abertas: A | comentadas: B | skipped (cap): C

## Por especialista
### prisma-db-specialist
- P0: ... | P1: ... | P2: ...
- Top findings: ...

### openapi-contract-specialist
- ...
MD
```

## Passo 11 — Devolver summary ao chamador

```yaml
status: ok
gh_auth: valid
specialists_run: 8
findings:
  total: N
  p0: X
  p1: Y
  p2: Z
issues_opened: [...]   # URLs
issues_commented: [...] # URLs
report_path: .agents/runs/findings-<ts>/report.md
```

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `gh auth status` falha | Token expirou / sandbox reciclado | STOP. Pedir user pra rodar `gh auth login` na máquina dele. **NUNCA aceitar token no chat.** |
| `gh issue create` falha com "label not found" | Passo 2 (labels) pulado | Rodar o bloco `gh label create --force` do Passo 2 |
| Specialist retorna exception | Skill mal carregada ou path errado | Reportar no summary; não abortar escaneamento inteiro |
| `open_issue_limit` atingido | Muitos P0/P1 simultâneos | Top-N por severity; excedentes vão pro report como "skipped (cap)" |
| Issues duplicadas (fuzzy match falha) | Threshold de Levenshtein muito alto | Tuning; reportar como "potential duplicate" no report |

## Saída + política crítica

- `findings.yaml` + `report.md` em `.agents/runs/findings-<ts>/`; issues abertas até `open_issue_limit`; comentários em duplicatas; summary YAML pro chamador.
- **Token NUNCA no chat.** Se `gh auth status` falha, abortar; user autentica fora.
- **P2 nunca vira issue.** Só relatório. **Cap é lei.** Top-N por severity.
- **Labels idempotentes.** `gh label create --force` antes de aplicar.
- **Relatório sempre persiste.** Mesmo se `gh auth` falha — auditoria.

## Referências

- Agent: `.agents/agents/finding-orchestrator.md`
- Skills por specialist: `prisma-audit`, `openapi-audit`, `otelcol-audit`, `docker-prod-audit`, `release-versioning-audit`
- Convenção: `.agents/specs/conventions/evolucao-agents.md`
