---
generated_at: 2026-10-17T00:00:11Z
written_at: 2026-10-16T21:14Z  # gerado 21:06, escrito 21:14 — por isso os 2
                               # artefatos da Fase 1 nao estavam em working_tree_files
agent: planner (sessão direta)
demand_slug: multi-tenant
branch_at_snapshot: feat/multi-tenant
main_sha: 32b285f7aa07d6b3a172dcddcede7edd235261d5
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files:
  - docs/fluxo-desenvolvimento.md
  - docs/superpowers/plans/2026-10-16-multi-tenant-plan.md
  - ".agents/runs/20261017T000011Z-* (10 artefatos do Passo 1)"
  - .agents/agents/multi-tenant-specialist.md   # Fase 1, 21:06
  - .agents/memory/multi-tenant-specialist.md   # Fase 1, 21:06
last_commit:
  sha: 32b285f
  author: ver .agents/runs/20261017T000011Z-last-commit.txt
  message: "feat(e2e): a regra de cobertura passa a conferir as rotas do disco (#100)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: 88.69
coverage_aggregate_branches: 92.13
coverage_aggregate_funcs: 88.23
coverage_threshold_met: true
preflight_checks: all_passed
preflight_skipped:
  - "archive integrity — archive vazio: 0 arquivo .md"
# Eram 2 ate a Fase 1 alterar agents: `drift agent<->memoria` sobe de skipped para ✓
health_endpoint:
  api: ok
  web: ok
otel_env_vars_declared:
  - OTEL_DEPLOYMENT_ENVIRONMENT
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_EXPORTER_OTLP_PROTOCOL
  - OTEL_LOGS_EXPORTER
  - OTEL_METRICS_EXPORTER
  - OTEL_RESOURCE_ATTRIBUTES
  - OTEL_SDK_DISABLED
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
  - OTEL_TRACES_EXPORTER
  - OTEL_TRACES_SAMPLER
  - OTEL_TRACES_SAMPLER_ARG
otel_collector_running: false
matrix_specialist_routing_lint: passed
matrix_specialist_routing_warnings: 2
matrix_specialist_routing_warnings_detail: "path_glob com blocking:true sem rationale: pnpm-workspace.yaml, turbo.json (preexistente)"

gaps_detectados:
  - id: G-001
    categoria: "Nenhum specialist possui o dominio multi-tenant"
    severity: blocker
    status: resolved
    resolved_at: "2026-10-16 (Fase 1 do plano 2026-10-16-multi-tenant)"
    resolved_by: "Criacao de .agents/agents/multi-tenant-specialist.md + memoria + skill multi-tenant-audit"
    file: ".agents/agents/multi-tenant-specialist.md"
    rationale: "grep -rliE 'multi.?tenant|tenantId' .agents/agents/ .agents/memory/ = 0 arquivos. A Fase 1 do plano e a resolucao."
    resolucao: "O MESMO grep agora devolve 2 arquivos (o agent e sua memoria). O blocker estava fechado no momento em que este snapshot foi escrito; o status foi atualizado depois."
    source: "Plan 2026-10-16 §Evidencia"
  - id: G-002
    categoria: "Gate de gap do router e inerte: gap_detected nunca e true"
    severity: major
    file: ".agents/specs/conventions/specialist-routing.md:264"
    rationale: "always_on: [monorepo-specialist] e incondicional, entao specialists.size === 0 (linha 206) e inalcancavel e gap_detected e sempre false. Medido: 3 invocacoes (com keyword que casa, sem keyword, e path fora de todo glob) -> gap_detected false, exit 0, nos 3 casos."
    source: "pnpm specialist:route com --demand=<arquivo> --paths=<arquivo>; codigo em tooling/scripts/specialist-router.ts:200-212"
  - id: G-003
    categoria: "Regra de migracao de dados existe em agent, nao em convencao"
    severity: major
    status: resolved
    resolved_at: "2026-10-16 (Fase 1 do plano 2026-10-16-multi-tenant)"
    resolved_by: "Promocao do anti-padrao de prisma-db-specialist.md:160 para convencao canonica"
    file: ".agents/specs/conventions/migracao-de-dados.md"
    rationale: "Anti-padrao 'sempre 3 passos: add nullable, backfill, drop' ja rege. O que falta e promover a convencao; a afirmacao do plano de que a fase 'nao tem dono nem regra' e mais forte que o disco."
    resolucao: "Convencao criada e registrada nos DOIS indices (AGENTS.md §6 e conventions/README.md); o agent agora aponta para ela como fonte unica. MEDIDO antes: `ls .agents/specs/conventions/ | grep -icE 'migrat|dados'` = 0."
    source: "Verificacao das 20 afirmacoes do plano, item 16"
  - id: G-004
    categoria: "Banco de dev sem estado pre-tenancy: backfill nao tem o que migrar"
    severity: major
    status: resolved
    resolved_at: "2026-10-16 (revisao v1.2.0 do plano)"
    resolved_by: "Medicao posterior: nao existe banco de producao"
    file: "apps/api/prisma/schema.prisma"
    rationale: "users=1, profiles=0, authorizations=0, user_history=1. Um backfill exercitado contra este volume nao prova nada, e o teste negativo cross-tenant da Fase 7 tambem nao tem sobre o que rodar."
    source: "Consulta de contagem ao Postgres de dev, 2026-10-17 (contagens, sem amostra de linhas)"
    resolucao: >
      A inferencia estava errada nas duas metades. (1) O exercicio da Fase 2 e a
      suite e2e, que roda em testcontainers (Postgres novo + prisma migrate deploy
      em testcontainers-helper.ts:91); o volume do banco de dev nao participa —
      o proprio CI diz que service postgres e dead code (ci.yml:158). (2) A Fase 7
      semeia tenants e usuarios dentro do proprio spec, no container novo.
      Medicao nova: nao existe banco de producao (nenhuma infra de deploy; o
      compose e template local). Logo o backfill exigiria um tenant padrao para
      onde apontar — decisao de produto que a demanda nao pede. Correcao: Fase 2
      sem backfill, users.profile_id vira coluna orfa, DROP COLUMN adiado.
  - id: G-005
    categoria: "state-aware-planning cita comando inexistente"
    severity: minor
    file: ".agents/specs/conventions/state-aware-planning.md:48"
    rationale: "Tabela §1 declara 'pnpm lint-specialist-routing'. O script real e 'pnpm specialist:lint'. Quem seguir a convencao a risca na mao."
    source: "pnpm lint-specialist-routing -> ERR Command not found"
  - id: G-006
    categoria: "Passo 1.5 depende de jq, ausente: produz arquivo vazio em silencio"
    severity: minor
    file: ".agents/specs/conventions/state-aware-planning.md:101"
    rationale: "O comando canonico de deps usa jq com 2>/dev/null. Sem jq, o .agents/runs/<ts>-deps.txt sai VAZIO e nada acusa — gate verde sobre arquivo vazio."
    source: "Passo 1.5 executado; fallback node -e, 80 linhas em 20261017T000011Z-deps.txt"

gap_blocker: false
proceed: true
proceed_rationale: >
  G-001 e blocker, mas a Fase 1 do plano e exatamente a sua resolucao
  (agent-architect cria multi-tenant-specialist) — mesmo formato do Exemplo 1
  da convencao. working_tree = dirty, nao conflicting. preflight 0 erros; os
  1 skipped e "nao havia o que medir", terceiro estado legitimo (§7.3 do
  fluxo-desenvolvimento). Eram 2: a Fase 1 alterou agents, e o check de drift
  `agent<->memoria` passou a ter o que medir — roda e da ✓.
---

# state-snapshot — demanda `multi-tenant`

Demanda: *"a aplicacao deve ser multi tenent e o usuario pode ter um perfil
diferente em cada empresa"*.

Camada 0 do pre-planner. Todo item abaixo vem de comando executado agora;
o que nao pode ser medido esta marcado como tal, e nao preenchido.

## §1 Divergencias entre a convencao e o disco

| A convencao diz | O disco tem | Efeito |
|----------------|-------------|--------|
| `pnpm lint-specialist-routing` (§1) | `pnpm specialist:lint` | comando falha; quem copia a convencao trava |
| Passo 1.5 com `jq` | `jq` ausente | deps.txt sai vazio e o preflight segue verde |

## §2 Ressalva da medicao de cobertura

`pnpm turbo run test:coverage --filter=@projeto/api` (que executa `vitest run --project unit --coverage`) mede **so o projeto `unit` do `@projeto/api`**:
**76 arquivos cobertos** (`grep -c '^SF:' apps/api/coverage/lcov.info`), **53 specs**
(`Test Files 53 passed`), 671 testes, 88,69% linhas / 92,13% branches / 88,23% funcs.
A versao anterior desta linha dizia "53 arquivos": o 53 era o numero de *specs*, nao de
arquivos cobertos — os tres numeros medidos por tres vias (`lcov`, tabela de texto,
`coverage-final.json`) dao 76.
O rotulo `coverage_aggregate_*` do frontmatter sugere agregacao de
workspace; **o que foi medido nao e agregado**. Registrado como ressalva.

## §3 Estado do banco (G-004, resolvido)

| Tabela | Contagem |
|--------|----------|
| users | 1 |
| profiles | **0** |
| authorizations | **0** |
| users_history | 1 |
| users_archive | 0 |

O seed de `apps/api/prisma/seed.ts` (que cria `admin`/`viewer`) nunca rodou
contra este volume. **Isto nao bloqueia nada.** A inferencia original do G-004
— "a Fase 2 precisa de uma fixture pre-tenancy para ter exercicio" — estava
errada: a suite e2e sobe Postgres novo via testcontainers e aplica as migrations
(`testcontainers-helper.ts:91`), e o CI registra que service postgres seria
dead code (`ci.yml:158`). Alem disso nao existe banco de producao. O plano v1.2.0
removeu o backfill. Ver `resolucao` no frontmatter.

## §4 Artefatos do Passo 1

Prefixo `20261017T000011Z-`, todos em `.agents/runs/`:

| Arquivo | Passo | Estado |
|---------|-------|--------|
| `-wt.txt` | 1.1 | ok |
| `-branch.txt` | 1.2 | ok |
| `-main-sha.txt` | 1.2 | ok |
| `-last-commit.txt` | 1.3 | ok |
| `-template-tag.txt` | 1.4 | ok |
| `-deps.txt` | 1.5 | fallback sem jq (G-006) |
| `-prisma-migrate.txt` | 1.6 | ok — 3 migrations, up to date |
| `-coverage.txt` | 1.7 | ok — unico projeto `unit` |
| `-preflight.txt` | 1.8 | ok — 0 erros, 2 skipped **naquele passo**; hoje 1 (ver `preflight_skipped`) |
| `-health.json` | 1.9 | ok — `{"status":"ok","checks":{"database":"ok"}}` |

## §5 Passo 3 — decisao

`proceed: true`. Ver `proceed_rationale` no frontmatter.