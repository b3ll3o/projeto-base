#!/usr/bin/env bash
# Verificador unico do plano de melhorias do fluxo. 21 checks, 1 por task.
# Exit 0 = todas as tasks feitas. Regra: todo check ancora em propriedade
# do artefato que MUDOU com a task — nenhum pode passar antes dela.
set -uo pipefail
cd "$(dirname "$0")/../../.." || { echo 'raiz do repo nao encontrada'; exit 2; }
[ -f package.json ] || { echo 'raiz do repo errada: sem package.json'; exit 2; }
pass=0; fail=0; skip=0
# Padrao dos checks fantasma de git-workflow.md (baseline B14). Casa o NOME
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

# F1-T0: ancorado no CONTEUDO do snapshot, nao no nome do arquivo. O plano
# previa `state-snapshot-2026*10*02*.md`, mas a captura usou o timestamp real
# (2026-10-03). Ancorar na data travaria o check num dia; ancorar no nome da
# demanda segue falhando na adocao — o unico snapshot pre-existente e o da
# demanda de telemetria — e so passa depois que F1-T0 cria este.
chk F1-T0 "state-snapshot da demanda" "1" \
  "grep -lF 'demand: melhorias-fluxo-desenvolvimento' .agents/runs/state-snapshot-*.md 2>/dev/null | wc -l"

# F1-T1: task turnou-se NO-OP na execucao. O plano previa 6 links 'path:linha'
# em docs/articles/; o arquivo ja foi versionado (173eed7) e a referencia e
# '(linha N)' como prosa FORA do parentes — grep conta 0 desde o inicio. O
# check deixa de ser "conte os 6" e passa a guardar o INVARIANTE que a task
# pretendia proteger: o artigo versionado, sem sufixo ':linha' no target.
chk F1-T1 "artigo versionado e sem path:linha" "0" \
  "git ls-files --error-unmatch docs/articles/vetor-grafos-fine-tuning-resumo.md >/dev/null 2>&1 && [ \"\$(grep -cE '\]\([^)]*\.md:[0-9]+\)' docs/articles/vetor-grafos-fine-tuning-resumo.md)\" = 0 ]; echo \$?"

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
# F4-T3 e' o unico check com valor esperado decidido pelo owner (D2). Com a
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
