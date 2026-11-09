#!/bin/sh
# apps/api/scripts/prepara-papeis.sh
#
# pt-BR (#118): aplica a SENHA dos papeis do banco, a partir do ambiente.
#
# POR QUE ISTO EXISTE
#
# A migration cria os papeis (`app_runtime`, `app_system`) SEM senha —
# `NOLOGIN`. Uma migration nao le env, e foi por isso que a senha do
# `app_runtime` ficou versionada em texto puro no historico do Git deste
# repositorio. A senha tem de vir de outro lugar: do ambiente, que é onde ela
# é segredo.
#
# A migration `20261108000001_papel_runtime_sem_senha_publicada` fecha o
# buraco para quem JA aplicou a versao antiga: ela limpa (`PASSWORD NULL`) o
# hash que a senha publicada deixou no banco. MEDIDO: depois dela,
# `rolcanlogin = f` e `rolpassword IS NULL = t`.
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

# O USUÁRIO da URI — e é ele que diz QUAL mínimo vale.
#
# ⚠️ (#133) O mínimo de 24 alcança os PAPÉIS GERENCIADOS
# (`app_runtime`, `app_system`) e NAO alcança o DONO: o guard de boot
# (`credenciais-do-banco.ts`) faz a MESMA distinção, e as duas camadas
# precisam concordar. Sem a exceção, o bootstrap de DEV quebrava: o
# `apps/api/.env.example` entrega `projeto:projeto` para o dono (6
# caracteres), e o script recusaria — com o runbook mandando gerar senha
# só para os dois papéis.
usuario_de() {
  node -e '
    const url = new URL(process.argv[1]);
    process.stdout.write(decodeURIComponent(url.username || ""));
  ' "$1"
}

senha_runtime="$(senha_de "$DATABASE_URL")"
senha_sistema="$(senha_de "$SYSTEM_DATABASE_URL")"
usuario_runtime="$(usuario_de "$DATABASE_URL")"
usuario_sistema="$(usuario_de "$SYSTEM_DATABASE_URL")"
usuario_dono="$(usuario_de "$DIRECT_DATABASE_URL")"

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
# É a MESMA regra do guard (`PREFIXOS_DE_SENHAS_EXPOSTAS` /
# `TAMANHO_MINIMO_DE_SENHA_DE_PAPEL`, em
# `src/shared/infrastructure/prisma/papel-de-runtime.ts`): o prefixo de
# exemplo e o tamanho mínimo. As duas existem em camadas diferentes — o
# script APLICA, o guard RECUSA — e as duas precisam recusar a isca.
#
# ⚠️ (#133) O mínimo subiu de 16 para 24. A senha que o repositório publicou
# tinha 15 — e PASSAVA pelo filtro de 16 (que só recusava < 16). Com 24, ela
# é barrada pelo TAMANHO, e não por valor: escrever o valor nesta lista seria
# outra forma de publicá-lo.
#
# ⚠️ O NÚMERO mora em DOIS lugares — aqui e no TypeScript — e o
# `papel-de-runtime.spec.ts` RECONCILIA os dois (lê este arquivo e compara).
# Sem isso, os dois divergem em silêncio e a regra da camada que escreve
# deixa de valer. O dono do número é o TypeScript
# (`TAMANHO_MINIMO_DE_SENHA_DE_PAPEL`).
# Os papéis cujas senhas o repositório GERE (e que, por isso, têm mínimo).
# ⚠️ (#133) É a MESMA lista do TypeScript (`PAPEIS_COM_SENHA_GERIDA`), e as
# duas camadas precisam concordar: o guard de boot recusa a senha curta de um
# papel gerenciado, e o script — que ESCREVE a senha — recusa também.
PAPEIS_COM_SENHA_GERIDA='app_runtime app_system'

senha_de_exemplo() {
  # $1 = senha. $2 = usuário da URI. Devolve 0 quando ela é de EXEMPLO (ou,
  # quando o usuário é um papel gerenciado, curta demais).
  #
  # ⚠️ O PREFIXO é conferido em minúsculas: o guard normaliza, e um
  # `Change_Me_...` (a mesma isca, com outra caixa) passava pelo `case` do
  # shell — e a camada que ESCREVE a senha é justamente a que não pode
  # deixar a isca passar.
  senha="$1"
  usuario="$2"
  minuscula="$(printf '%s' "$senha" | tr '[:upper:]' '[:lower:]')"
  case "$minuscula" in
    change_me*|'***') return 0 ;;
  esac
  # 24 caracteres é o mínimo do próprio repositório para uma senha de PAPEL
  # (`TAMANHO_MINIMO_DE_SENHA_DE_PAPEL`, no TypeScript). O DONO não entra:
  # a credencial dele é a `DIRECT_DATABASE_URL`, e o guard de boot — que
  # não a recebe — só exige que ela não seja um valor de exemplo.
  case " $PAPEIS_COM_SENHA_GERIDA " in
    *" $usuario "*)
      [ "${#senha}" -lt 24 ] && return 0
      ;;
  esac
  return 1
}

if senha_de_exemplo "$senha_runtime" "$usuario_runtime"; then
  echo 'ERRO: a senha do papel de RUNTIME é um valor de EXEMPLO (ou é curta demais — 24 caracteres, no mínimo).' >&2
  echo '       Um placeholder aplicado aqui vira a senha VIVA do papel de produção.' >&2
  echo '       Gere uma senha de verdade: openssl rand -hex 32. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi
if senha_de_exemplo "$senha_sistema" "$usuario_sistema"; then
  echo 'ERRO: a senha do papel de SISTEMA é um valor de EXEMPLO (ou é curta demais — 24 caracteres, no mínimo).' >&2
  echo '       Um placeholder aplicado aqui vira a senha VIVA do papel de produção.' >&2
  echo '       Gere uma senha de verdade: openssl rand -hex 32. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi

# ⚠️ (#133) O DONO entra no mesmo filtro. A `DIRECT_DATABASE_URL` é a
# credencial que o script USA para aplicar as senhas dos papeis — e ela é
# Superuser (ou tem CREATEROLE), ou seja, a que mais privilege tem. O
# placeholder do `.env.production.example` para o dono
# (`CHANGE_ME_...`) era recusado por NINGUEM: nem o guard (que não recebe a
# `DIRECT_DATABASE_URL`) nem este script (que só olhava as senhas dos
# papeis). Um dono com senha de exemplo é o banco inteiro atrás de uma
# senha pública.
# ⚠️ (#133) O DONO entra no filtro de PLACEHOLDER — e não no de tamanho.
#
# O dono é Superuser (ou tem CREATEROLE): a credencial dele é a
# `DIRECT_DATABASE_URL`, e o placeholder do `.env.production.example` para o
# dono (`CHANGE_ME_...`) era recusado por NINGUEM — nem o guard (que não
# recebe a `DIRECT_DATABASE_URL`) nem este script (que só olhava as senhas dos
# papeis). Um dono com senha de exemplo é o banco inteiro atrás de uma senha
# pública.
#
# ⚠️ O tamanho NÃO entra para o dono, e é DELIBERADO: o bootstrap de dev
# documentado usa `projeto:projeto` (6 caracteres) — e o guard de boot faz a
# MESMA distinção (o mínimo alcança os papéis gerenciados, não o dono). As
# duas camadas concordam, e o dev sobe.
senha_dono="$(senha_de "$DIRECT_DATABASE_URL")"
if senha_de_exemplo "$senha_dono" "$usuario_dono"; then
  echo 'ERRO: a senha do DONO do banco é um valor de EXEMPLO.' >&2
  echo '       O dono é o papel que roda a migration — é o que mais privilege tem.' >&2
  echo '       Gere uma senha de verdade: openssl rand -hex 32. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi

# ⚠️ (#132) A PODA do registro de refresh tokens, ANTES das senhas.
#
# A tabela `refresh_tokens` guarda uma linha por login, e ela só é útil
# enquanto o token não expirou — o `expires_at` é o `exp` do próprio token.
# Sem poda, a tabela só cresce.
#
# ⚠️ A comparação é de INSTANTES (`expires_at` é `timestamptz`, e `now()` é
# `timestamptz`), e por isso ela vale em QUALQUER fuso do banco. MEDIDO
# 2026-11-08 num Postgres 16 real: com a coluna `timestamp` (parede de
# relógio, sem fuso), a mesma consulta removia tokens QUE AINDA VALIAM num
# banco à frente do UTC (2 podados em `Asia/Tokyo`) e não podava nenhum num
# banco atrás (0 em `America/Sao_Paulo`).
#
# ⚠️ A PODA NÃO ABORTA O SETUP: ela é manutenção, e um banco onde a tabela
# ainda não existe (migration não rodada) tem que continuar recebendo a
# senha dos papeis. Por isso o `|| echo` — e a poda vem ANTES dos `ALTER
# ROLE` justamente para que a falha de um não impeça o outro.
printf "DELETE FROM refresh_tokens WHERE expires_at < now();\n" \
  | DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma db execute --stdin --schema=prisma/schema.prisma \
  || echo 'aviso: a poda do registro de refresh tokens nao rodou (a tabela talvez nao exista ainda) — o resto do setup segue.'

printf "ALTER ROLE app_runtime LOGIN PASSWORD '%s';\nALTER ROLE app_system LOGIN PASSWORD '%s';\n" \
  "$senha_runtime" "$senha_sistema" \
  | DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma db execute --stdin --schema=prisma/schema.prisma

echo 'prepara-papeis: senhas de app_runtime e app_system aplicadas.'
