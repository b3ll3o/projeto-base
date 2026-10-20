# STACK.md — Stack do Monorepo Base

> Documento canônico da stack escolhida para este monorepo base. Descreve **tecnologias, versões e justificativas**.
> Os apps `apps/api` e `apps/web` **já estão implementados** sobre esta stack
> (ver [`./MONOREPO.md`](./MONOREPO.md) para a convenção do monorepo e a seção
> [Containerização](#containerização) para os Dockerfiles).

---

## §1. Visão Geral

```text
projeto-base (monorepo)
├── apps/
│   ├── api/      # NestJS 11 + Fastify + Prisma 6 + PostgreSQL 16
│   └── web/      # Next.js 15 + React 19 + Tailwind 4
├── packages/
│   ├── shared-types/        # Tipos compartilhados front↔back
│   ├── tsconfig/            # tsconfig.base.json canônico
│   └── eslint-config/       # Configuração ESLint compartilhada
├── tooling/
│   └── scripts/             # Scripts utilitários do monorepo
├── infra/                   # Docker Compose, migrations, seeds
└── docs/                    # Esta documentação
```

> ⚠️ **Esta seção é auditada contra o disco, não contra a intenção.** Toda
> linha das tabelas abaixo foi verificada com `grep` nos `package.json` e
> `ls` nos diretórios em 2026-10-13, porque ela já afirmava seis tecnologias
> que o repositório nunca teve (`class-validator`, BullMQ, Redis, Jest,
> shadcn/ui, NextAuth.js) e um `packages/ui/` que não existe. Um documento de
> stack que descreve o projeto errado é pior que nenhum: quem adota o
> template copia a lista, e a lista mente.

## §2. Backend — NestJS (`apps/api`)

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Runtime | Node.js | ≥ 22.6.0 | Medido em `package.json` → `engines.node`; casa com a imagem base `node:22-bookworm-slim` |
| Framework | NestJS | 11.x | Estrutura modular, DI nativo, OpenAPI integrado |
| HTTP Adapter | Fastify | (último) | 2-3× mais rápido que Express; menor footprint |
| ORM | Prisma | 6.x | Type-safe, migrations versionadas, excelente DX |
| Banco de Dados | PostgreSQL | 16 | Maduro, JSONB, extensions, performance |
| Validação | **Zod** + `ZodValidationPipe` | ^3.25 | Schema único, executável no cliente E no servidor. `class-validator` NÃO está instalado — o pipe é `@Body(new ZodValidationPipe(Schema))`, não o `ValidationPipe` global |
| Documentação API | @nestjs/swagger | latest | OpenAPI 3.0 automático a partir dos decorators |
| Auth | @nestjs/jwt + `JwtAuthGuard` próprio | latest | Sem passport: o guard valida assinatura/expiração e um `@Public()` o libera. Detalhe em [`docs/api/auth.md`](./api/auth.md) |
| Hash de senha | argon2 (argon2id) | latest | Recomendação OWASP; resiste a GPU e a ASIC. Alternativa ao bcrypt, que trunca a senha em 72 bytes — ver [ADR-0002](./adr/0002-autenticacao-jwt-argon2.md) |
| Logging | Pino | latest | Estruturado JSON, rápido |
| Observabilidade | OpenTelemetry + Grafana + Tempo + Prometheus | latest / 11.2.0 / 2.5.0 / v2.54.1 | Vendor-neutral na produção; backends locais no perfil `observability` do Compose. Grafana é a tela (http://localhost:3300), Tempo guarda traces e o Prometheus faz *scrape* das métricas. Sem Loki — o Pino escreve em stdout e quem indexa é o driver de container. Detalhe em [ADR-0003](./adr/0003-backends-locais-de-telemetria.md) |
| Testes | **Vitest** + Testcontainers | ^2.1.9 | Unit + e2e com Postgres real. **Não há Jest** no repositório, e o harness e2e usa `app.inject` do Fastify, não `supertest` — a `devDep` `supertest` não é importada em lugar nenhum |
| Fila / Cache | — | — | Não existem. Nenhum serviço de fila ou cache foi adotado; a versão anterior desta tabela listava BullMQ + Redis (ioredis) e nenhuma das duas libs estava em nenhum `package.json` |

## §3. Frontend — Next.js (`apps/web`)

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Framework | Next.js | 15.x | App Router estável, RSC, Server Actions |
| React | React | 19.x | Concurrent features, use() hook, ações |
| Linguagem | TypeScript | 5.x estrito | Type safety end-to-end |
| Styling | Tailwind CSS | 4.x | Utility-first, zero runtime, tree-shakeable |
| Componentes | **escritos à mão com Tailwind** | — | Não há biblioteca de componentes. As classes são inline e repetidas por design (`cadastro-usuario-form.tsx` e `login-form.tsx` compartilham as mesmas classes de campo). shadcn/ui NÃO está instalado — nem como dependência, nem como código copiado |
| State (URL) | Next router | nativo | Filtros, paginação, tabs na URL |
| Forms | react-hook-form + zod | latest | Client Component + validação tipada |
| Server Actions | nativo | — | Mutações sem JS extra |
| Auth client | **`apps/web/lib/sessao.ts`** (casa própria) | — | grava/ler cookies httpOnly `access_token` + `refresh_token` e monta o `Authorization: Bearer`. NextAuth.js / Auth.js NÃO estão instalados. O browser nunca fala com a API: todo o tráfego passa por Server Action |
| Testes unit | Vitest + Testing Library | ^2.1.0 | `@testing-library/react` + `user-event` + `jest-dom`, em jsdom |
| Testes E2E | Playwright | latest | `apps/web/e2e/*.spec.ts` (8 specs), `testDir` separado do Vitest |
| Ícones | — | — | Nenhuma biblioteca de ícones instalada; a UI atual não usa ícones |
| Qualidade | — | — | **Lighthouse não está ligado**: sem dependência, sem `.lighthouserc*`, sem job. LCP/INP/CLS são *coletados* (`web-vitals` → OTel Metrics), mas não há orçamento que reprove. A menção a "Lighthouse ≥ 90" que sobrou é prosa de workflow, não gate |

## §4. Monorepo

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Gerenciador de pacotes | pnpm | 9.x | Workspaces nativos, eficiente em disco, hoisting seguro |
| Orquestrador de build | Turborepo | 2.x | Pipelines declarativos, cache distribuído |
| Versionamento | — | — | **Changesets não está instalado** e não existe `.changeset/`. O versionamento real é o tag automático `vX.Y.Z` do workflow `release-template.yml`. A tabela anterior listava Changesets 2.x, e o `docs/MONOREPO.md` §6 mandava rodar `pnpm changeset` / `pnpm version` — scripts que não existem em nenhum `package.json`. O §6 foi corrigido junto; a tabela aqui é o registro do que a anterior afirmava |
| Lint | ESLint | 9.x (flat config) | Padrão da indústria, plugins vastos |
| Formatação | Prettier | 3.x | Consistência automática |
| Lint Markdown | — | — | Existe `.markdownlint.json`, mas **nada executa markdownlint**: sem dependência, sem script, sem hook, sem workflow. O arquivo é configuração órfã |

## §5. Ferramentas de Desenvolvimento

| Categoria | Ferramenta | Uso |
|-----------|-----------|-----|
| Editor | VS Code | Suporte nativo a TS, ESLint, Prisma |
| Container | Docker + Compose | Postgres + api + web + `otel-collector` + `tempo` + `prometheus` + `grafana` (os 4 últimos, perfil `observability`). **Sem Redis** — nenhum serviço de cache/fila existe |
| Git hooks | Husky + lint-staged | TDD enforcer, lint, format |
| CI | GitHub Actions (`.github/workflows/`) | `ci.yml` + `review-stack.yml` + `sync-docs.yml` + `release-template.yml` |
| Secrets | (a definir por projeto) | Doppler / Vault / 1Password |

**Fluxo canônico (do primeiro comando ao merge):** como cada ferramenta acima dispara gates (pre-commit, pre-push, CI, release) e o que cada um bloqueia de fato está em [`docs/fluxo-desenvolvimento.md`](./fluxo-desenvolvimento.md).

## Containerização

- **Base image:** `node:22-bookworm-slim` (Prisma 6 exige glibc; major casa com `engines.node`)
- **Multi-stage:** `base` → `dev` → `prod` em ambos apps
- **Compose:** `docker-compose.yml` (prod) + `docker-compose.dev.yml` (override dev)
- **Healthchecks:** `curl /api/v1/health` (api) + node http.get (web)
- **Migrations:** entrypoint com `prisma migrate deploy`
- **Build cache:** BuildKit `--mount=type=cache,target=/root/.local/share/pnpm/store`
- **Runtime:** non-root user (`USER node`)

## §6. Quando Adicionar Nova Tecnologia

Adicionar nova lib/framework ao monorepo DEVE:

1. Passar por avaliação via `nestjs-specialist`, `nextjs-specialist` ou `monorepo-specialist`
2. Ser declarada em `package.json` do app/package correto
3. Ter justificativa registrada na memória do specialist
4. Passar por `code-reviewer` + `tdd-enforcer`

**Proibido:**

- ❌ Adicionar dependência sem avaliar alternativas
- ❌ Misturar 2 ORMs no mesmo app
- ❌ Adicionar biblioteca que duplica funcionalidade já presente
- ❌ Dependência sem tipo (`@types/*`) ou com `@ts-ignore`

## §7. Quando Substituir Stack

Substituir uma tecnologia (ex.: trocar Prisma por Drizzle) é decisão arquitetural e DEVE:

1. Ser proposta via ADR em `docs/adr/NNNN-titulo.md`
2. Justificar benefício técnico vs. custo de migração
3. Ter plano de migração incremental (apps em paralelo, gradual)
4. Ser aprovada por revisão (mínimo 1 aprovação)

## §8. Paradigma Arquitetural — DDD + Hexagonal (obrigatório)

> **Regra canônica** (a partir de `v1.2.0`): apps backend adotam **DDD + Hexagonal (Ports & Adapters)** como paradigma arquitetural. Decisão justificada no [ADR-0001 — DDD + Hexagonal + Auditoria](./adr/0001-arquitetura-ddd-hexagonal-auditoria.md).

A escolha de paradigma é tão vinculante quanto a escolha de stack: define a organização de cada módulo de feature em `domain/application/infrastructure`, com a regra de dependência invertida (camadas externas podem importar das internas; o inverso é proibido). Detalhes completos em [`MONOREPO.md` §11](./MONOREPO.md) e [`.agents/specs/conventions/estrutura-e-versionamento.md`](../.agents/specs/conventions/estrutura-e-versionamento.md).

### Guardião mecânico

O único guardião automatizado no template raiz é o agent [`stack-code-reviewer`](../.agents/agents/stack-code-reviewer.md) (D11 — pre-commit + CI), que aplica a lens DDD/Hexagonal em toda alteração de código (`*.ts`, `*.tsx`, `*.prisma`). Cobertura: pureza de `domain/`, direção de dependência entre camadas, existência de ports + mappers Prisma → domínio.

### Habilitadores

- Skill [`.agents/skills/ddd-hexagonal-validation/SKILL.md`](../.agents/skills/ddd-hexagonal-validation/SKILL.md) — checklist manual/semi-auto para auditoria de módulo.

---

**Mantido por:** projeto-base contributors
**Versão da stack:** 1.11.0

### Histórico de Versões

| Versão | Mudanças |
|--------|----------|
| `1.0.0` | Lançamento inicial da stack |
| `1.1.0` | Adicionados 3 specialists de stack |
| `1.2.0` | §8 — DDD/Hexagonal como paradigma arquitetural obrigatório (ADR-0001) |
| `1.3.0` | Habilitador `ddd-hexagonal-validation` (skill de auditoria) + guardiões `stack-code-reviewer` + `doc-sync` em pre-commit/CI (proven em BC `users`) |
| `1.4.0` | Habilitador `ci-defense-in-depth` (skill + convenção de defesa em 3 camadas) + workflows `ci-defense-mode` e `release-mode` automatizando auditoria de pipeline e bumps de versão |
| `1.5.0` | Seção "Containerização" — Dockerfiles multi-stage (api+web), docker-compose (prod) + override dev (hot reload), healthchecks (`/api/v1/health` + `node http.get`), entrypoint com `prisma migrate deploy`, BuildKit cache, runtime non-root (`USER node`) |
| `1.5.1` | Backfill: matrix `review-router` v1.2 (2 P1 gaps — `blocking:true` propagado em `path_globs`, regex security narrow call-site anchored). Sem mudança de stack. |
| `1.6.0` | Backfill: matrix `review-router` v1.3 (3 P2 gaps — `domains[]` enrich, lint WARNING blocking, coverage em apêndice). Sem mudança de stack. |
| `1.7.0` | Adição de **OpenTelemetry** ao stack backend (SDK Node + auto-instrumentations: NestJS/Fastify/Pino/Prisma/HTTP; exporter OTLP HTTP via OTel Collector perfil Compose `[observability]`); §Observabilidade agora instrumentável de fato (não apenas declarada). Frontend: `instrumentation.ts` + `@opentelemetry/sdk-web` + `web-vitals` (LCP/CLS/INP reporters → OTel Metrics). Estado correlacionado: `request.id` → `traceparent` W3C + `AuditContext.correlationId`. |
| `1.9.0` | `apps/api` e `apps/web` documentados como **implementados** — o cabeçalho afirmava o contrário e o próprio arquivo se contradizia (a §Containerização e o Histórico já descreviam os Dockerfiles de api+web). `+ Redis` removido da lista do README: `grep -l 'redis\|bullmq' apps/*/package.json` não acha nenhum dos dois. |
| `1.9.1` | §5 — CI reespecificado de "a definir por projeto" para GitHub Actions (com 4 workflows nomeados). Cross-ref para [`docs/fluxo-desenvolvimento.md`](./fluxo-desenvolvimento.md) (fluxo end-to-end re-medido a cada merge). |
| `1.10.0` | Auditoria da tabela contra o disco (`grep` nos `package.json`, `ls` nos diretórios, 2026-10-13). Removidas 8 tecnologias que o repositório nunca teve e 3 que existem mas não são o que a tabela dizia: `class-validator`/`class-transformer` → Zod + `ZodValidationPipe`; BullMQ + Redis (fila/cache) → ausentes; Jest → Vitest; shadcn/ui → componentes escritos à mão com Tailwind; `packages/ui/` (diretório inexistente) removido da árvore; NextAuth.js → `lib/sessao.ts`; lucide-react → ausente; Lighthouse ≥ 90 → não ligado (sem dep, sem config, sem job); Node 20 → `engines.node` ≥ 22.6.0; Changesets → ausente (o versionamento é o tag automático do `release-template.yml`); markdownlint → config órfã; `supertest` declarado e nunca importado (o harness e2e usa `app.inject`). |
| `1.11.0` | **Sem mudança de stack** — 5 skills de UI (`ui-modes`, `ui-craft`, `ui-break`, `motion`, `ui-review`), e nenhuma delas carrega dependência ou código: medido, cada diretório tem **um** arquivo (`SKILL.md`) e `find … -type f ! -name '*.md'` volta vazio nas 5. MEDIDO: a tag `v1.11.0` aponta para `e8ed335` ("5 skills de UI…", #78) — é este release, e só ele. As linhas de Auth/hash/sessão da tabela acima são da auditoria de `1.10.0` e já descrevem argon2id + cookies httpOnly. |
| *(sem tag)* | Hardening de #80, **ainda não released** — pin de `@sha256` em imagens Docker (`postgres:16-alpine`, `otel/opentelemetry-collector-contrib:0.103.0`); `mem_limit` nos 4 services; `memory_limiter` no OTel Collector; rate-limit global (`@nestjs/throttler`, 100 req/min) + CORS whitelist via `ALLOWED_ORIGINS`; `AbortController` timeout (10s) no `api-client`; migration `20260922003354` com `DEFAULT gen_random_uuid()` em `users_history.id` e `users_archive.id`.<br>⚠️ A linha entra como "(sem tag)" e não como `1.11.0` porque MEDIDO: `git log --oneline v1.11.0..origin/main` devolve `ae5015a` e `0943662` — o hardening está **depois** da tag, e a `v1.11.0` já existe apontando para as skills de UI. Rotular o hardening de `1.11.0` faria a linha afirmar que um commit já tagado contém o que ele não contém; será a `1.12.0` (ou o que o `release-template.yml` extrair de `docs/MONOREPO.md`) quando houver tag. |
