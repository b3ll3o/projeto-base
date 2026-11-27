# MONOREPO.md — Convenções de Monorepo

> Documento canônico de **convenções estruturais** do monorepo. Define layout de pastas, regras de isolamento entre apps, dependências compartilhadas e versionamento.
> Esta configuração é gerenciada pelo agent [`monorepo-specialist`](../.agents/agents/monorepo-specialist.md).
> **Docs irmãos:** o catálogo dos scripts da raiz está em [`MONOREPO-scriptarios.md`](./MONOREPO-scriptarios.md) (30 scripts; §7 é o índice). A stack está em [`STACK.md`](./STACK.md).

---

## §1. Layout Canônico

> ⚠️ **Árvore medida contra o disco** em 2026-10-29 (`ls -1 packages/`,
> `ls -1 infra/`, `ls -1 docker-compose*.yml`). A versão anterior declarava
> `packages/ui/` e `infra/{docker-compose.yml,postgres/}` — **nenhum dos três
> existe** — e se contradizia: a seção "Docker" abaixo já dizia que o Compose
> mora na **raiz**.

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
├── infra/                          # Config dos backends de telemetria: grafana/, otelcol/, prometheus/, tempo/
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

- **`packages/ui/` não existe** — o alias `@projeto/ui` saiu em 2026-10-29 (§4).
- **`infra/` não tem Postgres nem Compose** — o Postgres vive no serviço `postgres` do compose (raiz).
- **Todo package tem README** — o gate `check-doc-coverage` exige um por package.

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

> **Sem exceção, desde 2026-10-29.** `@playwright/test` era a **única**
> violação da regra acima (fixado em `1.60.0`, sem caret). O pin era
> **acidental** — nasceu na instalação da suíte e2e, sem comentário nem motivo em
> commit ou PR — e nada dependia dele: não há imagem do Playwright no repo, não
> há `playwright install` com versão, e a revisão do browser mora **dentro do
> pacote**. Virou caret (`^1.60.0`); o lock continua resolvendo `1.60.0` (o pnpm
> não re-resolve o que a faixa aceita), então **a versão instalada não muda** —
> a diferença é que agora um patch é permitido. MEDIDO:
> `grep -rnE '"[^"]+": "[0-9]+\.[0-9]+\.[0-9]+"' --include=package.json package.json apps/*/package.json packages/*/package.json tooling/scripts/package.json | grep -v '"version":'`
> → **zero linhas**.

## §4. Path Aliases

Centralizados em `tsconfig.base.json` (no root). Os **3** aliases declarados
hoje, medidos em 2026-10-29 com
`node -p "JSON.stringify(require('./tsconfig.base.json').compilerOptions.paths,null,1)"`:

```jsonc
{
  "baseUrl": ".",
  "paths": {
    "@projeto/shared-types": ["./packages/shared-types/src"],
    "@projeto/shared-audit": ["./apps/api/src/shared/audit"],
    "@projeto/shared-domain": ["./apps/api/src/shared/domain"]
  }
}
```

Os **3** aliases declarados apontam para diretórios que **existem** (medido em
2026-10-29). O quarto, `@projeto/ui` → `./packages/ui/src`, era um **alias
morto** — `packages/ui/` não existe (§1) e **nenhum** import o usava: só a
própria declaração. Saiu em 2026-10-29 (medido: `pnpm typecheck` 4/4, `pnpm
lint` 2/2 e `pnpm build` 2/2 verdes **depois** da remoção). O gate
[`check-path-alias`](../.tooling/scripts/ci/check-path-alias.ts) mede a regra
"todo alias aponta para um local que EXISTE, na forma que o TypeScript aceita
o alvo" — arquivo, diretório ou padrão com `*`, e com vários destinos basta
um existir, que é o que o TS faz ao tentá-los em ordem. Sem ele, o próximo
alias morto nascia em silêncio.

O gate mede **todos** os tsconfigs do repo (MEDIDO 2026-11-27: 11 tsconfigs,
9 deles com `paths` efetivo, 4 aliases distintos = 23 pares alias×destino,
porque o `extends` propaga os mesmos aliases; 0 mortos) — o `"@/*"` do
`apps/web` é um dos que passa a ser medido, e ele é **legítimo**: o web tem
**150** imports `@/…` (MEDIDO: `grep -rhoE "from '@/[^']*'" apps/web
--include=*.ts --include=*.tsx | wc -l` → 150).

Cada app/package estende `tsconfig.base.json` e adiciona seus próprios aliases.

## §5. Turborepo — Pipelines

As tasks que a convenção abaixo usa (medido em 2026-11-17 com `cat turbo.json`;
**o dono do pipeline é o arquivo**, e ele é a fonte — o bloco aqui é o recorte
que a convenção usa, não uma cópia):

```jsonc
"build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
"dev": { "cache": false, "persistent": true },
"db:generate": { "cache": false },
"typecheck": { "dependsOn": ["^build", "db:generate"], "outputs": [] },
"test:integration": { "dependsOn": ["@projeto/api#db:generate"], "cache": false, "outputs": [] },
"test:e2e": { "dependsOn": ["@projeto/api#db:generate"], "cache": false, "outputs": [] }
```

**Convenção:** toda tarefa declara `outputs` (o que cachear) ou `cache: false` (o
que nunca cachear); `dependsOn: ["^build"]` garante a ordem topológica; `dev` é
`cache: false, persistent: true` (watch mode); e as tasks de BANCO dependem de
`db:generate` — **qualificada com o pacote** (`@projeto/api#db:generate`), porque
só o `@projeto/api` tem Prisma: a dependência simples virava `<NONEXISTENT>`
(que o turbo pula) e a invariante não valeria para o e2e do web, que é o que
sobe a API (o porquê medido: [`ci-defense-in-depth.md`](../.agents/specs/conventions/ci-defense-in-depth.md)).

## §6. Versionamento

> ⚠️ **Changesets foi REMOVIDO desta seção** (2026-10-13). Ela mandava rodar
> `pnpm changeset`, `pnpm version` e `pnpm release`, e nenhum dos três scripts
> existe em nenhum `package.json` — o pnpm responde "None of the selected
> packages has a … script" e **sai 0**, verde para quem só olha o exit code.
> Não há `@changesets/cli` nem `.changeset/`. O versionamento que existe é o
> **tag automático `vX.Y.Z` em `main`**, disparado por
> `.github/workflows/release-template.yml` após o merge (ver
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

Os 6 footers versionados (`docs/MONOREPO.md`, `docs/STACK.md`,
`docs/TEMPLATE_USAGE.md`, `AGENTS.md`, `README.md` e
`.agents/specs/conventions/estrutura-e-versionamento.md`) têm de **concordar
entre si** — o gate `check-version-footers` barra o PR quando divergem. O bump
mecânico dos seis é `pnpm tooling:bump-version X.Y.Z`.

Mudança em `packages/` **DEVE** atualizar a versão no `package.json` do
package e entrar no changelog que o workflow gera — não há arquivo
`.changeset/` para escrever.

## §7. Scripts Canônicos (Root)

O catálogo completo está em
[`MONOREPO-scriptarios.md`](./MONOREPO-scriptarios.md) — **30 scripts**,
medidos em 2026-11-03 com
`node -p "Object.keys(require('./package.json').scripts).length"` → `30`.
A tabela desta seção listava **9** deles; os outros 21 não apareciam em lugar
nenhum — o `ambiente:check` (o 30º) foi direto para o catálogo, e os 20 demais
continuam só no [`MONOREPO-scriptarios.md`](./MONOREPO-scriptarios.md).

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
   workflow de release após o merge — não há `.changeset/`, ver §6)
6. Despachar monorepo-specialist → code-reviewer
```

## §11. Estrutura Obrigatória por App (DDD/Hexagonal)

> **O dono desta regra é a convenção
> [`estrutura-e-versionamento.md`](./../.agents/specs/conventions/estrutura-e-versionamento.md)
> §"Arquitetura por Módulo (DDD/Hexagonal)"** — a árvore das três camadas, a
> regra de dependência e os guardiões moram lá. Este índice aponta; **não repete**.

Resumo: apps backend adotam **DDD + Hexagonal (Ports & Adapters)** (`v1.2.0`), cada feature em
`apps/api/src/modules/<feature>/{domain,application,infrastructure}/`, os shared concerns em
`apps/<app>/src/shared/{audit,domain,infrastructure}/` — e o **desenho** disso em [`docs/system-design/`](../docs/system-design/README.md).

Decisão: [ADR-0001](./adr/0001-arquitetura-ddd-hexagonal-auditoria.md) ·
guardiões: agent `stack-code-reviewer` (D11) + skill
[`ddd-hexagonal-validation`](../.agents/skills/ddd-hexagonal-validation/SKILL.md) ·
visão de stack: [`docs/STACK.md` §8](./STACK.md).

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.39.1

### Histórico de Versões

> As versões anteriores à `1.20.0` estão em
> [`MONOREPO-historico.md`](./MONOREPO-historico.md) (apenas leitura),
> para preservar o limite de 300 linhas deste doc.

| `1.20.0` | **Adição de 4 skills de terceiro adaptadas** (minor bump — "Adição de nova skill é minor bump") — `grilling`, `handoff`, `design-taste-frontend` e `agent-browser` em `.agents/skills/`, cada uma com dono (o `orchestrator` carrega as 2 primeiras; o `ux-design-specialist` as 2 últimas) e wrapper em `.claude/skills/`. Nenhum arquivo de `apps/`, `packages/` ou `infra/` mudou: a árvore do monorepo é a mesma. Índices: `AGENTS.md §3.2` + a tabela de versões de `.agents/specs/conventions/estrutura-e-versionamento.md`. |
| `1.21.0` | **Sem mudança de monorepo** — a árvore de `apps/`, `packages/` e `infra/` é a mesma: o PR só adiciona um runbook (`docs/runbooks/cloudflare-edge.md`), que vive em `docs/`, fora da árvore do workspace. O footer do `AGENTS.md` e dos outros 4 subiu junto (o gate `check-version-footers` é o que fecha essa classe). |
| `1.22.0` | **As 10 issues P1 do scan de 2026-11-02, em um PR** (minor bump — o PR adiciona rota, tabelas e gates, e corrige 10 defeitos) — **#132 (revogação)**: o refresh token ganha `jti` e passa a ter registro (`refresh_tokens`), rotação, `POST /auth/logout` e detecção de replay; **#133 (credencial)**: a senha que a migration publicava sai do repositório (a role nasce sem senha, a rotação limpa o hash, o mínimo vai a 24 caracteres); **#134 (drift)**: `chaves_de_assinatura` ganha model no `schema.prisma` (o `migrate diff` propunha `DROP TABLE`); **#135 (convite)**: convite aceito ou expirado não bloqueia o reconvite; **#136 (cursor)**: o cursor da paginação aceita a forma que a tabela gera; **#137/#138/#139 (containers)**: o SIGTERM chega ao Node (`exec`), o web define `HOSTNAME`, e o probe do healthcheck não depende de pacote instalado. **2 gates novos** (`check-docker-healthcheck-binary`, `check-migrations-sem-model`) e **2 migrations** (`refresh_tokens`, rotação do papel de runtime). |
| `1.25.0` | **Uma pasta de tooling de IA, e a skill `agent-desktop`** (minor bump — nenhuma das duas mudanças mexe no formato de handoff nem na superfície canônica, que são os gatilhos de major) — **(A) a skill `agent-desktop`** em `.agents/skills/agent-desktop/SKILL.md`, adaptada de [vercel-labs/agent-desktop](https://github.com/vercel-labs/agent-desktop) (Apache-2.0): uma CLI que opera app nativo de desktop pela árvore de acessibilidade do SO. A CLI é **externa** — não entra no `package.json`, não pede segredo e não roda no CI. **(B) a pasta `.claude/` sai do repo**: os 29 wrappers de skill e os 3 de agent eram cópias do `name`/`description` que o `SKILL.md` canônico já trazia; os 2 hooks, o `settings.json`, o `README.md` e o `FINDINGS.md` foram para `.agents/`, e o binding do Claude Code passa a ser feito **na máquina** (symlink `~/.claude/skills/<nome>` → `.agents/skills/<nome>`; receita em [`docs/integrations/claude-code.md`](./integrations/claude-code.md)). MEDIDO 2026-11-09: uma pasta com só `.agents/skills/probe-skill/` devolveu **ZERO** skill de projeto ao Claude Code 2.1.319, e a mesma pasta com `.claude` como symlink para `.agents` devolveu **30 skills e 28 agents**, sem wrapper nenhum. Gate novo `check-pasta-unica`; o `check-skill-coverage` trocou SEM BINDING por DESCOBRÍVEL (frontmatter com `name`/`description`, e `name` igual ao diretório). **Nenhum arquivo de `apps/`, `packages/` ou `infra/` mudou: a árvore do monorepo é a mesma.** |
| `1.26.0` | **O system design canônico** (minor bump — doc: nenhum arquivo de `apps/`, `packages/` ou `infra/` mudou) — o conjunto `docs/system-design/` (7 documentos: índice, contexto, módulo, dados, segurança, operação e o **contrato de extensão**), o **ADR-0010** e o template que o app derivado copia. O `schema.prisma` passou a mapear para `docs/system-design/dados.md` no `doc-sync`, e a tabela de donos de `documentacao.md` §2 ganhou a linha do conjunto. |
| `1.27.0` | **O código passa a casar com o system design** (minor bump — o PR muda `apps/api` e o banco) — a rota de health ganha teto **PRÓPRIO** (`@Throttle` com 600/min no controller — e não `@SkipThrottle()`, que não existe no código; os dois comentários que afirmavam um `@SkipThrottle()` inexistente foram corrigidos); a escrita aceita `Idempotency-Key` (a pasta `apps/api/src/shared/idempotency/`, com port, adapter e interceptor); o papel de runtime ganha `statement_timeout = '8s'`; e a correlação da auditoria passa a usar a mesma derivação do `traceId` da resposta. **2 migrations** (`statement_timeout` do papel, `idempotency_keys`) e **2 ADRs** (0011, 0012). A árvore do workspace é a mesma — `shared/idempotency/` mora dentro de `apps/api/src/shared/`, e `packages/` e `infra/` não mudaram. |
| `1.30.0` | **O kit completo de documentação moderna, com dono e auditoria** (minor bump — doc: nenhum arquivo de `apps/`, `packages/` ou `infra/` mudou) — a convenção [`kit-documentacao.md`](../.agents/specs/conventions/kit-documentacao.md) declara os **5 pilares** e os **14 itens** do kit (README, CONTRIBUTING, GLOSSARY, HLD, C4, PRD, TDR, ADR, OpenAPI, AsyncAPI, ERD, Runbooks, Post-mortems, CHANGELOG); cada item passa a ter doc canônico, **specialist dono** e **auditor por pilar** — **19 agents novos** (14 specialists + 5 auditadores) e **5 skills de auditoria**. O instrumento é o gate `check-doc-kit`, que lê a matriz da convenção e mede doc, âncoras, índice e donos. Docs novos: `CONTRIBUTING.md`, `GLOSSARY.md`, `CHANGELOG.md` (raiz) e `docs/prd/`, `docs/tdr/`, `docs/post-mortems/`. |
| `1.31.0` | **O especialista em cobertura e2e de fluxos de usuário** (minor bump — "Adição de novo agent é minor bump") — o agent [`e2e-specialist`](../.agents/agents/e2e-specialist.md) (com a memória dele) e o workflow [`e2e-coverage-mode`](../.agents/workflows/e2e-coverage-mode.md): o dono do ciclo que fecha, antes do push, o espaço entre "a tela existe" e "a tela foi provada" — audita (a metade semântica que o gate de paridade não cobre), planeja (com o `state_snapshot`), revisa o plano com outro agent, implementa o spec faltante, roda `pnpm ci:local`, revisa o spec e commita/pusha na branch. Matrizes: `specialist-routing.md` v1.8 (2 path_globs + 1 demand_keyword) e `review-routing.md` v1.10 (1 path_glob). Índices: `AGENTS.md §3.1`, `.agents/WORKFLOWS.md`, `README.md`. **Nenhum arquivo de `apps/`, `packages/` ou `infra/` mudou** — a única mudança de dependência é o **override** de `effect` para `3.22.1` (advisory `1248071`, CVE-2026-121707: o pacote sai da árvore de produção de `apps/api`, onde era transitivo do `@prisma/config`); nenhum arquivo de `apps/` foi tocado. |
| `1.32.0` | **As três atualizações de dependência que os PRs do Dependabot pediam, em um PR só** (patch bump — nenhuma mudança de estrutura) — o `@nestjs/*` para a `12.5.1` (o `core` em uma instância só), o `react-hook-form` para a `7.92.0` e a família `@opentelemetry/*` para a geração `core` 3.x no node e para a última linha estável do browser; duas APIs do OTel mudaram no código (a classe `Resource` virou interface e o `provider.addSpanProcessor()` saiu do `WebTracerProvider`). O `engines.node` da raiz passa de `>=22.12.0` para `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` — o range real da árvore é o do `jsdom` 30.1.3, e `apps/api` e `apps/web` passam a declarar o mesmo range (o gate `check-engines-consistency` compara a raiz com cada app, e nenhum app declarava `engines`). O `prisma` 6 → 7 fica **fora**: é migração de schema (`prisma.config.ts` + driver adapter), não bump, e a major continua declarada como pendência com dono e motivo. |
| `1.33.0` | **O schema do Prisma passa a casar com o banco, e o `prisma migrate dev` volta a funcionar** (minor bump — o PR muda `apps/api` e o banco) — a issue #183 fecha os 3 achados: **prisma-N1-001**, a migration `20261020000003_revoke_prisma_migrations` passa a ter o `REVOKE` guardado por `IF EXISTS` (o statement cru levantava `ERROR: relation "_prisma_migrations" does not exist` — e a base onde a tabela não existe é justamente o shadow database que o `migrate dev` cria para replayar as migrations: o comando morria com P3006/P1014 e o caminho oficial de criação de migration ficava indisponível); **prisma-N1-002**, as 6 colunas de tempo das 3 tabelas que o banco criou com fuso (`profiles`, `authorizations`, `feature_flags`) ganham `@db.Timestamptz(6)` — o schema declarava `timestamp(3)`, uma parede de relógio sem fuso, e o `migrate diff` propunha converter as colunas (MEDIDO no Postgres 16: '2026-11-23 05:14:55+00' viraria '2026-11-23 02:14:55' numa sessão America/Sao_Paulo — 3 horas de deslocamento silencioso); **prisma-N1-003**, os 4 ids que o banco cria com `DEFAULT gen_random_uuid()` (`users_history`, `users_archive`, `profiles`, `authorizations`) passam a declarar `@default(dbgenerated("gen_random_uuid()"))` — o `@default(uuid())` do Prisma é client-side, e o `migrate diff` propunha `DROP DEFAULT` nas 4. MEDIDO: o `prisma migrate diff` do banco para o datamodel sai **vazio** nos dois sentidos, e o `prisma migrate dev` roda numa base limpa. Instrumento novo: o spec de integração `apps/api/src/shared/infrastructure/prisma/schema-e-migrations.integration.spec.ts` (4 casos — diff vazio, `migrate dev` com shadow database, DDL canônico com fuso e um instante relido em sessão não-UTC). Nenhuma dependência nova. |
| `1.34.0` | **O contrato HTTP do perfil de admin passa a ser validado na fronteira, e o PATCH para de apagar a descrição** (minor bump — o PR muda `apps/api` e acrescenta um arquivo de código de produção) — a issue #185 fecha 2 dos 3 achados: **code-N1-002**, o `PATCH /admin/profiles/:id` transformava a AUSÊNCIA do campo `description` em limpeza (`input.description ?? null`), e todo PATCH parcial — um PATCH que só renomeia — APAGAVA a descrição, que é dado de configuração que o cliente não tocou (a limpeza também entrava na auditoria como edição deliberada, porque o `alterarDescricao` bumpa a versão e emite `ProfileUpdatedEvent`); agora `description` ausente PRESERVA e `description: null` continua limpando. **code-N1-003**, `POST /admin/profiles`, `PUT /admin/users/:id/profile` e `POST /admin/profiles/:id/authorizations` não validavam o corpo (o pipe global de Zod é `ZodValidationPipe(z.any())`, um noop declarado: cada rota sobrescreve) — e o agregado itera `initialAuthorizations` sem checar o TIPO, então um `initialPermissions` numero ou objeto respondia **500** (TypeError) onde o certo é **400 VALIDATION_ERROR**, e uma string passava como iterable de CARACTERES, nomeando permissões que o cliente nunca pediu. O arquivo novo `apps/api/src/modules/profiles/infrastructure/http/profiles.schemas.ts` é o dono dos três corpos; a lista de permissões é validada por `z.custom` (e não `z.array`) porque o advisory do zod (`1243066`) é uma exaustão de memoria em coleção constrita e a exceção que o declara se sustenta por AUSÊNCIA desse padrão em `apps/api/src` — o zod do repo é o `3.25.76`, e a correção do advisory exige a major 4. Instrumento novo: o spec e2e `apps/api/test/e2e/scenarios/19-contrato-http-do-perfil.e2e.spec.ts` (7 casos — 3 de recusa, 2 de liberdade, e os 2 do PATCH). O 3º achado da issue (`code-N1-001`, o id malformado do `GET /users/:id/history`) JÁ ESTAVA CORRIGIDO no `main` pelo PR #171 — a issue citava linhas que não existem mais. Nenhuma dependencia nova. |
| `1.35.0` | **O limite do login passa a compor com o teto global, e a conta TRAVA por tentativas** (minor bump — o PR muda `apps/api`, o banco e o contrato HTTP) — a issue #182 fecha os 2 achados: **sec-N1-001**, o `@Throttle` da rota de login usava a chave `'default'`, que é o MESMO nome do único throttler do módulo — e no `@nestjs/throttler@6.8.0` o decorator SUBSTITUI o valor do módulo na rota (`routeOrClassLimit ?? namedThrottler.limit`), em vez de virar um bucket novo. MEDIDO com o guard real: na rota de login, 1 IP + 200 e-mails DIFERENTES davam 200 requisições permitidas, com o teto global por IP em 100 — o decorator não restringia, REMOVIA a restrição. Agora o módulo declara DOIS throttlers (`'default'`, o global por IP, e `'login'`, o de 5/min por `(IP, e-mail)`, com `skipIf` para não contar as outras rotas), e o dono da política é o arquivo novo `apps/api/src/modules/auth/infrastructure/http/throttle-do-login.ts`. **sec-N1-002**, o limite era por `(IP, e-mail)` e o número do NIST (5 tentativas POR CONTA) nunca se aplicava a uma conta só: 10 IPs distintos × 5 tentativas contra a MESMA conta davam 50 de 50 permitidas. Agora existe o LOCKOUT POR CONTA — a migration `20261125000000_tentativas_de_login` cria a tabela `login_tentativas` (chave: o e-mail NORMALIZADO; janela: 15 minutos; 5 falhas), o port `login-lockout.port.ts` é a fronteira, e o adapter Prisma fala com o banco pela credencial de SISTEMA (a de RUNTIME não alcança a tabela). O login consulta o contador ANTES de qualquer verificação (a conta travada não paga argon2), a falha conta para QUALQUER e-mail (inclusive de um que não existe na base — senão o NIST valeria só para quem já sabe o nome) e o login bem-sucedido ZERA (sem isso o lockout seria uma arma de DoS contra a vítima). A recusa é **423 ACCOUNT_LOCKED** — e não 429, que é o do throttler: o cliente precisa distinguir 'tente de novo em X segundos' de 'a conta está travada por 15 minutos'. Instrumento novo: o spec e2e `apps/api/test/e2e/scenarios/20-throttle-e-lockout-do-login.e2e.spec.ts` (5 casos) e 4 casos novos no spec unitário do login. Nenhuma dependencia nova. |
| `1.36.0` | **A imagem de produção da api sobe sem egress, e não embarca as devDependencies** (minor bump — o PR muda `apps/api/Dockerfile` e `docker-compose.yml`) — a issue #178 fecha os 3 achados: **#178 (P0)**, o cache do corepack era deixado em `/root/.cache/node/corepack` (o `corepack prepare` rodava como ROOT) e o runtime roda como `USER 1001:1001` — e `/root` é `drwx------ root`, INALCANÇÁVEL pelo uid do runtime. O corepack não achava o pnpm e o BAIXAVA do registry a cada boot: MEDIDO com `--network none`, o container saía com ExitCode=1 e a stack de produção não subia sem egress para a internet (e o `prisma migrate deploy` roda a CADA restart, então o download acontecia N vezes). Agora o cache é ASSADO no build (`COPY --from=builder` + `ENV COREPACK_HOME=/repo/.corepack`), e o tmpfs do cache do corepack saiu do compose. **#179 (P0)**, o healthcheck do postgres era `pg_isready` SEM `-h` — que connecta pelo SOCKET UNIX, e durante o `initdb` o entrypoint do postgres sobe um servidor TEMPORÁRIO que escuta SÓ no socket: MEDIDO nessa janela, o probe antigo respondia 'accepting connections' (rc=0) e o novo (com `-h 127.0.0.1`) responde 'no response' (rc=2) — o healthcheck mentia, e a `depends_on: service_healthy` liberava a api para um postgres que não aceitava TCP (a api morria com P1001, em crash-loop). **#187**, a imagem prod copiava o `node_modules` INTEIRO do builder: MEDIDO, `/repo/node_modules/.pnpm` tinha 687 MB e 718 pacotes, com `eslint`, `typescript`, `vitest`, `prettier`, `turbo`, `supertest` e `@testcontainers/postgresql` dentro de um container que roda com `read_only` e `cap_drop: ALL`. Agora o stage novo `deps-prod` empacota as `dependencies` com `pnpm deploy --prod`, e a imagem mede **979 MB** (contra 1,27 GB) com **428 MB** de `node_modules` e nenhum devDependency. Nenhuma dependencia nova. |
| `1.37.0` | **A credencial de DONO do banco não chega mais ao processo da api** (minor bump — o PR muda `apps/api`, o banco e a imagem) — a issue #180 fecha o bypass das policies de RLS: o desenho de isolamento se apoia em "o runtime NÃO tem o poder do dono", e a precondição estava violada no processo que expõe a API. MEDIDO: o `env_file` do Compose entregava a URI de dono ao container da api, e o próprio código a lia (`process.env['DIRECT_DATABASE_URL']`), abrindo um `PrismaClient` de SUPERUSER a cada boot — quem conseguisse ler o `env` (SSRF reflexivo, erro que imprima o env, o comprometimento de qualquer dependência da imagem) obteria a credencial que ignora RLS por definição, e com ela TODAS as empresas. O conserto tem TRÊS partes: **(1)** a chave de assinatura passa a ser lida por uma FUNÇÃO `SECURITY DEFINER` (migration `20261126000000_chave_de_assinatura_via_definer`) — a função roda com o poder do dono e devolve UM segredo, e a aplicação nunca vê a senha do dono. ⚠️ (2ª revisão do PR) O papel que LÊ a chave é o de SISTEMA, e o de RUNTIME NÃO PODE: MEDIDO, com `EXECUTE` liberado ao runtime, a escalada era inteira (o runtime lia os 32 bytes do segredo, montava o corpo, assinava com `hmac()` e chamava `criar_membership` — a vítima ganhou `role: owner` numa empresa alheia). A assinatura só tem valor como assinatura de um corpo que a APLICAÇÃO pediu, e o material que só ela tem é a chave — a migration `20261127000000_leitura_da_chave_fora_do_runtime` revoga o `EXECUTE` do runtime; **(2)** o guard de boot (`verificarCredenciaisDoBanco`) passa a RECUSAR a URI de dono no ambiente do processo (fora de `development`, que é onde o CLI do Prisma precisa dela localmente), e a imagem remove a variável do ambiente do Node antes do `exec` (`unset DIRECT_DATABASE_URL` no ENTRYPOINT, depois do `migrate deploy` e do `prepara-papeis.sh`, que precisam dela); **(3)** o harness de teste faz o mesmo (a URI de dono fica VAZIA no ambiente do processo), porque um harness que não implementa a regra treina o boot a aceitar o que a produção recusa. MEDIDO: o `PrismaClient` NÃO exige a `directUrl` em runtime (ela é do CLI), e a integração do onboarding continua verde com a função nova. Nenhuma dependencia nova. |
| `1.38.0` | **A mutação do usuário e o registro da auditoria passam a ser a MESMA transação** (minor bump — o PR muda `apps/api`) — a issue #184: cada escrita fazia DUAS transações (o `userRepo.save` abria uma, e o `auditService.record` abria outra), e a spec do projeto declara “Atomicidade: `prisma.$transaction([opPrincipal, opHistory, opArchive?])` — ou tudo ou nada”. MEDIDO: com a auditoria falhando depois (P2002 no unique `(entity_id, version)`), a linha em `users` SOBREVIVIA (o estado alterado, sem o registro que promete justificar a alteração) e o `users_history` ficava com 1 linha de 2 esperadas. Agora a auditoria VIAJA DENTRO da escrita: o port do usuário ganhou um `auditoria` opcional (o histórico e, no soft-delete, o arquivo), e o adaptador grava as DUAS coisas na transação que a mutação abriu — o rollback da auditoria desfaz a mutação. O caminho COM destino (o onboarding, que grava o usuário dentro da transação de tenancy) fica de fora: o port de tenancy tem a SUA fronteira transacional, e mudar isso é mexer no onboarding — o PR declara essa exceção no código. Instrumento novo: o caso de integração “a falha da auditoria DESFAZ a mutação (o usuário não sobrevive)”, que planta a linha conflitante do histórico e prova que o nome e a versão do usuário ficam como estavam. Nenhuma dependencia nova. |
| `1.39.0` | **O plano das 10 issues do scan de 2026-11-23, e o encerramento das 2 que o `main` já tinha corrigido** (patch bump — doc: nenhum arquivo de `apps/`, `packages/` ou `infra/` mudou) — o plano [`docs/superpowers/plans/2026-11-25-issues-abertas-178-187.md`](./superpowers/plans/2026-11-25-issues-abertas-178-187.md) e o snapshot que o alimenta [`.agents/runs/state-snapshot-20261124T182659Z-issues-178-187.md`](../.agents/runs/state-snapshot-20261124T182659Z-issues-178-187.md). Das 10 issues abertas, **7 ainda valiam** (2 P0 de docker, 1 P1 de RLS, 1 P1 de throttling, 1 P1 de drift do Prisma, 1 P1 de atomicidade e 2 P1 de contrato HTTP) e viraram 6 PRs; **3 não**: a #181 (advisory do `effect`) já estava corrigida pelo override de `effect@3.22.1` (commit `9c6d9efa`) e a #186 (colisão de versão) ficou obsoleta (a branch que colidia não existe mais) — ambas fechadas aqui, com a evidência; e o terceiro achado da #185 (o id malformado do `GET /users/:id/history`) já estava corrigido pelo PR #171. Nenhuma dependencia nova. |
| `1.39.1` | **Três gates que mediam errado saem do buraco** (patch bump — nenhum arquivo de `apps/`, `packages/` ou `infra/` mudou) — o `check-path-alias` passa a resolver o alvo de `compilerOptions.paths` **como o TypeScript resolve** (o alvo é um local de módulo: arquivo, diretório ou padrão com `*`; e com vários destinos basta um resolver, que é o que o TS faz em ordem) e a medir **todos** os tsconfigs do repo, não só o `tsconfig.base.json` — MEDIDO 2026-11-27: **11** tsconfigs (9 com `paths` efetivo), **4** aliases distintos — **23** pares alias×destino, porque o `extends` propaga os mesmos aliases — **0** mortos, e o `"@/*"` do `apps/web` (150 imports `@/…`) resolvido vivo, onde a semântica antiga o acusava como alias morto; o `check-doc-size` deixa de LANÇAR `ENOENT` quando o arquivo está no índice do git e não no disco (diz que não mediu); e o `preflight` roda cada check por `executarCheck`, que transforma um gate que lançou em uma LINHA vermelha. ⚠️ **Duas afirmações da redação anterior foram corrigidas por medição**: o `check-path-alias` **não** media só o `tsconfig.base.json`, e a queda do preflight não derrubava "os outros 56" — o preflight tem 56 checks no TOTAL e o crash ocorreu no **48º** (os 47 anteriores rodaram — 39 ✓ e 3 "– (skipped)" no worktree de medição —, os **8** seguintes não, o resumo final não imprimiu, e o exit foi **2** — o do crash, não 1). Dentes medidos: `check-path-alias` 11 de 20, `check-doc-size` 1 de 15, `preflight.spec` 3 de 43. Nenhuma dependencia nova. |
