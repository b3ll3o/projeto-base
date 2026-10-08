---
name: findings-orchestration
version: 1.0
updated: 2026-10-08
description: "Processo de orquestração de findings — pre-flight gh auth, coleta issues abertas para dedup, despacho paralelo de 8 specialists, agregação com severity, abertura de issues via `gh` com labels canônicos, persistência de relatório. Carregado por `finding-orchestrator` (agent). Use para escaneamento semanal automatizado ou on-demand."
---

# Skill: findings-orchestration

> **Quem invoca:** `finding-orchestrator` (papel, princípios, política de labels ficam no agent; este arquivo é só o **processo executável**).
>
> **Quando invocar:** cron semanal (sextas 02:00 UTC), pré-tag, on-demand ("rode auditoria", "gere relatório de findings").

## Pré-condições

- `gh` autenticado (`gh auth status`)
- Repo em `/root/projeto-base` (ou `$REPO`)
- Script `~/.hermes/scripts/findings-scan.sh` disponível (fonte única de pre-flight + labels + artefatos)
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
  echo "Política: Hermes NUNCA aceita token no chat."
  echo "User precisa: gh auth login"
  exit 4
}

# 1.2 Repo existe?
test -d "$REPO" || { echo "❌ $REPO não existe"; exit 5; }

# 1.3 Script de pre-flight disponível?
test -x ~/.hermes/scripts/findings-scan.sh || {
  echo "❌ findings-scan.sh não encontrado. Esperado em ~/.hermes/scripts/"
  exit 6
}
```

## Passo 2 — Rodar pre-flight (gera artefatos + labels)

```bash
bash ~/.hermes/scripts/findings-scan.sh
# Gera em ~/.hermes/cron/output/findings-<ts>/:
#   - open-issues.json (base de dedup)
#   - as-is-map.md (mapa AS-IS da stack)
#   - stats.md (métricas pré-scan)
#   - summary.txt (instruções pro agent)
# Cria/atualiza 12 labels canônicos no GitHub (5 agent:* + 3 severity:* + 4 type:*)
```

## Passo 3 — Despachar specialists em paralelo

```python
# Pseudo-código (a executar via Agent tool com subagent dispatch)
# specialists_to_run = context.specialists ou default 8

# Para cada specialist, dispatch em batch (não sequential):
parallel_dispatch([
  {agent: "prisma-db-specialist", skill: "prisma-audit", context: as_is_map},
  {agent: "openapi-contract-specialist", skill: "openapi-audit", context: as_is_map},
  {agent: "otelcol-infra-specialist", skill: "otelcol-audit", context: as_is_map},
  {agent: "docker-prod-specialist", skill: "docker-prod-audit", context: as_is_map},
  {agent: "release-versioning-specialist", skill: "release-versioning-audit", context: as_is_map},
  {agent: "code-reviewer", task: "general repo review", context: as_is_map},
  {agent: "security-auditor", task: "supply-chain + secrets", context: as_is_map},
  {agent: "doc-sync", task: "drift docs↔code", context: as_is_map},
])
```

Cada specialist carrega a skill correspondente (prisma-audit, openapi-audit, etc) e devolve uma lista de findings no formato canônico.

## Passo 4 — Agregar findings

```python
findings = []
for specialist_output in parallel_runs:
    findings.extend(specialist_output.findings)

# Calcular severity final (cruzando lens de múltiplos agents)
for f in findings:
    # P0 se: 2+ agents confirmam OU bloqueia produção OU CVE crítica
    # P1 se: 1 agente + impacto mensurável
    # P2 se: cosmético ou teórico
    f.severity = classify_severity(f)
```

## Passo 5 — Detectar duplicação contra issues abertas

```python
# Para cada finding P0/P1, cruzar com issues abertas por:
# 1. Mesmo location (file:line)
# 2. Mesmo título (fuzzy match via Levenshtein, threshold 0.85)
# 3. Label matching (agent:<specialist> em ambos)

for f in findings_p0_p1:
    matches = search_open_issues(f, base=open_issues.json)
    if matches:
        f.duplicate_of = matches[0].number
    else:
        f.action = "open_new_issue"
```

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

      ### Análise
      <f.cause>

      ### Causa-raiz provável
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

```python
# Se mais de open_issue_limit (default 10) seriam abertas:
#   ordena por severity (P0 > P1) e pega top-N
#   marca excedentes como "skipped (cap)" no report

to_open = [f for f in findings if f.action == "open_new_issue"]
if len(to_open) > open_issue_limit:
    to_open.sort(key=lambda f: (0 if f.severity == "P0" else 1, f.impact_score), reverse=True)
    skipped = to_open[open_issue_limit:]
    to_open = to_open[:open_issue_limit]
    for f in skipped:
        f.action = "skipped (cap)"
```

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
TS=$(date -u +%Y-%m-%dT%H%M%SZ)
REPORT_DIR="$HOME/.hermes/cron/output/findings-$TS"
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
report_path: ~/.hermes/cron/output/findings-<ts>/report.md
```

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `gh auth status` falha | Token expirou / sandbox reciclado | STOP. Pedir user pra rodar `gh auth login` na máquina dele. **NUNCA aceitar token no chat.** |
| `findings-scan.sh` retorna RC=1 | Pre-flight ou stats falhou (provavelmente `set -e` + glob vazio) | Ver log; corrigir script; re-rodar |
| `gh issue create` falha com "label not found" | Labels não criados antes | `gh label create --force` (idempotente); `findings-scan.sh` já faz |
| Specialist retorna exception | Skill mal carregada ou path errado | Reportar no summary; não abortar escaneamento inteiro |
| `open_issue_limit` atingido | Muitos P0/P1 simultâneos | Top-N por severity; excedentes vão pro report como "skipped (cap)" |
| Issues duplicadas (fuzzy match falha) | Threshold de Levenshtein muito alto | Tuning; reportar como "potential duplicate" no report |
| Cron executa mas pre-flight script não existe | Path errado em `~/.hermes/scripts/` | Verificar; `findings-scan.sh` deve ser executável |

## Saída + política crítica

- `findings.yaml` + `report.md` em `~/.hermes/cron/output/findings-<ts>/`; issues abertas até `open_issue_limit`; comentários em duplicatas; summary YAML pro chamador.
- **Token NUNCA no chat.** Se `gh auth status` falha, abortar; user autentica fora.
- **P2 nunca vira issue.** Só relatório. **Cap é lei.** Top-N por severity.
- **Labels idempotentes.** `gh label create --force` antes de aplicar.
- **Relatório sempre persiste.** Mesmo se `gh auth` falha — auditoria.

## Referências

- Agent: `.agents/agents/finding-orchestrator.md`
- Script: `~/.hermes/scripts/findings-scan.sh` (fonte única de labels + pre-flight)
- Skills por specialist: `prisma-audit`, `openapi-audit`, `otelcol-audit`, `docker-prod-audit`, `release-versioning-audit`
- Convenção: `.agents/specs/conventions/evolucao-agents.md`
