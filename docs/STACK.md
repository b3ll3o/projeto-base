# STACK.md — Stack do Monorepo Base

> Documento canônico da stack escolhida para este monorepo base. Descreve **tecnologias, versões e justificativas**.
> Os apps `apps/api` e `apps/web` **já estão implementados** sobre esta stack
> (ver [`./MONOREPO.md`](./MONOREPO.md) para a convenção do monorepo e a seção
> [Containerização](#containerização) para os Dockerfiles).
> **O desenho da stack** — topologia, módulos, dados, segurança e operação — está em
> [`./system-design/README.md`](./system-design/README.md), e as **decisões** que a justificam estão em
> [`./adr/`](./adr/).

---

## §1. Visão Geral

```text
projeto-base (monorepo)
├── apps/
│   ├── api/      # NestJS 12 + Fastify + Prisma 6 + PostgreSQL 16
│   └── web/      # Next.js 15 + React 19 + Tailwind 4
├── packages/
│   ├── shared-types/        # Tipos compartilhados front↔back
│   ├── tsconfig/            # tsconfig.base.json canônico
│   └── eslint-config/       # Configuração ESLint compartilhada
├── tooling/
│   └── scripts/             # Scripts utilitários do monorepo
├── infra/                   # Config dos backends locais de telemetria
│                            # (grafana, otelcol, prometheus, tempo)
├── docs/                    # Esta documentação
├── docker-compose.yml       # Compose de produção — na RAIZ
└── docker-compose.dev.yml   # Override de dev — na RAIZ
```

> ⚠️ **Esta seção é auditada contra o disco, não contra a intenção.** Toda
> linha das tabelas abaixo foi verificada com `grep` nos `package.json` e
> `ls` nos diretórios em 2026-10-13, porque ela já afirmava seis tecnologias
> que o repositório nunca teve (`class-validator`, BullMQ, Redis, Jest,
> shadcn/ui, NextAuth.js) e um `packages/ui/` que não existe. A **árvore**
> foi remedida de novo em 2026-10-29: ela ainda declarava um `infra/` com
> `docker-compose.yml` e `postgres/` — nenhum dos dois existe (o Compose mora
> na **raiz**, e o `infra/` é a config dos 4 backends de telemetria). Um
> documento de stack que descreve o projeto errado é pior que nenhum: quem
> adota o template copia a lista, e a lista mente.

## §2. Backend — NestJS (`apps/api`)

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Runtime | Node.js | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | Medido em `package.json` → `engines.node`; casa com a imagem base `node:22-bookworm-slim` (que resolve 22.23.3). O range é o do `jsdom` 30.1.3 — `>=22.22.2` sozinho prometia Node 23.x e 25.x, que a árvore **não** aceita (o `.npmrc` liga `engine-strict=true`); o `@opentelemetry/*` 3.x (`>=22.15.0`) fica abaixo dele |
| Framework | NestJS | 12.x | Estrutura modular, DI nativo, OpenAPI integrado |
| HTTP Adapter | Fastify | 5.12.8 (transitiva) | 2-3× mais rápido que Express; menor footprint. O adapter é `@nestjs/platform-fastify` `^12.5.1` — o `fastify` em si não é dependência direta |
| ORM | Prisma | 6.x | Type-safe, migrations versionadas, excelente DX |
| Banco de Dados | PostgreSQL | 16 | Maduro, JSONB, extensions, performance |
| Validação | **Zod** + `ZodValidationPipe` | ^3.25.76 | Schema único, executável no cliente E no servidor. `class-validator` NÃO está instalado — o pipe é `@Body(new ZodValidationPipe(Schema))`, não o `ValidationPipe` global |
| Documentação API | @nestjs/swagger | ^12.1.2 | OpenAPI 3.0 automático a partir dos decorators |
| Auth | @nestjs/jwt + `JwtAuthGuard` próprio | ^12.0.2 | Sem passport: o guard valida assinatura/expiração e um `@Public()` o libera. O **refresh token é revogável**: o `jti` vive na tabela `refresh_tokens` (rotação, `POST /auth/logout` e detecção de replay — [ADR-0007](./adr/0007-refresh-token-revogavel.md)). Detalhe em [`docs/api/auth.md`](./api/auth.md) |
| Hash de senha | argon2 (argon2id) | ^0.45.1 | Recomendação OWASP; resiste a GPU e a ASIC. Alternativa ao bcrypt, que trunca a senha em 72 bytes — ver [ADR-0002](./adr/0002-autenticacao-jwt-argon2.md) |
| Logging | Pino | ^10.3.0 | Estruturado JSON, rápido |
| Observabilidade | OpenTelemetry + Grafana + Tempo + Prometheus | ^0.301.2 (node) · ^2.12.1 (browser) / 11.2.0 / 2.5.0 / v2.54.1 | Vendor-neutral na produção; backends locais no perfil `observability` do Compose. Grafana é a tela (http://localhost:3300), Tempo guarda traces e o Prometheus faz *scrape* das métricas. Sem Loki — o Pino escreve em stdout e quem indexa é o driver de container. No browser o SDK é o `@opentelemetry/sdk-trace-web` `^2.12.1` (a linha 2.x é a última estável do browser: o `core` 3.x que o node usa não tem equivalente estável para browser). Detalhe em [ADR-0003](./adr/0003-backends-locais-de-telemetria.md) |
| Testes | **Vitest** + Testcontainers | ^2.1.9 | Unit + e2e com Postgres real. **Não há Jest** no repositório, e o harness e2e usa `app.inject` do Fastify, não `supertest` — a `devDep` `supertest` não é importada em lugar nenhum |
| Fila / Cache | — | — | Não existem. Nenhum serviço de fila ou cache foi adotado; a versão anterior desta tabela listava BullMQ + Redis (ioredis) e nenhuma das duas libs estava em nenhum `package.json` |

> **Versões medidas em 2026-10-29**, todas com o comando que as reproduz:
> `node -p "const p=require('./apps/api/package.json'); p.dependencies['@nestjs/swagger']"`
> (idem para `@nestjs/jwt`, `argon2`, `pino`, `zod`);
> `node -p "require('./apps/api/package.json').devDependencies['vitest']"`;
> `grep -m1 -E "^  fastify@" pnpm-lock.yaml` → `5.11.3` (dependência
> transitiva de `@nestjs/platform-fastify`); `grep -nE "image: (grafana|grafana/tempo|prom/prometheus)" docker-compose.yml`
> → as 3 imagens dos backends locais.

## §3. Frontend — Next.js (`apps/web`)

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Framework | Next.js | 15.x | App Router estável, RSC, Server Actions |
| React | React | 19.x | Concurrent features, use() hook, ações |
| Linguagem | TypeScript | 5.x estrito | Type safety end-to-end |
| Styling | Tailwind CSS | 4.x | Utility-first, zero runtime, tree-shakeable. CSS-first: os tokens vivem no bloco `@theme` de `apps/web/app/globals.css` |
| Padrão de estilo | **`estilizacao.md`** (convenção) | — | Tokens semânticos + primitivas em `apps/web/components/ui/`; o instrumento é a regra ESLint `estilizacao/no-estilizacao-informal`. Ver [`.agents/specs/conventions/estilizacao.md`](../.agents/specs/conventions/estilizacao.md) |
| Componentes | **escritos à mão, sobre as primitivas** | — | Não há biblioteca de componentes: shadcn/ui NÃO está instalado — nem como dependência, nem como código copiado. As primitivas (`Container`, `CabecalhoPagina`, `CabecalhoSecao`, `Campo`, `Botao`, `Alerta`, `Tabela`, `CabecalhoTabela`, `CelulaTabela`, `EstadoVazio`, `LinkTexto`) são o que as telas usam — as 9 de `apps/web/components/ui/` exportam 11 componentes, porque `Tabela` vem com `CabecalhoTabela` e `CelulaTabela`; o `className` repetido era a dívida que elas pagaram |
| State (URL) | Next router | nativo | Filtros, paginação, tabs na URL |
| Forms | react-hook-form + zod | ^7.92.0 / ^3.25.76 | Client Component + validação tipada |
| Server Actions | nativo | — | Mutações sem JS extra |
| Auth client | **`apps/web/lib/sessao.ts`** (casa própria) | — | grava/ler cookies httpOnly `access_token` + `refresh_token` e monta o `Authorization: Bearer`. NextAuth.js / Auth.js NÃO estão instalados. O browser nunca fala com a API: todo o tráfego passa por Server Action |
| Testes unit | Vitest + Testing Library | ^2.1.9 | `@testing-library/react` + `user-event` + `jest-dom`, em jsdom |
| Testes E2E | Playwright | `^1.65.0` (resolvido em `1.65.0` pelo lock) | `apps/web/e2e/*.spec.ts` — **21 specs** (`f1`–`f21`), `testDir` separado do Vitest. O inventário canônico (rota, nome e estados cobertos de cada fluxo) está em [`.agents/specs/conventions/e2e-playwright.md`](../.agents/specs/conventions/e2e-playwright.md) §"Inventário de Fluxos" |
| Ícones | — | — | Nenhuma biblioteca de ícones instalada; a UI atual não usa ícones |
| Qualidade | — | — | **Lighthouse não está ligado**: sem dependência, sem `.lighthouserc*`, sem job. LCP/INP/CLS são *coletados* (`web-vitals` → OTel Metrics), mas não há orçamento que reprove. A menção a "Lighthouse ≥ 90" que sobrou é prosa de workflow, não gate |

> **Versões do frontend medidas em 2026-11-17**, com
> `node -p "const p=require('./apps/web/package.json'); p.dependencies['react-hook-form'] + ' ' + p.dependencies['zod'] + ' ' + p.devDependencies['@playwright/test'] + ' ' + p.devDependencies['vitest']"`
> → `^7.91.0 ^3.25.76 ^1.65.0 ^2.1.9`.
>
> **Os 21 specs de e2e** (`ls apps/web/e2e/*.spec.ts | wc -l` → `21`, e os
> nomes de cada um em `grep -h '^// FLUXO:' apps/web/e2e/*.spec.ts`) cobrem:
> F1 listagem de usuários · F2 cadastro com sucesso · F3 validação no cliente ·
> F4 email duplicado · F5 erro genérico (5xx) · F6 navegação entre telas ·
> F7 login · F8 rota protegida sem sessão · F9 listagem de perfis (admin) ·
> F10 criação de perfil (admin) · F11 detalhe de perfil e troca de permissões ·
> F12 atribuição de perfil a usuário · F13 meu perfil · F14 ativação e
> desativação de flags · F15 edição dos metadados de perfil · F16 onboarding de
> empresa · F17 inventário de empresas e usuários (tenancy) · F18 cabeçalhos
> de segurança do web · F19 sair revoga o refresh token · F20 detalhe do
> usuário e as empresas em que ele está (admin do sistema) · F21 histórico de
> auditoria de uma pessoa (admin do sistema).

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
| Git hooks | Husky + lint-staged | `pre-commit`: `lint-staged` → `stack-code-reviewer` → `doc-sync` · `commit-msg`: `commit-msg-gate` (Conventional Commits) · `pre-push`: `ci:preflight` → `ci:boot` → `pr:refresh` (advisory). **Nenhum hook roda `tdd-enforcer`** — ele existe como agent ([`tdd-enforcer`](../.agents/agents/tdd-enforcer.md)), mas `grep -rn "tdd-enforcer" .husky/ .github/workflows/` volta vazio. Detalhe linha a linha em [`docs/fluxo-desenvolvimento.md` §3.1](./fluxo-desenvolvimento.md) |
| CI | GitHub Actions (`.github/workflows/`) | `ci.yml` + `review-stack.yml` + `sync-docs.yml` + `pr-review.yml` + `release-template.yml` + `delete-merged-branch.yml` (apaga a branch do PR mergeado — regra [git-workflow.md](../.agents/specs/conventions/git-workflow.md) §"Branch Morta") |
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
**Versão da stack:** 1.40.0

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
| *(sem tag)* | Hardening de #80, **ainda não released** — pin de `@sha256` em imagens Docker (`postgres:16-alpine`, `otel/opentelemetry-collector-contrib:0.103.0`); `mem_limit` nos 4 services; `memory_limiter` no OTel Collector; rate-limit global (`@nestjs/throttler`, 100 req/min) + CORS whitelist via `ALLOWED_ORIGINS`; `AbortController` timeout (10s) no `api-client`; migration `20260922003354` com `DEFAULT gen_random_uuid()` em `users_history.id` e `users_archive.id`.<br>⚠️ A linha entra como "(sem tag)" e não como `1.11.0` porque MEDIDO: `git log --oneline v1.11.0..origin/main` **não é vazio** — o hardening está **depois** da tag, e a `v1.11.0` já existe apontando para as skills de UI (`e8ed335`). Rotular o hardening de `1.11.0` faria a linha afirmar que um commit já tagado contém o que ele não contém; será a `1.12.0` (ou o que o `release-template.yml` extrair de `docs/MONOREPO.md`) quando houver tag. |
| `1.12.0` | **Papel `app_system` no Postgres + `SYSTEM_DATABASE_URL`** — o bucket de sistema deixou de ser concedido por um valor de GUC (que a sessão escolhe) e passou a ser concedido pela **CREDENCIAL** (`current_user = 'app_system'`). São **dois** papeis e **duas** URIs no ambiente: `DATABASE_URL` (runtime, o escopo de empresa) e `SYSTEM_DATABASE_URL` (sistema, o bucket global). A senha dos dois sai do ambiente — a migration `20261027000001` cria os papeis sem senha (`NOLOGIN`) e o `prepara-papeis.sh` (no entrypoint) a aplica. Também: `apps/api/openapi.json` **versionado** no repo (com um gate que compara o versionado com o gerado), 3 gates novos de preflight (`check-shell-injection`, `check-openapi-contract`, `check-version-footers`) e o `SYSTEM_DATABASE_URL` como chave **obrigatória** em todo ambiente que não seja `development`. |
| `1.13.0` | **Sem mudança de stack** — o footer do `AGENTS.md` subiu para `1.13.0` sozinho, e os outros 4 footers seguiam em `1.12.0` (drift medido em 2026-10-29). O gate `check-version-footers` (criado no #126) é o que fecha essa classe. |
| `1.14.0` | **Correção de fatos medidos contra o código** (2026-10-29). §1 — a árvore deixou de declarar o `infra/` como "Docker Compose, migrations, seeds": o real é a config dos 4 backends de telemetria (`grafana/`, `otelcol/`, `prometheus/`, `tempo/`), e o Compose mora na **raiz**. §2 e §3 — as 7 células que diziam `latest`/`(último)` na coluna Versão passaram a trazer a versão que o `package.json` declara (`@nestjs/swagger` `^11.0.0`, `@nestjs/jwt` `^12.0.2`, `argon2` `^0.45.1`, `pino` `^10.3.0`, `@opentelemetry/sdk-node` `^0.54.0`, `react-hook-form` `^7`, `@playwright/test` `^1.60.0`, resolvido em `1.60.0` pelo `pnpm-lock.yaml`) e o Fastify, que não é dependência direta, aparece como `5.11.3` (transitiva de `@nestjs/platform-fastify`). §3 — "8 specs" de Playwright virou **17** (`f1`–`f17`), com o que cada um cobre. §5 — a linha dos Git hooks deixou de afirmar "TDD enforcer": nenhum hook o roda (`pre-commit` = `lint-staged` → `stack-code-reviewer` → `doc-sync`; `commit-msg` = `commit-msg-gate`; `pre-push` = `ci:preflight` → `ci:boot` → `pr:refresh`).  §3 — a versão do Playwright passou a `^1.60.0` (o lock continua resolvendo `1.60.0`: o pin era acidental e nada dependia dele — não há imagem do Playwright no repo nem `playwright install` com versão). ||
| `1.20.0` | **Sem mudança de stack** — as 4 skills novas são docs e roteamento (nenhuma dependência, nenhum script, nenhuma config de infra mudou); o footer subiu junto com os outros 5. O gate `check-version-footers` (do #126) é o que fecha essa classe. |
| `1.21.0` | **Sem mudança de stack** — o runbook novo (`docs/runbooks/cloudflare-edge.md`) é doc: nenhuma dependência, nenhum script, nenhuma config de infra mudou. O footer subiu junto com os outros 5. |
| `1.22.0` | **A autenticação tem registro, e o container tem probe** — o BC `auth` ganha a tabela `refresh_tokens` (o `jti` do refresh token, a rotação, o `POST /auth/logout` e a detecção de replay) e a imagem da api ganha o `exec` no ENTRYPOINT (o SIGTERM chega ao Node) e um probe que não depende de pacote instalado. Duas migrations novas, dois gates novos. O footer subiu junto com os outros 5. |
| `1.25.0` | **Sem mudança de stack** — a skill `agent-desktop` (adaptada de [vercel-labs/agent-desktop](https://github.com/vercel-labs/agent-desktop), Apache-2.0) e a unificação da pasta de tooling de IA são docs e roteamento: **nenhuma dependência nova**, nenhum binário no `package.json` (a CLI é externa, instalada na máquina), nenhuma mudança em `apps/api`, `apps/web`, `packages/` ou `infra/`. O único config movido foi o `settings.json` do Claude Code, de `.claude/` para `.agents/`. |
| `1.26.0` | **Sem mudança de stack** — o conjunto de system design canônico ([`./system-design/README.md`](./system-design/README.md), 7 documentos) é **doc**: nenhuma dependência nova, nenhum binário no `package.json`, nenhuma mudança em `apps/api`, `apps/web`, `packages/` ou `infra/`. O que mudou foi a **descoberta**: o `STACK.md` passa a apontar para o desenho, e o desenho passa a apontar para o ADR dono de cada decisão. |
| `1.27.0` | **O código passa a casar com o system design** — o conjunto `docs/system-design/` afirmava quatro coisas que o código não tinha, e elas agora existem: a rota de health tem teto **PRÓPRIO** (`@Throttle` com 600/min no controller — não `@SkipThrottle()`, que não existe no código), a escrita aceita **`Idempotency-Key`** (a tabela `idempotency_keys` + um interceptor global), o papel de runtime ganha **`statement_timeout = '8s'`**, e a correlação da auditoria é a **mesma** da resposta. **Nenhuma dependência nova**, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. |
| `1.28.0` | **Sem mudança de stack** — o PR fecha as pendências dos 6 PRs abertos e da issue #149: o `.github/dependabot.yml` passa a gerar `chore(deps):` (o prefixo `deps` NÃO é aceito pelo gate de Conventional Commits do repo, e os 5 PRs do Dependabot nasceram vermelhos por isso), 2 gates ganham regra (a major pendente que foi **adotada** reprova; a claim do total de advisories é conferida contra o `pnpm audit` medido) e a prosa do registro de exceções volta a bater com o audit (41 → 31 advisories). **Nenhuma dependência nova**, nenhum binário novo no `package.json`, nenhuma mudança em `apps/`, `packages/` ou `infra/`. |
| `1.30.0` | **Sem mudança de stack** — o kit de documentação moderna ([`kit-documentacao.md`](../.agents/specs/conventions/kit-documentacao.md)) é **doc**: nenhuma dependência nova, nenhum binário no `package.json`, nenhuma mudança em `apps/api`, `apps/web`, `packages/` ou `infra/`. O que mudou foi a **cobertura**: os 14 itens do kit passaram a ter doc canônico, specialist dono e auditor por pilar, e o gate `check-doc-kit` cobra. |
| `1.31.0` | **Sem mudança de stack** — o agent `e2e-specialist` e o workflow `e2e-coverage-mode` são docs e roteamento: **nenhuma dependência nova**, nenhum binário no `package.json`, nenhuma mudança em `apps/api`, `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é o **override** de `effect` para `3.22.1` (a versão corrigida da advisory `1248071`, CVE-2026-121707 — o `effect` era transitivo do `@prisma/config` e está na árvore de produção de `apps/api`); o `package.json` e o `pnpm-lock.yaml` mudaram, nenhum arquivo de `apps/` foi tocado. O footer subiu junto com os outros 5. |
| `1.32.0` | **A família NestJS, o `react-hook-form` e a família OpenTelemetry sobem juntas** — a tabela de versões acima muda em 4 linhas: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify` e `@nestjs/testing` para a `12.5.1` (com o `core` em uma instância só — o precedente do #166), `react-hook-form` para a `7.92.0`, e o OpenTelemetry para a geração `core` 3.x no node (`@opentelemetry/sdk-node` `0.301.2`, `@opentelemetry/resources` `3.1.1`) e para a última linha estável do browser (`@opentelemetry/sdk-trace-web` e `@opentelemetry/sdk-trace-base` `2.12.1` — não há 3.x estável para browser). Duas APIs mudaram no código: a classe `Resource` virou **interface** (`resourceFromAttributes()`) e o `provider.addSpanProcessor()` saiu do `WebTracerProvider` (o processor entra no construtor, em `spanProcessors`). O **Runtime** mudou de `≥ 22.12.0` para `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` — o range real da árvore é o do `jsdom` 30.1.3 (que já estava no repo; o `>=22.12.0` declarado mentia, e o `>=22.22.2` sozinho prometia Node 23.x/25.x, que a árvore **não** aceita com `engine-strict=true`). O footer subiu junto com os outros 5. |
| `1.33.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é o schema do Prisma de `apps/api` (as 6 colunas de tempo com fuso, os 4 ids com o DEFAULT do banco e o `updated_at` com default) e a migration `20261020000003_revoke_prisma_migrations`, que passa a ser tolerante à ausência da tabela `_prisma_migrations` — o que destrava o `prisma migrate dev` (issue #183). O footer subiu junto com os outros 5. |
| `1.34.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é o BC de Perfis de `apps/api`: o arquivo novo `apps/api/src/modules/profiles/infrastructure/http/profiles.schemas.ts` (os schemas dos corpos de admin) e a validação de Zod nas três rotas de admin de perfil — o corpo cru chegava ao agregado e um `initialPermissions` fora de lista de textos respondia 500 (issue #185). O footer subiu junto com os outros 5. |
| `1.35.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é o BC de Auth de `apps/api`: o arquivo novo `throttle-do-login.ts` (o dono da política de limite do login), o arquivo novo `login-lockout.port.ts` com o seu adapter Prisma, a migration `20261125000000_tentativas_de_login` (a tabela `login_tentativas`) e o status 423 novo no contrato HTTP — o login passa a ter DOIS tetos (o global por IP e o de login por `(IP, e-mail)`) e a conta trava por 5 falhas em 15 minutos (issue #182). O footer subiu junto com os outros 5. |
| `1.36.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é a imagem de produção da api (`apps/api/Dockerfile`): o cache do corepack assado no build (o container não baixa o pnpm do registry a cada boot), o stage novo `deps-prod` com `pnpm deploy --prod` (a imagem não embarca mais as devDependencies) e o healthcheck do postgres medindo TCP em vez do socket unix (issue #178/#179/#187). O footer subiu junto com os outros 5. |
| `1.37.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é o BC de Auth/`shared` de `apps/api` e a imagem: a chave de assinatura passa a ser lida por uma função `SECURITY DEFINER` (migration nova), o guard de boot recusa a URI de dono no ambiente do processo, e o ENTRYPOINT da imagem a remove antes do `exec node` (issue #180). O footer subiu junto com os outros 5. |
| `1.38.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é o BC de Usuários de `apps/api`: a mutação e o registro de auditoria passam a ser a mesma transação (issue #184). O footer subiu junto com os outros 5. |
| `1.39.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/`, `packages/` ou `infra/`. Este PR é **doc**: o plano das 10 issues do scan de 2026-11-23 e o snapshot que o alimenta, e o encerramento das 2 issues que o `main` já tinha corrigido (a #181 pelo override do `effect`, a #186 por obsolescência). O footer subiu junto com os outros 5. |
| `1.39.1` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/`, `packages/` ou `infra/`. Este PR é **tooling**: três gates da camada de preflight que mediam errado (o `check-path-alias` media uma semântica de `paths` que o TypeScript não tem, e o `check-doc-size` lançava `ENOENT` derrubando o preflight) saem do buraco, e o `preflight` passa a transformar um gate que lançou em uma linha vermelha. A camada de CI ganha **um workflow novo**: `delete-merged-branch.yml`, que apaga a branch do PR mergeado — é o instrumento da regra de branch morta de [`git-workflow.md`](../.agents/specs/conventions/git-workflow.md). O footer subiu junto com os outros 5. |
| `1.40.0` | **Sem mudança de stack** — nenhuma dependência nova, nenhum binário novo no `package.json`, nenhuma mudança em `apps/web`, `packages/` ou `infra/`. A única mudança na árvore é o BC de `profiles` de `apps/api`: os 3 eventos passam a `profiles.profile.created.v1` (prefixo derivado do caminho), e o PR acrescenta a convenção `event-driven.md` + o gate `check-event-driven` (75 testes, 41 mutações medidas) + o agent `event-driven-auditor` + a skill `event-driven-audit`. O footer subiu junto com os outros 5. |
