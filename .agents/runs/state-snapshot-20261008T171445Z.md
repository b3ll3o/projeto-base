---
name: state-snapshot-ci-local-e2e
demand: ci-local-e2e
created: 2026-10-08T17:14:45Z
state: active
gap_detected: false
specialist_router: monorepo-specialist + test-writer
---

# State Snapshot — `ci:local` não roda nenhuma das duas suítes e2e

> Camada 0 do pre-planner, conforme
> [`state-aware-planning.md`](../specs/conventions/state-aware-planning.md).
> Comando de medição: `pnpm ci:local`, `pnpm turbo run …`, `playwright …` —
> todos na janela 17:04–17:20 UTC de 2026-10-08, nesta máquina.
>
> Demanda: fechar a pendência registrada em
> [`ci-defense-in-depth-pendencias.md`](../specs/conventions/ci-defense-in-depth-pendencias.md)
> — "`ci:local` não roda nenhuma das duas suítes e2e".

## AS-IS — Estado medido

### Estado do repositório

| Item | Valor | Comando |
|---|---|---|
| Working tree | clean | `git status --short` (vazio) |
| Branch | `feat/e2e-playwright-frontend` | `git branch --show-current` |
| `origin/main` | `4b183d4` | `git rev-parse --short origin/main` |
| Commits no branch | 5 | `git rev-list --count origin/main..HEAD` |
| Último commit | `fb797f2` `fix(web): tira o harness e2e do escopo de typecheck do build de produção` | `git log -1 --pretty='%h %an %s'` |
| Tag do template | `v1.10.0` | `git tag --list 'v*' --sort=-v:refname \| head -1` |
| Prisma drift | nenhum — "Database schema is up to date!" | `(cd apps/api && pnpm exec prisma migrate status)` |
| Preflight | 0 erro(s), 2 check(s) skipped | `pnpm ci:preflight` |

### O que `ci:local` roda hoje

```bash
$ node -e "console.log(require('./package.json').scripts['ci:local'])"
pnpm ci:preflight && pnpm turbo run lint typecheck test:unit test:coverage \
  --filter=@projeto/api --filter=@projeto/web
```

Nenhuma menção a `test:integration` nem a `test:e2e`.

### O que o job `quality` do CI roda

`.github/workflows/ci.yml`, job `quality`, na ordem:

```bash
pnpm install --frozen-lockfile
pnpm turbo run db:generate
pnpm turbo run lint typecheck
pnpm turbo run test:coverage test:unit
pnpm turbo run test:integration test:e2e --filter=@projeto/api
pnpm --filter @projeto/web exec playwright install --with-deps chromium
pnpm turbo run test:e2e --filter=@projeto/web
```

`db:generate` e `^build` chegam por `dependsOn` — MEDIDO:
`pnpm turbo run typecheck --filter=@projeto/web --filter=@projeto/api --force --dry=json`
lista `@projeto/api#db:generate`, `@projeto/web#db:generate`,
`@projeto/eslint-config#build`, `@projeto/shared-types#build`,
`@projeto/tsconfig#build`. Ou seja, `ci:local` **já** cobre `db:generate`;
o que ele não cobre são as **duas suítes e2e** e o `playwright install`.

## Custos medidos (2026-10-08, esta máquina)

| Comando | Tempo | Nota |
|---|---|---|
| `pnpm ci:local` (hoje, turbo quente) | **22,6 s** | `9 successful, 9 total` |
| `turbo run test:integration test:e2e --filter=@projeto/api` | **30,2 s** | 29 + 23 testes |
| `apps/web`: `playwright test` | **51,3 s** | `build concluído em 33,4s`; 19 testes |
| `turbo run test:integration test:e2e` (**sem** filtro) | **56,5 s** | os três em paralelo |
| `playwright install chromium` (browser presente) | **0,92 s** | no-op; mtime do cache não muda |
| `playwright install chromium` (cache vazia) | **36,4 s** / 641 MB | instala `chromium-1223` **e** `chromium_headless_shell-1223` |
| job `quality` no CI (run `37812900087`) | **2m17s** | 19 passed (48,9s) |

**Consequência de projeto que a pendência não tinha medido:** rodar os três
concorrentes custa **56,5 s**, e não os 82 s da soma sequencial — o turbo
paraleliza. Isso muda o que "colocar e2e em todo push" significa: `ci:local`
vai de 22,6 s para ~79 s, não para ~105 s.

## Gaps detectados

### G-001 — `ci:local` não roda nenhuma das duas suítes e2e
- **severidade**: major
- **categoria**: lacuna de verificação
- **arquivos**: `package.json:22`, `.github/workflows/ci.yml:120-128`
- **rationale**: o CI roda `test:integration`, `test:e2e` da API e `test:e2e`
  do web; o gate local não roda nenhum dos três. Defeito de integração e de UI
  só aparecem no `quality`, 2m17s depois do push.
- **fonte**: pendência registrada em `ci-defense-in-depth-pendencias.md`,
  e medição de 2026-10-08 acima.

### G-002 — `git-workflow.md` afirma o que o script não faz (2ª ocorrência)
- **severidade**: major
- **categoria**: claim falsa (guard-classes §classe 3)
- **arquivo**: `.agents/specs/conventions/git-workflow.md:274`
- **rationale**: o texto diz que `ci:local` "executa as **mesmas validações que
  o CI roda** em ~30-60s localmente". MEDIDO: hoje ele não roda as três suítes
  e2e, e leva 22,6 s — o "~30-60s" só bate por acidente. `ci-defense-in-depth.md`
  §Camada 1 **já foi corrigido** para declarar a ausência; este segundo doc
  continua afirmando o contrário. São duas convenções discordando sobre o mesmo
  comando, e nenhuma das duas é verificada por nada.
- **fonte**: leitura + medição de 2026-10-08.

### G-003 — o `playwright install` só existe no CI, e a ausência custa 43 s
- **severidade**: major
- **categoria**: falha pelo motivo errado (guard-classes §classe 2)
- **arquivo**: `apps/web/e2e/global-setup.ts:132` (o `next build`)
- **rationale**: `grep -rn "playwright install" --include=*.md --include=*.json
  --include=*.yml .` devolve **3** linhas — o passo do `ci.yml` e a linha do
  `docs/fluxo-desenvolvimento.md` que o descreve. **Nenhum** comando local,
  nenhum README, nenhum `postinstall`. MEDIDO, com
  `PLAYWRIGHT_BROWSERS_PATH` apontando para um diretório vazio: a suíte sobe
  Postgres, sobe a API, roda o `next build` (**33,5 s**), sobe o Next — e só
  então o **primeiro** teste falha com `browserType.launch: Executable doesn't
  exist at …/chromium_headless_shell-1223/…`. Tempo total até o erro:
  **43,4 s**, com o setup inteiro registrado como "pronto em 39,9 s".
- **contrafactual medido**: depois de `playwright install chromium` com a
  mesma variável de ambiente, os mesmos 3 testes passam (42,6 s).

### G-004 — nada reconcilia o `ci:local` com o `ci.yml`
- **severidade**: minor
- **categoria**: guard que pode não disparar
- **rationale**: `check-package-json-drift.ts` só exige que `ci:local`
  **exista** (`REQUIRED_SCRIPTS`, linha 19) — nunca lê o conteúdo. Um gate de
  reconciliação com o `ci.yml` exigiria parsear YAML, e a pendência "Nenhum
  tooling lê `.github/workflows/ci.yml`" (mesmo arquivo, primeiro item) já
  declara isso fora de escopo por decisão. **O que este change fecha é a
  instância, com um gate estreito que lê só o `package.json`**; a classe
  (drift entre `ci:local` e o `ci.yml`) continua registrada como pendência.
- **fonte**: leitura de `check-package-json-drift.ts` + a pendência já aberta.

`gap_blocker: false` — nenhum gap tem severidade `blocker`; `proceed: true`.

## Contradição que o TO-BE precisa resolver

Duas convenções, dois contratos para o mesmo comando:

| Doc | Afirma |
|---|---|
| `git-workflow.md:274` | "executa as **mesmas validações que o CI roda** em ~30-60s" |
| `ci-defense-in-depth.md:23-27` | "roda a Camada 2 mais lint, typecheck, unit e cobertura. ⚠️ **Não** roda `test:e2e` (API nem frontend)" |

Só uma das duas pode estar certa depois do conserto. A escolha que fecha a
pendência é tornar a primeira verdadeira — porque enfraquecer mais a prosa foi
exatamente o que criou a pendência: três ressalvas em vez de um script que
faz o que o doc promete.