---
name: melhorias-fluxo-fase-1-p0-part-02
description: Fase 1 (P0) parte 2 — 1 task que corrige os 18 links de memoria quebrados e os 2 marcadores stale do catalogo do AGENTS.md, e entrega o verificador unico do plano (21 checks, um por task).
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-<ts>.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-1-p0-part-01.md
---

# Fase 1 (P0) — Parte 2: catálogo do `AGENTS.md` + verificador do plano

> **Pré-requisito:** [F1-P0-P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-1-p0-part-01.md) completa.
> **Agente responsável:** `stack-code-reviewer` (review) · `doc-sync` (pós-alteração).

---

## F1-T2 — Corrigir os 18 links de memória e os 2 marcadores "pendente" do `AGENTS.md`, e escrever o verificador

**Arquivos tocados**

- Modify: `AGENTS.md` (18 links da coluna "Memória" + 2 marcadores, linhas 77 e 84)
- Modify: `.agents/WORKFLOWS.md:25` (mesmo marcador stale, propagado)
- Create: `docs/superpowers/plans/verify-melhorias-fluxo.sh`

**Contexto verificado.** `AGENTS.md:65-88` usa o prefixo `../.agents/memory/` na
coluna "Memória", enquanto a coluna vizinha "Arquivo" usa o prefixo correto
`./.agents/agents/` — **na mesma linha**. Como `AGENTS.md` está na raiz do repo,
`../` sai do repositório:

```bash
grep -c '(\.\./\.agents/memory/' AGENTS.md   # → 18
ls -d ../.agents                              # → não existe
```

Os 21 arquivos de memória **existem** em `.agents/memory/` — é divergência de
prefixo, não arquivo faltando. Além disso, 2 entradas estão marcadas como
pendentes embora os artefatos existam e estejam em uso
(`AGENTS.md:77` review-router · `AGENTS.md:84` docker-specialist).

> **Por que importa mais do que parece:** `AGENTS.md` é injetado no contexto de
> todo agent. Um link que sai do repo e um "(pendente Fase 3)" obsoleto fazem o
> agent concluir que `review-router` não existe — e ele **não** vai verificar o
> disco, porque confia no índice. E, com §F2-T2, `AGENTS.md` **passa a ser
> coberto** pelo link-checker: os 18 viram erro de gate, não anotação.

**Passos**

1. Dry-run dos 18 prefixos:

   ```bash
   sed 's|](\.\./\.agents/memory/|](./.agents/memory/|g' AGENTS.md | diff AGENTS.md - | grep -c '^[<>]'
   ```

   **Output esperado:** `36` (18 pares `<` / `>`).

2. Aplicar:

   ```bash
   sed -i 's|](\.\./\.agents/memory/|](./.agents/memory/|g' AGENTS.md
   ```

3. Converter as 2 linhas de texto plano em link e remover os marcadores:

   - `AGENTS.md:77` — `` `.agents/agents/review-router.md` _(pendente Fase 3)_ ``
     → link `` [`.agents/agents/review-router.md`](.agents/agents/review-router.md) ``
     e `` `../.agents/memory/review-router.md` _(pendente Fase 3)_ ``
     → `` [`.agents/memory/review-router.md`](.agents/memory/review-router.md) ``.
   - `AGENTS.md:84` — mesma operação para `docker-specialist.md` e
     `.agents/memory/docker-specialist.md`, removendo `_(pendente Task 9)_`.
   - `.agents/WORKFLOWS.md:25` — remover `_(pendente Fase 3)_` da linha do
     workflow `review-routing`; o mesmo mock está propagado aqui.

4. **Verificar que os 18 targets existem** antes de commitar:

   ```bash
   grep -o '](\./\.agents/memory/[^)]*)' AGENTS.md | sed 's/](\.\///; s/)$//' | while read -r f; do
     [ -f "$f" ] || echo "MISSING: $f"
   done; echo "fim"
   ```

   **Output esperado:** apenas `fim` (nenhum `MISSING`).

5. **Escrever o verificador único do plano** (o comando que prova as 21 tasks):

   ```bash
   cat > docs/superpowers/plans/verify-melhorias-fluxo.sh <<'SH'
   #!/usr/bin/env bash
   # Verificador unico do plano de melhorias do fluxo. 21 checks, 1 por task.
   # Exit 0 = todas as tasks feitas. Regra: todo check ancora em propriedade
   # do artefato que MUDOU com a task — nenhum pode passar antes dela.
   set -uo pipefail
   cd "$(dirname "$0")/../../.." || { echo 'raiz do repo nao encontrada'; exit 2; }
   [ -f package.json ] || { echo 'raiz do repo errada: sem package.json'; exit 2; }
   pass=0; fail=0; skip=0
   # Padrão dos checks fantasma de git-workflow.md (baseline B14). Casa o NOME
   # NU, nao o cercado: ':112-114' nao usam backtick, e um padrao ancorado no
   # cercado contaria 5 em vez de 8 e deixaria 3 linhas sem dono.
   GHOSTS='(tdd-enforcer|code-reviewer|markdown-size-check)'
   export GHOSTS

   # chk <id> <descricao> <esperado, separado por |> <comando que imprime 1 valor>
   chk() {
     local id="$1" desc="$2" want="$3" cmd="$4" got
     got="$(bash -c "$cmd" 2>/dev/null | tail -n 1)"
     # got vazio = comando nao produziu valor. Precisa falhar, nunca passar:
     # sem esta guarda, '' casa com qualquer '|want|' e o check vira no-op.
     if [ -z "$got" ]; then got='<vazio>'; fi
     case "|${want}|" in
       *"|${got}|"*)
         printf '✓ %-7s %s\n' "$id" "$desc"; pass=$((pass + 1)) ;;
       *)
         printf '✗ %-7s %s (esperado=%s obtido=%s)\n' "$id" "$desc" "$want" "$got"
         fail=$((fail + 1)) ;;
     esac
   }

   # chk_net: igual a chk, mas sem rede/token marca ⊘ e NAO conta como falha.
   chk_net() {
     local id="$1" desc="$2" want="$3" cmd="$4" got
     if ! command -v gh >/dev/null 2>&1; then
       printf '⊘ %-7s %s (sem gh)\n' "$id" "$desc"; skip=$((skip + 1)); return
     fi
     got="$(bash -c "$cmd" 2>/dev/null | tail -n 1)"
     if [ -z "$got" ]; then
       printf '⊘ %-7s %s (sem rede)\n' "$id" "$desc"; skip=$((skip + 1)); return
     fi
     case "|${want}|" in
       *"|${got}|"*) printf '✓ %-7s %s\n' "$id" "$desc"; pass=$((pass + 1)) ;;
       *) printf '✗ %-7s %s (esperado=%s obtido=%s)\n' "$id" "$desc" "$want" "$got"
          fail=$((fail + 1)) ;;
     esac
   }

   PLAN_P4=docs/superpowers/plans/2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-02.md

   chk F1-T0 "state-snapshot da demanda"          "1"  'ls .agents/runs/state-snapshot-2026*10*02*.md 2>/dev/null | wc -l'
   chk F1-T1 "6 links path:linha + preflight verde" "0" \
     "test -f docs/articles/vetor-grafos-fine-tuning-resumo.md && [ \"\$(grep -cE '\]\([^)]*\.md:[0-9]+\)' docs/articles/vetor-grafos-fine-tuning-resumo.md)\" = 0 ] && pnpm ci:preflight >/dev/null 2>&1; echo \$?"
   chk F1-T2 "links de memoria do AGENTS.md"      "0"  "grep -c '(\.\./\.agents/memory/' AGENTS.md"
   chk F2-T1 "mascara inline-code aplicada"       "1"  "grep -c 'repeat(s.length)' .tooling/scripts/ci/check-doc-refs.ts"
   chk F2-T2 "escopo ampliado + 98 links resolvidos" "0" \
     "grep -q TARGET_ALLOWLIST .tooling/scripts/ci/check-doc-refs.ts && pnpm ci:preflight >/dev/null 2>&1; echo \$?"
   chk F2-T3 "eslint.config.mjs no apps/api"      "0"  'ls apps/api/eslint.config.mjs >/dev/null 2>&1; echo $?'
   chk F2-T4 "apps/api sem erro de lint"          "0"  'cd apps/api && npx eslint . >/dev/null 2>&1; echo $?'
   chk F2-T5 "lint script real (nao stub)"        "0"  "grep -c 'lint stub' apps/api/package.json"
   chk F2-T6 "gate DDD em infrastructure/"        "2"  "grep -c 'infrastructure' tooling/scripts/stack-code-reviewer.ts"
   chk F2-T7 "tdd:check fora do turbo.json"       "0"  'grep -c "\"tdd:check\"" turbo.json'
   chk F2-T8 "specs .tooling verdes"              "0"  'npx vitest run --root .tooling/scripts/ci >/dev/null 2>&1; echo $?'
   chk F3-T1 "README e STACK sem apps ausentes"   "0"  '! grep -q "não foram criados" README.md docs/STACK.md; echo $?'
   chk F3-T2 "arvore e contagens do README"       "1"  "grep -c '19 agents' README.md"
   chk F3-T3 "git-workflow sem check fantasma"    "0"  'grep -cE "$GHOSTS" .agents/specs/conventions/git-workflow.md'
   chk F3-T4 "footer MONOREPO = 1.9.0"            "1.9.0" \
     "grep -oE '\*\*Versão do documento:\*\* [0-9.]+' docs/MONOREPO.md | grep -oE '[0-9.]+$'"
   chk F3-T5 "warning no path idempotente"        "1"  "grep -c '::warning::' .github/workflows/release-template.yml"
   chk F4-T1 "estado skipped no painel"           "1"  "grep -c 'skipped' .tooling/scripts/ci/check-types.ts"
   chk F4-T2 "archive/.gitkeep versionado"        "0"  'test -f .agents/runs/archive/.gitkeep; echo $?'
   # F4-T3 e' o unico check com valor esperado decided pelo owner (D2). Com a
   # opcao (a) o valor e' 1. Se o owner escolher (d), troque para "0" AQUI e
   # justifique no corpo do PR — senao o check continua vermelho de proposito.
   chk_net F4-T3 "ruleset com required_status_checks (D2)" "1" \
     "gh api repos/b3ll3o/projeto-base/rulesets/23853096 --jq '.rules[].type' | grep -c required_status_checks"
   chk F4-T4 "doc-sync declara report-only"       "1"  "grep -c 'report-only' .agents/agents/doc-sync.md"
   chk F4-T5 "backlog versionado e re-medido"    "10" \
     "test -f .agents/runs/backlog-2026-10-02.md || { echo 0; exit 0; }; grep -c '^| \*\*BL' .agents/runs/backlog-2026-10-02.md"

   echo '---'
   echo "✓ $pass · ✗ $fail · ⊘ $skip  (de $((pass + fail + skip)) checks)"
   [ "$fail" -eq 0 ] || exit 1
   echo "✓ todas as tasks verificadas (EXIT=0)"
   SH
   chmod +x docs/superpowers/plans/verify-melhorias-fluxo.sh
   ```

   > **Sobre o check `F3-T1`:** `grep -c` em 2 arquivos imprime `arquivo:N`, o
   > que não é comparável com um escalar. Por isso o check nega o `grep -q` e
   > compara o **status**: hoje devolve `1` (há match), depois devolve `0`.
   > **Sobre o check `F1-T1`:** a v1.0.0 ancorava só em `ci:preflight` verde — o
   > que **§F2-T1/§F2-T2** também entregam. O check passaria se a §F1-T1 fosse
   > pulada e a Fase 2 feita: gate verde sem a task, que é a classe de defeito
   > que este plano existe para eliminar. Por isso exige **os dois**: os 6 links
   > `path:linha` virados `0` **e** preflight verde. Se D1 for (b) deletar ou
   > (c) mover, o `test -f` falha e o check acusa em vez de passar no vazio.
   > **Sobre o check `F3-T3`:** o padrão casa o **nome nu**, não o cercado — ver
   > `GHOSTS` no topo do script. As `:112-114` de `git-workflow.md` não usam
   > backtick: um padrão ancorado no cercado contaria 5 em vez das **8** linhas
   > reais e deixaria 3 sem dono (baseline **B14** = `8` → `0`).
   > **Sobre o check `F4-T5`:** ele conta as linhas `| **BL` do artefato
   > `.agents/runs/backlog-2026-10-02.md`, **não** as do plano. A tabela do
   > plano é escrita pela revisão, antes de qualquer task rodar: um check que a
   > contasse passaria já na adoção — verde sem a task, o defeito que este plano
   > existe para eliminar. O guard `test -f … || { echo 0; exit 0; }` devolve
   > `0` quando o artefato não existe, então hoje o check falha com
   > `esperado=10 obtido=0` em vez de virar `<vazio>`.

6. Rodar o verificador. As 3 tasks da Fase 1 devem estar verdes, o resto
   vermelho — **é assim que se prova que o verificador tem dentes**:

   ```bash
   bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -c '^✓ F1-'
   ```

   **Output esperado:** `3`.

7. **2 commits atômicos** (o link-fix e o script são independentes):

   ```bash
   git add AGENTS.md .agents/WORKFLOWS.md
   git commit -m "fix(docs): 18 links de memoria do AGENTS.md + 2 marcadores stale

   AGENTS.md esta na raiz do repo, entao '](../.agents/memory/' sai do
   repositorio. Os 21 arquivos existem em .agents/memory/ — e a coluna
   vizinha (Arquivo) ja usava o prefixo correto, na mesma linha.
   Remove 'pendente Fase 3' (review-router) e 'pendente Task 9'
   (docker-specialist): os artefatos existem e sao usados. Mesmo
   marcador propagado em .agents/WORKFLOWS.md:25.

   Impacto ampliado: com F2-T2 o AGENTS.md passa a ser coberto pelo
   link-checker, entao estes 18 viram erro de gate, nao anotacao.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"

   git add docs/superpowers/plans/verify-melhorias-fluxo.sh
   git commit -m "chore(plans): verificador unico do plano de melhorias do fluxo

   21 checks, um por task. Exit 0 = plano inteiro feito. Todo check
   ancora em propriedade do artefato que MUDOU com a task, entao nenhum
   pode passar antes dela. F4-T3 degrada para ⊘ sem rede/gh e nao conta
   como falha (D2 tem a opcao (d) legitima).

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c '(\.\./\.agents/memory/' AGENTS.md
grep -c 'pendente Fase 3\|pendente Task 9' AGENTS.md
bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -c '^✓ F1-'
```

**Output esperado:** `0`, `0`, `3`. Baselines **B11** `18` → `0` e **B12** `2` → `0`.

**Gate que valida:** `pnpm ci:preflight` e revisão do PR. O `checkDocRefs` ainda
**não** cobre `AGENTS.md` — ver §F2-T2, que fecha essa classe de drift.

---

## Critério de saída da Fase 1

```bash
out=$(pnpm ci:preflight 2>&1); st=$?
printf '%s\n' "$out" | tail -2
echo "EXIT=$st"
bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -c '^✓ F1-'
```

**Output esperado:** `EXIT=0` e `3`.

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
