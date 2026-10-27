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

if [ -z "${DATABASE_URL:-}" ]; then
  echo 'ERRO: DATABASE_URL vazia — é a credencial do papel de RUNTIME.' >&2
  exit 1
fi
if [ -z "${SYSTEM_DATABASE_URL:-}" ]; then
  echo 'ERRO: SYSTEM_DATABASE_URL vazia — é a credencial do papel de SISTEMA (#118).' >&2
  exit 1
fi
if [ -z "${DIRECT_DATABASE_URL:-}" ]; then
  echo 'ERRO: DIRECT_DATABASE_URL vazia — o ALTER ROLE exige a credencial de DONO.' >&2
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

printf "ALTER ROLE app_runtime LOGIN PASSWORD '%s';\nALTER ROLE app_system LOGIN PASSWORD '%s';\n" \
  "$senha_runtime" "$senha_sistema" \
  | DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma db execute --stdin --schema=prisma/schema.prisma

echo 'prepara-papeis: senhas de app_runtime e app_system aplicadas.'
