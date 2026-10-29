# MONOREPO.md — Convenções de Monorepo

> Documento canônico de **convenções estruturais** do monorepo. Define layout de pastas, regras de isolamento entre apps, dependências compartilhadas e versionamento.
> Esta configuração é gerenciada pelo agent [`monorepo-specialist`](../.agents/agents/monorepo-specialist.md).
> **Docs irmãos:** o catálogo dos scripts da raiz está em [`MONOREPO-scriptarios.md`](./MONOREPO-scriptarios.md) (29 scripts; §7 é o índice). A stack está em [`STACK.md`](./STACK.md).

---

## §1. Layout Canônico

> ⚠️ **Árvore medida contra o disco** em 2026-10-29 (`ls -1 packages/`,
> `ls -1 infra/`, `ls -1 docker-compose*.yml`). A versão anterior declarava um
> `packages/ui/` **que não existe** e um `infra/` com `docker-compose.yml` e
> `postgres/` **que também não existem** — e se contradizia: a seção "Docker"
> abaixo já dizia que o Compose mora na **raiz**.

```text
.
├── apps/                           # Aplicações deployables
│   ├── api/                        # Backend NestJS
│   └── web/                        # Frontend Next.js
├── packages/                       # Bibliotecas internas (versionadas)
│   ├── shared-types/               # Tipos compartilhados front↔back
│   ├── tsconfig/                   # tsconfig.base.json + base/node/react
│   └── eslint-config/              # Regras ESLint compartilhadas
├── tooling/scripts/                # Scripts utilitários do monorepo
├── infra/                          # Config dos backends de telemetria:
│                                   # grafana/, otelcol/, prometheus/, tempo/
├── docs/                           # Documentação
├── .agents/                        # Agents, skills, workflows
├── AGENTS.md                       # Spec canônica do padrão
├── README.md
├── pnpm-workspace.yaml             # Declaração dos workspaces
├── turbo.json                      # Pipeline de build/test/lint
├── tsconfig.base.json              # TS config base (path aliases)
├── package.json                    # Scripts orquestrados
├── docker-compose.yml              # Compose de produção — RAIZ
├── docker-compose.dev.yml          # Override de dev — RAIZ
└── .markdownlint.json              # Config órfã (nada executa markdownlint)
```

- **`packages/ui/` não existe** — o alias `@projeto/ui` continua apontando para um diretório inexistente (§4).
- **`infra/` não tem Postgres nem Compose** — o Postgres vive no serviço `postgres` do `docker-compose.yml` (raiz).
- **Todo package do workspace tem README** — o gate `check-doc-coverage` exige
  um por package (`eslint-config`, `shared-types`, `tsconfig`).

## §2. Regra de Ouro — Apps Isolados

> **Um app NUNCA importa diretamente de outro app.**

Comunicação entre apps:

- ✅ Via HTTP/REST (ou GraphQL, fila)
- ✅ Via `packages/shared-types` (tipos de contrato)
- ❌ `import { UserService } from '../../api/src/users/user.service'` — **PROIBIDO**

Quando precisar compartilhar código entre apps:

1. Identificar o que é compartilhável (tipos, utils, componentes)
2. Criar/mover para `packages/<nome>`
3. Adicionar como dependência via `workspace:*`
4. Versionar o `package.json` do package (o tag `vX.Y.Z` é feito pelo CI — ver §6)

## §3. Dependências

### 3.1 Internas (packages) e externas (npm)

```jsonc
// apps/api — deps internas: SEMPRE workspace protocol
{ "dependencies": { "@projeto/shared-types": "workspace:*" } }
// root — deps compartilhadas
{ "devDependencies": { "typescript": "^5.6.0", "eslint": "^9.12.0" } }
// apps/api — deps específicas
{ "dependencies": { "@nestjs/core": "^11.0.0", "prisma": "^6.0.0" } }
```

### 3.2 Regras

- ✅ Deps compartilhadas no **root** (TS, ESLint, Prettier)
- ✅ Deps específicas no **app/package** que as usa
- ✅ `workspace:*` para packages internos
- ❌ Versão fixa (`"1.2.3"`) — usar caret (`"^1.2.3"`) para permitir patches
- ❌ Deps duplicadas (mesmo pacote, versões diferentes) — resolver via `pnpm dedupe`

> **Exceção medida:** `@playwright/test` está **fixado** em `1.60.0` (sem
> caret) em `apps/web/package.json` — a **única** violação da regra acima no
> repositório, medido em 2026-10-29 com
> `grep -rnE '"[^"]+": "[0-9]+\.[0-9]+\.[0-9]+"' --include=package.json package.json apps/*/package.json packages/*/package.json tooling/scripts/package.json | grep -v '"version":'`
> → uma linha só, `apps/web/package.json:40`. O motivo do pin não está
> documentado no repo: a regra e a exceção estão em conflito até alguém decidir
> qual cede.

## §4. Path Aliases

Centralizados em `tsconfig.base.json` (no root). Os 4 aliases declarados,
medidos em 2026-10-29 com
`node -p "JSON.stringify(require('./tsconfig.base.json').compilerOptions.paths,null,1)"`:

```jsonc
{
  "baseUrl": ".",
  "paths": {
    "@projeto/shared-types": ["./packages/shared-types/src"],
    "@projeto/shared-audit": ["./apps/api/src/shared/audit"],
    "@projeto/shared-domain": ["./apps/api/src/shared/domain"],
    "@projeto/ui": ["./packages/ui/src"]      // ⚠️ ALIAS MORTO
  }
}
```

⚠️ **`@projeto/ui` é um alias morto**: aponta para `./packages/ui/src`, e
`packages/ui/` não existe (§1). Removê-lo é mudança de código com blast radius
(build dos 3 workspaces) — **reportado, não corrigido aqui**.

Cada app/package estende `tsconfig.base.json` e adiciona seus próprios aliases.

## §5. Turborepo — Pipelines

Conteúdo real de `turbo.json` (medido em 2026-10-29 com `cat turbo.json`):

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local", "tsconfig.base.json"],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "db:generate": { "cache": false },
    "typecheck": { "dependsOn": ["^build", "db:generate"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:unit": { "outputs": ["coverage/**"] },
    "test:coverage": { "outputs": ["coverage/**"] },
    "test:integration": { "cache": false, "outputs": [] },
    "test:e2e": { "cache": false, "outputs": [] },
    "clean": { "cache": false }
  }
}
```

**Convenção:** toda tarefa declara `outputs` (o que cachear) ou `cache: false` (o
que nunca cachear); `dependsOn: ["^build"]` garante a ordem topológica; `dev` é
`cache: false, persistent: true` (watch mode).

## §6. Versionamento

> ⚠️ **Changesets foi REMOVIDO desta seção** (2026-10-13). Ela mandava rodar
> `pnpm changeset`, `pnpm version` e `pnpm release`, e nenhum dos três scripts
> existe em nenhum `package.json` — o pnpm responde "None of the selected
> packages has a … script" e **sai 0**, que é verde para quem só olha o exit
> code. Não há `@changesets/cli` instalado nem diretório `.changeset/`. O
> versionamento que existe é o **tag automático `vX.Y.Z` em `main`**, disparado
> por `.github/workflows/release-template.yml` após o merge (ver
> [`post-merge-release.md`](../.agents/specs/conventions/post-merge-release.md)).

A **fonte da verdade da versão do template é o rodapé deste arquivo** — é dele
que o `release-template.yml` extrai a tag. O `package.json` da raiz **não** é a
fonte: o `version` dele (`0.1.0`) é a do pacote npm local.

```bash
# versão do TEMPLATE (a que vira tag)
grep -oE '\*\*Versão do documento:\*\* [0-9]+\.[0-9]+\.[0-9]+' docs/MONOREPO.md | tail -1
# a "version" do package.json da raiz é a do pacote npm local, NÃO a do template:
node -p "require('./package.json').version"   # → 0.1.0
```

Os 4 footers versionados (`docs/MONOREPO.md`, `docs/STACK.md`,
`docs/TEMPLATE_USAGE.md` e
`.agents/specs/conventions/estrutura-e-versionamento.md`) têm de **concordar
entre si** — o gate `check-version-footers` barra o PR quando divergem. O bump
mecânico dos quatro é `pnpm tooling:bump-version X.Y.Z`.

Mudança em `packages/` **DEVE** atualizar a versão no `package.json` do
package e entrar no changelog que o workflow gera — não há arquivo
`.changeset/` para escrever.

## §7. Scripts Canônicos (Root)

O catálogo completo está em
[`MONOREPO-scriptarios.md`](./MONOREPO-scriptarios.md) — **29 scripts**,
medidos em 2026-10-29 com
`node -p "Object.keys(require('./package.json').scripts).length"` → `29`.
A tabela desta seção listava **9** deles; os outros 20 não apareciam em lugar
nenhum.

| Script | O que faz |
|--------|------------|
| `pnpm dev` / `pnpm build` | Sobe os apps em watch / build com cache. |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` em todos os workspaces. |
| `pnpm test` | Unit dos 2 apps + a suíte do tooling. |
| `pnpm ci:preflight` | Roda os checks estruturais; aborta com exit 1. |
| `pnpm ci:local` | Atalho manual da Camada 1 completa (não está em hook). |

**Fluxo canônico (do primeiro comando ao merge):** cada script acima é uma peça do quebra-cabeça — quem dispara, em qual ordem, e o que bloqueia está em [`docs/fluxo-desenvolvimento.md`](./fluxo-desenvolvimento.md) (documento factual, re-medido a cada merge).

## §8. Isolamento por App

Cada app tem seu próprio:

- `package.json` (deps específicas)
- `tsconfig.json` (extends base)
- `eslint.config.js` (extends base)
- `Dockerfile` (para deploy)
- `.env.example` (variáveis esperadas)

Apps NÃO compartilham:

- ❌ `src/` — código de aplicação é isolado
- ❌ `node_modules/` — pnpm gerencia isso (hoisting no root)
- ❌ Configurações runtime (.env, logs)

### Docker

- `Dockerfile` em cada app (`apps/api/Dockerfile`, `apps/web/Dockerfile`)
- `docker-compose.yml` na raiz (postgres + api + web prod)
- `docker-compose.dev.yml` na raiz (override dev com hot reload)
- `.dockerignore` na raiz
- Comandos:
  - `docker compose up -d postgres api web` (prod)
  - `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` (dev)

## §9. Quando Adicionar um App

```text
1. Criar pasta apps/<nome>
2. Adicionar tsconfig.json, eslint.config.js, package.json
3. Adicionar ao pnpm-workspace.yaml (globs)
4. Adicionar pipeline ao turbo.json (se tarefas específicas)
5. Criar Dockerfile (se for deployable)
6. Documentar em README.md do app
7. Despachar monorepo-specialist → code-reviewer
```

## §10. Quando Adicionar um Package

```text
1. Criar pasta packages/<nome>
2. Adicionar tsconfig.json, package.json (com exports map)
3. Adicionar ao pnpm-workspace.yaml (já coberto se for "packages/*")
4. Adicionar path alias em tsconfig.base.json
5. Bump da versão no `package.json` do package (o changelog é gerado pelo
   workflow de release após o merge — não há `.changeset/` para escrever, ver §6)
6. Despachar monorepo-specialist → code-reviewer
```

## §11. Estrutura Obrigatória por App (DDD/Hexagonal)

> **Regra canônica** (a partir de `v1.2.0`): apps backend adotam **DDD + Hexagonal (Ports & Adapters)** como paradigma arquitetural obrigatório. Decisão justificada no [ADR-0001 — DDD + Hexagonal + Auditoria](./adr/0001-arquitetura-ddd-hexagonal-auditoria.md).

```text
apps/api/src/modules/<feature>/
├── domain/          # TypeScript puro — entidades, VOs, eventos de domínio
├── application/     # Use cases + ports (interfaces) — depende só de domain
└── infrastructure/  # http/, persistence/, adapters — implementa ports

domain         ─→ (nada além de typescript padrão)
  ↑
application    ─→ domain + ports próprias
  ↑
infrastructure ─→ application + domain + libs externas (NestJS, Prisma)
```

Cada app backend **DEVE** organizar cada feature como módulo com as três camadas acima. Shared concerns (auditoria, validação, infra HTTP) ficam em `apps/<app>/src/shared/{audit,domain,infrastructure}/`.

- ❌ `domain/` **nunca** importa `@nestjs/*`, `@prisma/*`, `class-validator`, `reflect-metadata`, `rxjs`.
- ❌ `application/` **nunca** importa de `infrastructure/`.
- ✅ O fluxo inverso (camadas externas → internas) é livre.
- ✅ `infrastructure/http/` implementa os ports definidos em `application/ports/`.

**Guardiões:** agent `stack-code-reviewer` (D11 — pre-commit + CI) com lens
DDD/Hexagonal + skill [`ddd-hexagonal-validation`](../.agents/skills/ddd-hexagonal-validation/SKILL.md).
Referência cruzada: [`estrutura-e-versionamento.md`](../.agents/specs/conventions/estrutura-e-versionamento.md) e [`docs/STACK.md` §8](./STACK.md).

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.12.0

### Histórico de Versões

| Versão | Mudanças |
|--------|----------|
| `1.0.0` | Lançamento inicial |
| `1.1.0` | Adicionados 3 specialists de stack + workflows detalhados |
| `1.2.0` | §11 — Estrutura obrigatória DDD/Hexagonal por app (ADR-0001) |
| `1.3.0` | §11 — Referência à skill `ddd-hexagonal-validation` (validador automatizado de boundaries) validada em BC `users` end-to-end |
| `1.4.0` | §Defense in Depth — referência ao padrão de 3 camadas (`ci-defense-in-depth` skill + convenção) e à estratégia de auditoria `ci-defense-mode` / release-mode workflows |
| `1.5.0` | Seção "Docker" — `Dockerfile` por app (`apps/api`, `apps/web`) + `docker-compose.yml` (postgres + api + web prod) + `docker-compose.dev.yml` (override dev com bind mounts / hot reload) + `.dockerignore` na raiz |
| `1.5.1` | Backfill: matrix `review-router` bumped para v1.2 (2 P1 gaps resolvidos — propagação `blocking:true` em path_globs + regex security narrow call-site anchored). Sem mudança de monorepo. |
| `1.6.0` | Backfill: matrix `review-router` bumped para v1.3 (3 P2 gaps resolvidos — `domains[]` enrich, lint WARNING para blocking, coverage scenarios em apêndice). Sem mudança de monorepo. |
| `1.7.0` | Adição do agent `telemetry-specialist` (transversal: backend+frontend+docker) + convenção `state-aware-planning` (camada 0 do pre-planner) + skill/workflow/memory companions; nova categoria transversal "Observabilidade" (referência cross-stack) |
| `1.9.0` | §1 — árvore de estrutura e contagens de agents/memórias/workflows realinhadas com o disco (19/21/10). §CI — `tooling:test` passou a cobrir `.tooling/scripts/ci` (6 specs / 32 testes que nunca rodavam) e roda no job `preflight`; lint real em `apps/api` (antes era stub `exit 0`); gate DDD barra import de `infrastructure/` em `domain/`; `turbo.json` sem tasks órfãs; `checkDocRefs` com escopo via `git ls-files` e máscara de inline-code. |
| `1.9.1` | §1 — contagem de agents corrigida de 19 para 20 (inclui o sub-dir `telemetry-specialist/` além do `.md` correspondente). §7 — `pnpm ci:preflight` e `pnpm ci:local` adicionados à tabela canônica de scripts; cross-ref para [`docs/fluxo-desenvolvimento.md`](./fluxo-desenvolvimento.md) (fluxo end-to-end re-medido a cada merge). |
| `1.10.0` | Adição do agent `ux-design-specialist` (UX/design de interface: tokens, estados, formulários, a11y, microcopy) — 6º specialist de stack; índices atualizados em `AGENTS.md §3.1`, `README.md` e nas matrizes `specialist-routing.md` (v1.3) e `review-routing.md` (v1.5). O §1 não enumera agents individualmente (só o diretório `.agents/`), então não houve contagem a corrigir ali. |
| `1.11.0` | Adição de 5 skills de UI (`ui-modes`, `ui-craft`, `ui-break`, `motion`, `ui-review`) adaptadas de 3 repositórios externos (emilkowalski/skills MIT, pbakaus/impeccable Apache-2.0, leonxlnx/taste-skill MIT) e carregadas pelo `ux-design-specialist` — única relação 1:N do repo. Índice: `AGENTS.md §3.2` (nota nova) + `§5` (rows `ui-review-mode`, `audit-mode`, `release-pre-tag`), `WORKFLOWS.md`, matriz `review-routing.md` v1.7. Nenhuma mudança de stack, script ou count de §1. |
| `1.12.0` | Adição do agent `multi-tenant-specialist` (tenancy: schema + `tenant_id`, contexto por request, RLS) + companion de memória + skill `multi-tenant-audit` + **promoção da convenção `migracao-de-dados.md`** (gap G-003). Índices: `AGENTS.md §3.1` + `§6`, `README.md`, matriz `specialist-routing.md` v1.6 (2 path_globs + 1 demand_keyword) e `review-routing.md` v1.8 (§0 reviewer→skill). Nenhuma mudança de stack, script ou count de §1. |
| `1.13.0` | **Sem mudança de monorepo** — o footer do `AGENTS.md` subiu para `1.13.0` sozinho, e os outros 4 footers seguiam em `1.12.0` (drift medido em 2026-10-29). O gate `check-version-footers` (criado no #126) é o que fecha essa classe. |
| `1.14.0` | **Correção de fatos medidos contra o código** (2026-10-29). §1 — a árvore perdeu o `packages/ui/` (não existe) e o `infra/` deixou de declarar `docker-compose.yml`/`postgres/` (o real é `grafana/`, `otelcol/`, `prometheus/`, `tempo/`; o Compose mora na raiz). §4 — os 4 aliases de `tsconfig.base.json` foram listados, com `@projeto/ui` marcado como **alias morto**. §5 — o `turbo.json` agora é o arquivo real (12 tasks, não 5). §6 — o comando que "inspeciona a versão" apontava para o `package.json` da raiz (`0.1.0`), que não é a versão do template; a fonte é o rodapé deste arquivo. §7 — os 9 scripts listados viraram índice; o catálogo dos **29** foi para [`MONOREPO-scriptarios.md`](./MONOREPO-scriptarios.md). §3.2 — a regra do caret ganhou a exceção medida de `@playwright/test` (`1.60.0`, sem caret). |
