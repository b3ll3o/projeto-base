#!/usr/bin/env bash
# PostToolUse (Edit|Write) — roda o stack-code-reviewer sobre o arquivo editado.
#
# O QUE ESTE HOOK NAO FAZ: nao bloqueia, nao desfaz, nao impede a escrita.
# PostToolUse dispara DEPOIS que a tool ja executou com sucesso. O unico
# contrato disponivel aqui e FEEDBACK: exit 2 coloca o stderr na frente do
# Claude, que reage ao finding antes de seguir. Para impedir a escrita de
# verdade, o caminho e PreToolUse (ver pretooluse-block-pnpm-lock.mjs).
#
# MEDIDO 2026-10-13: a CLI nomeia de "hook blocking error" a saida de um command
# hook com exit 2, e e ela que entrega o texto ao modelo. Nao ha `onFailure` de
# hook no schema — esse campo pertence a `policyHelper`/`policyHelpers` e aceita
# "continue"/"refuse".
#
# Por que ainda vale a pena: o modelo ve os findings NO MESMO TURNO da edicao e
# corrige antes de avancar, sem ciclo extra de rodada.
#
# Ver `.claude/README.md` para o contrato completo do binding.
set -uo pipefail

# Extrai tool_input.file_path do JSON do stdin.
#
# MEDIDO 2026-10-13: `jq` NAO esta instalado nesta maquina. Os exemplos
# documentados de hook usam `jq -r`; um hook escrito a partir deles nao quebraria
# com erro visivel — bash devolveria 127 e o comportamento observavel seria o de
# um hook que falha sempre. Daqui o uso de `node`, que o repo ja exige
# (engines: node >= 22.6).
payload="$(cat)"

file_path="$(printf '%s' "$payload" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  try {
    process.stdout.write(JSON.parse(s)?.tool_input?.file_path ?? "");
  } catch {
    process.stdout.write("");
  }
});
')"

[ -n "$file_path" ] || exit 0

# Escopo: as extensoes que o reviewer sabe ler. O matcher "Edit|Write" casa o
# NOME DA TOOL, nao a extensao — a extensao e filtrada aqui, que e o unico
# lugar onde ela e conhecida. `.jsx` entra porque `checkNextImage` aceita
# `/\.(tsx|jsx)$/`; e a comparacao e em minusculas porque um `.TS` passaria
# fora num fs case-insensitive (macOS) e o fs do CI e Linux — divergir entre
# as duas maquinas seria um guard que so funciona na metade dos ambientes.
lowered="${file_path,,}"
case "$lowered" in
  *.ts | *.tsx | *.jsx | *.prisma) ;;
  *) exit 0 ;;
esac

# Arquivo tem que existir: o reviewer le do disco, e um path que sumiu entre a
# escrita e o hook faria ele reportar "0 findings" — verde medindo nada.
[ -f "$file_path" ] || exit 0

# Raiz do projeto. O proprio binario do CLI instrui o caminho certo para um
# guard que precisa inspecionar o projeto:
#   "a guard that inspects the project must use $CLAUDE_PROJECT_DIR or the cwd
#    field on stdin"
# O fallback $PWD cobre o caso da variavel ausente — verificado em pipe-test.
root="${CLAUDE_PROJECT_DIR:-$PWD}"
script="$root/tooling/scripts/stack-code-reviewer.ts"

# Ausencia do reviewer e FALHA VISIVEL, nao saida silenciosa: um exit 0 quieto
# aqui seria um hook que reporta verde sem nunca ter rodado regra nenhuma.
if [ ! -f "$script" ]; then
  printf '[stack-review hook] reviewer nao encontrado em %s — nenhum finding foi medido.\n' \
    "$script" >&2
  exit 2
fi

if [ -x "$root/node_modules/.bin/tsx" ]; then
  tsx="$root/node_modules/.bin/tsx"
else
  tsx="tsx"
fi

# --out-file e OBRIGATORIO num hook, e o motivo nao e estetico:
# `writeFileSync(outFile, ...)` no reviewer roda INCONDICIONAL, e o default e
# `stack-review-report.json` na raiz do repo. Num refactor de 40 arquivos isso
# sao 40+ escritas concorrentes do MESMO arquivo, cada uma com files=1, e a
# ultima a terminar sobrescreve o relatorio do commit inteiro. O conteudo nao
# e consumido aqui (lemos stdout), entao ele vai para um temporario descartado.
out_dir="$(mktemp -d)" || exit 2
trap 'rm -rf "$out_dir"' EXIT

# `--files=` com aspas e obrigatorio: sem aspas o path passa por
# word-splitting e o segundo token vira opcao solta e descartada.
#
# `--mode=pre-commit` e o valor REAL, nao um rotulo invented: o parametro mode
# e parseado (:225) e impresso (:238) pelo reviewer, mas nenhum `if` sobre ele
# existe no script — nenhuma regra muda conforme o modo. Passar "post-edit"
# faria o hook imprimir mode=post-edit sugerindo um comportamento que nao existe.
# O que este hook faz e aplicar o CONJUNTO de regras do pre-commit a cada edicao.
set +e
output="$(cd "$root" && "$tsx" "$script" \
  --files="$file_path" \
  --mode=pre-commit \
  --out-file="$out_dir/stack-review-report.json" 2>&1)"
code=$?
set -e

# MEDIDO 2026-10-13: o exit do reviewer é veredito de APROVAÇÃO, não de achado.
# `approved = blockers === 0 && majors <= 3` (stack-code-reviewer.ts:192), e o
# script só sai !=0 quando NÃO aprovado. Um único finding `major` produz
# `approved: true`, exit 0 — e um hook que lesse o exit como "nada a relatar"
# jogaria fora um finding que foi medido e escrito no relatório. Por isso a
# decisão é pelo CONTÉUDO do relatório; o exit sozinho não distingue
# "aprovado e limpo" de "aprovado com achados".
report="$out_dir/stack-review-report.json"
achados=0
if [ -f "$report" ]; then
  achados="$(node -e '
    try {
      const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"));
      process.stdout.write(String((r.findings ?? []).length));
    } catch {
      process.stdout.write("0");
    }
  ' "$report")"
fi

[ "$code" -eq 0 ] && [ "$achados" -eq 0 ] && exit 0

# Qualquer nao-zero vira exit 2, que e o caminho que entrega o texto ao Claude.
# O CLI do reviewer usa o MESMO exit 1 para "nao aprovado" e para crash do proprio
# script, e nao ha como distinguir os dois daqui — por isso o texto vai inteiro,
# SEM rotulo: quem julga se foi um finding legitimo ou o script quebrado e o
# Claude, que tem o conteudo na mao. Rotular aqui seria inventar um veredito que
# o hook nao tem.
printf '%s\n' "$output" >&2
exit 2
