# Design — review-router: Orquestrador Inteligente de Revisões por Task

> **Data:** 2026-09-22
> **Branch:** `feat/review-router-agent`
> **Status:** Aprovado (brainstorming completo, 8 seções validadas)
> **Próximo passo:** `superpowers:writing-plans` → plano de implementação TDD

## §1. Resumo Executivo

Criar um **agent `review-router`** que substitui a decisão manual "qual reviewer eu disparo após este diff?" por uma **classificação automatizada tri-sinal** (paths + commit type + diff content) seguida de **dispatch paralelo** dos specialists adequados, preservando o controller como autoridade de triage final.

**Substitui:** decisão ad-hoc do controller (qual reviewer chamar).
**Complementa:** `stack-code-reviewer` (gate automatizado) e `doc-sync` (sincronizador reativo) — permanecem autônomos.
**Preserva:** memórias `review-and-fix-after-each-task` (triage) e `two-stage-review-after-each-task` (piso mínimo de spec + quality).

## §2. Contexto e Motivação

O projeto já tem **15 specialists** em `.agents/agents/` e **4 memórias** que codificam o processo de revisão pós-task. Hoje, o controller decide manualmente quais specialists despachar após cada implementer — decisão repetitiva, sujeita a:

1. **Omissão** — esquecer de chamar `security-auditor` quando muda `auth/`.
2. **Ruído** — chamar `monorepo-specialist` em diff trivial.
3. **Drift** — sem critério explícito, decisões divergem entre sessões.
4. **Falta de rastreabilidade** — não há log de "por que este reviewer foi chamado".

Dois agents (`stack-code-reviewer`, `doc-sync`) já fazem classificação por path, mas a lógica está **espalhada e implícita**. Centralizar em um orquestrador formaliza, torna editável e auditável.

## §3. Decisões Tomadas

| # | Decisão | Escolha | Justificativa |
|---|---------|---------|---------------|
| D1 | Nível de automação | **Agent router novo** (option C do brainstorm) | Usuário escolheu automação completa; cobertura multi-sinal |
| D2 | Sinais de classificação | **Paths + commit type + diff content** (full multi-signal) | Máxima precisão; Conventional Commits já é convenção |
| D3 | Integração com two-stage | **Router é o orquestrador; two-stage vira caso particular** | Router decide se pula spec/quality via heurística |
| D4 | Fonte da matriz | **Convention markdown externa** (`.agents/specs/conventions/review-routing.md`) | Editável sem tocar agent; segue padrão ADR-0001 |
| D5 | Quem faz triage | **Controller** (não router) | Preserva `review-and-fix-after-each-task`; router apenas agrega |
| D6 | Skip heuristics | Explícitas + versionadas na matriz | Auditável; evolução via bump `version:` |
| D7 | TDD | Obrigatório para script classificador + integração do agent | Alinhado com `mandatory-tdd-rule` |
| D8 | Rollback | Flag `REVIEW_ROUTER_ENABLED=false` + migração em 6 fases | Rollback atômico por fase |

## §4. Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│  IMPLEMENTER (subagent) DONE                                     │
└────────────────────────────────┬─────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────┐
│  CONTROLLER dispara review-router (Agent tool)                   │
│  Input: task{scope}, branch{base,head}, implementer_output_path  │
└────────────────────────────────┬─────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────┐
│  REVIEW-ROUTER (subagent fresh)                                  │
│  1. git diff/log → paths[], commits[], diff                      │
│  2. Read review-routing.md → matriz                              │
│  3. Bash: review-router.ts → classification.yaml                 │
│  4. Resolve domains → reviewers + apply skip rules               │
│  5. Agent tool (paralelo) → N reviewers                          │
│  6. Aggregate CheckResults + detect consensus                    │
│  7. Return YAML ao controller                                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────┐
│  CONTROLLER faz triage + dispatch fix se BLOCKING/IMPORTANT      │
│  (memória review-and-fix-after-each-task permanece canônica)     │
└──────────────────────────────────────────────────────────────────┘
```

## §5. Componentes (arquivos)

**Novos (7):**

| Arquivo | Função | LOC máx |
|---|---|---|
| `.agents/agents/review-router.md` | Agent definition (papel, comportamento, inputs/outputs, coordenação) | 300 |
| `.agents/memory/review-router.md` | Estado evolutivo do agent (learnings, gaps detectados) | — |
| `.agents/skills/review-routing/SKILL.md` | Workflow detalhado para o controller invocar router | 300 |
| `.agents/specs/conventions/review-routing.md` | **Matriz** (globs, commit_types, diff_patterns, skip_rules) | 300 |
| `tooling/scripts/review-router.ts` | Classificador headless (Node, recebe diff via stdin, emite YAML) | 200 |
| `tooling/scripts/review-router.spec.ts` | TDD do classificador | proporcional |
| `docs/superpowers/specs/2026-09-22-review-router-design.md` | Este spec | 300 |

**Atualizados (5):**

| Arquivo | Update |
|---|---|
| `.agents/agents/AGENTS.md` §3 | Adicionar linha do router na tabela |
| `.agents/WORKFLOWS.md` | Adicionar workflow `review-routing` |
| Memory `two-stage-review-after-each-task.md` | Reescrever (router orquestra; two-stage = piso) |
| Memory `review-and-fix-after-each-task.md` | Citar router; triage permanece no controller |
| Memory `subagent-driven-development-always.md` | Adicionar router como orquestrador de review |

## §6. Fluxo de Dados

**Input do controller:**

```yaml
task: { scope: medium, description: "..." }
context:
  branch: { base: main, head: feat/audit-fields }
  pr_number: 42                         # opcional
  implementer_output_path: ".agents/runs/2026-09-22-impl-01.yaml"
```

**Pipeline interno (7 passos):**

1. `git diff --name-only $BASE..HEAD` → `paths[]`
2. `git log --pretty=%s $BASE..HEAD` → `commits[]`
3. `git diff $BASE..HEAD | head -c 51200` → `diff` (cap 50KB)
4. `Read review-routing.md` → matriz YAML
5. `pnpm tsx tooling/scripts/review-router.ts --paths=... --diff-stdin < diff.txt` → `classification.yaml`
6. Resolver `domains[]` → `reviewers[]` via matriz; aplicar skip rules
7. `Agent tool` paralelo (N reviewers) → aggregate CheckResults

**Output do router:**

```yaml
classification:
  scope: medium; base: main; head: feat/audit-fields
  domains_detected: [nestjs, prisma, ddd-hexagonal, docs]
  matrix_version: 1
reviewers_dispatched:
  - { id: spec-compliance-reviewer, skipped: false, rationale: "..." }
  - { id: code-quality-reviewer, skipped: false, rationale: "..." }
  - { id: nestjs-specialist, skipped: false, rationale: "path + diff match" }
  - { id: security-auditor, skipped: true, skipped_reason: "sem auth path" }
findings_aggregated:
  totals: { blocker: 0, major: 2, minor: 4, info: 1 }
  consensus_count: 1                       # 2+ reviewers, mesmo file:line
classification_evidence: [...]             # cada reviewer adicionado → signal + pattern + files
next_steps: [...]                          # recomendação ao controller
```

**Storage:** `.agents/runs/<timestamp>-review-<n>.yaml` + `.agents/runs/INDEX.md` (auto).

## §7. Matriz de Roteamento

Vive em `.agents/specs/conventions/review-routing.md` com 4 blocos YAML estruturados:

1. **`path_globs`** — pattern + reviewers[] + stacks[] (ex: `apps/api/**/domain/**` → `nestjs-specialist, stack-code-reviewer`).
2. **`commit_types`** — feat/fix/refactor/perf/docs/chore/ci/test → reviewers_added[] + may_skip[].
3. **`diff_patterns`** — regex no conteúdo do diff → reviewers_added[] (ex: `bcrypt|jwt.sign` → `security-auditor`, blocking).
4. **`skip_rules`** — `spec-compliance-reviewer` e `code-quality-reviewer` têm `skip_if[]` explícitos.
5. **`always_on`** — `spec-compliance-reviewer` + `code-quality-reviewer` (piso, salvo skip).

**Versionamento:** frontmatter `version: 1`; bump em qualquer mudança estrutural. Router loga `matrix_version` + `matrix_file_sha` em todo output (reprodutibilidade).

**Exemplo (path_globs):**

```yaml
path_globs:
  - pattern: "apps/api/**/domain/**"
    reviewers: [nestjs-specialist, stack-code-reviewer]
    stacks: [ddd-hexagonal]
  - pattern: "apps/api/prisma/**"
    reviewers: [nestjs-specialist, stack-code-reviewer, doc-sync]
    stacks: [prisma]
  - pattern: "**/auth/**"
    reviewers: [security-auditor, nestjs-specialist]
    blocking_if_diff_matches: ["jwt", "bcrypt", "session"]
```

## §8. Heurísticas de Skip + Integração

**Skip `spec-compliance-reviewer` quando:**
- `scope=trivial AND files_changed<=1` OU `commit_type=chore AND scope!=large`
- `all_paths ∈ {*.md, *.txt}` OU ausente feature spec no escopo

**Skip `code-quality-reviewer` quando:**
- `all_paths ∈ {*.md, *.txt}` OU `scope=docs` OU fixtures/mocks apenas

**Override (força reviewer mesmo com skip):** paths críticos (`schema.prisma`, `.agents/specs/conventions/*.md`, `docs/adr/**`) ou breaking change indicator (`!` em Conventional Commit).

**Consenso (alta confiança):** quando 2+ reviewers flaggam mesmo `file:line` com severidades compatíveis → marca `consensus: true`. Solo (1 reviewer) fica marcado como `solo: true` (exige triage manual).

**Integração com agentes existentes:**
- `stack-code-reviewer` e `doc-sync` mantêm vida autônoma (pre-commit + CI). Router pode invocá-los como sub-reviewers.
- `code-reviewer` (genérico) vira o `spec-compliance-reviewer` no novo fluxo.
- `review-and-fix-after-each-task` permanece canônica para o triage no controller.

## §9. Error Handling + Testing

**Categorias de erro:** input invalid (fatal) | matrix malformada (fatal) | git base not found (fatal) | diff too large (warning) | classifier timeout (major, retry) | reviewer dispatch timeout (warning, skip + log) | reviewer output invalid schema (major, descartar + prosseguir) | consensus conflict (info).

**Padrões:** fail-fast em input, fail-safe em dispatch, idempotência, validação em fronteiras, rastreabilidade.

**Testing (TDD - memory `mandatory-tdd-rule`):**

| Nível | Arquivo | Coverage target |
|---|---|---|
| Unit (classificador) | `tooling/scripts/review-router.spec.ts` | ≥ 90% |
| Unit (matrix lint) | `tooling/scripts/lint-review-routing.ts` + spec | ≥ 85% |
| Integration (agent) | `.agents/skills/review-routing/integration.spec.ts` | cenários chave |
| E2E (feature-mode) | Adicionar cenário em `apps/api/test/` | end-to-end com fix loop |
| Matrix lint | pre-commit + CI em PR tocando `review-routing.md` | enforced |

**Lint da matriz** valida: YAML parse, globs válidos, reviewers referenciados existem, sem duplicatas, LOC ≤ 300.

## §10. Storage + Versionamento + Migração

**Storage layout:**

```
.agents/runs/
├── INDEX.md                              ← índice (auto)
├── 2026-09-22-review-001.yaml            ← output completo
└── ...
```

Cada output referencia `implementer_run`, `matrix_version`, `matrix_file_sha` (reprodutibilidade).

**Plano de migração (6 fases):**

| Fase | Entrega | Validação |
|---|---|---|
| 1 | Criar 7 arquivos novos (zero behavior change) | lint + testes unit passam |
| 2 | Catalogar em AGENTS.md §3 + WORKFLOWS.md | discoverability |
| 3 | Piloto com `monorepo-change.md` | 1 task real, latency OK |
| 4 | Reescrever memórias (router orquestra) | 3-5 tasks reais, consistência |
| 5 | Adicionar passo router em todos workflows | 1 sprint de produção |
| 6 | Retrospectiva + bump v1.1 se necessário | retrospective-capture aplicado |

**Rollback:** `export REVIEW_ROUTER_ENABLED=false` desabilita router; controller volta a usar two-stage manual. Por fase: reverter PR; restaurar memórias; rodar retrospective.

## §11. Critérios de Sucesso (DoD)

**Funcionalidade:** todos os 7 arquivos novos criados + 5 atualizados + spec commitado.

**Qualidade:** testes passam (unit + integration + e2e), `pnpm ci:local` verde, `pnpm review:lint` verde, 1 task real rodada via router, P95 < 90s, false positive rate < 10%.

**Documentação:** spec cross-ref em retrospectivas, INDEX.md template criado, retrospective-capture cita router, CHANGELOG entry.

**Métricas pós-rollout:**
- Coverage de domínios (path match) ≥ 95%
- Consensus rate 15-30%
- Skip rate (spec + quality) < 20% cada
- Latência P50 < 30s, P95 < 90s, P99 < 180s
- Reviewer utilization (1+ specialist) em 60% de tasks medium+

## §12. Riscos + Open Questions

**Riscos principais:** matriz cresce > 300 linhas (lint enforces) | falsos positivos irritam time (métrica monitorada + rollback em Fase 6) | diff cap 50KB perde precisão (paths ainda classificam) | schema drift entre router e reviewers (CheckResult versionado).

**Open questions (decidir durante implementação):**

1. Agent `performance-auditor` ainda não existe — criar agora ou marcar como `pending` na v1?
2. Cache de resultados de reviewer quando controller re-roda com mesmo input (TTL)?
3. Limite de paralelismo no dispatch (concurrency do Agent tool)?
4. Notification system entre router e reviewers (vs dispatch direto)?
5. Diferenciação de logs para trabalho local vs PR?

## §13. Próximos Passos

1. ✅ Aprovar este design (você está aqui)
2. ⏭️ Invocar `superpowers:writing-plans` para gerar plano de implementação TDD detalhado (Fases 1-6 da migração)
3. ⏭️ Implementar Fase 1 (criação dos arquivos) em TDD
4. ⏭️ Review de duas etapas (router inclusive, via piloto)
5. ⏭️ Avançar Fases 2-6 sequencialmente

## §14. Referências Canônicas

- **Memórias do projeto:**
  - `two-stage-review-after-each-task.md` (caso particular após migração)
  - `review-and-fix-after-each-task.md` (triage canônico)
  - `subagent-driven-development-always.md` (paralelização)
  - `reviewer-must-differ-from-implementer.md` (fresh subagent)
  - `mandatory-tdd-rule.md` (Red→Green→Refactor)
  - `prefer-parallel-subagents-when-possible.md`
- **Agents existentes:** [`.agents/agents/AGENTS.md`](../../../AGENTS.md) §3 (catálogo)
- **Workflows:** [`.agents/WORKFLOWS.md`](../../../WORKFLOWS.md)
- **Skills:** `agents-coordinate`, `ddd-hexagonal-validation`, `ci-defense-in-depth`, `retrospective-capture`
- **Conventions:** `.agents/specs/conventions/ci-defense-in-depth.md`, `retrospective-capture.md`, `estrutura-e-versionamento.md`
- **Documentação externa:**
  - [Conventional Commits](https://www.conventionalcommits.org/)
  - [Git diff format](https://git-scm.com/docs/git-diff)

---

**Aprovado por:** usuário (brainstorming completo)
**Data de aprovação:** 2026-09-22
**Próximo artefato:** `docs/superpowers/plans/2026-09-22-review-router-plan.md`
