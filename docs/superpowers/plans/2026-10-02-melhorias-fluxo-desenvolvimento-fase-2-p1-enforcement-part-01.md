---
name: melhorias-fluxo-fase-2-p1-enforcement-part-01
description: Fase 2 (P1 enforcement) parte 1 — 2 tasks em UM commit: trocar a remocao de inline-code por mascara que preserva offset em check-doc-refs.ts, e ampliar o escopo para os 189 .md versionados com a limpeza dos 76 links corrigiveis e a allowlist dos 22 que nunca sao path.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-20261003T154334Z.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-02.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-05.md
  - ../../fluxo-desenvolvimento.md
---

# Fase 2 (P1 enforcement) — Parte 1: máscara + escopo do link-checker

> **Pré-requisito:** Fase 1 completa e `main` atualizada.
> **Próxima parte:** [F2-P1-P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-02.md)
> **Inventário dos 98:** [F2-P1-P05 (Apêndice A)](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-05.md)
> **Agente responsável:** `stack-code-reviewer` (review) · `test-writer` (RED dos specs).
> **⚠️ §F2-T1 e §F2-T2 são 2 tasks e 1 commit.** A máscara leva o gate de **2**
> para **71** erros **dentro do escopo atual** (medido, **B2b**). Como
> `.husky/pre-push` roda `pnpm ci:preflight` com `exit 1`, um commit só com a
> máscara seria **impushável** — e um commit só com a limpeza não teria efeito,
> porque com remoção o gate já está verde. Não existe ordem em que o estado
> intermediário seja verde.
> **O padrão que esta parte elimina:** gate que não pode falhar.

| Gate | Verdade medida |
|------|----------------|
| link-checker, escopo | `128` de `189` `.md` cobertos; `AGENTS.md` **fora** |
| link-checker, links | link com label 100% inline-code **descartado em silêncio** |
| `apps/api` lint | `echo 'apps/api lint stub…' && exit 0` |
| `DDD_BLOCKED_IMPORTS` | não casa `infrastructure/` — 0 findings onde deveria haver blocker |
| `doc-sync.ts` | `grep -c 'process.exit'` → **0** |
| `tdd:check` | roda `test:unit` e imprime `FULL TURBO` |
| 6 specs em `.tooling/scripts/ci/` | fora do `--root tooling/scripts`, nunca executados |

---

## F2-T1 — Trocar remoção de inline-code por máscara que preserva offset

**Arquivos tocados**

- Modify: `.tooling/scripts/ci/check-doc-refs.ts:67`
- Modify: `.tooling/scripts/ci/preflight.spec.ts` (teste de regressão)

**Contexto verificado — o bypass.** `check-doc-refs.ts:67` roda **antes** do
regex de link da `:70`:

```ts
content = content.replace(/`[^`\n]+`/g, '');        // :67  — REMOÇÃO
const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;       // :70  — [^\]]+ exige 1+ char
```

Como `[^]]+` exige **1 ou mais** caracteres, um link cujo label é 100%
inline-code colapsa para `[]()` e **nunca casa**. Impacto real medido: **6 dos
98** links quebrados do repo estão escondidos por isso — entre eles 4 dos 6
`path:linha` que §F1-T1 corrigiu.

**Passos**

1. **RED** — em `preflight.spec.ts`, 1 teste com fixture em diretório
   **existente** e target **relativo** (um path absoluto inexistente pode ser
   classificado como externo): um `.md` com 2 links para o mesmo
   `./nao-existe.md`, um com label inline-code e um sem →
   `expect(result.ok).toBe(false)` e `expect(result.errors).toHaveLength(2)`.

   > Fixture novo e isolado: `docs-inline-code-label/guia.md`. **Não** reaproveite
   > `docs-inline-code` — esse é um dos 3 fixtures que §F2-T8 cria, e testes que
   > hoje estão vermelhos por ausência dele não podem ser a base do RED.

2. **Rodar — deve falhar:**

   ```bash
   out=$(npx vitest run --root .tooling/scripts/ci -t 'inline-code' 2>&1); st=$?
   printf '%s\n' "$out" | tail -3; echo "EXIT=$st"
   ```

   **Output esperado:** `EXIT=1`, com `expected 2 to be 1`.

3. **GREEN** — `.tooling/scripts/ci/check-doc-refs.ts:67`:

   ```ts
   // Inline code `código` — MASCARADO (preserva offset), nao removido.
   // Remover quebrava o offset e fazia link com label 100% inline-code
   // colapsar para `[]()`, que nunca casa com /\[([^\]]+)\]/ (label 1+ char).
   content = content.replace(/`[^`\n]+`/g, (s) => ' '.repeat(s.length));
   ```

4. **Rodar — deve passar:**

   ```bash
   out=$(npx vitest run --root .tooling/scripts/ci -t 'inline-code' 2>&1); st=$?
   printf '%s\n' "$out" | tail -3; echo "EXIT=$st"
   ```

   **Output esperado:** `EXIT=0`. Baseline **B3**: `errors.length = 1` → `2`.

5. **Medir o estrago** — é o que justifica o §F2-T2:

   ```bash
   out=$(pnpm ci:preflight 2>&1); st=$?
   printf '%s\n' "$out" | grep -c 'quebrado'; echo "EXIT=$st"
   ```

   **Output medido hoje, com a máscara aplicada:** **71** quebrados, `EXIT=1`.
   Sem a máscara são **2**. É esse delta que impede o commit intermediário.

> **Nota sobre pipelines.** Nenhum critério deste plano usa
> `comando | tail -N; echo "EXIT=$?"`: nesse formato `$?` é o status do `tail`,
> que é **sempre 0**, e o critério passaria com o gate vermelho. Medido: `false | tail -2`
> imprime `EXIT=0`. Capturar antes do pipe, como acima, ou usar `set -o pipefail`.

**Critério de aceite:** `EXIT=0` no passo 4.

**Gate que valida:** `preflight.spec.ts`. Até §F2-T8 essa suíte **não roda em
hook nem em CI** — o gate real até lá é a revisão do PR.

---

## F2-T2 — Ampliar o escopo para os 189 `.md` versionados e resolver os 98

**Arquivos tocados**

- Modify: `.tooling/scripts/ci/check-doc-refs.ts:17` (assinatura), `:89-99` (`walk`)
- Modify: `.tooling/scripts/ci/preflight.ts:60-61`
- Modify: `.tooling/scripts/ci/preflight.spec.ts`
- Modify: **34 arquivos de conteúdo** (grupos G1–G4 do
  [Apêndice A](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-05.md))

**Contexto verificado.** `preflight.ts:60-61` chama `checkDocRefs` só com
`docs` e `.agents/specs`, o que hoje cobre **128** `.md` de **189**
versionados — e `AGENTS.md`, o índice que todo agent LLM lê primeiro para
decidir a quem despachar, está fora.

| Escopo | Arquivos | Remoção (hoje) | **Máscara** |
|--------|----------|----------------|-----------|
| `git ls-files '*.md'` | 189 | 21 em 4 | **98 em 34** |
| escopo atual, em disco | 128 | **2 em 1** (gate de hoje) | **71 em 26** |
| escopo atual, versionados | 114 | 0 em 0 | 65 em 25 |

> A v1.0.0 deste plano afirmava "124 links quebrados em 43 arquivos". **Não é
> reproduzível por nenhuma variante** do algoritmo do gate — 124 é o número que
> aparece quando se **não** pulam blocos cercados por ``` e linhas indentadas,
> artefato de implementação, não do repositório. As três linhas da tabela vêm do
> script de medição do [índice §Baseline](./2026-10-02-melhorias-fluxo-desenvolvimento.md).

**Decisão D3 (do índice) — default: (a) `git ls-files` com fallback explícito.**

**Os 98 quebrados, por causa.** `98 = 76 corrigíveis + 22 em allowlist`.
O inventário arquivo-a-arquivo, com o `sed` exato de cada grupo, está no
[Apêndice A](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-05.md).

| Grupo | n | Correção | Por quê |
|-------|---|----------|---------|
| **G1** profundidade relativa | 66 | `sed` | **Todos os targets existem** — falta 1 ou 2 `../` |
| **G2** nome stale `agent-evolution-and-memory.md` | 3 | `sed` → `evolucao-agents.md` | o nome real do arquivo |
| **G3** `docs/articles/vibe-coding-sdd-*` | 6 | remover o link, manter o texto | `find` retorna **0**: não existe em lugar nenhum |
| **G4a** placeholders de template | 20 | `TARGET_ALLOWLIST` | `./evals/*.evals.yaml` é o que a spec vai produzir |
| **G4b** `../../../../home/leo/…` | 2 | `TARGET_ALLOWLIST` | memória do agent, fora do repo |
| **G4c** `…-07-referencias.md` | 1 | remover o link | a spec nunca foi criada |

**Por que quase tudo é `sed` e não allowlist.** Allowlist de gate não reduz
falso positivo; instala **falso negativo permanente e silencioso** — a mesma
classe de falha que este plano existe para eliminar. A v1.0.0 de §F2-T2
allowlistava `^.*-part-\d+\.md$`, que mascararia justamente os 9 índices de
fase que são corrigíveis com um `sed`.

**Passos**

1. **RED** — em `preflight.spec.ts`, 2 testes: (a) um `.md` fora das 2 raízes
   atuais é coberto; (b) `node_modules/` é ignorado.

2. **GREEN (1)** — `check-doc-refs.ts`, assinatura compatível (não quebra os
   testes existentes) e skip no `walk`:

   ```ts
   export async function checkDocRefs(opts: { docsRoot: string; docsRoots?: string[] }): Promise<CheckResult> {
   ```

   ```ts
   const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.turbo']);
   // ... dentro de walk():
   if (entry.isDirectory()) { if (SKIP_DIRS.has(entry.name)) continue; await walk(full); }
   ```

   Coleta dos versionados, com fallback **que avisa**:

   ```ts
   async function collectVersioned(repoRoot: string): Promise<string[] | null> {
     try {
       const { execFileSync } = await import('node:child_process');
       const out = execFileSync('git', ['ls-files', '*.md'], { cwd: repoRoot, encoding: 'utf8' });
       const files = out.split('\n').filter(Boolean).map((f) => path.join(repoRoot, f));
       return files.length > 0 ? files : null;
     } catch { return null; }
   }
   ```

   > Se retornar `null`, cai no `walk` das raízes **e imprime aviso**. Um gate
   > cujo escopo encolhe em silêncio é a falha que este plano elimina.

3. **GREEN (2)** — `preflight.ts:60-61`, as 2 chamadas literais viram 1:

   ```ts
   { name: 'Cross-refs em .md versionados', fn: () => checkDocRefs({ docsRoot: '.', docsRoots: ['docs', '.agents/specs'] }) },
   ```

4. **GREEN (3) — limpeza G1, G2, G3 e G4c**, pelos `sed` do Apêndice A.
   Rodar cada bloco, revisar o `git diff` e rodar o script de medição do índice
   entre um grupo e outro. **Esperado ao fim de cada grupo:** o total cai
   (66 → 3 → 0 → 0 → 0).

5. **GREEN (4) — `TARGET_ALLOWLIST`**, por **substring de target**, nunca por
   arquivo (assim um link novo quebrado no mesmo arquivo continua sendo pego):

   ```ts
   // Targets que NAO sao caminhos resolviveis: placeholders de template,
   // artefatos gerados e memoria do agent (fora do repo).
   const TARGET_ALLOWLIST = [
     /^\.\.?\/evals\//,                 // .agents/specs/templates/** — saida da convencao evals
     /^\.\/contracts\//,                 // placeholder de template
     /^\.\/(plan|tasks)\.md$/,           // placeholders de template
     /^\.\.\/\.\.\/\.\.\/docs\/(domain|architecture)\//, // docs gerados
     /(\.\.\/)+home\//,                  // memoria do agent, fora do repo
   ];
   ```

   > A v1.0.0 listava `^<.*>$` e `^.*-part-\d+\.md$`: **nenhum** casa com os 98
   > medidos. Regex sem alvo medido é_regex morta — e dá falsa sensação de
   > cobertura.

6. **Verificar:**

   ```bash
   out=$(pnpm ci:preflight 2>&1); st=$?
   printf '%s\n' "$out" | grep -E 'Cross-refs|Todos os checks|erro\(s\)'
   echo "EXIT=$st"
   ```

   **Output esperado:** `EXIT=0` e nenhuma linha `quebrado`. Baselines **B1**
   `128` → `189` cobertos e **B2** `98` → `0`.

   > Se sobrar item, ele vai para o **backlog** (§F4-T5) e o critério passa a
   > `errors == <n> restante`. **Nunca** afrouxar o critério para `EXIT=0`
   > mentido: gate ajustado ao resultado não é gate.

7. **Commit único** (§F2-T1 + §F2-T2):

   ```bash
   git add -A .tooling/scripts/ci .agents docs AGENTS.md
   git commit -m "fix(ci): mascara inline-code + escopo dos 189 .md versionados

   Duas correcoes que nao podem ser separadas: com a mascara o gate passa
   de 2 para 71 erros no escopo atual, e .husky/pre-push roda
   pnpm ci:preflight com exit 1 — um commit so com a mascara seria
   impushavel, e um so com a limpeza nao teria efeito (com remocao o gate
   ja esta verde).

   check-doc-refs.ts:67 removia o trecho de inline-code, quebrando o offset:
   com label 100% inline-code o link colapsava para []() e o regex
   /\[([^\]]+)\]/ (label 1+ char) nunca casava. 6 dos 98 quebrados do repo
   estavam escondidos por isso. Troca por ' '.repeat(s.length).

   Escopo: de 128 de 189 .md (preflight.ts:60-61 so passava 'docs' e
   '.agents/specs', e AGENTS.md ficava fora) para os 189 versionados via
   git ls-files, com fallback AVISADO. Skip de node_modules/.git/dist/
   coverage/.next/.turbo no walk — docsRoot '.' media 500+ erros sem isso.

   Dos 98 quebrados, 76 corrigidos (sed de profundidade em 34 arquivos —
   todos os targets existem; falta 1 ou 2 '../') e 22 em TARGET_ALLOWLIST
   (placeholders de template e memoria do agent fora do repo).
   Allowlist por SUBSTRING de target, nunca por arquivo.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
out=$(pnpm ci:preflight 2>&1); st=$?
printf '%s\n' "$out" | grep -c 'quebrado'
echo "PREFLIGHT_EXIT=$st"
bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -E '^.. F2-T[12]'
```

**Output esperado:** `0`, `PREFLIGHT_EXIT=0`, e 2 linhas `✓`.

> O rótulo é `PREFLIGHT_EXIT=` e não `EXIT=` porque este bloco imprime **dois**
> status distintos — o do preflight e o do verificador. Dois `EXIT=` no mesmo
> bloco deixam ambíguo qual comando falhou.

**Gate que valida:** `.husky/pre-push` (`pnpm ci:preflight` + `exit 1`) e o job
`preflight` do CI (`.github/workflows/ci.yml:32`).

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
