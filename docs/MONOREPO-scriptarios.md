# MONOREPO-scriptarios.md — Catálogo dos Scripts da Raiz

> Catálogo canônico dos scripts declarados no `package.json` da raiz do
> monorepo. As convenções estruturais (layout, aliases, versionamento) estão em
> [`MONOREPO.md`](./MONOREPO.md); a stack e as versões ficam em
> [`STACK.md`](./STACK.md).

---

## §1. A lista e o comando que a reproduz

**MEDIDO em 2026-10-29.** A contagem e a lista saem do próprio `package.json` —
nenhuma delas é escrita à mão:

```bash
# contagem
node -p "Object.keys(require('./package.json').scripts).length"   # → 29

# a lista inteira, com o comando de cada script
node -p "Object.entries(require('./package.json').scripts)
  .map(([k,v])=>'| `'+k+'` | `'+v+'` |').join('\n')"
```

> ⚠️ **A tabela anterior vivia em `docs/MONOREPO.md` §7 e listava 9 dos 29**
> scripts — `dev`, `build`, `test`, `lint`, `typecheck`, `format`, `clean`,
> `ci:preflight` e `ci:local`. Os outros 20 (incluindo `ci:boot`,
> `pr:refresh`, `review:route`, `specialist:route`, `tooling:test` e
> `format:check`) não apareciam em lugar nenhum. Um catálogo de scripts que
> lista um terço do que existe não é catálogo.

## §2. Scripts canônicos (29)

### 2.1 Build, dev e limpeza

| Script | Comando | O que faz |
|--------|---------|------------|
| `pnpm build` | `turbo run build` | Build de tudo, com cache do Turborepo (`dist/**` e `.next/**`). |
| `pnpm dev` | `turbo run dev` | Sobe os 2 apps em watch (api :3000, web :3001). |
| `pnpm clean` | `turbo run clean && rm -rf node_modules .turbo` | Limpa cache de build e dependências. |
| `pnpm prepare` | `husky` | Instala os hooks do git — roda no `pnpm install`. |

### 2.2 Qualidade (lint, tipos, formatação, testes)

| Script | Comando | O que faz |
|--------|---------|------------|
| `pnpm lint` | `turbo run lint` | ESLint em todos os workspaces. |
| `pnpm typecheck` | `turbo run typecheck` | `tsc --noEmit` em todos os workspaces. |
| `pnpm typecheck:tooling` | `tsc --noEmit -p .tooling/tsconfig.json` | Tipos do **próprio tooling** (`.tooling/`), que não faz parte do `turbo.json`. |
| `pnpm format` | `prettier --write "**/*.{ts,tsx,json,yaml,yml}"` | Formata o código (escreve). |
| `pnpm format:check` | `prettier --check "**/*.{ts,tsx,json,yaml,yml}"` | Verifica a formatação **sem escrever** — roda como step do job de preflight no CI (`.github/workflows/ci.yml`, antes do `ci:preflight`). |
| `pnpm test` | `turbo run test:unit && pnpm tooling:test` | Unit dos 2 apps + a suíte do tooling. |
| `pnpm test:unit` | `turbo run test:unit` | Só os testes unitários. |
| `pnpm test:integration` | `turbo run test:integration` | Testes de integração (Postgres real via Testcontainers). |
| `pnpm test:coverage` | `turbo run test:coverage` | Testes unitários com relatório de cobertura. |
| `pnpm test:e2e` | `turbo run test:e2e` | E2E dos 2 apps: Playwright no web, `app.inject` do Fastify na api. |
| `pnpm tooling:test` | `vitest run --root tooling/scripts && vitest run --root .tooling/scripts/ci` | Suíte do tooling (`tooling/scripts` **e** `.tooling/scripts/ci`). |

### 2.3 Gates e CI

| Script | Comando | O que faz |
|--------|---------|------------|
| `pnpm ci:preflight` | `tsx .tooling/scripts/ci/preflight.ts` | Roda os checks estruturais registrados em [`preflight-gates.ts`](../.tooling/scripts/ci/preflight-gates.ts) e aborta com exit 1. É o que o `.husky/pre-push` roda. |
| `pnpm ci:boot` | `tsx .tooling/scripts/ci/boot-local.ts` | **Sobe a aplicação local** (api + web) e confere o health. O banco local é pré-requisito — a etapa não o sobe. |
| `pnpm ci:local` | `preflight` + `db:generate` + `lint`/`typecheck`/`test:*` + `tooling:test` + `ci:boot` | Atalho manual da Camada 1 completa. Não está em hook nenhum. |
| `pnpm pr:marker` | `tsx tooling/scripts/pr-refresh-gate.ts` | Gate do marcador `<!--pr-refresh:live-->` no corpo do PR. Bloqueia no **CI** (não no hook). |

### 2.4 Agents, roteamento e lint das matrizes

| Script | Comando | O que faz |
|--------|---------|------------|
| `pnpm stack:review` | `tsx tooling/scripts/stack-code-reviewer.ts` | Review com lens de stack (NestJS/Next.js/Prisma/DDD). Sai 1 quando há blocker. |
| `pnpm docs:sync` | `tsx tooling/scripts/doc-sync.ts` | Mapeia arquivos de código para docs de referência e dispara `review`/`update`/`create`/`alert`. |
| `pnpm review:route` | `cd tooling/scripts && pnpm review:route` | Classifica o diff e despacha os reviewers segundo a matriz de review. |
| `pnpm review:lint` | `cd tooling/scripts && pnpm review:lint --matrix=../../.agents/specs/conventions/review-routing.md --agents=../../.agents/agents/` | Lint da matriz de review contra os agents existentes. |
| `pnpm specialist:route` | `cd tooling/scripts && pnpm specialist:route` | Identifica o(s) specialist(s) de uma demanda (camada 1 do pre-planner). |
| `pnpm specialist:lint` | `cd tooling/scripts && pnpm specialist:lint --matrix=../../.agents/specs/conventions/specialist-routing.md --agents=../../.agents/agents/` | Lint da matriz de specialist contra os agents existentes. |
| `pnpm archive:lint` | `cd tooling/scripts && pnpm archive:lint` | Valida o frontmatter canônico das demandas arquivadas em `.agents/runs/archive/`. |
| `pnpm repeticao:analisa` | `cd tooling/scripts && pnpm repeticao:analisa` | Mede os literais de texto que se repetem em vários arquivos (regra DRY). É **analisador**, não gate: sai 0 mesmo achando repetição. |

### 2.5 PR e release

| Script | Comando | O que faz |
|--------|---------|------------|
| `pnpm pr:refresh` | `tsx tooling/scripts/pr-refresh-hook.ts` | Reescreve as claims numéricas do corpo do PR a cada push. **Nunca bloqueia** (advisory): o exit code é capturado e não propagado. |
| `pnpm tooling:bump-version` | `tsx tooling/scripts/bump-version.ts` | Bump **mecânico** dos 4 footers de versão de uma vez: `pnpm tooling:bump-version 1.14.0`. |

## §3. Onde cada script é disparado

O mapa de "quem roda o quê, e o que bloqueia" está em
[`fluxo-desenvolvimento.md`](./fluxo-desenvolvimento.md) (documento factual,
re-medido a cada merge). O resumo, medido nos hooks em 2026-10-29:

| Hook | Scripts | Bloqueia? |
|------|---------|-----------|
| `.husky/pre-commit` | `lint-staged` → `stack-code-reviewer` → `doc-sync` | Sim, por arquivo staged. |
| `.husky/commit-msg` | `commit-msg-gate` | Sim (Conventional Commits). |
| `.husky/pre-push` | `ci:preflight` → `ci:boot` → `pr:refresh` | `ci:preflight` e `ci:boot` sim; `pr:refresh` é advisory. |

**Nenhum hook executa `tdd-enforcer`** — ele existe como agent
([`.agents/agents/tdd-enforcer.md`](../.agents/agents/tdd-enforcer.md)), mas
`grep -rn "tdd-enforcer" .husky/ .github/workflows/` volta vazio.

---

**Mantido por:** projeto-base contributors
**Doc irmão:** [`MONOREPO.md`](./MONOREPO.md) (estrutura, aliases, versionamento)

> Este arquivo **não** tem footer de versão: os 4 footers canônicos são os de
> [`MONOREPO.md`](./MONOREPO.md), [`STACK.md`](./STACK.md),
> [`TEMPLATE_USAGE.md`](./TEMPLATE_USAGE.md) e
> [`estrutura-e-versionamento.md`](../.agents/specs/conventions/estrutura-e-versionamento.md)
> — a lista é do gate `check-version-footers`, e ela não cresce.
