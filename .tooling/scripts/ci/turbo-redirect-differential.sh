#!/usr/bin/env bash
# Diferencial: o que o turbo REAL trata como task, vs o que o parser extrai.
#
# POR QUE ISTO EXISTE
#
# O parser de `turbo run` passou por três versões, e as três tinham spec verde.
# A 1a vazava `2>/dev/null` como task. A 2a cortava a task colada ao redirect.
# A 3a cortava toda task depois de um redirect espaçado — a forma mais comum.
# Nenhuma mutação de guard acha a 3a, porque ela não é um erro do guard: é
# uma forma que **não existe nos dados do repo**, então nenhum spec escrito a
# partir dos dados do repo podia cobrir. A classe ausente do dado só aparece
# quando se pergunta ao sistema real.
#
# COMO FUNCIONA
#
# Workspace temporário com `turbo.json.tasks = {}`: assim TODA palavra que o
# turbo trata como task aparece como "Could not find task `X`". O lado do
# parser é o que `extractTurboRunTasks` devolve. Divergência = o gate pode
# deixar passar uma task fantasma.
#
# DOIS ERROS QUE ESTE SCRIPT JÁ COMETEU (não repita)
#
#  1. `pnpm turbo run $form` NÃO cria o redirect: operador de shell é
#     reconhecido no parsing, não depois da expansão de variável. O turbo
#     recebia `>out.log` como palavra e o resultado era 100% divergente.
#     Tem que passar por `bash -c`.
#  2. Com o redirect real, o stdout do turbo vai para o arquivo-alvo. Ler só
#     o stdout dá falso-verde. Aqui se lê o arquivo-alvo também, e o veredito
#     é por exit code + presença da lista de tasks.
#
# Uso: bash .tooling/scripts/ci/turbo-redirect-differential.sh
# Sai != 0 se houver divergência, para poder entrar num gate no futuro.
set -uo pipefail

WS=$(mktemp -d /tmp/turbo-diff-XXXXXX)
# Resolve o próprio diretório ABSOLUTO antes de subir. Com `../..` a partir de
# um `$0` relativo, o `cd` é relativo ao cwd e não ao script. E o número de
# `..` é a contagem de segmentos: este arquivo vive em `.tooling/scripts/ci`,
# então são TRÊS para chegar na raiz. Errei as duas vezes — a primeira
# apontava para `.tooling/node_modules` e `.tooling/.tooling`, a segunda ainda
# para `.tooling`. As duas apareceram como "15/15 divergentes", que é ruído, e
# não sinal. Daí o guard logo abaixo: ele falha em 1 linha, em vez de produzir
# 15 medições sem sentido.
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PARSER="$ROOT/.tooling/scripts/ci/check-package-json-drift.ts"
trap 'rm -rf "$WS"' EXIT

mkdir -p "$WS/apps/p"
printf 'packages:\n  - "apps/*"\n' > "$WS/pnpm-workspace.yaml"
printf '{ "name": "@x/root", "version": "0.0.0", "private": true, "packageManager": "pnpm@9.0.0" }\n' > "$WS/package.json"
# tasks vazio: toda palavra task vira "Could not find task"
printf '{ "$schema": "https://turbo.build/schema.json", "tasks": {} }\n' > "$WS/turbo.json"
printf '{ "name": "@x/p", "version": "0.0.0", "scripts": { "build": "echo build" } }\n' > "$WS/apps/p/package.json"
# Sem `2>/dev/null`: symlink pendente significa que o turbo não roda, e aí TODAS
# as 15 medições viram `[]` — o instrumento quebrado produzindo um resultado
# que parece um veredito. Falha barulhenta, não silêncio.
[ -d "$ROOT/node_modules" ] || { echo "ERRO: $ROOT/node_modules nao existe"; exit 1; }
ln -s "$ROOT/node_modules" "$WS/node_modules"

OUT="$WS/.turbo-out"
n=0; div=0
while IFS= read -r form; do
  [ -z "$form" ] && continue
  n=$((n + 1))
  # limpa artefatos de redirect do caso anterior, recria o que o corpus usa
  find "$WS" -maxdepth 1 -type f ! -name '*.json' ! -name '*.yaml' -delete 2>/dev/null
  printf 'conteudo\n' > "$WS/in.txt"

  ( cd "$WS" && bash -c "pnpm turbo run $form" ) > "$OUT" 2>&1
  # a saida do turbo pode ter ido para o arquivo-alvo do proprio comando
  find "$WS" -maxdepth 1 -type f ! -name '*.json' ! -name '*.yaml' ! -name 'in.txt' ! -name '.turbo-out' \
    -exec cat {} + >> "$OUT" 2>/dev/null

  # O instrumento precisa provar que rodou. Sem esta checagem, um turbo que nem
  # executou produz `real=[]`, e uma forma sem tasks casaria `[]` com `[]` e
  # reportaria `ok` — o falso-verde mais caro possível, vindo do próprio
  # verificador.
  grep -q 'turbo 2\.11\.2' "$OUT" || { echo "ABORTA: turbo nao executou em '$form'"; exit 1; }

  real=$(grep -oE 'Could not find task `[^`]+`' "$OUT" \
    | sed 's/.*`\(.*\)`/\1/' | sort -u | tr '\n' ',' | sed 's/,$//')
  got=$(node --experimental-strip-types -e "
    import('$PARSER')
      .then((m) => console.log(m.extractTurboRunTasks('turbo run $form').sort().join(',')))
      .catch((e) => console.log('ERRO:' + e.code))
  " 2>/dev/null | tail -1)

  case "$got" in
    ERRO:*) echo "ABORTA: parser nao carregou em '$form' ($got)"; exit 1 ;;
  esac

  if [ "$real" = "$got" ]; then
    printf '  ok     %-34s tasks=[%s]\n' "$form" "$real"
  else
    div=$((div + 1))
    printf 'DIVERGE %-34s turbo=[%s] parser=[%s]\n' "$form" "$real" "$got"
  fi
done <<'CASES'
build
build >out.log
build >out.log ALVO
build>log.txt ALVO
build 2>err ALVO
build 2>&1 ALVO
build &>a.log ALVO
ALVO >out.log
build <in.txt ALVO
build<<EOF ALVO
build >>log ALVO
build 2> ALVO
build > ALVO
build >out.log build2 ALVO
build --filter=./apps/* ALVO
CASES

echo
echo "  $n formas testadas contra o turbo real, $div divergentes"
[ "$div" -eq 0 ] || exit 1
