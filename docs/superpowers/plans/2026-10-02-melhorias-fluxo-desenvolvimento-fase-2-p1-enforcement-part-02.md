---
name: melhorias-fluxo-fase-2-p1-enforcement-part-02
description: Fase 2 (P1 enforcement) parte 2 — 2 tasks: renomear apps/api/.eslintrc.js para eslint.config.mjs (e tirar a allowlist no mesmo commit) e corrigir os 7 erros de lint que o ESLint real passa a enxergar.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-20261003T154334Z.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-01.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-03.md
---

# Fase 2 (P1 enforcement) — Parte 2: o linter do backend passa a existir

> **Pré-requisito:** [F2-P1-P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-01.md) completa.
> **Próxima parte:** [F2-P1-P03](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-03.md)
> **Agente responsável:** `stack-code-reviewer` (review) · `test-writer` (RED dos specs).
> **⚠️ Ordem obrigatória: §F2-T3 (rename) → §F2-T4 (7 erros).** O rename é o
> que torna `eslint .` executável. Sem ele, §F2-T4 não tem como medir o
> baseline, e §F2-T5 (§F2-P03) ligaria um script que sai com
> *"couldn't find an eslint.config.\*".
> **O duplo gate que hoje esconde o `apps/api`:** o arquivo `apps/api/.eslintrc.js`
tem **conteúdo de flat config** (array `export default [...]`) mas o **nome
legado** que o ESLint 9 recusa. E o próprio `preflight` o esconde: a allowlist
`['api/.eslintrc.js']` em `preflight.ts:74` foi adicionada com o comentário
*"é convenção NestJS válida (escopo fora deste plano)"* — mas ela **não** é
válida, é exatamente o drift que o próprio check existe para acusar.

---

## F2-T3 — Renomear `.eslintrc.js` → `eslint.config.mjs` e fechar a allowlist

**Arquivos tocados**

- Rename: `apps/api/.eslintrc.js` → `apps/api/eslint.config.mjs`
- Modify: `.tooling/scripts/ci/preflight.ts:70-74` (allowlist + comentário)

**Contexto verificado.** Sem o `--config`, o ESLint 9 aborta antes de analisar
qualquer arquivo:

```bash
cd apps/api && npx eslint .; echo "EXIT=$?"
```

```text
ESLint: 9.39.5
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
EXIT=2
```

E forçando o carregamento manual, a config funciona — provando que o problema
é **só** o nome:

```bash
cd apps/api && npx eslint . --config ./.eslintrc.js 2>&1 | tail -2
```

```text
✖ 11 problems (7 errors, 4 warnings)
```

`apps/web` já usa o nome certo (`apps/web/eslint.config.mjs`) com o mesmo
conteúdo — espelhar.

**Passos**

1. **RED (linha de base)** — o `ls` falha:

   ```bash
   ls apps/api/eslint.config.mjs; echo "EXIT=$?"
   ```

   **Output esperado:** `ls: cannot access …: No such file or directory` e
   `EXIT=2` (`ls` devolve **2** para arquivo ausente, não 1).

2. **GREEN** — `git mv` (preserva histórico; `mv` + `git add` também serve):

   ```bash
   git mv apps/api/.eslintrc.js apps/api/eslint.config.mjs
   ```

   O conteúdo **não muda**. O comentário da `:2` que diz `// Fase 2-3
   overrides` precisa sair junto: é o marcador do stub que §F2-T4 elimina.

3. **Fechar a allowlist no MESMO commit** — `.tooling/scripts/ci/preflight.ts:70-74`:

   ```diff
   -    // `apps/api/.eslintrc.js` é convenção NestJS válida (escopo fora deste plano).
   -    // Migrar NestJS para flat config é decisão separada; por ora allowlist.
        {
          name: 'ESLint config drift (apps)',
   -      fn: () => checkEslintDrift({ appsRoot: 'apps', allowlist: ['api/.eslintrc.js'] }),
   +      fn: () => checkEslintDrift({ appsRoot: 'apps', allowlist: [] }),
        },
   ```

   > **Os dois no mesmo commit.** A ordem importa: arquivo renomeado com a
   > allowlist ainda ativa deixa o gate verde sem verificar nada; allowlist
   > removida com o arquivo ainda no nome legado deixa o preflight vermelho.
   > Não existe estado intermediário verde — como em §F2-T1/§F2-T2.

4. **Verificar:**

   ```bash
   out=$(pnpm ci:preflight 2>&1); st=$?
   printf '%s\n' "$out" | grep -E 'ESLint config drift|Cross-refs'; echo "EXIT=$st"
   cd apps/api && npx eslint . 2>&1 | tail -2; echo "ESLINT_EXIT=$?"
   ```

   **Output esperado:** `ESLint config drift (apps)... ✓` e
   `11 problems (7 errors, 4 warnings)`. O preflight segue **vermelho** por
   causa dos 2 links de §F1 — isso é esperado até §F2-T2.

5. **Commit:**

   ```bash
   git add -A apps/api .tooling/scripts/ci/preflight.ts
   git commit -m "fix(ci): eslint.config.mjs no apps/api + allowlist do drift fechada

   apps/api/.eslintrc.js tinha CONTEUDO de flat config (export default [...])
   mas o NOME legado que o ESLint 9 nao carrega. Sem --config, 'eslint .'
   aborta com exit 2 e nao analisa um unico arquivo. apps/web ja usa
   eslint.config.mjs com o mesmo formato — espelha.

   Junto, remove a allowlist ['api/.eslintrc.js'] do checkEslintDrift
   (preflight.ts:74). O comentario dizia 'convencao NestJS valida': nao e.
   Era exatamente o drift que o check existe para acusar — e enquanto a
   excecao existia, o unico app sem lint do monorepo ficava invisivel.

   Renomear e fechar a allowlist no mesmo commit por necessidade: nao ha
   estado intermediario verde.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
ls apps/api/eslint.config.mjs >/dev/null 2>&1; echo "EXIT=$?"
grep -c "allowlist: \['api/.eslintrc.js'\]" .tooling/scripts/ci/preflight.ts
```

**Output esperado:** `0` e `0`. Hoje os mesmos comandos devolvem `2` e `1`.

**Gate que valida:** `check-eslint-drift.spec.ts` (5 testes, já roda em §F2-T8)
e o job `preflight`.

---

## F2-T4 — Corrigir os 7 erros de lint do `apps/api` (6 arquivos)

**Arquivos tocados**

- Modify: `apps/api/src/modules/users/domain/user.aggregate.spec.ts:12-13`
- Modify: `apps/api/src/modules/users/application/user-use-cases.spec.ts:14`
- Modify: `apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts:69`
- Modify: `apps/api/src/shared/infrastructure/http/global-exception.filter.spec.ts:17`
- Modify: `apps/api/src/shared/infrastructure/http/zod-validation.pipe.ts:19`
- Modify: `apps/api/src/main.spec.ts:17`
- Modify: `packages/eslint-config/index.js` (`argsIgnorePattern`)
- Modify (auto `--fix`): `apps/api/scripts/export-openapi.ts:71,76` ·
  `apps/api/src/main.ts:54` · `apps/api/src/shared/infrastructure/telemetry/tracing.ts:8`

**Contexto verificado — os 7 erros, um a um.**

```bash
cd apps/api && npx eslint . 2>&1 | grep -E 'error'; echo "EXIT=$?"
```

| # | Arquivo | Regra | Correção |
|---|---------|-------|----------|
| 1-2 | `user.aggregate.spec.ts:12,13` | `'T3'` / `'T4'` atribuídos e nunca usados | deletar as 2 linhas `const T3 = …` / `const T4 = …` |
| 3 | `prisma-user.repository.ts:69` | `'e'` definido e nunca usado | `} catch (e) {` → `} catch {` |
| 4 | `global-exception.filter.spec.ts:17` | `'context'` definido e nunca usado | `import { trace, context } from '@opentelemetry/api';` → `import { trace } from '@opentelemetry/api';` |
| 5 | `zod-validation.pipe.ts:19` | `'_metadata'` definido e nunca usado | `argsIgnorePattern: '^_'` no config compartilhado |
| 6 | `main.spec.ts:17` | `no-explicit-any` | `} as any;` → `} as unknown as ArgumentsHost;` + `import type { ArgumentsHost } from '@nestjs/common';` |
| 7 | `user-use-cases.spec.ts:14` | `'ApplicationResourceDeletedException'` definido e nunca usado | remover do bloco de `import` |

> **Correção sobre a v1.0.0:** ela listava **5 arquivos / 6 erros** e faltava o
> nº 7. Sem ele o `eslint .` continua emitindo 1 erro e o job `quality` do CI
> quebra no primeiro push — exatamente o que a task existia para evitar.
>
> **Correção 2:** a v1.0.0 dizia que `argsIgnorePattern: '^_'` resolveria
> `context`. **Não resolve** — o padrão `^_` exige prefixo `_` e `context` não
> tem. `context` é um **binding de import**, não argumento: a correção é
> removê-lo do import. A v1.0.0 entregaria um erro remanescente e declararia a
> task fechada.

**Passos**

1. **RED (linha de base)** — com §F2-T3 já aplicada:

   ```bash
   out=$(cd apps/api && npx eslint . 2>&1); st=$?
   printf '%s\n' "$out" | tail -2; echo "EXIT=$st"
   ```

   **Output medido hoje:** `11 problems (7 errors, 4 warnings)` e `EXIT=1`.
   Baseline **B5**.

2. **GREEN — as 6 correções manuais** da tabela. Preferência por **deletar o
   lixo**, não por `eslint-disable`; a única exceção é o nº 5, que é
   assinatura de override e o parâmetro precisa existir.

3. **`argsIgnorePattern` no config compartilhado** —
   `packages/eslint-config/index.js`, na entrada de `tseslint.configs.recommended`
   (o `export default` já monta `js.configs.recommended`, `...tseslint…` e o
   bloco `ddd-hexagonal`; o override entra como mais um objeto no array):

   ```js
   {
     rules: {
       '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
     },
   },
   ```

   > Afeta `apps/web` também, porque ambas as apps importam
   > `@projeto/eslint-config`. Passo 5 prova que não regride.

4. **Os 4 warnings `Unused eslint-disable directive`** — `main.ts:54`,
   `export-openapi.ts:71,76`, `tracing.ts:8`:

   ```bash
   out=$(cd apps/api && npx eslint . --fix 2>&1); st=$?
   printf '%s\n' "$out" | tail -2; echo "EXIT=$st"
   ```

   > `--fix` **depois** das manuais, nunca antes: ele pode remover um
   > `eslint-disable` que a correção manual ainda precisa.

5. **Verificar — backend e frontend:**

   ```bash
   out=$(cd apps/api && npx eslint . 2>&1); st=$?
   printf '%s\n' "$out" | tail -2; echo "API_EXIT=$st"
   out=$(cd apps/web && npx eslint . 2>&1); st=$?
   printf '%s\n' "$out" | tail -2; echo "WEB_EXIT=$st"
   ```

   **Output esperado:** `0 problems` / `API_EXIT=0` e `WEB_EXIT=0`.

6. **Commit:**

   ```bash
   git add -A apps/api packages/eslint-config
   git commit -m "fix(api): 7 erros de lint revelados ao virar a config do ESLint

   6x @typescript-eslint/no-unused-vars (2 deletados, 1 catch sem binding,
   1 import morto, 1 param de override, 1 import de exception) +
   1x no-explicit-any + 4 'unused eslint-disable directive' do --fix.
   0 violacoes ddd-hexagonal — o ganho e preventivo, nao de remocao.

   argsIgnorePattern '^_' entra no config compartilhado por causa de
   _metadata (assinatura de override); 'context' NAO e coberto por ele
   (nao tem prefixo _) e sai removido do import. apps/web segue verde.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
out=$(cd apps/api && npx eslint . 2>&1); st=$?
printf '%s\n' "$out" | tail -2; echo "EXIT=$st"
bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -E '^.. F2-T[34]'
```

**Output esperado:** `0 problems`, `EXIT=0`, e 2 linhas `✓`.
Baseline **B5**: `11 problems (7 errors)` → `0`.

**Gate que valida:** o job `quality` do CI (`.github/workflows/ci.yml`) e
`pnpm ci:local`, que roda `turbo run lint`. **A partir de §F2-T5** o script
`lint` do `apps/api` deixa de ser stub — daí a ordem.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
