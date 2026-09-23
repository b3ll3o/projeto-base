# projeto-base

> **Monorepo base** para projetos que usam agents de IA interoperáveis.
> Vendor-neutral — funciona com Claude Code, Cursor, Windsurf, Aider, Continue, Cline e outras ferramentas.
> Stack inicial: **NestJS (backend) + Next.js (frontend)** + **pnpm workspaces + Turborepo**.

---

## O que é

Um **monorepo base reutilizável** que implementa o **padrão genérico de agents de IA** onde todos os agents podem interoperar entre si via coordenação explícita. Use como ponto de partida para qualquer projeto full-stack que queira organizar trabalho multi-agent de forma consistente, com convenções de monorepo bem definidas.

**Diferencial:** enquanto o template anterior era genérico para qualquer projeto, este é um **monorepo base opinativo** com:

- Estrutura de workspaces (apps/, packages/, tooling/)
- Stack inicial configurada (NestJS + Next.js)
- 3 specialists de stack inclusos (`monorepo-specialist`, `nestjs-specialist`, `nextjs-specialist`)
- Convenções claras de isolamento entre apps e reuso via packages

## Estrutura

```text
projeto-base/
├── AGENTS.md                           # Spec canônica do padrão (LEIA PRIMEIRO, ≤ 300 linhas)
├── README.md                           # Este arquivo
├── .markdownlint.json                  # Configuração do lint de Markdown
├── .agents/
│   ├── agents/                         # 13 agents (10 genéricos + 3 specialists de stack)
│   │   ├── agent-architect.md
│   │   ├── orchestrator.md
│   │   ├── explorer.md
│   │   ├── code-reviewer.md
│   │   ├── security-auditor.md
│   │   ├── refactorer.md
│   │   ├── test-writer.md
│   │   ├── tdd-enforcer.md
│   │   ├── doc-writer.md
│   │   ├── task-manager.md
│   │   ├── monorepo-specialist.md      # NOVO (v1.1.0)
│   │   ├── nestjs-specialist.md        # NOVO (v1.1.0)
│   │   └── nextjs-specialist.md        # NOVO (v1.1.0)
│   ├── memory/                         # Memória acumulada por agent (13 arquivos)
│   ├── skills/
│   │   └── agents-coordinate/          # Skill de coordenação multi-agent
│   │       ├── SKILL.md                # Ponto de entrada (≤ 300 linhas)
│   │       ├── MEMORY.md               # Memória da skill
│   │       ├── protocolos/             # dispatch, composição, outputs
│   │       └── exemplos/               # feature-mode completo
│   ├── specs/
│   │   └── conventions/                # Sub-specs referenciadas por AGENTS.md §6
│   │       ├── README.md
│   │       ├── idioma.md
│   │       ├── tamanho-e-revisao.md
│   │       ├── tdd.md
│   │       ├── evolucao-agents.md
│   │       ├── git-workflow.md
│   │       └── estrutura-e-versionamento.md
│   └── WORKFLOWS.md                    # Fluxos pré-configurados (11 workflows)
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

Reproduz o que o CI roda, sem precisar push:

```bash
pnpm ci:preflight                         # ~10s — drift (cross-refs, tsconfig, docker, lint)
pnpm turbo run lint typecheck             # ~1min — qualidade estática
pnpm turbo run test:unit --filter=@projeto/api   # ~1min
pnpm turbo run test:unit --filter=@projeto/web   # ~30s

# Docker build sanity (sem daemon local: falha cedo se Dockerfile quebrado)
docker build -f apps/api/Dockerfile --target dev -t projeto-api:dev .
docker build -f apps/web/Dockerfile --target dev -t projeto-web:dev .
```

Para o smoke completo da stack Docker (requer daemon):

```bash
docker compose up -d postgres api web
sleep 30
pnpm --filter @projeto/api test:integration
pnpm --filter @projeto/api test:e2e
docker compose down
```

### Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `prisma migrate deploy` falha em container | Migrations já aplicadas parcialmente | `docker compose down -v` para resetar volume + re-up |
| `pnpm dev` falha com `Cannot find module '@projeto/...'` | Workspace não linkado | `pnpm install --frozen-lockfile` |
| `docker compose` diz "port already in use" | Postgres local na 5432 | `lsof -i :5432` → parar processo OU mudar porta no compose |
| `curl /api/v1/health` retorna 503 (degraded) | Postgres não subiu ou credenciais erradas | `docker compose logs postgres` |

## Como usar

### Opção 1: Copiar para novo monorepo

```bash
cp -r projeto-base/ meu-novo-monorepo/
cd meu-novo-monorepo/
# Customize à vontade — o padrão de interoperabilidade permanece
```

### Opção 2: Usar como submodule

```bash
git submodule add https://github.com/seu-org/projeto-base.git .agents-base
# Sincronize updates do padrão sem perder customizações locais
```

### Opção 3: Fork + personalizar

Faça fork deste repositório e customize para sua organização. Mantenha a `§1` do `AGENTS.md` intacta para preservar a interoperabilidade.

## Regra Mandatória

> **SEMPRE use o padrão genérico de agents de IA onde TODOS os agents podem interoperar entre si** via a skill `agents:coordinate`.

Detalhes completos em [`AGENTS.md`](./AGENTS.md) (seção §1).

## Agents Inclusos

### Genéricos (10)

| Agent              | Uso                                                |
| ------------------ | -------------------------------------------------- |
| `agent-architect`  | Cria/evolui agents (meta-agent)                    |
| `orchestrator`     | Despacha tarefas multi-step                        |
| `explorer`         | Mapeia código (read-only)                          |
| `code-reviewer`    | Revisão de código                                  |
| `security-auditor` | Auditoria OWASP                                    |
| `refactorer`       | Refatoração incremental                            |
| `test-writer`      | Criação de testes (TDD)                            |
| `tdd-enforcer`     | Valida ciclo Red→Green→Refactor (bloqueia merge)   |
| `doc-writer`       | Documentação                                       |
| `task-manager`     | Gestão de tarefas                                  |

### Specialists de Stack (3) — novos em v1.1.0

| Agent                  | Uso                                                          |
| ---------------------- | ------------------------------------------------------------ |
| `monorepo-specialist`  | Estrutura de workspaces, pipelines turbo, versionamento     |
| `nestjs-specialist`    | Arquitetura backend NestJS (módulos, DI, validação, Swagger) |
| `nextjs-specialist`    | Arquitetura frontend Next.js (RSC, App Router, Server Actions)|

Cada agent possui arquivo de **memória** em `.agents/memory/<nome>.md` que armazena decisões, padrões e sugestões de evolução — garantindo que os agents evoluam junto com a aplicação.

## Workflows Pré-Configurados

### Genéricos (8)

- `feature-mode` — implementar nova feature
- `bugfix-mode` — corrigir bug
- `refactor-mode` — refatorar
- `security-mode` — auditoria de segurança
- `docs-mode` — documentar
- `task-mode` — gerenciar tarefas
- `explore-mode` — explorar código
- `review-mode` — revisar PR/diff

### Por Stack (3) — novos em v1.1.0

- `backend-feature` — implementar endpoint NestJS
- `frontend-feature` — criar página/rota Next.js
- `monorepo-change` — adicionar/mover pacote ou app

Detalhes em [`.agents/WORKFLOWS.md`](./.agents/WORKFLOWS.md).

## Stack Configurada (configurar, não criar ainda)

Conforme convenção [`docs/STACK.md`](./docs/STACK.md):

- **Monorepo:** pnpm workspaces + Turborepo + Changesets
- **Backend (apps/api):** NestJS 11 + Fastify + Prisma 6 + PostgreSQL + Redis
- **Frontend (apps/web):** Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui

> **⚠️ IMPORTANTE:** A stack está **configurada** (agents specialists prontos, convenções documentadas) mas os apps `apps/api` e `apps/web` ainda **não foram criados**. Crie-os somente quando for implementar a primeira feature.

Veja [`docs/MONOREPO.md`](./docs/MONOREPO.md) para convenções detalhadas.

## Compatibilidade por Ferramenta

| Ferramenta         | Suporte     | Como integrar                                    |
| ------------------ | ----------- | ------------------------------------------------ |
| Claude Code        | ✅ Nativo   | `AGENTS.md` carregado automaticamente            |
| Cursor             | ✅          | `AGENTS.md` + `.cursorrules` opcional            |
| Windsurf           | ✅          | `AGENTS.md` + `.windsurf/memories/`              |
| Aider              | ✅          | `--read AGENTS.md`                               |
| Continue           | ✅          | Custom slash commands                            |
| GitHub Copilot     | ✅          | `AGENTS.md` + `.github/copilot-instructions.md`  |
| Cline / Roo Code   | ✅          | `.clinerules`                                    |
| Cody               | ✅          | `.vscode/cody.json` recipes                      |

Detalhes completos em [`docs/TEMPLATE_USAGE.md`](./docs/TEMPLATE_USAGE.md).

## Versão

**1.6.0** — Seção "Como executar localmente" (Docker + pnpm nativo + verificação rápida) + healthchecks no compose.

## Licença

MIT
