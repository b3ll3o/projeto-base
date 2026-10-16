# projeto-base

> **Monorepo base** para projetos que usam agents de IA interoperáveis.
> Vendor-neutral — funciona com Claude Code, Cursor, Windsurf, Aider, Continue, Cline e outras ferramentas.
> Stack implementada: **NestJS (backend) + Next.js (frontend) + OpenTelemetry** + **pnpm workspaces + Turborepo**.

---

## O que é

Um **monorepo base reutilizável** que implementa o **padrão genérico de agents de IA** onde todos os agents podem interoperar entre si via coordenação explícita. Use como ponto de partida para qualquer projeto full-stack que queira organizar trabalho multi-agent de forma consistente, com convenções de monorepo, DDD/Hexagonal e CI defense-in-depth bem definidas.

**Diferencial:** enquanto o template anterior era genérico para qualquer projeto, este é um **monorepo base opinativo** com:

- Apps `apps/api` (NestJS) + `apps/web` (Next.js) **já implementados** — bounded context `users` em camadas `domain/`, `application/`, `infrastructure/`
- **26 agents** (12 genéricos + 2 routers + 6 specialists de stack + 6 specialists de auditoria) + 3 arquivos companheiro em `telemetry-specialist/`, interoperáveis via skill `agents:coordinate` — medido do disco 2026-10-08, `ls .agents/agents/*.md | wc -l`
- **20 skills + 15 workflows + 19 convenções canônicas** — medido do disco 2026-10-13 (`ls .agents/skills/*/SKILL.md | wc -l`, `ls .agents/workflows/*.md | wc -l`, linhas de dados da tabela em `AGENTS.md §6`)
- **Paradigma DDD + Hexagonal** canônico (ADR-0001) com guardiões automáticos
- **OpenTelemetry cross-stack** (backend + frontend + Collector)
- **CI Defense-in-Depth** em 3 camadas

## Estrutura

```text
projeto-base/
├── AGENTS.md              # Spec canônica do padrão (LEIA PRIMEIRO, ≤ 300 linhas)
├── README.md              # Este arquivo
├── .agents/
│   ├── agents/            # 26 agents (12 genéricos + 2 routers + 6 de stack + 6 de auditoria)
│   │                      # catálogo nominal, com papel e memória: AGENTS.md §3
│   ├── memory/            # Memória acumulada (28 arquivos: 26 agents + state-aware-planning + _template)
│   ├── skills/            # coordenação, routing, auditoria, UI (mapeamento agent↔skill: AGENTS.md §3.2)
│   ├── specs/conventions/ # tdd, git-workflow, cobertura, tamanho… (ver AGENTS.md §6)
│   ├── workflows/         # 15 workflows detalhados
│   └── WORKFLOWS.md       # Fluxos pré-configurados, em tabela
├── apps/                  # api (NestJS 11) + web (Next.js 15)
├── packages/              # eslint-config, shared-types, tsconfig
├── tooling/scripts/       # stack-code-reviewer, doc-sync, routers
├── turbo.json             # pipeline cacheado (turbo)
├── pnpm-workspace.yaml
└── docs/
    ├── TEMPLATE_USAGE.md  # Guia principal (≤ 300 linhas)
    ├── MONOREPO.md        # convenções de monorepo
    ├── STACK.md           # stack escolhida e justificativas
    └── integrations/      # Integração por ferramenta: claude-code, cursor, windsurf,
                           # aider, continue, copilot, cline, cody
```

## Como executar localmente

> **Mapa completo por ambiente** (dev, Docker, observabilidade, e2e, CI): [`docs/como-rodar.md`](./docs/como-rodar.md)
>
> Três modos suportados. Use Docker para reproduzir ambiente de produção, pnpm nativo para iterar rápido, ou só Postgres+apps nativos para debugar uma camada.

### Pré-requisitos

- **Node.js** ≥ 20 (LTS)
- **pnpm** ≥ 9.12.0 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- **Docker** + **Docker Compose** v2 (apenas para modos A e B)
- **PostgreSQL 16** rodando em `localhost:5432`. ⚠️ Desde o #91 o `postgres` do compose
  **não publica porta no host** (`expose` sem `ports`), então `docker compose up -d postgres`
  não serve para apps rodando na máquina — veja [`docs/como-rodar.md` §1.1](./docs/como-rodar.md)

### Opção A — Docker Compose (recomendado)

Reproduz fielmente o ambiente de produção com healthchecks, network interna e migrations automáticas.

A API assina JWT e **recusa o boot sem `JWT_SECRET`** — sem valor, sem default,
sem exceção. Gere um antes de subir o serviço `api`:

```bash
export JWT_SECRET=$(openssl rand -base64 48)
```

O Postgres não depende dele (`docker compose up -d postgres` funciona sem), porque
o Compose interpola o arquivo inteiro antes de qualquer comando: exigir a variável
no compose quebraria também `config`, `ps` e `down`.

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

# 2. Subir Postgres COM PORTA PUBLICADA NO HOST.
# ⚠️ O `postgres` do compose usa só `expose` desde o #91 — `docker compose up -d postgres`
# sobe o banco, mas a API na máquina não alcança. Use um container próprio:
docker run -d --name projeto-base-pg-local -p 5432:5432 \
  -e POSTGRES_USER=projeto -e POSTGRES_PASSWORD=projeto -e POSTGRES_DB=projeto_base \
  postgres:16-alpine
# ou aponte para um Postgres existente:
# export DATABASE_URL="postgresql://projeto:projeto@localhost:5432/projeto_base?schema=public"

# 3. Gerar Prisma Client (uma vez, e após cada mudança em schema.prisma)
pnpm turbo run db:generate

# 4. Configurar o segredo JWT — ANTES de subir a API: ela recusa o boot
# sem o segredo em QUALQUER NODE_ENV, não só em produção
cp apps/api/.env.example apps/api/.env
openssl rand -base64 48    # preencha o valor na linha JWT_SECRET= de apps/api/.env

# 5. Rodar migrations — o binário do Prisma direto, de dentro de apps/api
# para que ele leia o apps/api/.env. Não existe script
# `prisma:migrate:deploy` em nenhum package.json: o pnpm responde
# "None of the selected packages has a ... script" e SAI 0, que é verde
# para quem só olha o exit code
cd apps/api && pnpm exec prisma migrate deploy && cd ../..

# 6. Subir apps em watch mode
pnpm dev    # turbo run dev em paralelo — api em :3000, web em :3001
```

⚠️ **`JWT_SECRET` não tem valor default, por decisão de projeto** (ver
[ADR-0002](docs/adr/0002-autenticacao-jwt-argon2.md)). Um segredo JWT padrão em
repositório é pior que nenhum: todos que instalaram o projeto compartilhariam a
chave de assinatura, e qualquer um poderia forjar um token de administrador.

Endpoints:

- **API:** <http://localhost:3000>
- **API Docs (Swagger):** <http://localhost:3000/api/docs>
- **Web:** <http://localhost:3001>

### Verificação rápida (CI-equivalente local)

```bash
# Atalho consolidado antes de push — ~1min
pnpm ci:local    # preflight + lint + typecheck + test:unit + test:coverage
                # + test:integration + test:e2e (API e web), ~70-75s medidos

# Granular (debug de gate específico)
pnpm ci:preflight                          # ~10s — drift
pnpm turbo run lint typecheck              # ~1min
pnpm turbo run test:coverage --filter=@projeto/api --filter=@projeto/web  # gate 80%
pnpm stack:review --files="$(git diff --name-only main | tr '\n' ',' | sed 's/,$//')"
pnpm docs:sync --files="$(git diff --name-only main | tr '\n' ',' | sed 's/,$//')" --mode=check
```

**Fluxo canônico (do primeiro comando ao merge):** [`docs/fluxo-desenvolvimento.md`](./docs/fluxo-desenvolvimento.md) — documento factual com cada gate, em qual camada, e o que **de fato** bloqueia.

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

### Specialists de Stack (6)

| Agent | Uso |
|---|---|
| `monorepo-specialist` | Arquiteto de monorepo (workspaces, pipelines turbo, versionamento) |
| `nestjs-specialist` | Arquitetura backend NestJS (módulos, DI, validação, Swagger, DDD/Hexagonal) |
| `nextjs-specialist` | Arquitetura frontend Next.js (RSC, App Router, Server Actions) |
| `docker-specialist` | Containerização (Dockerfile multi-stage, Compose, hardening) |
| `telemetry-specialist` | Observabilidade cross-stack (OTel SDK init, exporters OTLP, propagação W3C, web-vitals) |
| `ux-design-specialist` | UX e design de interface (tokens, estados, formulários, a11y, microcopy) |

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

- **Monorepo:** pnpm workspaces + Turborepo
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

## Versão & Licença

**Versão:** 1.11.0 — contagens re-medidas do disco (2026-10-13): skills 15 → 20 (as 5 de UI que `v1.11.0` adicionou) e convenções 21 → 19 (linhas de dados de `AGENTS.md §6`); agents 26 e memórias 28 conferem. Footer alinhado ao de `docs/MONOREPO.md` e à tag `v1.11.0`. **Licença:** MIT.
