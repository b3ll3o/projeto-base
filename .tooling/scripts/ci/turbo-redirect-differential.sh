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
# ERROS QUE ESTE SCRIPT JÁ COMETEU (não repita) — o corpo numera de 1 a 6
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
# para `.tooling`. As duas apareceram como "todas as formas divergentes", que é
# ruído, e não sinal — e o número exato é uma claim que envelhece a cada forma
# acrescentada ao corpus, sem que nada do script mude. Daí o guard logo abaixo:
# ele falha em 1 linha, em vez de produzir uma pilha de medições sem sentido.
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PARSER="$ROOT/.tooling/scripts/ci/check-package-json-drift.ts"
trap 'rm -rf "$WS"' EXIT

mkdir -p "$WS/apps/p"
printf 'packages:\n  - "apps/*"\n' > "$WS/pnpm-workspace.yaml"
# 3. `packageManager` chumbado aqui quebrava o gate NO CI. O corepack honra o
#    campo: com `pnpm@9.0.0` e essa versao fora do cache do runner, ele tentava
#    baixar antes de rodar qualquer coisa, o banner do turbo nao saia, e a
#    checagem de autoverificacao abaixo abortava — 271 ms depois de comecar,
#    contra 8,2 s que as 18 formas levam. Localmente passava porque o 9.0.0
#    estava no cache desta maquina desde o dia em que o harness foi escrito.
#    O verde era uma propriedade do cache, nao do repo. Agora o campo e lido do
#    package.json do repo, que e a unica fonte, e nao pode divergir dele.
PM_VERSION=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/package.json")
[ -n "$PM_VERSION" ] || { echo "ERRO: packageManager ausente em $ROOT/package.json"; exit 1; }
printf '{ "name": "@x/root", "version": "0.0.0", "private": true, "packageManager": "%s" }\n' "$PM_VERSION" > "$WS/package.json"
# tasks vazio: toda palavra task vira "Could not find task"
printf '{ "$schema": "https://turbo.build/schema.json", "tasks": {} }\n' > "$WS/turbo.json"
printf '{ "name": "@x/p", "version": "0.0.0", "scripts": { "build": "echo build" } }\n' > "$WS/apps/p/package.json"
# Sem `2>/dev/null`: symlink pendente significa que o turbo não roda, e aí TODAS
# as medições viram `[]` — o instrumento quebrado produzindo um resultado
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

  # O instrumento precisa provar que rodou — e provar **isto**: que o turbo leu o
  # comando, resolveu as tasks contra o `tasks = {}` e por isso nomeou cada
  # palavra. Sem esta checagem, um turbo que nem executou produz `real=[]`, e uma
  # forma sem tasks casaria `[]` com `[]` e reportaria `ok` — o falso-verde mais
  # caro possível, vindo do próprio verificador.
  #
  # 4. A prova é `real` não-vazio, não o banner. Duas tentativas anteriores usaram
  #    o banner — `turbo 2.11.2` chumbado, depois `turbo [0-9]+\.[0-9]+\.[0-9]+` —
  #    e as duas quebraram no CI. A saída do CI diz por quê: `• turbo 2.11.2` não
  #    sai num runner sem TTY, que é exatamente onde este gate roda (a assinatura
  #    é o renderizador plain, com `x` no lugar de `→`). A versão no grep
  #    envelhecia no lugar mais caro do arquivo; já sem versão, o banner ainda
  #    media o terminal em vez do turbo.
  #
  # 5. Um único regex define o que é uma task, para o guard e para a comparação.
  #    Duas definições divergentes dão um guard que passa enquanto a comparação
  #    (ou vice-versa) — o guard medindo uma coisa e o veredito medindo outra.
  real=$(grep -oE 'Could not find task `[^`]+`' "$OUT" \
    | sed 's/.*`\(.*\)`/\1/' | sort -u | tr '\n' ',' | sed 's/,$//')
  # 6. E o abort diz o que ele sabe, não o que ele deduz. Este gate já abortou três
  #    vezes no CI com "turbo não executou" — e nenhuma das três vezes o turbo
  #    era a causa. Abortar sem dump é abortar sem evidência: sem o que saiu, a
  #    próxima hipótese também é um palpite.
  [ -n "$real" ] || {
    echo "ABORTA: o turbo nao nomeou nenhuma task em '$form'."
    echo "O que sei: nenhuma linha 'Could not find task \`X\`' apareceu em \$OUT."
    echo "O que NAO sei: se o turbo rodou. Quatro causas dão esta mesma linha —"
    echo "  (a) o turbo nao executou;"
    echo "  (b) executou contra um turbo.json com tasks reais, e a premissa do"
    echo "      differential (tasks = {}) quebrou;"
    echo "  (c) o texto da mensagem mudou;"
    echo "  (d) a saida foi para o arquivo-alvo do comando e nao voltou para \$OUT."
    echo "--- exit de 'pnpm turbo run $form' e saida capturada ---"
    echo "WS=$WS"
    echo "node_modules -> $(readlink "$WS/node_modules" 2>&1)"
    echo "turbo visivel em \$WS/node_modules/.bin: $(ls "$WS/node_modules/.bin/turbo" 2>&1)"
    echo "--- conteudo de \$OUT ---"
    cat "$OUT" 2>&1 | head -30
    echo "--- fim ---"
    exit 1
  }
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
build "a<b"
"a<b" build
build "lint typecheck"
CASES

echo
echo "  $n formas testadas contra o turbo real, $div divergentes"
[ "$div" -eq 0 ] || exit 1
