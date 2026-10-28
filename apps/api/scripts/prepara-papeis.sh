#!/bin/sh
# apps/api/scripts/prepara-papeis.sh
#
# pt-BR (#118): aplica a SENHA dos papeis do banco, a partir do ambiente.
#
# POR QUE ISTO EXISTE
#
# A migration cria os papeis (`app_runtime`, `app_system`) SEM senha —
# `NOLOGIN`. Uma migration nao le env, e foi por isso que a senha do
# `app_runtime` ficou versionada em texto puro (`PASSWORD 'app_runtime_dev'`,
# no historico do Git deste repositorio). A senha tem de vir de outro lugar:
# do ambiente, que é onde ela é segredo.
#
# ⚠️ A ORDEM IMPORTA, e é a ordem do ENTRYPOINT:
#
#   1. `prisma migrate deploy` — cria os papeis (sem senha);
#   2. `prepara-papeis.sh`    — aplica a senha, com a credencial de DONO;
#   3. `node dist/main.js`    — a API conecta com a senha aplicada.
#
# A senha vem da URI: `DATABASE_URL` é a credencial do papel de RUNTIME, e
# `SYSTEM_DATABASE_URL` a do papel de SISTEMA. As DUAS sao obrigatorias no
# mesmo lugar — e e a separacao entre elas que fecha o furo da #118.
#
# A conexao do `db execute` e a de DONO (`DIRECT_DATABASE_URL`): o `ALTER ROLE`
# exige superuser, e o `app_runtime` nao e.
#
# `set -eu`: qualquer falha aborta o boot. Um papel sem senha faz a API
# subir e falhar na primeira conexao — o pior dos dois mundos.

set -eu

# ⚠️ O `.env` DO APP É A FONTE DAS URIs NO AMBIENTE LOCAL.
#
# O README, o runbook (§1.2.1) e o `.env.example` mandam pôr as três URIs em
# `apps/api/.env` e rodar este script — sem exportar nada. O script, como
# estava, só olhava o AMBIENTE: em local ele abortava com "DATABASE_URL
# vazia", e a instrução dos três documentos não podia ser seguida.
#
# No CONTAINER não existe `.env` (o Dockerfile prod copia `dist`, `prisma` e
# `scripts` — e só eles): lá quem traz as URIs é o `env_file` do Compose. Por
# isso o AMBIENTE tem precedência sobre o arquivo, e o arquivo é a RESERVA.
ARQUIVO_ENV="$(dirname "$0")/../.env"

# O valor de uma chave: do AMBIENTE primeiro, do `.env` do app como reserva.
#
# O `.env` do app é `CHAVE=VALOR`, com o valor dividido no PRIMEIRO `=` (a
# senha pode conter `=`) e as aspas do par retiradas. O valor sai de um `sed`
# — e o resultado de uma substituição de comando NÃO é re-expandido, então uma
# senha com `$` chega intacta (a senha vai parar num literal SQL).
valor_de() {
  chave="$1"

  valor="$(printenv "$chave" 2>/dev/null || true)"
  if [ -n "$valor" ]; then
    printf '%s' "$valor"
    return 0
  fi

  [ -f "$ARQUIVO_ENV" ] || return 0
  valor="$(sed -n "s/^[[:space:]]*${chave}[[:space:]]*=[[:space:]]*//p" "$ARQUIVO_ENV" | head -n 1)"
  printf '%s' "$(printf '%s' "$valor" | sed -e 's/[[:space:]]*$//' -e "s/^[\"']//" -e "s/[\"']\$//")"
}

DATABASE_URL="$(valor_de DATABASE_URL)"
SYSTEM_DATABASE_URL="$(valor_de SYSTEM_DATABASE_URL)"
DIRECT_DATABASE_URL="$(valor_de DIRECT_DATABASE_URL)"
export DATABASE_URL SYSTEM_DATABASE_URL DIRECT_DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
  echo 'ERRO: DATABASE_URL vazia — é a credencial do papel de RUNTIME.' >&2
  echo '       Ponha a URI em apps/api/.env ou exporte a variável. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi
if [ -z "$SYSTEM_DATABASE_URL" ]; then
  echo 'ERRO: SYSTEM_DATABASE_URL vazia — é a credencial do papel de SISTEMA (#118).' >&2
  echo '       Ponha a URI em apps/api/.env ou exporte a variável. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi
if [ -z "$DIRECT_DATABASE_URL" ]; then
  echo 'ERRO: DIRECT_DATABASE_URL vazia — o ALTER ROLE exige a credencial de DONO.' >&2
  echo '       Ponha a URI em apps/api/.env ou exporte a variável. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi

# Extrai a senha da URI e escapa o `'` (o único caractere que muda o
# sentido de um literal SQL). O `decodeURIComponent` desfaz o percent-encoding
# — a senha real é a decodificada.
senha_de() {
  node -e '
    const url = new URL(process.argv[1]);
    const senha = decodeURIComponent(url.password || "");
    process.stdout.write(senha.replace(/'"'"'/g, "'"'"''"'"'"));
  ' "$1"
}

senha_runtime="$(senha_de "$DATABASE_URL")"
senha_sistema="$(senha_de "$SYSTEM_DATABASE_URL")"

if [ -z "$senha_runtime" ] || [ -z "$senha_sistema" ]; then
  echo 'ERRO: uma das URIs não tem senha — o papel do banco não tem como autenticar.' >&2
  exit 1
fi

# ⚠️ ESTE SCRIPT É ONDE O PLACEHOLDER VIRA SENHA VIVA.
#
# O guard de boot (`verificarCredenciaisDoBanco`) recusa a senha de exemplo —
# mas o guard roda DEPOIS deste passo, e este passo é o que escreve a senha no
# papel. MEDIDO: com o placeholder `***` do `.env.production.example`, o guard
# aceitava, o boot passava, e o `ALTER ROLE` aplicava `***` como a senha do
# papel de PRODUÇÃO — uma senha pública no repositório, com o banco inteiro
# atrás dela.
#
# Por isso a regra é APLICADA AQUI, na camada que escreve, e não só no guard:
# um placeholder recusado pelo guard mas aplicado pelo script deixa o papel
# com senha pública mesmo com a API recusando o boot.
#
# É a MESMA regra do guard (`SENHAS_EXPOSTAS` / `PREFIXOS_DE_SENHAS_EXPOSTAS`,
# em `src/shared/infrastructure/prisma/papel-de-runtime.ts`): o prefixo de
# exemplo e o tamanho mínimo. As duas existem em camadas diferentes — o
# script APLICA, o guard RECUSA — e as duas precisam recusar a isca.
senha_de_exemplo() {
  # $1 = senha. Devolve 0 quando ela é de EXEMPLO.
  printf '%s' "$1" | {
    IFS= read -r senha || true
    case "$senha" in
      CHANGE_ME*|change_me*) exit 0 ;;
    esac
    # 16 bytes é o mínimo do próprio repositório para uma senha de banco
    # (`CHANGE_ME_strong_password_min_16_chars`, no example do dono).
    [ "${#senha}" -lt 16 ] && exit 0
    exit 1
  }
}

if senha_de_exemplo "$senha_runtime"; then
  echo 'ERRO: a senha do papel de RUNTIME é um valor de EXEMPLO (ou é curta demais).' >&2
  echo '       Um placeholder aplicado aqui vira a senha VIVA do papel de produção.' >&2
  echo '       Gere uma senha de verdade: openssl rand -hex 32. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi
if senha_de_exemplo "$senha_sistema"; then
  echo 'ERRO: a senha do papel de SISTEMA é um valor de EXEMPLO (ou é curta demais).' >&2
  echo '       Um placeholder aplicado aqui vira a senha VIVA do papel de produção.' >&2
  echo '       Gere uma senha de verdade: openssl rand -hex 32. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi

printf "ALTER ROLE app_runtime LOGIN PASSWORD '%s';\nALTER ROLE app_system LOGIN PASSWORD '%s';\n" \
  "$senha_runtime" "$senha_sistema" \
  | DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma db execute --stdin --schema=prisma/schema.prisma

echo 'prepara-papeis: senhas de app_runtime e app_system aplicadas.'
