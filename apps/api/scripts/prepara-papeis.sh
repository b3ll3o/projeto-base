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
# ⚠️ (#133) A URI tem de NOMEAR o papel que recebe a senha. O `ALTER ROLE`
# escreve em `app_runtime` e `app_system` — papéis FIXOS — e a senha vem
# das URIs. Uma URI que nomeasse OUTRO usuário colocaria a senha de um papel
# em outro, e o filtro de tamanho (que é do PAPEL) deixaria passar uma
# senha curta. Por isso o script recusa: o filtro é do papel que a senha vai
# SERVIR, e a URI tem de apontar para ele.
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
#
# ⚠️ (#133) A URI vai pelo AMBIENTE, e não por argv.
#
# O argv de um processo é público na máquina: `ps aux` mostra a linha de
# comando de qualquer usuário, e a senha estava ali — dentro da URI, que
# é o que carrega a credencial INTEIRA. O ambiente só é legível pelo
# próprio usuário (e pelo root), e a URI já estava no ambiente deste
# script — ou seja, o env não expõe nada de novo.
senha_de() {
  URI_DO_BANCO="$1" node -e '
    const url = new URL(process.env.URI_DO_BANCO);
    const senha = decodeURIComponent(url.password || "");
    process.stdout.write(senha.replace(/'"'"'/g, "'"'"''"'"'"));
  '
}

# O USUÁRIO da URI.
usuario_de() {
  URI_DO_BANCO="$1" node -e '
    const url = new URL(process.env.URI_DO_BANCO);
    process.stdout.write(decodeURIComponent(url.username || ""));
  '
}

# O TAMANHO da senha, em BYTES UTF-8.
#
# ⚠️ (#133) A MEDIDA tem de ser a MESMA nos dois lados — e o `sh` do
# container conta BYTES (`${#senha}`), enquanto o guard (TypeScript) contava
# unidades UTF-16. MEDIDO: `"😀😀😀😀😀😀"` (12 unidades, 24 bytes) PASSAVA
# no script — que é quem escreve — e era RECUSADO pelo guard. As duas
# camadas que precisam concordar mediam coisas diferentes.
#
# Por isso a medida é a de BYTES, e é o `node` que a faz nos dois lados: o
# `Buffer.byteLength` é o do Node, e o `node` já é dependência deste
# script (é ele que extrai a senha). O `sh` contaria bytes, mas contaria
# os da LOCALE — e a locale do container não é a do Node.
tamanho_da_senha() {
  SENHA_A_MEDIR="$1" node -e '
    process.stdout.write(String(Buffer.byteLength(process.env.SENHA_A_MEDIR, "utf8")));
  '
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

# ⚠️ (#133) Os PAPÉIS que este script escreve são FIXOS — e é esse o
# defeito que o mínimo indexado pelo usuário da URI escondia.
#
# O `ALTER ROLE` do fim do script escreve em `app_runtime` e `app_system`,
# com as senhas que vêm do `DATABASE_URL` e do `SYSTEM_DATABASE_URL`. As
# DUAS coisas eram independentes: o filtro de tamanho olhava o USUÁRIO da
# URI, e a escrita olhava o PAPEL. MEDIDO: com
# `DATABASE_URL=postgresql://runtime:<15 caracteres>@…` o filtro não se
# aplicava (o usuário não é um papel gerenciado) e o script rodava
# `ALTER ROLE app_runtime LOGIN PASSWORD '<15 caracteres>'` — a
# credencial que a #133 tirou do repositório voltava a autenticar no
# papel de runtime.
#
# Por isso o mínimo é do PAPEL ESCRITO, e a URI tem de NOMEAR esse papel.
PAPEL_DE_RUNTIME='app_runtime'
PAPEL_DE_SISTEMA='app_system'

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
# ⚠️ (#133) As duas medem em BYTES UTF-8 — e não em caracteres. O `sh` do
# container conta bytes e o TypeScript contava unidades UTF-16; a regra que
# "precisa concordar" media duas coisas diferentes.
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
PAPEIS_COM_SENHA_GERIDA="$PAPEL_DE_RUNTIME $PAPEL_DE_SISTEMA"

# O tamanho mínimo de uma senha de PAPEL do banco.
#
# ⚠️ (#133) O NÚMERO mora em DOIS lugares — aqui e no TypeScript — e o
# `papel-de-runtime.spec.ts` RECONCILIA os dois (lê este arquivo e compara).
# Sem isso, os dois divergem em silêncio e a regra da camada que escreve
# deixa de valer. O dono do número é o TypeScript
# (`TAMANHO_MINIMO_DE_SENHA_DE_PAPEL`).
TAMANHO_MINIMO_DE_SENHA_DE_PAPEL=24

motivo_da_recusa() {
  # $1 = senha. $2 = usuário da URI. $3 = o PAPEL que a senha vai SERVIR
  # (vazio = o DONO, que não tem papel). IMPRIME o motivo da recusa e
  # devolve 0 quando a credencial é RECUSADA.
  #
  # ⚠️ (#133) O terceiro argumento é o PAPEL, e não o usuário da URI: o
  # filtro é do papel que a senha vai SERVIR — e é este script que decide
  # em qual papel ela vai cair. Indexar pelo usuário da URI é o que deixava o
  # filtro burado (MEDIDO: `usuario='runtime'` + senha de 15 caracteres
  # passava, e o `ALTER ROLE app_runtime` aplicava essa senha).
  #
  # ⚠️ O PREFIXO é conferido em minúsculas: o guard normaliza, e um
  # `Change_Me_...` (a mesma isca, com outra caixa) passava pelo `case` do
  # shell — e a camada que ESCREVE a senha é justamente a que não pode
  # deixar a isca passar.
  senha="$1"
  usuario="$2"
  papel="$3"
  minuscula="$(printf '%s' "$senha" | tr '[:upper:]' '[:lower:]')"
  case "$minuscula" in
    change_me*|'***')
      echo 'é um valor de EXEMPLO'
      return 0
      ;;
  esac
  # ⚠️ (#133) A URI tem de NOMEAR o papel que recebe a senha. A escrita é
  # em papel FIXO (`app_runtime`, `app_system`); se a URI nomear OUTRO
  # usuário, a senha que entra no papel gerenciado não é a senha daquele
  # papel — e o filtro, que é por papel, deixaria passar a senha curta de
  # um papel que o script NÃO é. Recusar aqui é o que fecha o furo na
  # camada que ESCREVE — a única que consegue colocá-lo.
  if [ -n "$papel" ] && [ "$usuario" != "$papel" ]; then
    echo "a URI nomeia '$usuario' e não o papel '$papel' que recebe a senha"
    return 0
  fi
  # O tamanho mínimo alcança os PAPÉIS GERENCIADOS — e o DONO não entra: a
  # credencial dele é a `DIRECT_DATABASE_URL`, e o guard de boot — que
  # não a recebe — só exige que ela não seja um valor de exemplo.
  if [ -n "$papel" ]; then
    case " $PAPEIS_COM_SENHA_GERIDA " in
      *" $papel "*)
        tamanho="$(tamanho_da_senha "$senha")"
        if [ "$tamanho" -lt "$TAMANHO_MINIMO_DE_SENHA_DE_PAPEL" ]; then
          echo "tem $tamanho bytes — o mínimo do papel gerenciado é $TAMANHO_MINIMO_DE_SENHA_DE_PAPEL"
          return 0
        fi
        ;;
    esac
  fi
  return 1
}

if motivo="$(motivo_da_recusa "$senha_runtime" "$usuario_runtime" "$PAPEL_DE_RUNTIME")"; then
  echo "ERRO: a credencial do papel de RUNTIME não serve: $motivo." >&2
  echo '       Um valor recusado aqui vira a senha VIVA do papel de produção.' >&2
  echo '       Gere uma senha de verdade: openssl rand -hex 32. Veja docs/como-rodar.md §1.2.1.' >&2
  exit 1
fi
if motivo="$(motivo_da_recusa "$senha_sistema" "$usuario_sistema" "$PAPEL_DE_SISTEMA")"; then
  echo "ERRO: a credencial do papel de SISTEMA não serve: $motivo." >&2
  echo '       Um valor recusado aqui vira a senha VIVA do papel de produção.' >&2
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
# ⚠️ (#133) O DONO entra no filtro de PLACEHOLDER, e não no de tamanho — o
# papel vazio é o que diz "este não é um papel gerenciado", e o usuário do
# dono não tem de ser um papel (a `DIRECT_DATABASE_URL` é a do DONO).
if motivo="$(motivo_da_recusa "$senha_dono" "$usuario_dono" "")"; then
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

printf "ALTER ROLE %s LOGIN PASSWORD '%s';\nALTER ROLE %s LOGIN PASSWORD '%s';\n" \
  "$PAPEL_DE_RUNTIME" "$senha_runtime" "$PAPEL_DE_SISTEMA" "$senha_sistema" \
  | DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma db execute --stdin --schema=prisma/schema.prisma

echo 'prepara-papeis: senhas de app_runtime e app_system aplicadas.'
