# Design — specialist-router + docker-specialist: Roteamento de Demandas para Specialists

> **Data:** 2026-09-23
> **Branch:** `feat/dockerize-apps` (criada a partir de `main`)
> **Status:** Aprovado (brainstorming completo, 4 seções validadas)
> **Próximo passo:** `superpowers:writing-plans` → plano de implementação TDD

## §1. Resumo Executivo

Criar um **agent `specialist-router`** que substitui a decisão ad-hoc "qual specialist deve planejar/executar esta demanda?" por uma **classificação automatizada multi-sinal** (demand text + target paths + scope) seguida de **dispatch paralelo** dos specialists identificados, com **bloqueio automático** se nenhum specialist cobrir a demanda (regra `gap_detected: true`).

Em paralelo, criar o **agent `docker-specialist`** + **skill `docker`** para preencher o gap identificado para a demanda concreta de **dockerização de apps/api + apps/web** (escopo de aplicação imediata deste design).

**Substitui:** decisão manual do controller sobre qual specialist despachar.
**Complementa:** `review-router` (que continua orquestrando revisões pós-task).
**Aplica imediatamente a:** demanda "dockerizar apps/api e apps/web" — gera plano unificado (docker-specialist + monorepo-specialist) e executa via workflow padrão com TDD + revisões por tarefa.

## §2. Contexto e Motivação

O projeto tem **16 specialists** em `.agents/agents/` (15 existentes + `review-router`). Hoje:

1. **Controller decide manualmente** qual specialist usar para uma demanda — propenso a omissão, ruído e drift entre sessões.
2. **Demand "dockerização" expõe gap real** — nenhum specialist cobre Dockerfile/Compose/hardening/registries/runtime. Sem o specialist, a demanda teria que ser implementada sem o devido gate de qualidade.
3. **Convenção `evolucao-agents.md` já exige** "analisar catálogo → se não cobre → pesquisar → criar/adaptar → atualizar AGENTS.md §3 → dispatch". Falta o **mecanismo operacional** que enforce esse fluxo.
4. **Paralelo direto com `review-router`**: o mesmo padrão (agent + skill + matriz + classificador headless + lint + memory) já foi implementado com sucesso em 6 fases + Fix v1.2/v1.3. Replicar para demandas (não PRs) é natural.

Objetivos:
- **O1** — Para qualquer demanda, o controller sabe **automaticamente** quais specialists despachar.
- **O2** — Se a demanda não tem specialist, o controller é **bloqueado** até que `agent-architect` crie o specialist ausente.
- **O3** — O **docker-specialist** é criado agora (gap concreto da demanda de dockerização) e cobre Dockerfile multi-stage, Compose multi-file, hardening, BuildKit, registries, runtime, integração com monorepo pnpm+turbo.
- **O4** — A demanda de dockerização é **executada de ponta-a-ponta** após a infra de roteamento estar pronta, com TDD + revisões por tarefa + PR para main.

## §3. Decisões Tomadas

| # | Decisão | Escolha | Justificativa |
|---|---------|---------|---------------|
| D1 | Nível de automação | **Agent router novo** (mirror do review-router) | Cobertura multi-sinal + gate automático de gap |
| D2 | Sinais de classificação | **Demand text (keywords) + target paths + scope** | Análogo ao review-router (paths + commit type + diff patterns) |
| D3 | Quem planeja | **Specialists identificados, em paralelo** | Como review-router despacha reviewers em paralelo |
| D4 | Fonte da matriz | **Convention markdown externa** (`.agents/specs/conventions/specialist-routing.md`) | Mirror do review-routing; editável, versionável |
| D5 | Quando há gap | **Bloqueio total** — controller exige criação do specialist via `agent-architect` antes de planning | Regra inegociável da convenção `evolucao-agents.md` |
| D6 | Classificador | **Headless TDD em `tooling/scripts/specialist-router.ts`** | Pure function testável; mesma arquitetura do review-router |
| D7 | Lint da matriz | **`tooling/scripts/lint-specialist-routing.ts`** | Valida refs, globs, keywords, size, version |
| D8 | docker-specialist scope | **Completo + hardening** (Dockerfile, Compose, hardening, BuildKit, registries, runtime, monorepo) | Cobre demanda atual e futuras (deploy, observabilidade) |
| D9 | docker skill | **Skill separada em `.agents/skills/docker/`** | Captura convenções específicas do projeto (ordem db:generate→tsc, standalone output, entrypoint migrations) |
| D10 | Matriz v1.0 specialists | `monorepo`, `nestjs`, `nextjs`, `docker`, `security-auditor`, `test-writer`, `doc-writer`, `refactorer` | Cobrem domínios presentes na árvore; `code-reviewer`, `tdd-enforcer`, `orchestrator`, `agent-architect` ficam fora (meta/gates) |
| D11 | Integração com workflows | **Adicionar "Passo Pré-Planner: Despachar specialist-router"** nos 6 workflows existentes, antes do passo 1 | Espelha "Passo Pós-Implementer: Despachar review-router" |
| D12 | Execução da demanda atual | **Plano unificado docker-specialist + monorepo-specialist** com TDD + revisões por tarefa + PR para main | Fecha o ciclo de validação do router end-to-end |

## §4. Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│  DEMANDA DO USUÁRIO (ex: "dockerizar apps")                      │
└────────────────────────────────┬─────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────┐
│  CONTROLLER dispara specialist-router (Agent tool)               │
│  Input: demand{text, inferred_paths, scope}                      │
└────────────────────────────────┬─────────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────┐
│  SPECIALIST-ROUTER (subagent)                                    │
│  1. Extrair sinais (keywords + paths + scope)                    │
│  2. Ler matriz .agents/specs/conventions/specialist-routing.md   │
│  3. Invocar classificador headless pnpm specialist:route          │
│  4. Resolver specialists + aplicar skip_rules + always_on        │
│  5. Se gap_detected → retornar gap.yaml e BLOQUEAR planning      │
│  6. Despachar specialists em paralelo (Agent tool)               │
│  7. Agregar planos + escrever .agents/runs/<ts>-specialist.yaml  │
└────────────────────────────────┬─────────────────────────────────┘
                                 ↓
              ┌──────────────────┴──────────────────┐
              ↓                                     ↓
   docker-specialist (Agent)             monorepo-specialist (Agent)
   → plano de Dockerfile/Compose         → plano de integração turbo,
   → plano de hardening                     STACK.md, MONOREPO.md
              ↓                                     ↓
              └──────────────────┬──────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────────┐
│  CONTROLLER recebe plan unificado → writing-plans → execution    │
└──────────────────────────────────────────────────────────────────┘
```

## §5. Componentes

### §5.1. specialist-router agent (`.agents/agents/specialist-router.md`, ≤ 300 linhas)

**Frontmatter:**
```yaml
---
name: specialist-router
description: Orquestrador de demanda. Classifica demanda (keywords + paths + scope), consulta matriz .agents/specs/conventions/specialist-routing.md, despacha specialists em paralelo via Agent tool. Bloqueia planning se gap_detected (sem specialist cobre a demanda) e retorna instrução para criar specialist via agent-architect. Use antes de qualquer planning quando a demanda tem escopo técnico definido.
type: specialist
tools: Read, Glob, Grep, Bash, Agent
---
```

**12 seções padrão:** Papel / Quando invocar / Quando NÃO invocar / Inputs (yaml) / Comportamento (7 passos) / Outputs (yaml com `gap_detected`, `specialists_dispatched[]`, `plans_aggregated`) / Coordenação (tabela com `agent-architect`, `docker-specialist`, `monorepo-specialist`, etc.) / Princípios / Anti-Padrões / Referências Canônicas / footer.

**Comportamento (7 passos):**
1. Extrair sinais — keywords regex da demand text + glob patterns inferidos + scope (feat/fix/refactor/infra/security/docs/test/perf).
2. Ler matriz — `.agents/specs/conventions/specialist-routing.md` (frontmatter `version` + 4 seções: PATH_GLOBS, DEMAND_KEYWORDS, DEMAND_SCOPES, SKIP_HEURISTICS).
3. Invocar classificador headless — `pnpm specialist:route --demand=<file> --paths=<file> --matrix=<file>` → YAML puro.
4. Resolver specialists — aplicar `skip_rules[<specialist>]` (skip_if textuais) + `always_on[]` (forçar despacho).
5. Checar `gap_detected` — se `specialists == []`: retornar YAML com `gap_detected: true` + `suggested_specialist: <nome inferido>` + `next_steps: ["dispatch agent-architect to create <nome>"]`. **BLOQUEIO.**
6. Despachar specialists em paralelo (Agent tool).
7. Agregar planos + escrever `.agents/runs/<ts>-specialist-<n>.yaml` + retornar summary ao controller.

### §5.2. specialist-routing skill (`.agents/skills/specialist-routing/SKILL.md`, ≤ 200 linhas)

Workflow do controller para invocar o router pré-planning. Espelha `review-routing/SKILL.md`.

**Frontmatter:**
```yaml
---
name: specialist-routing
description: Workflow completo para o controller invocar o specialist-router antes do planning. Cobre inputs, dispatch, interpretação do output, tratamento de gap_detected, integração com writing-plans. Use em qualquer demanda com escopo técnico definido.
---
```

**6 passos:** pre-dispatch checks / dispatch router / interpretar output (incluindo gap_detected) / triage (controller decide se planeja ou bloqueia) / se bloqueado: dispatch `agent-architect` / se OK: integrar com writing-plans.

### §5.3. specialist-routing matriz (`.agents/specs/conventions/specialist-routing.md`, ≤ 300 linhas)

**Frontmatter:**
```yaml
---
name: specialist-routing
version: 1.0
updated: 2026-09-23
maintainer: specialist-router
description: "Matriz de roteamento de specialists consultada pelo specialist-router"
---
```

**4 seções YAML (espelho do review-routing):**
- `path_globs[]` — `{pattern, specialists[], stacks[], rationale?, blocking?: false, domain?: "<label>"}`
- `demand_keywords[]` — `{regex, specialists_added[], scope_filter?, rationale?}`
- `demand_scopes` — map `feat/fix/refactor/infra/security/docs/test/perf` → `{specialists_added[], may_skip[]}`
- `skip_rules[<specialist>]` + `always_on[]`

**Matriz v1.0 specialists:**

| Specialist | Paths | Keywords |
|---|---|---|
| `monorepo-specialist` | `apps/*`, `packages/*`, `tooling/*`, `turbo.json`, `pnpm-workspace.yaml`, `.tooling/**` | "monorepo","workspace","turbo","pnpm" |
| `nestjs-specialist` | `apps/api/**` | "nestjs","fastify","prisma","controller","module" |
| `nextjs-specialist` | `apps/web/**` | "next","nextjs","react","rsc","tailwind" |
| `docker-specialist` | `**/Dockerfile*`, `**/docker-compose*`, `**/.dockerignore`, `**/infra/**` | "docker","container","compose","dockerfile","imagem","containerização","containerize" |
| `security-auditor` | `**/auth/**`, `**/secrets/**`, `**/.env*` | "security","auth","jwt","cve","vulnerability" |
| `test-writer` | `**/*.spec.ts`, `**/*.test.ts`, `**/*.spec.tsx`, `**/*.test.tsx` | "test","tdd","coverage" |
| `doc-writer` | `**/*.md`, `docs/**`, `.agents/specs/**` | "doc","documentation","readme","spec" |
| `refactorer` | — (keywords only) | "refactor","simplify","cleanup" |

### §5.4. specialist-router memory (`.agents/memory/specialist-router.md`)

Inicializado do `_template.md`. Estrutura: Estado Inicial / Learnings (sub-seções datadas por demanda) / Gaps Conhecidos / Cross-refs.

### §5.5. Classificador headless TDD (tooling/scripts/specialist-router.ts + .spec.ts)

Mirror de `review-router.ts`. Pure function `classify({demand, paths, scope}, rules): ClassifyResult` com matchers:
- `matchPathGlobs(paths, rules)` — converte glob → regex (placeholder trick do review-router).
- `matchDemandKeywords(demand, rules)` — aplica regex contra demand text.
- `matchDemandScopes(scope, rules)` — Conventional scopes (`feat/fix/refactor/infra/security/docs/test/perf`).

CLI: `pnpm specialist:route --demand=<file> --paths=<file> --matrix=<file>`. Exit 0 OK / 2 usage / 3 gap_detected.

### §5.6. Lint da matriz (tooling/scripts/lint-specialist-routing.ts)

Mirror de `lint-review-routing.ts`. Valida: YAML bem-formado, glob compila, regex válida, specialist refs existem em `.agents/agents/`, size ≤ 300 linhas, version bump consistente.

### §5.7. docker-specialist agent (`.agents/agents/docker-specialist.md`, ≤ 300 linhas)

**Frontmatter:**
```yaml
---
name: docker-specialist
description: Specialist em containerização. Cobre Dockerfile (multi-stage, BuildKit cache mounts), Compose (multi-file com override, profiles, networks, volumes, secrets), hardening (non-root, distroless, version pinning, healthchecks, signals), registries (multi-arch, OCI labels), runtime (init containers, graceful shutdown, observability), integração com monorepo pnpm+turbo. Use para criar/auditar Dockerfiles, configurar compose stacks, otimizar imagens, validar segurança de runtime, debugar build/runtime issues.
type: specialist
tools: Read, Glob, Grep, Bash, Write, Agent
---
```

**12 seções padrão** com ênfase em: papel (8 responsabilidades), quando invocar (9 bullets), quando NÃO invocar (4), comportamento (7 passos), outputs (plan YAML), coordenação (nestjs-specialist, nextjs-specialist, monorepo-specialist, security-auditor), princípios (6), anti-padrões (6 com ❌), referências (Docker docs, BuildKit docs, OWASP Docker Top 10, distroless, Prisma binaryTargets).

### §5.8. docker-specialist memory (`.agents/memory/docker-specialist.md`)

Inicializado do `_template.md`.

### §5.9. docker skill (`.agents/skills/docker/SKILL.md`, ≤ 200 linhas)

**Frontmatter:**
```yaml
---
name: docker
description: Convenções e processos docker específicos do monorepo projeto-base. Cobre ordem de build (db:generate → tsc), next.config.mjs standalone, entrypoint com prisma migrate deploy, .dockerignore, Compose profiles (dev/prod), networks, volumes, healthchecks via curl, non-root user, BuildKit cache mounts para pnpm. Use sempre que criar/editar Dockerfile, compose, ou .dockerignore no projeto.
---
```

**Estrutura:** Inputs (yaml) / Comportamento (10 passos: detectar stack → escolher base image → multi-stage dev+prod → ordem db:generate antes de tsc → standalone output para Next.js → entrypoint migrations → .dockerignore mínimo → healthcheck endpoint → non-root user → BuildKit cache) / Outputs (Dockerfile final + .dockerignore + entrypoint) / Anti-Padrões (6 com ❌) / Cross-refs.

## §6. Fluxos

### §6.1. Fluxo do controller — invoke specialist-router

```
1. Recebe demanda do usuário (texto + contexto)
2. Extrai sinais básicos (keywords visíveis, paths inferidos)
3. Escreve temp files: .agents/runs/<ts>-demand.txt e <ts>-paths.txt
4. Despacha specialist-router via Agent tool
5. Lê output .agents/runs/<ts>-specialist-<n>.yaml
6. Se gap_detected: true
   → Log "Gap detectado: <suggested_specialist>"
   → Despacha agent-architect para criar specialist
   → Re-roda specialist-router após criação
7. Se specialists_dispatched: []
   → Erro fatal (matriz vazia = bug)
8. Se specialists_dispatched: [X, Y]
   → Cada specialist já foi despachado em paralelo dentro do router (passo 6 do router)
   → Plans agregados vêm no output do router
9. Prossegue para writing-plans com plans unificados
```

### §6.2. Fluxo do specialist-router — classificar e despachar

```
1. Extrair sinais
   - keywords: regex split da demand text
   - paths: glob patterns inferidos (se usuário mencionou)
   - scope: heurística (feat/fix/refactor/infra/...)
2. Read matriz
3. Bash: pnpm specialist:route --demand=... --paths=... --matrix=...
   → ClassifyResult { specialists[], evidence[], blocking, gap_detected }
4. Resolver (agent layer, NÃO classificador):
   - Aplicar skip_rules[<specialist>].skip_if textuais
   - Aplicar always_on[] (forçar despacho)
   - Remover duplicatas (Set)
5. Se specialists resolvidos == []:
   → gap_detected: true, suggested_specialist: <top keyword cluster>
   → return early (não dispatch)
6. Senão:
   → Promise.all(Agent tool para cada specialist)
   → Agregar plans
   → Escrever YAML + retornar
```

### §6.3. Fluxo de aplicação à demanda de dockerização

```
1. Controller recebe demanda "dockerizar apps/api e apps/web"
2. Despacha specialist-router
3. Router classifica: docker-specialist (keywords "docker","compose") + monorepo-specialist (paths apps/*)
4. Router despacha ambos em paralelo
5. docker-specialist retorna plan:
   - Dockerfile apps/api/Dockerfile (multi-stage dev+prod)
   - Dockerfile apps/web/Dockerfile (multi-stage dev+prod, output: 'standalone')
   - apps/web/next.config.mjs (output: 'standalone')
   - .dockerignore (root)
   - Atualização docker-compose.yml (postgres + api + web prod)
   - docker-compose.dev.yml (override dev)
   - Endpoint GET /api/v1/health em apps/api
   - Endpoint GET /api/health em apps/web
   - CORS permissivo em dev no apps/api
6. monorepo-specialist retorna plan:
   - Atualização docs/STACK.md (seção Docker + footer version bump)
   - Atualização docs/MONOREPO.md (seção Docker + footer version bump)
   - Atualização .tooling/scripts/ci/preflight.ts (drift check para .dockerignore + Dockerfile size + version consistency)
   - Atualização AGENTS.md §3 (catálogo — docker-specialist + specialist-router)
7. Plans mesclados → writing-plans → plan unificado
8. Execution com TDD + 2-stage review por tarefa (Dockerfile tem "build verde" como test)
9. PR para main com CI verde
```

## §7. Gaps Conhecidos (v1.0)

| # | Severidade | Gap | Mitigação |
|---|---|---|---|
| G1 | P2 | Demand keywords regex é ingênuo (não semântico) — pode dar FP em demandas com "docker" como adjetivo ("docker hub" sem ser containerização real) | Adicionar scope_filter `infra` para keywords docker; refinar após 5 demandas reais |
| G2 | P2 | Matriz v1.0 não cobre `code-reviewer`, `tdd-enforcer`, `orchestrator`, `agent-architect` — meta-agents e gates não devem ser roteados via demanda | Documentado em §5.3 como "fora do escopo"; aliases no router resolvem nomes |
| G3 | P3 | Classificador não tem `noUncheckedIndexedAccess` enforcement (regression risk vs review-router) | Mesmo pattern do review-router (escapar índices); TDD cobre casos |
| G4 | P3 | Skip rules são textuais (não programáticas) — futuro v2 pode parsear YAML | Aceito em v1.0; alinhado com review-router |
| G5 | P3 | Pilot run não foi executado antes da demanda real (ciclo curto) | Pós-execução da dockerização, retro captura aprendizados para v1.1 |

## §8. Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-09-23 | Criação inicial: specialist-router + docker-specialist + docker skill + matriz v1.0 + classificador TDD + lint |