---
name: state-aware-planning
description: Como gerar o state-snapshot canônico antes de planejar. Coleta working tree + main SHA + último commit + versão do template + Prisma schema drift + coverage + preflight + health endpoint + OTEL env vars + lint da matriz. Emite state-snapshot-<ts>.md no formato da convenção. Prossegue ou bloqueia conforme gap_blocker. Camada 0 do pre-planner (antes do specialist-router).
type: specialist
---

# Skill: `state-aware-planning`

> Especificação canônica em
> [`.agents/specs/conventions/state-aware-planning.md`](../../specs/conventions/state-aware-planning.md).
> Esta skill é a **metodologia**; o workflow detalhado é o
> [`.agents/workflows/state-aware-planning.md`](../workflows/state-aware-planning.md).

---

## Papel

Materializar o ritual de state-aware-planning definido na convenção
canônica: **coletar o estado atual verificável** da aplicação via
comandos shell documentados, **emitir o `state-snapshot-<ts>.md`** no
formato canônico, e **decidir `proceed` ou `block`** conforme
`gap_blocker`. É a camada 0 do pre-planner — vem **antes** do
`specialist-router` (camada 1) na composição de qualquer workflow de
planner.

## Quando usar

- Antes de criar qualquer plano de feature (multi-task)
- Antes de despachar `specialist-router` em uma demanda nova
- Antes de bump de versão do template (workflow `release-mode`)
- Antes de cada ciclo de revisão de backlog (`task-manager`)
- Em auditoria periódica (1×/sprint pelo `agent-architect`)

## Quando NÃO usar

- Typo fix / dep bump trivial / merge conflict — §6 da convenção dispensa
- Doc-only patch sem claims verificáveis
- Implementer seguindo plano já criado (não confundir com planner criando)
- Atividades puramente conversacionais (sem execução)

## Inputs (do orquestrador)

```yaml
demand_slug: "<kebab-case único>"   # ex: "telemetria"
branch_at_snapshot: "<current branch>"
agent: "<quem está gerando o snapshot>"   # ex: "specialist-router" / "orchestrator"
extra_paths: ["<paths opcionais>"]   # paths extras a checar além dos canônicos
```

## Método (3 passos obrigatórios)

### Passo 1 — Snapshot inicial (≤ 90 segundos)

Executar comandos do **§3 Passo 1** da convenção (`state-aware-planning.md`) —
esta skill **não duplica a sequência canônica**, apenas reforça o ritual de
≤ 90s e a obrigação de salvar cada output em `.agents/runs/<TS>-*.txt`.

**Categorias obrigatórias** (resumo; detalhes na convenção §3 Passo 1):

1. Working tree (`git status --short`)
2. Branch + main SHA (`git branch --show-current` + `git rev-parse origin/main`)
3. Último commit (`git log -1 --pretty=fuller`)
4. Versão template (`git tag --list 'v*' --sort=-v:refname | head -1`)
5. Deps (`jq -r '.dependencies' apps/api/package.json apps/web/package.json ...`)
6. Prisma schema drift (`cd apps/api && pnpm exec prisma migrate status`)
7. Coverage agregada (`pnpm -r test --coverage | tail -50`)
8. Preflight (`pnpm ci:preflight`)
9. Health endpoints (`curl -fsS http://localhost:3000/api/v1/health || echo "DOWN"`)
10. OTEL_* env vars + OTel collector running + matrix lint (state-aware-planning §3)

**Salvar cada output em `.agents/runs/<TS>-<categoria>.txt`** antes do Passo 2.
Esses arquivos **são evidência** — manter no repo até fim do plano.

### Passo 2 — Compor `state-snapshot-<ts>.md`

Formato canônico definido no §3 Passo 2 da convenção. **Não inventar
campos**: o frontmatter é estrito.

**Pontos críticos:**

- `gap_blocker: true` se algum gap `severity: blocker`
- `preflight_checks: all_passed` apenas se todos passaram
- `coverage_threshold_met: true` apenas se agregado ≥ 80%
  (regra `cobertura-testes.md`)
- Cada `gap_detectado.id` deve ser único e referenciável em ADR/proposal
  futuro
- `working_tree_files`: lista vazia `[]` quando `working_tree: clean`
- Env vars OTel: listar chaves (`OTEL_SERVICE_NAME`,
  `OTEL_EXPORTER_OTLP_ENDPOINT`, etc.) **NÃO valores** (segredos)

### Passo 3 — Decidir `proceed` ou `block`

Tabela de decisão:

| Sinal | Ação |
|-------|------|
| `gap_blocker: false` + `working_tree: clean` + `preflight_checks: all_passed` + `coverage_threshold_met: true` | ✅ `proceed: true` |
| `gap_blocker: true` | ⛔ Despatch `agent-architect`; parar |
| `working_tree: conflicting` | ⛔ Resolver merge antes de prosseguir |
| `preflight_checks` ≠ `all_passed` | ⛔ Corrigir preflight (regra `ci-defense-in-depth.md`) |
| `coverage_threshold_met: false` | ⚠️ Avaliar: se novo módulo a ser criado exige cobertura desde início → planejar cobertura no plano; senão prosseguir com nota |

**Output final:**

```yaml
result:
  state_snapshot_path: ".agents/runs/state-snapshot-20260923T200000Z.md"
  decision: proceed | block
  gaps_count: 0   # ou contagem por severidade
  consumed_by: ["specialist-router (camada 1)", "orchestrator (decomposicao)"]
```

## Comportamento (8 sub-passos)

### Sub-passo 1: Pré-validação

Antes de gastar 90 segundos em comandos shell, validar:

- `extra_paths` aponta para arquivos que EXISTEM? (`test -f`)
- `branch_at_snapshot` é uma branch conhecida? (`git branch --list`)
- `demand_slug` é kebab-case válido? (`^[a-z0-9]+(-[a-z0-9]+)*$`)

Se qualquer pré-validação falhar → erro imediato sem gerar snapshot.

### Sub-passo 2: Ordem de comandos

A ordem importa (cada falha aborta cedo):

1. `git status` — se conflicting abort imediato
2. `git rev-parse origin/main` — se remoto não configurado abort
3. `pnpm exec prisma migrate status` — executa em `apps/api/`
4. `pnpm ci:preflight` — depende de `package.json` válido
5. `pnpm -r test --coverage` — mais lento
6. `curl /api/v1/health` — só se step anterior OK

### Sub-passo 3: Captura de Evidência

Cada comando gera arquivo `.agents/runs/<TS>-<categoria>.txt`. Esses
arquivos **são evidência** — manter no repo até fim do plano (mover
para `archive/` via `demand-archiving` quando plano for arquivado).

### Sub-passo 4: Análise Heurística dos Gaps

Para cada categoria do snapshot, decidir se há gap:

- Working tree: zero divergência → sem gap; divergência → gap `info`
- Prisma migrate: drift detectado → gap `major`
- Coverage: abaixo de 80% → gap `minor` (avaliação por contexto)
- Preflight: falha em 1 check → gap `major`
- Health endpoint: `down` → gap `blocker` (aplicação quebrada)
- OTel env vars: ausentes quando demanda envolve telemetria → gap `info`
- OTel collector: ausente → gap `info` (opt-in)
- Matriz lint falha → gap `major` (router inconsistente)

### Sub-passo 5: Compor frontmatter

Schema estrito (campos obrigatórios, valores enumerados) definido na
**§3 Passo 2 da convenção canônica** (`state-aware-planning.md`) — esta
skill **não duplica o schema completo**, apenas reforça 3 invariantes:

1. `gap_blocker: true` ⟺ existe pelo menos 1 gap com `severity: blocker`
2. `preflight_checks: all_passed` somente se **todos** os checks passaram
3. `coverage_threshold_met: true` somente se agregado ≥ 80%
   (regra `cobertura-testes.md`)

### Sub-passo 6: Body do snapshot

Body **mínimo** (5-10 linhas) explicando o que o snapshot revela:

```markdown
# State snapshot — <demand_slug>

<1 parágrafo: o que o snapshot mostra sobre o estado atual>

## Comandos executados

<bulleted list dos arquivos em `.agents/runs/<TS>-*.txt`>

## Gaps principais

<numerados, com referência aos `id`s do frontmatter>

## Decisão

`proceed: true` OU `block: <motivo>`
```

### Sub-passo 7: Validação final

Antes de devolver resultado:

- [ ] frontmatter tem **todos** os campos obrigatórios
- [ ] todos os gaps têm `id` único
- [ ] `gap_blocker` consistente com `severity` dos gaps
- [ ] arquivos em `.agents/runs/<TS>-*.txt` estão commitados (ou
  listados no `.gitignore` da categoria — verificar antes)
- [ ] nenhum secret vazou para o snapshot (regex grep: `SECRET|PASSWORD|TOKEN|API_KEY` → 0 hits)

### Sub-passo 8: Saída

Devolver via `agents:coordinate`:

```yaml
result:
  state_snapshot_path: ".agents/runs/state-snapshot-<TS>.md"
  decision: proceed | block
  gap_blocker: bool
  gaps_count: { blocker: N1, major: N2, minor: N3, info: N4 }
  next_step_hint:
    - "specialist-router (camada 1) recebe como contexto"
    - "ou agent-architect se gap_blocker: true"
```

## Coordenação

| Agent / Skill | Relação |
|---------------|---------|
| `specialist-routing` (skill Passo 1) | **Consumidor.** Lê `state-snapshot-<ts>.md` se presente. **Camada 1** (depois desta skill = camada 0). |
| `agent-architect` | **Consumidor preferencial** quando `gap_blocker: true`. Avalia criação de novo agent (regra `evolucao-agents.md`). |
| `orchestrator` | **Consumidor** — Passo 1 consome state-snapshot antes de decompor feature. |
| `retrospective-capture` (skill) | Pode **reprocessar** snapshot em falhas (regra §5 da convenção: retroalimentação). |
| `demand-archiving` (skill) | Move snapshot para `.agents/runs/archive/` quando plano é arquivado. |
| `task-manager` | Pode triggar esta skill antes de `bump de versão`. |
| **Plan gerado** | Todo plan em `docs/superpowers/plans/*.md` referencia snapshot correspondente no frontmatter (futuro). |

## Princípios

1. **Não inventar estado.** Todo item do snapshot vem de comando shell
   **reproduzível e documentado** no snapshot (regra `tamanho-e-revisao.md
   §Verificabilidade de Claims Numéricos`).
2. **Camada 0, não substituta.** Esta skill **alimenta** o
   `specialist-router` (camada 1). Não duplica nem substitui nenhum
   pre-dispatch check existente.
3. **Idempotência.** Re-rodar com mesmo `demand_slug`+`TS` é seguro;
   sobrescreve artefatos `<TS>-*.txt`.
4. **Tempo limitado.** ≤ 90 segundos para snapshot completo (timing
   agressivo para encorajar uso).
5. **Sem secrets no snapshot.** Valores de `.env` NUNCA entram no
   snapshot; apenas **nomes de variáveis declaradas**.
6. **Evidência preservada.** Arquivos `<TS>-*.txt` ficam em
   `.agents/runs/` até `demand-archiving` mover para `archive/`.
7. **Determinístico.** Mesmo input → mesmo output. Sem heurística
   "achismo" — heurística explícita no Passo 4 documentada.
8. **State-aware-planning como hábito.** Aplicar mesmo quando a demanda
   parece trivial — é o que transforma em hábito confiável.

## Anti-Padrões (NÃO fazer)

- ❌ "Lembro que o preflight passou ontem" — **re-executar sempre**
- ❌ Rodar comandos sem salvar output em `<TS>-*.txt` (perde evidência)
- ❌ Inventar campo `gap_blocker: false` sem checar `severity` dos gaps
- ❌ Hardcodar valores do `.env` no snapshot (segredos)
- ❌ Confundir "branch atual" com "branch de trabalho" (sempre
  `branch_at_snapshot` = `git branch --show-current`)
- ❌ Pular Passo 1 quando demanda "parece óbvia" — hábito > intuição
- ❌ Misturar outputs de planos diferentes no mesmo snapshot
- ❌ Usar `Math.random()` em correlationId (migrar para OTel trace_id)
- ❌ Despachar implementer enquanto state-snapshot não foi gerado

## Cross-references

- [`.agents/specs/conventions/state-aware-planning.md`](../../specs/conventions/state-aware-planning.md) — spec canônica
- [`.agents/workflows/state-aware-planning.md`](../workflows/state-aware-planning.md) — workflow detalhado
- [`.agents/memory/state-aware-planning.md`](../memory/state-aware-planning.md) — memória
- [`.agents/specs/conventions/evolucao-agents.md`](../../specs/conventions/evolucao-agents.md) — `gap_detected` é instância de state-aware
- [`.agents/specs/conventions/ci-defense-in-depth.md`](../../specs/conventions/ci-defense-in-depth.md) — preflight = 1 categoria
- [`.agents/specs/conventions/tamanho-e-revisao.md`](../../specs/conventions/tamanho-e-revisao.md) — limite 300 linhas + verificabilidade
- [.agents/skills/specialist-routing/SKILL.md](../specialist-routing/SKILL.md) — camada 1 do pre-planner

---

**Arquivo:** `.agents/skills/state-aware-planning/SKILL.md`
**Tipo:** Specialist methodology skill
**Memória:** [`../../memory/state-aware-planning.md`](../../memory/state-aware-planning.md)
