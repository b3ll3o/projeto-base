---
name: melhorias-fluxo-fase-2-p1-enforcement-part-03
description: Fase 2 (P1 enforcement) parte 3 — 2 tasks: trocar o stub de lint do apps/api por `eslint .` (liga ao job quality do CI) e fechar o gate DDD para imports relativos de infrastructure/, que hoje passa sem encontrar nada.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-20261003T154334Z.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-02.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-04.md
---

# Fase 2 (P1 enforcement) — Parte 3: o `lint` deixa de ser `echo`, e o gate DDD passa a casar

> **Pré-requisito:** [F2-P1-P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-02.md) completa
> (sem §F2-T3 o `eslint .` nem executa; sem §F2-T4 ele sai com 7 erros).
> **Próxima parte:** [F2-P1-P04](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-04.md)
> **Agente responsável:** `stack-code-reviewer` (review) · `test-writer` (RED do spec DDD).
> **⚠️ Ordem obrigatória: §F2-T5 → §F2-T6.** Ligar o lint com 7 erros presentes
> quebraria o job `quality` do CI. O gate DDD é independente e paralelizável com
> §F2-T4 (arquivos distintos, nenhum compartilhado).
> **O padrão que as 2 tasks eliminam:** gate que reporta verde sem executar
> nada. Um `echo && exit 0` e um regex que nunca casa são a mesma falha com
> roupas diferentes — ambos consomem confiança sem produzir verificação.

---

## F2-T5 — Trocar o stub `lint` do `apps/api` por `eslint .`

**Arquivos tocados**

- Modify: `apps/api/package.json` (campo `scripts.lint`)

**Contexto verificado.**

```bash
python3 -c "import json;print(json.load(open('apps/api/package.json'))['scripts']['lint'])"
```

```text
echo 'apps/api lint stub (real wiring in Phase 3)' && exit 0
```

O job `quality` do CI roda `pnpm turbo run lint …`, e a task `lint` do
`turbo.json` itera todos os pacotes. Para `@projeto/api` — o maior codebase do
monorepo — o CI executa um `echo`. O mesmo arquivo tem
`"test": "echo 'apps/api test stub (real wiring in Phase 3)' && exit 0"`:
**a task `test` também é stub** e está fora do escopo deste plano (backlog
**BL10** do §F4-T5, porque `vitest.workspace.ts` já define os projetos
`unit`/`integration`/`e2e` e religar exige recalibrar a task `test` do turbo).

**Passos**

1. Trocar o stub, espelhando `apps/web/package.json`:

   ```diff
   -  "lint": "echo 'apps/api lint stub (real wiring in Phase 3)' && exit 0",
   +  "lint": "eslint .",
   ```

   > **Não** usar `eslint "{src,test}/**/*.ts"`: criaria divergência de escopo em
   > relação ao `apps/web` e reduziria a cobertura justamente no que se quer
   > recuperar. `eslint .` + `ignores` da config é o contrato dos dois apps.

2. **Verificar que o turbo materializa a task de verdade:**

   ```bash
   out=$(pnpm turbo run lint --filter=@projeto/api 2>&1); st=$?
   printf '%s\n' "$out" | tail -4; echo "EXIT=$st"
   ```

   **Output esperado:** `Tasks: 1 successful` e `EXIT=0` — sem nenhum
   `lint stub` na saída. Baseline **B4**: `1` → `0`.

3. **Provar que o gate tem dentes** (a task de cobertura do `#40` aprendeu isto):

   ```bash
   printf 'const x: any = 1;\nexport { x };\n' > apps/api/src/__lint_probe__.ts
   out=$(cd apps/api && npx eslint . 2>&1); st=$?
   printf '%s\n' "$out" | grep -c no-explicit-any; echo "EXIT=$st"
   rm apps/api/src/__lint_probe__.ts
   out=$(cd apps/api && npx eslint . 2>&1); st=$?
   printf '%s\n' "$out" | tail -1; echo "EXIT_DEPOIS=$st"
   ```

   **Output esperado:** `1` e `EXIT=1`; depois `0 problems` e `EXIT_DEPOIS=0`.
   **Um gate que não pode falhar é pior que nenhum gate** — o teste de negação
   é o que prova que este pode.

4. **Commit:**

   ```bash
   git add apps/api/package.json
   git commit -m "fix(api): lint real no apps/api (era stub exit 0)

   'lint': \"echo 'apps/api lint stub (real wiring in Phase 3)' && exit 0\"
   -> 'eslint .'. Espelha apps/web. Liga automaticamente ao job quality do
   CI, que ate aqui executava um echo para o maior codebase do monorepo.

   A rule 'ddd-hexagonal/no-domain-imports-from-infra' (error em
   packages/eslint-config/index.js) passa a rodar de fato.

   'test' segue stub — backlog BL10: religar exige recalibrar a task test do
   turbo, porque vitest.workspace.ts ja define 3 projetos.

   Negacao verificada: probe com 'const x: any' produz exit 1.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c 'lint stub' apps/api/package.json
out=$(pnpm turbo run lint typecheck 2>&1); st=$?
printf '%s\n' "$out" | tail -2; echo "EXIT=$st"
```

**Output esperado:** `0` e `EXIT=0`.

**Gate que valida:** o job `quality` do CI e `pnpm ci:local`
(`turbo run lint typecheck test:unit test:coverage --filter=@projeto/api --filter=@projeto/web`).

---

## F2-T6 — Fechar o gate DDD para imports relativos de `infrastructure/`

**Arquivos tocados**

- Modify: `tooling/scripts/stack-code-reviewer.ts:39-47` (`DDD_BLOCKED_IMPORTS`)
- Modify: `tooling/scripts/stack-code-reviewer.spec.ts` (3 testes)

**Contexto verificado — o gate funciona, mas para um subconjunto.**
`DDD_BLOCKED_IMPORTS` (`:39-47`) tem **7 entradas, todas de framework**
(`@nestjs/`, `@prisma/`, `prisma/`, `class-validator`,
`class-transformer`, `reflect-metadata`, `rxjs`). A skill proíbe
explicitamente arquivos em `infrastructure/`
(`.agents/skills/ddd-hexagonal-validation/SKILL.md:58`) e o array **não casa** —
`grep -c 'infrastructure' tooling/scripts/stack-code-reviewer.ts` → **`1`**, e
essa ocorrência é a `recommendation` da `:73`, não um padrão.

O **mesmo bug** não existe no lint: `packages/eslint-config/rules/no-domain-imports-from-infra.js:15`
já tem `/\/infrastructure\//` no seu `FORBIDDEN`. Dois gates que deveriam
dizer a mesma coisa discordam — e é o mais fraco que roda no hook.

**Repro (o gate hoje devolve 0):**

```bash
d=$(mktemp -d)/domain; mkdir -p "$d"
printf "import { Repo } from '../infrastructure/persistence/repo';\nexport class P {}\n" > "$d/probe.vo.ts"
pnpm tsx tooling/scripts/stack-code-reviewer.ts --files="$d/probe.vo.ts" --mode=pre-commit 2>&1 | head -2
```

**Output medido hoje:** `0 finding(s) — 0 blocker, 0 major`. Baseline **B6**.

**Escopo honesto:** isto fecha `domain/ → infrastructure/`. A regra
`application/ → infrastructure/` **continua sem gate**, porque `isDomainFile`
(`:52-54`) só reconhece path com componente `domain/`. Registrar como
limitação conhecida, não como bug corrigido.

**Passos**

1. **RED** — em `stack-code-reviewer.spec.ts`. A API real é
   `reviewFiles(files: string[]): ReviewReport`: ela lê do **disco**
   (`readFileSync` em `:161`) e devolve `{ approved, findings, … }`. O helper
   `tmpFile(name, content)` (`:16-22`) do próprio spec faz a parte de disco:

   ```ts
   it('bloqueia import relativo de infrastructure/ a partir de domain/', () => {
     const file = tmpFile('domain/probe.vo.ts',
       "import { Repo } from '../infrastructure/persistence/repo';\nexport class P {}\n");
     const report = reviewFiles([file]);
     expect(
       report.findings.some(
         (f) => f.severity === 'blocker' && f.rule === 'ddd-h1-no-framework-imports-in-domain',
       ),
     ).toBe(true);
   });
   ```

   > O path precisa conter `/domain/` como componente de diretório
   > (`isDomainFile`), senão o gate nem se aplica e o teste passaria vazio.

2. **Rodar — deve falhar:**

   ```bash
   out=$(npx vitest run --root tooling/scripts -t 'infrastructure' 2>&1); st=$?
   printf '%s\n' "$out" | tail -3; echo "EXIT=$st"
   ```

   **Output esperado:** `EXIT=1`, com `expected false to be true`.

3. **GREEN (1)** — acrescentar **1 entrada** ao array em
   `stack-code-reviewer.ts:47`:

   ```ts
   // SKILL.md:58 — domain/ nao pode importar arquivos em infrastructure/.
   // Mesmo padrao do gate ESLint (no-domain-imports-from-infra.js:15), para
   // que os 2 gates nao discordem sobre o mesmo arquivo.
   /\/infrastructure\//,
   ```

4. **GREEN (2) — 2 testes de anti-falso-positivo**, porque o regex é amplo:

   ```ts
   it('nao bloqueia import de shared/ fora de domain/', () => {
     const file = tmpFile('application/use-cases/user.uc.ts',
       "import { F } from '../infrastructure/http/f.js';\nexport class U {}\n");
     expect(reviewFiles([file]).findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
   });

   it('nao bloqueia infrastructure/ citado em comentario', () => {
     const file = tmpFile('domain/ports/repo.port.ts',
       "export interface R {}\n// a implementacao fica em infrastructure/persistence/\n");
     expect(reviewFiles([file]).findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
   });
   ```

   O 2º teste cobre um caso **real** deste repo:
   `apps/api/src/modules/users/domain/ports/user-repository.port.ts:40` menciona
   `infrastructure/persistence/` dentro de um comentário. `checkDomain` (`:61`)
   só casa `^import .* from ['"]…`, então não há falso positivo — e o teste
   trava esse comportamento.

5. **Rodar — deve passar:**

   ```bash
   out=$(npx vitest run --root tooling/scripts 2>&1); st=$?
   printf '%s\n' "$out" | tail -3; echo "EXIT=$st"
   ```

   **Output esperado:** `Test Files 10 passed (10)` · `Tests 153 passed (153)`
   e `EXIT=0` — hoje `150 passed (150)`, +3 desta task. Baseline **B7**.

6. **Verificar o gate novo e o caseiro junto:**

   ```bash
   d=$(mktemp -d)/domain; mkdir -p "$d"
   printf "import { Repo } from '../infrastructure/persistence/repo';\nexport class P {}\n" > "$d/probe.vo.ts"
   printf "import { Injectable } from '@nestjs/common';\nexport class Bad {}\n" > "$d/bad.vo.ts"
   pnpm tsx tooling/scripts/stack-code-reviewer.ts --files="$d/probe.vo.ts" --mode=pre-commit 2>&1 | head -2
   pnpm tsx tooling/scripts/stack-code-reviewer.ts --files="$d/bad.vo.ts" --mode=pre-commit 2>&1 | head -2
   ```

   **Output esperado:** `1 finding(s) — 1 blocker, 0 major` e
   `✗ Não aprovado (blocker=1)` nos **dois** — o caso novo e o que já
   funcionava. Baseline **B6**: `0` → `1`.

7. **Commit:**

   ```bash
   git add tooling/scripts/stack-code-reviewer.ts tooling/scripts/stack-code-reviewer.spec.ts
   git commit -m "feat(stack-review): gate DDD cobre import relativo de infrastructure/

   DDD_BLOCKED_IMPORTS tinha 7 entradas, todas de framework. A skill proibe
   arquivos em infrastructure/ (SKILL.md:58) e o padrao nao casava:
   '../infrastructure/persistence/...' gerava 0 findings. Adiciona 1 entrada
   com o MESMO padrao do gate ESLint (no-domain-imports-from-infra.js:15),
   que ja o tinha — dois gates nao podem discordar sobre o mesmo arquivo.

   2 testes de anti-falso-positivo: application/ (fora do escopo do
   isDomainFile) e infrastructure/ citado em comentario — caso real em
   user-repository.port.ts:40. 3 testes novos, 153 no total.

   Escopo: fecha domain/ -> infrastructure/. application/ -> infrastructure/
   segue sem gate, porque isDomainFile so reconhece path com componente
   'domain/'. Registrado como limitacao conhecida.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c 'infrastructure' tooling/scripts/stack-code-reviewer.ts
out=$(npx vitest run --root tooling/scripts 2>&1); st=$?
printf '%s\n' "$out" | tail -2; echo "EXIT=$st"
```

**Output esperado:** `2` (o novo padrão + a `recommendation` da `:73`) e
`153 passed (153)` / `EXIT=0`. Hoje os mesmos comandos dão `1` e `150`.

**Gate que valida:** `.husky/pre-commit:19`
(`stack-code-reviewer … || exit 1`) e o job `stack-code-review`
(`.github/workflows/review-stack.yml:31`), que roda o **mesmo** script em
`--mode=ci`.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
