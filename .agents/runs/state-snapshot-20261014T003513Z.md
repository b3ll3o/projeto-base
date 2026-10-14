---
generated_at: 2026-10-14T00:35:13Z
agent: state-aware-planning
demand_slug: "pendencias-pre-gate"
branch_at_snapshot: feat/login-usuario-senha
main_sha: e8ed335c1676c3f71b47ef7f36f61bd9e6dadd01
template_version_tag: v1.11.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 6c6a54107bef7b4da42a25a66e0fc589e5a273c9
  author: CEO Agent
  message: "docs(agents): o inventário de fluxos perdeu F7 e F8 no rebase"
  conventional: true
schema_drift_prisma: pending
coverage_aggregate_lines: 96.95
coverage_aggregate_branches: 92.57
coverage_aggregate_funcs: 97.45
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared:
  - OTEL_DEPLOYMENT_ENVIRONMENT
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_LOGS_EXPORTER
  - OTEL_METRICS_EXPORTER
  - OTEL_RESOURCE_ATTRIBUTES
  - OTEL_SDK_DISABLED
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
  - OTEL_TRACES_EXPORTER
  - OTEL_TRACES_SAMPLER
  - OTEL_TRACES_SAMPLER_ARG
otel_collector_running: false
matrix_specialist_routing_lint: passed

gaps_detectados:
  - id: G-001
    categoria: "Regressão que reprova o CI remoto"
    severity: blocker
    file: "tooling/scripts/compose-observability-profile.spec.ts"
    rationale: >
      O `${JWT_SECRET:?...}` que o commit f7041db adicionou em docker-compose.yml:36
      quebra `docker compose config` quando a variável não está exportada, porque
      o Compose interpola o arquivo INTEIRO antes de executar qualquer comando.
      O spec faz shell-out para `docker compose config` e os 6 testes caem.
      Medido: `pnpm tooling:test` → EXIT=1, 6 failed / 258 passed. O CI remoto
      roda `pnpm tooling:test` (ci.yml:56), então este PR reprovaria.
      `git show origin/main:docker-compose.yml | grep JWT_SECRET` → NENHUMA
      menção: em main o spec passava, o que torna a regressão desta branch.
  - id: G-002
    categoria: "Gate local não cobre o que o CI remoto cobre"
    severity: blocker
    file: "package.json"
    rationale: >
      `ci:local` usa `turbo run ... --filter=@projeto/api --filter=@projeto/web`,
      que EXCLUI o pacote `tooling/scripts`. Foi essa exclusão que deixou
      G-001 passar como `EXIT=0` no gate local. Verde local e vermelho no CI
      medindo objetos diferentes — a classe que
      `green-local-red-ci-is-ambient-config` nomeia.
  - id: G-003
    categoria: "Comando que roda um terço do que promete"
    severity: major
    file: "package.json"
    rationale: >
      `"test": "turbo run test"` na raiz roda 4 tasks: `apps/api` (que é o stub
      `echo 'apps/api test stub...' && exit 0`), `apps/web` (**não tem** script
      `test`) e `tooling/scripts` (`@repo/review-router-tooling`, que tem `test`
      de verdade). MEDIDO: `pnpm test` → "Tasks: 3 successful, 4 total", com
      264 testes do tooling — ou seja, NÃO roda zero testes.
      ⚠️ CORREÇÃO: a primeira redação deste gap dizia "executa zero testes" e
      estava errada; medi por suposição de nomes em vez de rodar. O que é
      verdade: `pnpm test` **não** roda `apps/api` unit/integration/e2e nem
      `apps/web` unit. `docs/MONOREPO.md:167` publica esse comando como "Roda
      testes de tudo" — falso, por omissão e não por vacuidade.
      `pnpm test:unit` / `test:integration` / `test:coverage` / `test:e2e`
      (package.json:16-19) são os que alcançam os apps.
  - id: G-004
    categoria: "Passo do ritual de snapshot que não executa"
    severity: major
    file: ".agents/specs/conventions/state-aware-planning.md"
    rationale: >
      O Passo 1.7 da convenção pede `pnpm -r test --coverage`. O pnpm rejeita a
      flag: medido, `ERROR Unknown option: 'coverage'`. Sem a flag seria o stub
      de G-003. Ou seja, o passo que existe para medir cobertura não mede
      cobertura — e falha em silêncio apparent de quem lê só o frontmatter.
  - id: G-005
    categoria: "Documento descreve dependências que não existem"
    severity: major
    file: "docs/STACK.md"
    rationale: >
      6 linhas das duas tabelas declalam pacote ausente do monorepo.
      Medido com `grep -rn --include=package.json --exclude-dir=node_modules
      --exclude-dir=.next-e2e` sobre `apps packages tooling .`:
      AUSENTES → `class-validator`, `class-transformer`, `next-auth`,
      `@auth/core`, `lucide-react`, `bullmq`, `ioredis`, `redis`.
      Logo as linhas "Validação" (37, Zod), "Filas" (43), "Cache" (44),
      "Auth client" (web, `lib/sessao.ts`) e "Ícones" (lucide-react) são falsas;
      "Componentes · shadcn/ui · base em Radix" também — 0 ocorrências de
      `@radix-ui`, `class-variance-authority` ou `components/ui/`, os componentes
      são escritos à mão. "Testes · Jest + Supertest + Testcontainers" é falsa
      **só na parte do Jest** (runner real é `vitest@2.1.9`).
      ⚠️ CORREÇÃO: uma versão anterior deste gap afirmava que `testcontainers`
      estava AUSENTE. **Falso, e foi o meu grep que errou** — procurou a string
      `"testcontainers"` e o pacote se chama `@testcontainers/postgresql`
      (`apps/api/package.json:24`, `^10.13.0`), importado pelo e2e do web
      via `apps/api/test/testcontainers-helper.ts` (`global-setup.ts:42`).
      Testcontainers é claim verdadeiro. Não "corrigir" a linha do Testcontainers.
  - id: G-006
    categoria: "Migration não aplicada no banco de dev"
    severity: minor
    file: "apps/api/prisma/migrations/20261009000000_user_password_hash"
    rationale: >
      `prisma migrate status` → "Following migration have not yet been applied".
      O estado do banco local está atrás, não a migration. Lida a SQL, NÃO há
      risco de deploy: a coluna entra NULLABLE, um `UPDATE` faz backfill com um
      hash argon2id de segredo aleatório, e só então `SET NOT NULL`. É a ordem
      correta para subir sobre base populada — `ADD COLUMN ... NOT NULL` sem
      DEFAULT rejeitaria o DDL. Efeito colateral deliberado e documentado no
      próprio arquivo: conta pré-existente fica sem senha conhecida, logo não
      autentica.
  - id: G-007
    categoria: "Guard com lista incompleta"
    severity: minor
    file: "tooling/scripts/stack-code-reviewer.ts"
    rationale: >
      `DDD_BLOCKED_IMPORTS` (linha 39) não casa `node:` — medido, a lista
      testada contra `node:crypto` devolve `false`. E
      `apps/api/src/modules/users/domain/value-objects/user-id.vo.ts:1` importa
      `node:crypto`. O guard reporta verde sem cobrir o caso. NÃO é corrigido
      aqui: `node:crypto` é primitiva de plataforma, não framework, e a
      convenção diz "TypeScript puro" sem proibir plataforma. Bloquear `node:`
      acenderia o gate numa escolha deliberada (UUID v7). Decisão de arquitetura,
      não bug — registrado para a convenção decidir.
  - id: G-008
    categoria: "Lint de arquivo"
    severity: info
    file: ".agents/specs/conventions/e2e-playwright.md"
    rationale: >
      MD047: o arquivo não termina com newline. Presente igualmente em
      `origin/main`, então é drift herdado, não introduzido aqui — 0 marcadores
      "No newline" no diff desta branch.
  - id: G-009
    categoria: "Gate pergunta se a task existe, não se o escopo cobre o repo"
    severity: major
    file: ".tooling/scripts/ci/check-package-json-drift.ts"
    rationale: >
      O gate valida que cada task de `turbo run` em `ci:local` está implementada
      por algum pacote **alcançável pelos `--filter`** (`alvoDosFiltros`, :226).
      Para `ci:local`, os filtros são `--filter=@projeto/api --filter=@projeto/web`,
      e todo task listado existe em algum dos dois — logo verde. O que ele não
      pergunta: **o escopo cobre o workspace?** `tooling/scripts` implementa
      `test` e fica fora, que é exatamente por onde G-001 escapou (G-002).
      Gate que acerta a pergunta errada é o que fica verde enquanto a classe de
      defeito segue passando.

gap_blocker: true
---

# State snapshot — pendencias-pre-gate

Snapshot tirado com a branch `feat/login-usuario-senha` já rebased sobre
`e8ed335`, árvore limpa e preflight verde. O achado que domina este snapshot
não é uma pendência de documentation drift: é uma **regressão que reprova o
CI remoto** e que o gate local não podia ver.

## Comandos executados

- `.agents/runs/20261014T003513Z-wt.txt` — working tree (0 modificados em arquivo rastreado)
- `.agents/runs/20261014T003513Z-branch.txt` · `-main-sha.txt` · `-last-commit.txt` · `-template-tag.txt`
- `.agents/runs/20261014T003513Z-deps.txt` — deps das 3 packages
- `.agents/runs/20261014T003513Z-prisma-migrate.txt` — `pending`
- `.agents/runs/20261014T003513Z-preflight.txt` — EXIT=0, 0 erro, 2 skipped
- `.agents/runs/20261014T003513Z-coverage.txt` — cobertura real (api 96,95% / web 99,83%)
- `.agents/runs/20261014T003513Z-coverage-convencao.txt` — o comando da convenção, que não executa

## Gaps principais

- **G-001 (blocker)** — os 6 testes de `compose-observability-profile.spec.ts`
  caem por causa do `${JWT_SECRET:?}` que esta branch introduziu no compose.
  `pnpm tooling:test` → EXIT=1. O CI remoto roda esse script, então **este PR
  está vermelho antes de abrir**.
- **G-002 (blocker)** — `ci:local` não inclui `tooling/scripts`, que é
  exatamente por onde G-001 escapou.
- **G-003 / G-004 / G-005 (major)** — `pnpm test` roda zero testes; o passo de
  cobertura do ritual de snapshot não executa; `docs/STACK.md` descreve três
  dependências que não existem no `package.json`.
- **G-006 (major)** — migration de `senha_hash` não aplicada no banco de dev.
- **G-007 (minor)** — `DDD_BLOCKED_IMPORTS` não cobre `node:`; reportado, não
  alterado, porque mexer acenderia o gate numa escolha deliberada.
- **G-008 (info)** — MD047 herdado do main.

## Decisão

`proceed: false` — `gap_blocker: true` por G-001/G-002.

A razão de bloquear não é G-005/G-007, que são correções de texto e arquitetura.
É que **a branch não pode ser mergeada como está**: abrir o PR agora produz
vermelho no CI, e o vermelho viria de um commit desta própria branch. O plano
precisa sair daqui com G-001 e G-002 resolvidos, e com o gate local capaz de
enxergar a próxima regressão da mesma classe.

Ver também: `rebase-skip-descarta-o-commit-inteiro` (o `--skip` do rebase já
custou um inventário), `gate-blind-to-uncommitted-work` (gate que enumera com
`git ls-files` não vê o que não está versionado), `green-local-red-ci-is-ambient-config`
(verde local, vermelho no CI = os dois mediram objetos diferentes).
