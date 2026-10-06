# projeto-base

> **Monorepo base** para projetos que usam agents de IA interoperáveis.
> Vendor-neutral — funciona com Claude Code, Cursor, Windsurf, Aider, Continue, Cline e outras ferramentas.
> Stack implementada: **NestJS (backend) + Next.js (frontend) + OpenTelemetry** + **pnpm workspaces + Turborepo**.

---

## O que é

Um **monorepo base reutilizável** que implementa o **padrão genérico de agents de IA** onde todos os agents podem interoperar entre si via coordenação explícita. Use como ponto de partida para qualquer projeto full-stack que queira organizar trabalho multi-agent de forma consistente, com convenções de monorepo, DDD/Hexagonal e CI defense-in-depth bem definidas.

**Diferencial:** enquanto o template anterior era genérico para qualquer projeto, este é um **monorepo base opinativo** com:

- Apps `apps/api` (NestJS) + `apps/web` (Next.js) **já implementados** — bounded context `users` em camadas `domain/`, `application/`, `infrastructure/`
- 20 agents (12 genéricos + 2 routers + 5 specialists + 1 sub-dir) interoperáveis via skill `agents:coordinate`
- 9 skills + 10 workflows + 17 convenções canônicas
- **Paradigma DDD + Hexagonal** canônico (ADR-0001) com guardiões automáticos
- **OpenTelemetry cross-stack** (backend + frontend + Collector)
- **CI Defense-in-Depth** em 3 camadas

## Estrutura

```text
projeto-base/
├── AGENTS.md                           # Spec canônica do padrão (LEIA PRIMEIRO, ≤ 300 linhas)
├── README.md                           # Este arquivo
├── .markdownlint.json                  # Configuração do lint de Markdown
├── .agents/
│   ├── agents/                         # 19 agents (12 genéricos + 2 routers + 5 specialists de stack)
│   │   ├── agent-architect.md
│   │   ├── code-reviewer.md
│   │   ├── docker-specialist.md
│   │   ├── doc-sync.md
│   │   ├── doc-writer.md
│   │   ├── explorer.md
│   │   ├── monorepo-specialist.md
│   │   ├── nestjs-specialist.md
│   │   ├── nextjs-specialist.md
│   │   ├── orchestrator.md
│   │   ├── refactorer.md
│   │   ├── review-router.md            # roteia diffs pós-task para reviewers
│   │   ├── security-auditor.md
│   │   ├── specialist-router.md        # roteia demanda para o(s) specialist(s)
│   │   ├── stack-code-reviewer.md
│   │   ├── task-manager.md
│   │   ├── tdd-enforcer.md
│   │   ├── telemetry-specialist.md
│   │   └── test-writer.md
│   ├── memory/                         # Memória acumulada por agent (21 arquivos)
│   ├── skills/                         # coordenação, routing, validação (ver AGENTS.md §3)
│   ├── specs/conventions/              # tdd, git-workflow, cobertura, tamanho… (ver AGENTS.md §6)
│   └── WORKFLOWS.md                    # Fluxos pré-configurados (10 workflows)
├── apps/                              # api (NestJS 11) + web (Next.js 15)
├── packages/                          # eslint-config, shared-types, tsconfig
├── tooling/scripts/                   # stack-code-reviewer, doc-sync, routers
├── turbo.json                         # pipeline cacheado (turbo)
├── pnpm-workspace.yaml
└── docs/
    ├── TEMPLATE_USAGE.md               # Guia principal (≤ 300 linhas)
    ├── MONOREPO.md                     # NOVO (v1.1.0) — convenções de monorepo
    ├── STACK.md                        # NOVO (v1.1.0) — stack escolhida e justificativas
    └── integrations/                   # Integração por ferramenta
        ├── claude-code.md
        ├── cursor.md
        ├── windsurf.md
        ├── aider.md
        ├── continue.md
        ├── copilot.md
        ├── cline.md
        └── cody.md
```

## Como executar localmente

> Três modos suportados. Use Docker para reproduzir ambiente de produção, pnpm nativo para iterar rápido, ou só Postgres+apps nativos para debugar uma camada.

### Pré-requisitos

- **Node.js** ≥ 20 (LTS)
- **pnpm** ≥ 9.12.0 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- **Docker** + **Docker Compose** v2 (apenas para modos A e B)
- **PostgreSQL 16** rodando em `localhost:5432` (ou usar `docker compose up -d postgres`)

### Opção A — Docker Compose (recomendado)

Reproduz fielmente o ambiente de produção com healthchecks, network interna e migrations automáticas.

```bash
# Stack completa (postgres + api + web prod targets)
docker compose up -d postgres api web

# Aguardar healthcheck (~30s na primeira vez — migrations + db:generate)
docker compose ps   # todos Up + (healthy)

# Validar endpoints
curl -f http://localhost:3000/api/v1/health     # 200 { status: "ok" }
curl -f http://localhost:3001/api/health        # 200 { status: "ok" }
curl -f http://localhost:3000/api/docs          # Swagger UI

# Logs em tempo real
docker compose logs -f api web
```

**Dev (hot reload via bind mounts):**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# Editar apps/api/src/ → tsx watch recarrega em <2s
# Editar apps/web/app/ → Next.js Fast Refresh imediato
```

### Opção B — pnpm nativo (sem Docker nos apps)

Mais rápido para iterar. Postgres ainda roda em Docker (B22 alternativa: Postgres local via brew/apt).

```bash
# 1. Instalar deps
pnpm install --frozen-lockfile

# 2. Subir Postgres
docker compose up -d postgres
# ou apontar DATABASE_URL para Postgres existente:
export DATABASE_URL="postgresql://projeto:projeto@localhost:5432/projeto_base?schema=public"

# 3. Gerar Prisma Client (uma vez, e após mudanças em schema.prisma)
pnpm turbo run db:generate

# 4. Subir apps em watch mode
pnpm dev    # turbo run dev em paralelo — api em :3000, web em :3001

# 5. Rodar migrations
pnpm --filter @projeto/api prisma:migrate:deploy
```

Endpoints:

- **API:** <http://localhost:3000>
- **API Docs (Swagger):** <http://localhost:3000/api/docs>
- **Web:** <http://localhost:3001>

### Verificação rápida (CI-equivalente local)

```bash
# Atalho consolidado antes de push — ~1min
pnpm ci:local    # preflight + lint + typecheck + test:unit + test:coverage

# Granular (debug de gate específico)
pnpm ci:preflight                          # ~10s — drift
pnpm turbo run lint typecheck              # ~1min
pnpm turbo run test:coverage --filter=@projeto/api --filter=@projeto/web  # gate 80%
pnpm stack:review --files="$(git diff --name-only main | tr '\n' ',' | sed 's/,$//')"
pnpm docs:sync --files="$(git diff --name-only main | tr '\n' ',' | sed 's/,$//')" --mode=check
```

Smoke completo da stack Docker (requer daemon):

```bash
docker compose up -d postgres api web && sleep 30 \
  && pnpm --filter @projeto/api test:integration \
  && pnpm --filter @projeto/api test:e2e && docker compose down
```

### Troubleshooting

| Sintoma | Solução |
|---|---|
| `prisma migrate deploy` falha em container | `docker compose down -v` para resetar volume + re-up |
| `pnpm dev` falha com `Cannot find module '@projeto/...'` | `pnpm install --frozen-lockfile` |
| `docker compose` diz "port already in use" | `lsof -i :5432` → parar processo OU mudar porta no compose |
| `curl /api/v1/health` retorna 503 | `docker compose logs postgres` |
| Traces não chegam no OTel Collector | Subir com `docker compose --profile observability up -d` |
| `pnpm ci:preflight` falha com cross-ref quebrada | `pnpm docs:sync --mode=fix` ou ajustar manualmente |

## Como usar

Três opções para derivar um novo projeto:

```bash
# Opção 1 — Copiar
cp -r projeto-base/ meu-novo-monorepo/ && cd meu-novo-monorepo/

# Opção 2 — Submodule (sincroniza updates sem perder customizações)
git submodule add https://github.com/seu-org/projeto-base.git .agents-base

# Opção 3 — Fork + personalizar (mantenha §1 do AGENTS.md intacta)
gh repo fork b3ll3o/projeto-base
```

Independente da opção, o padrão de interoperabilidade permanece intacto.

## Regra Mandatória

> **SEMPRE use o padrão genérico de agents de IA onde TODOS os agents podem interoperar entre si** via a skill `agents:coordinate`.

Detalhes completos em [`AGENTS.md`](./AGENTS.md) (seção §1).

## Agents Inclusos

### Genéricos (12)

| Agent | Uso |
|---|---|
| `agent-architect` | Cria/evolui agents (meta-agent) |
| `orchestrator` | Despacha tarefas multi-step |
| `explorer` | Mapeia código (read-only) |
| `code-reviewer` | Revisão geral (bugs, smells, qualidade) |
| `stack-code-reviewer` | Revisão com lens de stack (DDD/Hexagonal, NestJS, NextJS, Prisma) — gate em pre-commit + CI |
| `security-auditor` | Auditoria OWASP Top 10 + supply chain |
| `doc-sync` | Sincroniza docs após alteração de código — gate em pre-commit + CI |
| `refactorer` | Refatoração incremental TDD-driven |
| `test-writer` | Criação de testes (TDD/BDD/ATDD) |
| `tdd-enforcer` | Valida ciclo Red→Green→Refactor (bloqueia merge) |
| `doc-writer` | Geração de documentação |
| `task-manager` | Gestão de tarefas e backlog |

### Routers / Orquestradores (2)

| Agent | Uso |
|---|---|
| `review-router` | Despacha reviewers em paralelo após task DONE (matriz `path_globs` × `commit_types` × `diff_patterns`) |
| `specialist-router` | Pré-planejamento — classifica demanda e identifica specialist(s); bloqueia se `gap_detected` |

### Specialists de Stack (5)

| Agent | Uso |
|---|---|
| `monorepo-specialist` | Arquiteto de monorepo (workspaces, pipelines turbo, versionamento) |
| `nestjs-specialist` | Arquitetura backend NestJS (módulos, DI, validação, Swagger, DDD/Hexagonal) |
| `nextjs-specialist` | Arquitetura frontend Next.js (RSC, App Router, Server Actions) |
| `docker-specialist` | Containerização (Dockerfile multi-stage, Compose, hardening) |
| `telemetry-specialist` | Observabilidade cross-stack (OTel SDK init, exporters OTLP, propagação W3C, web-vitals) |

Cada agent possui arquivo de **memória** em `.agents/memory/<nome>.md` que armazena decisões, padrões e sugestões de evolução — garantindo que os agents evoluam junto com a aplicação.

## Workflows Pré-Configurados

Workflows detalhados em [`.agents/WORKFLOWS.md`](./.agents/WORKFLOWS.md) (índice) e [`.agents/workflows/`](./.agents/workflows/) (detalhes por workflow).

### Genéricos (10)

- `feature-mode` — implementar nova feature
- `bugfix-mode` — corrigir bug
- `refactor-mode` — refatorar
- `security-mode` — auditoria de segurança
- `docs-mode` — documentar
- `task-mode` — gerenciar tarefas
- `explore-mode` — explorar código
- `review-mode` — revisar PR/diff
- `release-mode` — preparar release / bumpar versão
- `retrospective-mode` — capturar aprendizados / post-mortem

### Compostos (6)

`ci-defense-mode` · `state-aware-planning` · `specialist-routing` · `feedback-to-spec` (v1.9.0+ — fecha o Engineering Loop) · `review-routing` · `archive-demand`

### Por Stack (3)

`backend-feature` · `frontend-feature` · `monorepo-change`

## Stack e Apps Implementados

Conforme convenção [`docs/STACK.md`](./docs/STACK.md):

- **Monorepo:** pnpm workspaces + Turborepo + Changesets
- **Backend (`apps/api`):** NestJS 11 + Fastify + Prisma 6 + PostgreSQL 16
- **Frontend (`apps/web`):** Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- **Observabilidade:** OpenTelemetry SDK + OTel Collector (perfil Compose `observability`)

Os apps `apps/api` e `apps/web` **já estão implementados** — bounded context
`users` com auditoria, em camadas `domain/`, `application/` e
`infrastructure/`, conforme o
[ADR-0001](./docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md). Para subir
localmente, ver a seção "Como executar localmente" acima.

Veja [`docs/MONOREPO.md`](./docs/MONOREPO.md) para convenções detalhadas.

## Compatibilidade por Ferramenta

| Ferramenta | Suporte | Como integrar |
|---|---|---|
| Claude Code | ✅ Nativo | `AGENTS.md` carregado automaticamente |
| Cursor | ✅ | `AGENTS.md` + `.cursorrules` opcional |
| Windsurf | ✅ | `AGENTS.md` + `.windsurf/memories/` |
| Aider | ✅ | `--read AGENTS.md` |
| Continue | ✅ | Custom slash commands |
| GitHub Copilot | ✅ | `AGENTS.md` + `.github/copilot-instructions.md` |
| Cline / Roo Code | ✅ | `.clinerules` |
| Cody | ✅ | `.vscode/cody.json` recipes |

Detalhes em [`docs/TEMPLATE_USAGE.md`](./docs/TEMPLATE_USAGE.md).

## Versão

**1.9.0** — Major doc sync: README alinhado ao estado real (20 agents / 9 skills / 17 conventions / 10 workflows; apps implementados; OpenTelemetry). Bump 1.6.0 → 1.9.0.

## Licença

MIT
