# projeto-base

> **Monorepo base** para projetos que usam agents de IA interoperáveis.
> Vendor-neutral — funciona com Claude Code, Cursor, Windsurf, Aider, Continue, Cline e outras ferramentas.
> Stack implementada: **NestJS (backend) + Next.js (frontend) + OpenTelemetry** + **pnpm workspaces + Turborepo**.

---

## O que é

Um **monorepo base reutilizável** que implementa o **padrão genérico de agents de IA** onde todos os agents podem interoperar entre si via coordenação explícita. Use como ponto de partida para qualquer projeto full-stack que queira organizar trabalho multi-agent de forma consistente, com convenções de monorepo, DDD/Hexagonal e CI defense-in-depth bem definidas.

**Diferencial:** enquanto o template anterior era genérico para qualquer projeto, este é um **monorepo base opinativo** com:

- Apps `apps/api` (NestJS) + `apps/web` (Next.js) **já implementados** — **6 módulos** em `apps/api/src/modules/` (`auth`, `feature-flags`, `health`, `profiles`, `tenancy`, `users`), em camadas `domain/`, `application/`, `infrastructure/`. O app é **multi-tenant por empresa** (RLS no Postgres), com **RBAC por perfil**, **feature flags** e **administração de sistema** (usuários, empresas, perfis).
- **28 agents** (12 genéricos + 2 routers + 7 specialists de stack + 6 de auditoria + 1 de documentação) + 3 arquivos companheiros em `telemetry-specialist/`, interoperáveis via skill `agents:coordinate`; **24 skills + 15 workflows + 23 convenções canônicas**
- **Paradigma DDD + Hexagonal** canônico (ADR-0001) com guardiões automáticos
- **OpenTelemetry cross-stack** (backend + frontend + Collector)
- **CI Defense-in-Depth** em 3 camadas

> Contagens medidas do disco em **2026-10-29** — o comando de cada uma está no rodapé.

## Estrutura

```text
projeto-base/
├── AGENTS.md              # Spec canônica do padrão (LEIA PRIMEIRO, ≤ 300 linhas)
├── README.md              # Este arquivo
├── .agents/
│   ├── agents/            # 28 agents (12 genéricos + 2 routers + 7 de stack + 6 de auditoria + 1 de documentação)
│   │                      # catálogo nominal, com papel e memória: AGENTS.md §3
│   ├── memory/            # 30 memórias (28 agents + state-aware-planning + _template)
│   ├── skills/            # 24 skills — coordenação, routing, auditoria, UI (agent↔skill: AGENTS.md §3.2)
│   ├── specs/conventions/ # 23 convenções (ver AGENTS.md §6)
│   ├── workflows/         # 15 workflows detalhados
│   └── WORKFLOWS.md       # Fluxos pré-configurados, em tabela
├── apps/                  # api (NestJS 11) + web (Next.js 15)
├── packages/              # eslint-config, shared-types, tsconfig
├── tooling/scripts/       # stack-code-reviewer, doc-sync, routers
├── turbo.json             # pipeline cacheado (turbo)
├── pnpm-workspace.yaml
└── docs/
    ├── como-rodar.md      # mapa de execução por ambiente (6 ambientes) — canônico do "como rodar"
    ├── fluxo-desenvolvimento.md  # os gates: camada, comando, o que de fato bloqueia
    ├── api/               # referência HTTP por bounded context
    ├── adr/               # decisões arquiteturais (ADR-0001…)
    ├── flows/             # fluxos (IR → diagrama)
    ├── agents/            # issue tracker, labels de triagem, glossário
    ├── articles/          # artigos de fundo
    ├── superpowers/       # planos e specs de trabalho
    ├── web/               # catálogo de rotas Next.js (em criação — PR paralelo)
    ├── runbooks/          # runbooks por incidente (em criação — PR paralelo)
    ├── TEMPLATE_USAGE.md  # Guia principal (≤ 300 linhas)
    ├── MONOREPO.md        # convenções de monorepo
    ├── STACK.md           # stack escolhida e justificativas
    └── integrations/      # Integração por ferramenta: claude-code, cursor, windsurf,
                           # aider, continue, copilot, cline, cody
```

## Como executar localmente

> **Mapa completo por ambiente** (dev, Docker, observabilidade, e2e, CI): [`docs/como-rodar.md`](./docs/como-rodar.md) — **6 ambientes** indexados no §0 (`grep -cE '^\| [0-9]+ \| ' docs/como-rodar.md`). O **Ambiente 1** (dev local, pnpm nativo) está no runbook principal; os outros 5 são runbooks irmãos em `docs/runbooks/`.
>
> **Dois modos** neste README: **Docker Compose** (reproduz o ambiente de produção) e **pnpm nativo** (itera rápido, com o Postgres em Docker).

### Pré-requisitos

- **Node.js** ≥ 22.6.0 (`package.json` → `engines.node`)
- **pnpm** ≥ 9.12.0 (`packageManager` → `corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- **Docker** + **Docker Compose** v2 (apenas para o modo Docker)
- **PostgreSQL 16** rodando em `localhost:5432`. ⚠️ Desde o #91 o `postgres` do compose
  **não publica porta no host** (`expose` sem `ports`) — veja [`docs/como-rodar.md` §1.1](./docs/como-rodar.md)

### Opção A — Docker Compose (recomendado)

Reproduz fielmente o ambiente de produção com healthchecks, network interna e migrations automáticas.

A API assina JWT e **recusa o boot sem `JWT_SECRET`** — sem valor, sem default, sem exceção.
Gere um antes de subir o serviço `api`:

```bash
export JWT_SECRET=$(openssl rand -base64 48)
```

O Postgres não depende dele (`docker compose up -d postgres` funciona sem), porque o Compose
interpola o arquivo inteiro antes de qualquer comando: exigir a variável no compose quebraria
também `config`, `ps` e `down`.

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

Mais rápido para iterar. Postgres ainda roda em Docker (alternativa: Postgres local via brew/apt).

```bash
# 1. Instalar deps
pnpm install --frozen-lockfile

# 2. Subir Postgres COM PORTA PUBLICADA NO HOST.
# ⚠️ O `postgres` do compose usa só `expose` desde o #91 — a API na máquina não o alcança.
docker run -d --name projeto-base-pg-local -p 5432:5432 -e POSTGRES_USER=projeto -e POSTGRES_PASSWORD=projeto -e POSTGRES_DB=projeto_base postgres:16-alpine
# ou aponte para um Postgres existente. São TRÊS URIs (apps/api/.env.example):
#   DATABASE_URL        → papel app_runtime  (escopo de empresa; é o que faz as RLS valerem)
#   SYSTEM_DATABASE_URL → papel app_system   (bucket de sistema, cross-empresa)
#   DIRECT_DATABASE_URL → papel dono          (migrate/seed; precisa de CREATEROLE)

# 3. Gerar Prisma Client (uma vez, e após cada mudança em schema.prisma)
pnpm turbo run db:generate

# 4. Configurar o segredo JWT — ANTES de subir a API: ela recusa o boot
# sem o segredo em QUALQUER NODE_ENV, não só em produção
cp apps/api/.env.example apps/api/.env
openssl rand -base64 48    # preencha o valor na linha JWT_SECRET= de apps/api/.env

# 4.1. Senhas dos PAPÉIS do banco (#118) — o .env.example traz PLACEHOLDER, e a
# API recusa o boot com placeholder (a senha que a migration publicava,
# `app_runtime_dev`, está no histórico do Git — quem leu o repositório, conhece).
# São DOIS papéis, com DUAS senhas: app_runtime (DATABASE_URL, o escopo de
# empresa) e app_system (SYSTEM_DATABASE_URL, o bucket de sistema).
# ⚠️ `-hex 32`, e NÃO `-base64 48`: o base64 traz `/`, e o `/` ENCERRA a parte
# de credencial da URI → "Invalid URL". Detalhe em docs/como-rodar.md §1.2.1.
openssl rand -hex 32    # -> senha do papel de RUNTIME, em DATABASE_URL
openssl rand -hex 32    # -> senha do papel de SISTEMA, em SYSTEM_DATABASE_URL

# 5. Rodar migrations — o binário do Prisma direto, de dentro de apps/api, para que ele leia
# o apps/api/.env. Não existe script `prisma:migrate:deploy` em nenhum package.json: o pnpm
# responde "None of the selected packages has a ... script" e SAI 0 — verde para quem só olha
# o exit code
cd apps/api && pnpm exec prisma migrate deploy && cd ../..

# 5.1. Aplicar a senha de cada papel (a migration cria os papéis SEM senha)
cd apps/api && sh scripts/prepara-papeis.sh && cd ../..

# 6. Subir apps em watch mode
pnpm dev    # turbo run dev em paralelo — api em :3000, web em :3001
```

⚠️ **`JWT_SECRET` não tem valor default, por decisão de projeto** (ver
[ADR-0002](docs/adr/0002-autenticacao-jwt-argon2.md)): um segredo padrão no repositório faria
todos que instalaram o projeto compartilharem a chave de assinatura.

Endpoints:

- **API:** <http://localhost:3000>
- **API Docs (Swagger):** <http://localhost:3000/api/docs> — só em `development` (#122); fora dele é desabilitado (`SWAGGER_ENABLED=true` liga de propósito)
- **Web:** <http://localhost:3001>

### Verificação rápida (CI-equivalente local)

```bash
# Atalho consolidado antes de push — ~1min
pnpm ci:local    # ci:preflight → db:generate → lint/typecheck/test:unit/
                # test:coverage/test:integration/test:e2e (api, web, shared-types)
                # → tooling:test → ci:boot

# Granular (debug de gate específico)
pnpm ci:preflight                          # ~10s — drift
pnpm turbo run lint typecheck              # ~1min
pnpm turbo run test:coverage --filter=@projeto/api --filter=@projeto/web  # gate 80%
pnpm stack:review --files="$(git diff --name-only main | tr '\n' ',' | sed 's/,$//')"
pnpm docs:sync --files="$(git diff --name-only main | tr '\n' ',' | sed 's/,$//')" --mode=check
```

> O `pnpm ci:local` real está no `package.json` da raiz (`scripts.ci:local`) — a linha acima é o resumo, não a fonte.

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

**28 agents** no catálogo — o catálogo nominal (agent, papel e memória de cada um) é o [`AGENTS.md` §3 e §3.2](./AGENTS.md); o README só aponta, não duplica.

- **Genéricos (12):** `agent-architect`, `orchestrator`, `explorer`, `code-reviewer`, `stack-code-reviewer`, `security-auditor`, `doc-sync`, `refactorer`, `test-writer`, `tdd-enforcer`, `doc-writer`, `task-manager`
- **Routers (2):** `review-router` (dispensa reviewers em paralelo após task DONE), `specialist-router` (pré-planejamento; bloqueia se `gap_detected`)
- **Specialists de stack (7):** `monorepo-specialist`, `nestjs-specialist`, `nextjs-specialist`, `docker-specialist`, `telemetry-specialist`, `ux-design-specialist`, `multi-tenant-specialist`
- **Specialists de auditoria (6):** `prisma-db-specialist`, `openapi-contract-specialist`, `otelcol-infra-specialist`, `docker-prod-specialist`, `release-versioning-specialist`, `finding-orchestrator`
- **Documentação (1):** `documentation-specialist` — dono da doc da aplicação (matriz de cobertura, drift, frescor); carrega a skill `documentation-audit`

Cada agent possui arquivo de **memória** em `.agents/memory/<nome>.md` que armazena decisões, padrões e sugestões de evolução — garantindo que os agents evoluam junto com a aplicação.

## Workflows Pré-Configurados

O índice completo — trigger, tipo e cadeia de agents de cada workflow — é o
[`.agents/WORKFLOWS.md`](./.agents/WORKFLOWS.md). **15** deles têm o detalhe passo a passo
(`ls .agents/workflows/*.md | wc -l`), em [`.agents/workflows/`](./.agents/workflows/).
Todo workflow é disparado pela skill `agents:coordinate` (§Regra Mandatória).

## Stack e Apps Implementados

Conforme convenção [`docs/STACK.md`](./docs/STACK.md):

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend (`apps/api`):** NestJS 11 + Fastify + Prisma 6 + PostgreSQL 16
- **Frontend (`apps/web`):** Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- **Observabilidade:** OpenTelemetry SDK + OTel Collector (perfil Compose `observability`)

Os apps `apps/api` e `apps/web` **já estão implementados** — **6 módulos** em
`apps/api/src/modules/` (`auth`, `feature-flags`, `health`, `profiles`, `tenancy`, `users`),
em camadas `domain/`, `application/` e `infrastructure/`, conforme o
[ADR-0001](./docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md). O domínio é multi-tenant
(empresa), com RBAC por perfil, feature flags e administração de sistema. Para subir localmente,
ver a seção "Como executar localmente" acima.

Veja [`docs/MONOREPO.md`](./docs/MONOREPO.md) para convenções detalhadas.

## Compatibilidade por Ferramenta

O `AGENTS.md` da raiz é o ponto de entrada de **todas** as ferramentas. Os arquivos auxiliares de cada uma **não existem neste repo** — a coluna abaixo diz qual criar, e a receita está em [`docs/integrations/`](./docs/integrations/).

| Ferramenta | Suporte | Arquivo auxiliar (opcional, **não existe no repo**) |
|---|---|---|
| Claude Code | ✅ Nativo | `AGENTS.md` carregado automaticamente |
| Cursor | ✅ | `.cursorrules` (legado) — [receita](./docs/integrations/cursor.md) |
| Windsurf | ✅ | `.windsurf/memories/` — [receita](./docs/integrations/windsurf.md) |
| Aider | ✅ | `--read AGENTS.md` |
| Continue | ✅ | Custom slash commands |
| GitHub Copilot | ✅ | `.github/copilot-instructions.md` — [receita](./docs/integrations/copilot.md) |
| Cline / Roo Code | ✅ | `.clinerules` (legado) — [receita](./docs/integrations/cline.md) |
| Cody | ✅ | `.vscode/cody.json` (recipes) — [receita](./docs/integrations/cody.md) |

Detalhes em [`docs/TEMPLATE_USAGE.md`](./docs/TEMPLATE_USAGE.md).

## Versão & Licença

**Versão:** 1.14.0 — re-medido do disco em **2026-10-29**: `ls .agents/agents/*.md | wc -l` = **28** agents · `ls .agents/memory/*.md | wc -l` = **30** memórias (1 por agent + `state-aware-planning` + `_template`) · `ls .agents/skills/*/SKILL.md | wc -l` = **24** skills · `ls .agents/workflows/*.md | wc -l` = **15** workflows · `ls .agents/specs/conventions/*.md | grep -vE 'README|gaps|examples|historico|apendice' | wc -l` = **23** convenções · `ls apps/api/src/modules/ | wc -l` = **6** módulos.

A `1.14.0` adiciona o `documentation-specialist` (+1 agent, +1 memória), a skill `documentation-audit` (+1) e a convenção `documentacao` (+1) — e corrige os fatos errados da versão anterior: Node ≥ 20 → ≥ 22.6.0, `openssl rand -base64 48` → `-hex 32` nas senhas de papel, "três modos" → dois, e a lista de agents (faltavam os 6 de auditoria). A **tag do template** é a dos 4 footers canônicos (o de [`docs/MONOREPO.md`](./docs/MONOREPO.md) manda), extraída pelo `release-template.yml` — este rodapé não a define. **Licença:** MIT.
