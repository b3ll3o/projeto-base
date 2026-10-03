---
name: melhorias-fluxo-fase-2-p1-enforcement-part-04
description: Fase 2 (P1 enforcement) parte 4 — 2 tasks: remover as 4 tasks orfas do turbo.json (tdd:check, ci:quality, stack:review, docs:sync) que davam falso verde, e ligar os 6 specs orfas de .tooling/scripts/ci corrigindo os 3 vermelhos. Fecha a Fase 2.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-20261003T154334Z.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-03.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-05.md
---

# Fase 2 (P1 enforcement) — Parte 4: remover falsos verdes e fechar a fase

> **Pré-requisito:** [F2-P1-P03](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-03.md) completa.
> **Inventário dos 98 (consulta):** [F2-P1-P05](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-05.md)
> **Agente responsável:** `stack-code-reviewer` (review) · `test-writer` (RED dos specs).

---

## F2-T7 — Remover as 4 tasks órfãs do `turbo.json`

**Arquivos tocados**

- Modify: `turbo.json:17-23` (4 entradas de `tasks`)

**Contexto verificado.** Nenhum pacote do workspace implementa `tdd:check`,
`stack:review`, `docs:sync` ou `ci:quality`. Verificado por varredura de
`apps/*/package.json`, `packages/*/package.json` e `tooling/scripts/package.json`
(o workspace é `apps/*`, `packages/*`, `tooling/*` — `pnpm-workspace.yaml`):
**saída vazia**. O próprio `check-turbo-drift.ts:32-34` admite o limite:
*"Não detecta tasks 'órfãs' sem `dependsOn` e não consumidas por ninguém
(precisaria de análise de grafo; fora de escopo deste check estrutural)."*

O turbo materializa `tdd:check` **pelo `dependsOn` herdado** e reporta sucesso
(`out=$(pnpm tdd:check 2>&1); st=$?; printf '%s\n' "$out" | tail -4; echo "EXIT=$st"`):

```text
 Tasks:    2 successful, 2 total
Cached:    2 cached, 2 total
  Time:    37ms >>> FULL TURBO
EXIT=0
```

As 2 tasks executadas são ambas `test:unit`. Quem cumpre o ritual Red→Green→Refactor
digita `pnpm tdd:check`, recebe exit 0 e conclui que o TDD foi validado.
**Não é lento: é silenciosamente inútil, que é pior.** Baseline **B9**.

**Por que remover em vez de implementar.** O histórico é squash-merge:
`git show --stat 5490de6` mostra **1** commit com 5 arquivos `*.spec.ts` **e** a
implementação. Um gate que exige "commit de teste falhando antes do de
implementação" não tem o que inspecionar — RED e GREEN vivem no mesmo commit por
construção. TDD é garantido pelo agent `tdd-enforcer` (`.agents/specs/conventions/tdd.md`),
não por gate de `git log`.

**Por que remover SÓ do `turbo.json`.** Estes 3 locais são load-bearing — mexer
em qualquer um quebra o preflight, e portanto **todo push** (`.husky/pre-push:9`,
`exit 1`) e o **job `preflight` do CI** (`.github/workflows/ci.yml:32`):
`package.json:20` (o script raiz), `check-package-json-drift.ts:20`
(`REQUIRED_SCRIPTS` inclui `'tdd:check'`), invocado por `preflight.ts:86`.

Removendo **apenas** a *task* do turbo, o comando passa a falhar alto e honesto:

```bash
out=$(pnpm turbo run nonexistent-task-xyz 2>&1); st=$?
printf '%s\n' "$out" | grep -c 'Missing tasks in project'; echo "EXIT=$st"
```

→ `1` e `EXIT=1` (já medido hoje com uma task fictícia). É o estado honesto:
um comando que não existe diz que não existe.

**Passos**

1. Em `turbo.json`, remover 4 entradas de `tasks`:
   - `tdd:check` (`:17`) — `"tdd:check": { "dependsOn": ["test:unit"], "outputs": [] }`
   - `stack:review` (`:18`) — `"stack:review": { "cache": false }`
   - `docs:sync` (`:19`) — `"docs:sync": { "cache": false }`
   - `ci:quality` (`:20-23`) — `dependsOn: ["tdd:check","stack:review","docs:sync"]`
     (remover o bloco inteiro tira também a única referência interna a
     `tdd:check`, de modo que `grep -c '"tdd:check"' turbo.json` cai para `0`)

   Manter: `build`, `dev`, `lint`, `db:generate`, `typecheck`, `test`,
   `test:unit`, `test:coverage`, `test:integration`, `test:e2e`, `clean`.

   > **Correção sobre a v1.0.0:** ela afirmava que o `turbo.json` "não é JSON
   > puro, tem trailing comma" e que `JSON.parse` nele falharia. **Falso** —
   > `python3 -c "import json;json.load(open('turbo.json'))"` passa hoje, e
   > `check-turbo-drift.ts:55` faz `JSON.parse` sem reclamar. Validar com
   > `pnpm turbo run lint` **e** com o próprio `checkTurboDrift`, que tem
   > regras que o parser não tem (`:63-71` `$schema`, `:76` nome de task,
   > `:85` `cache:false` com `outputs`).

2. **Não** remover os scripts raiz `stack:review` (`package.json:23`) e
   `docs:sync` (`package.json:24`) — são reais, funcionais, e é assim que
   `.husky/pre-commit:19,25` os invoca. Remove-se só a *task* do turbo.

3. Verificar que nada quebra:

   ```bash
   out=$(pnpm tdd:check 2>&1); st=$?
   printf '%s\n' "$out" | grep -c 'Missing tasks in project'; echo "EXIT=$st"
   out=$(pnpm ci:preflight 2>&1)
   printf '%s\n' "$out" | grep -cE 'turbo.json drift \(pipeline.*✓|package.json drift \(scripts.*✓'
   ```

   **Output esperado:** `1` e `EXIT=1`; e `2` — o script raiz continua
   existindo, só a task sumiu, então `REQUIRED_SCRIPTS` continua satisfeito.

4. Commit:

   ```bash
   git add turbo.json
   git commit -m "refactor(turbo): remove 4 tasks orfas (tdd:check, ci:quality, stack:review, docs:sync)

   Nenhum pacote do workspace implementa esses scripts (varredura de
   apps/*, packages/* e tooling/scripts/package.json: saida vazia). O turbo
   materializava tdd:check pelo dependsOn herdado ['test:unit'] e imprimia
   '2 successful / 2 cached / 2 total >>> FULL TURBO' — quem cumpre o
   ritual do TDD recebia exit 0 e concluia que o TDD tinha sido validado.
   Nao e lento: e silenciosamente inutil.

   Remove SO do turbo.json. package.json:20 e REQUIRED_SCRIPTS
   (check-package-json-drift.ts:20) ficam intactos: sao load-bearing para
   .husky/pre-push e para o job preflight do CI. Resultado: 'pnpm tdd:check'
   passa a falhar alto, que e o estado honesto.

   Nao implementar gate de git log: o historico e squash-merge
   (git show --stat 5490de6 = 1 commit com spec + implementacao), entao
   RED e GREEN vivem no mesmo commit por construcao.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c '"tdd:check"' turbo.json
out=$(pnpm tdd:check 2>&1); st=$?; printf '%s\n' "$out" | grep -c 'Missing tasks in project'; echo "EXIT=$st"
```

**Output esperado:** `0` e `1` / `EXIT=1`.
Baseline **B9**: `FULL TURBO` → `Missing tasks in project`.

**Gate que valida:** `.husky/pre-push` e o job `preflight` do CI — é o que
garante que `REQUIRED_SCRIPTS` continua consistente com `package.json`.

---

## F2-T8 — Ligar os 6 specs órfãos de `.tooling/scripts/ci/` e consertar os 3 vermelhos

**Arquivos tocados**

- Modify: `package.json:30` (`tooling:test`)
- Modify: `.tooling/scripts/ci/preflight.spec.ts:6` (`FIXTURES`) e `:9-33` (`beforeAll`)
- Modify: `.github/workflows/ci.yml` (job `preflight`, ao lado de `:32`)

**Contexto verificado — dívida antiga, não regressão desta fase.**

```bash
ls .tooling/scripts/ci/*.spec.ts | wc -l                              # 6
npx vitest run --root tooling/scripts 2>&1 | tail -3                  # 10 passed / 150 passed
npx vitest run --root .tooling/scripts/ci 2>&1 | tail -3              # 1 failed | 5 passed / 3 failed | 26 passed
```

`pnpm tooling:test` é `vitest run --root tooling/scripts` (`package.json:30`)
e **exclui** `.tooling/`. Os 6 specs de `.tooling/scripts/ci/` nunca rodam em
hook nem em CI — foi assim que `preflight.spec.ts` ficou com 3 testes vermelhos
sem ninguém perceber. Baseline **B8**.

Os 3 vermelhos são **um só bug**: o `beforeAll` (`preflight.spec.ts:9-33`) cria
só `docs-ok`, `docs-broken-ref` e `docs-external-links`, mas 3 testes
referenciam `docs-fenced-block`, `docs-inline-code` e `docs-mixed`:

```text
AssertionError: expected 'docsRoot '/tmp/ci-fixtures/docs-mixe…' to match /real-broken/
+ Received: "docsRoot '/tmp/ci-fixtures/docs-mixed' não existe ou não é acessível: …ENOENT…"
```

**Passos**

1. **RED (confirmar o estado)**:

   ```bash
   out=$(npx vitest run --root .tooling/scripts/ci 2>&1); st=$?
   printf '%s\n' "$out" | tail -3; echo "EXIT=$st"
   ```

   **Output medido hoje:** `Tests 3 failed | 26 passed (29)` e `EXIT=1`.

2. **GREEN (1) — isolar o diretório de fixtures.** Hoje é `/tmp/ci-fixtures`
   (`:6`), compartilhado e vulnerável a leftover de outra execução:

   ```ts
   import * as os from 'node:os';
   const FIXTURES = path.join(os.tmpdir(), 'ci-fixtures-check-doc-refs');
   ```

3. **GREEN (2) — criar os 3 fixtures faltantes** no `beforeAll`:

   ```ts
   await fs.mkdir(path.join(FIXTURES, 'docs-fenced-block'), { recursive: true });
   await fs.writeFile(path.join(FIXTURES, 'docs-fenced-block/guia.md'),
     '# Guia\n\n```ts\nconst x = [a](b);\n```\n\nVeja [intro](intro.md).\n');
   await fs.writeFile(path.join(FIXTURES, 'docs-fenced-block/intro.md'), '# Intro\n');

   await fs.mkdir(path.join(FIXTURES, 'docs-inline-code'), { recursive: true });
   await fs.writeFile(path.join(FIXTURES, 'docs-inline-code/guia.md'),
     '# Guia\n\nVeja [`intro.md`](intro.md) para começar.\n');
   await fs.writeFile(path.join(FIXTURES, 'docs-inline-code/intro.md'), '# Intro\n');

   await fs.mkdir(path.join(FIXTURES, 'docs-mixed'), { recursive: true });
   await fs.writeFile(path.join(FIXTURES, 'docs-mixed/guia.md'),
     '# Guia\n\n```\n[a](b)\n```\n\nVeja [real-broken](nao-existe.md).\n');
   ```

4. **Ligar ao `tooling:test`** e **ao CI** — 1 linha em cada arquivo, que é o
   que transforma teste em barreira:

   ```json
   // package.json:30
   "tooling:test": "vitest run --root tooling/scripts && vitest run --root .tooling/scripts/ci",

   # .github/workflows/ci.yml, job preflight, ao lado de :32
   # - run: pnpm tooling:test
   ```

   > `docs-inline-code` é criado **aqui**, e o teste de §F2-T1 usa um fixture
   > **separado** (`docs-inline-code-label`) de propósito: se dividissem o
   > diretório, a ordem de criação viraria dependência entre tasks.

5. **Verificar:**

   ```bash
   out=$(npx vitest run --root .tooling/scripts/ci 2>&1); st=$?
   printf '%s\n' "$out" | tail -3; echo "CI_EXIT=$st"
   out=$(pnpm tooling:test 2>&1); st=$?
   printf '%s\n' "$out" | tail -3; echo "TOOLING_EXIT=$st"
   ```

   **Output esperado:** `6 passed (6)` · `32 passed (32)` / `CI_EXIT=0` (os 29
   de hoje + os 3 que §F2-T1 e §F2-T2 adicionam) e `16 passed (16)` ·
   `185 passed (185)` / `TOOLING_EXIT=0` (`153` de `tooling/scripts` — 150 + 3
   de §F2-T6 — mais `32`).

6. **2 commits atômicos** (fix de fixture e wiring são independentes):

   ```bash
   git add .tooling/scripts/ci/preflight.spec.ts
   git commit -m "test(ci): corrige 3 specs vermelhos em .tooling/scripts/ci

   O beforeAll criava so 3 dos 6 fixtures referenciados (docs-fenced-block,
   docs-inline-code, docs-mixed) — os 3 testes que os usam falhavam com
   ENOENT. Isola FIXTURES por suite (/tmp/ci-fixtures compartilhado era
   vulneravel a leftover de outra execucao).

   Co-Authored-By: Claude Code <noreply@anthropic.com>"

   git add package.json .github/workflows/ci.yml
   git commit -m "test(ci): liga .tooling/scripts/ci ao tooling:test e ao job preflight

   'tooling:test' usava --root tooling/scripts, que exclui .tooling/:
   6 arquivos de spec / 29 testes nunca rodavam em hook nem em CI. Adiciona ao
   job preflight do CI (1 linha) — e o que transforma a suite em barreira em
   vez de relatorio.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
out=$(pnpm tooling:test 2>&1); st=$?
printf '%s\n' "$out" | tail -3; echo "EXIT=$st"
```

**Output esperado:** `16 passed (16)` · `185 passed (185)` e `EXIT=0`.
Baselines **B7** (`10 files / 150 tests` → `16 / 185`) e **B8** (`3 failed` → `0`).

**Gate que valida:** a própria suíte (`pnpm tooling:test`) + o job `preflight`
do CI, a partir do passo 4.

---

## Critério de saída da Fase 2

```bash
out=$(pnpm ci:preflight 2>&1); st=$?; echo "PREFLIGHT_EXIT=$st"
out=$(pnpm tooling:test 2>&1); st=$?; echo "TOOLING_EXIT=$st"
out=$(pnpm turbo run lint typecheck 2>&1); st=$?; echo "LINT_EXIT=$st"
bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -cE '^✓ F2-'
```

**Output esperado:** os 3 `EXIT=0` e `8` — as **8** tasks da Fase 2
(F2-T1 … F2-T8), uma linha `✓` cada.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
