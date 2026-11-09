// apps/api/src/shared/infrastructure/prisma/credenciais-do-banco.ts
//
// pt-BR (#118): o guard que decide se as CREDENCIAIS do banco servem.
//
// Duas credenciais, e as duas têm que estar em ordem:
//
//   `DATABASE_URL`       → o papel de RUNTIME. É a credencial que vive no
//                          container da API — a que mais vaza (está no env, em
//                          log, em mensagem de erro). Ela NÃO abre o bucket
//                          de sistema.
//   `SYSTEM_DATABASE_URL` → o papel de SISTEMA. É a credencial que abre o
//                          bucket de sistema (`current_user = 'app_system'`),
//                          e ela é SEPARADA da de runtime.
//
// ⚠️ POR QUE O `SYSTEM_DATABASE_URL` É OBRIGATÓRIO, E NÃO OPCIONAL
//
// Com uma credencial só, qualquer coisa que a sessão possa escolher, o
// atacante escolhe. A sessão escolhe o GUC (`app.tenant_id`); a sessão NÃO
// escolhe o `current_user` — esse vem da credencial. Então o bucket de sistema
// só pode ser concedido por uma credencial DIFFERENTE, e a aplicação precisa
// tê-la. Sem ela, o bucket de sistema simplesmente não abre — e a API precisa
// dizer isso no boot, e não no primeiro cadastro.
//
// ⚠️ A SENHA QUE O REPOSITÓRIO PUBLICOU
//
// #133: a senha de runtime que a migration publicava está no HISTÓRICO do
// Git deste repositório — e quem leu o repositório, conhece. A recusa não
// pode ser por VALOR (escrever o valor aqui seria outra forma de publicá-lo),
// e é por CRITÉRIO:
//
//   1. o PREFIXO de exemplo (`CHANGE_ME…`, `***`);
//   2. o TAMANHO mínimo — e é ele que barra a senha publicada, que tinha 15
//      caracteres.
//
// ⚠️ O tamanho só alcança os PAPÉIS GERENCIADOS (`app_runtime`,
// `app_system`): o dono do banco (`projeto` no Compose) não entra, e o
// Compose de DEV conecta como o dono com a senha `projeto` (6 caracteres).
// MEDIDO: `verificarCredenciaisDoBanco` devolvia `{"ok":true}` para ela — e
// um mínimo sem esta exceção derrubaria o DEV no primeiro boot.
//
// A decisão é uma FUNÇÃO PURA (o mesmo padrão do `decisaoDoAdminLocal` do
// PR #115 e do `segredoDeServico` do #120): decisão de segurança dentro de
// um construtor é decisão sem spec.

import {
  PAPEIS_COM_SENHA_GERIDA,
  PREFIXOS_DE_SENHAS_EXPOSTAS,
  PAPEL_DE_RUNTIME,
  PAPEL_DE_SISTEMA,
  TAMANHO_MINIMO_DE_SENHA_DE_PAPEL,
} from './papel-de-runtime.js';

/** O ambiente mínimo que a verificação precisa. */
export interface AmbienteDoBanco {
  // O `| undefined` explícito é exigência do `exactOptionalPropertyTypes`: sem
  // ele, `{ NODE_ENV: undefined }` não é atribuível a `{ NODE_ENV?: string }`.
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  SYSTEM_DATABASE_URL?: string | undefined;
}

/**
 * O tamanho da senha, em BYTES UTF-8.
 *
 * ⚠️ (#133) A MEDIDA tem de ser a MESMA que a do `prepara-papeis.sh` — e o
 * `sh` do container conta BYTES, enquanto esta contava unidades UTF-16.
 * MEDIDO: `"😀😀😀😀😀😀"` (12 caracteres, 24 bytes) PASSAVA no script — que
 * é quem ESCREVE a senha — e era RECUSADO aqui. As duas camadas que precisam
 * concordar mediam coisas diferentes.
 */
function tamanhoDaSenha(senha: string): number {
  return Buffer.byteLength(senha, 'utf8');
}

/**
 * A senha é exposta?
 *
 * O valor EXATO saiu (#133) — o critério é o prefixo de exemplo e, para os
 * PAPÉIS GERENCIADOS, o tamanho mínimo.
 *
 * @param usuario o usuário da URI — é ele que diz QUAL mínimo vale (o do
 * dono é outro, e o `docker-compose.dev.yml` conecta como o dono).
 */
function senhaExposta(senha: string | undefined, usuario: string | undefined): boolean {
  if (senha === undefined) return false;
  const minusculo = senha.toLowerCase();
  if (PREFIXOS_DE_SENHAS_EXPOSTAS.some((prefixo) => minusculo.startsWith(prefixo))) return true;
  if (usuario !== undefined && PAPEIS_COM_SENHA_GERIDA.includes(usuario)) {
    return tamanhoDaSenha(senha) < TAMANHO_MINIMO_DE_SENHA_DE_PAPEL;
  }
  return false;
}

/**
 * A credencial do SLOT está nomeando o papel do OUTRO slot?
 *
 * ⚠️ (#133) A SEPARAÇÃO das duas credenciais é o que fecha a #118: a que
 * vive no container da API (`app_runtime`) é a que NÃO abre o bucket de
 * sistema, e a que o abre (`app_system`) é uma credencial separada. Trocadas
 * de lugar, a API passa a rodar com o poder de SISTEMA — que é a credencial
 * que o `prepara-papeis.sh` escreve com a senha do `SYSTEM_DATABASE_URL`.
 *
 * ⚠️ A regra NÃO é "a URI tem de nomear o papel do seu slot": o `docker-
 * compose.dev.yml` e o harness de teste conectam como o DONO (o papel não
 * existe antes da migration), e essa recusa derrubaria os dois. A coupling
 * que fecha o furo da #133 — "a URI tem de apontar para o papel que o
 * script escreve" — é do `prepara-papeis.sh`, que é a camada que ESCREVE.
 * Aqui a recusa é a que é verdade em TODO lugar: as DUAS credenciais não
 * podem ser o mesmo papel gerenciado.
 */
function papelTrocado(usuario: string | undefined, papelEsperado: string): boolean {
  return (
    usuario !== undefined && PAPEIS_COM_SENHA_GERIDA.includes(usuario) && usuario !== papelEsperado
  );
}

/** O veredito da verificação das credenciais. */
export type VereditoCredenciais = { ok: true } | { ok: false; motivo: string };

/**
 * A senha que está na URI, ou `undefined` se a URI não tem (ou não parseia).
 *
 * `new URL` aceita `postgresql://user:pass@host` — e a senha é o que vem
 * depois do primeiro `:` do `userinfo`, antes do `@`.
 */
function senhaDaUri(uri: string | undefined): string | undefined {
  if (uri === undefined || uri.trim() === '') return undefined;
  try {
    const url = new URL(uri);
    return url.password === '' ? undefined : decodeURIComponent(url.password);
  } catch {
    return undefined;
  }
}

/**
 * O usuário da URI, ou `undefined` se a URI não tem (ou não parseia).
 *
 * ⚠️ (#133) É o que decide QUAL regra de senha vale: o tamanho mínimo
 * alcança os papéis gerenciados, e o dono do banco tem outra regra (a do
 * `prepara-papeis.sh`, que é a camada que escreve a senha).
 */
function usuarioDaUri(uri: string | undefined): string | undefined {
  if (uri === undefined || uri.trim() === '') return undefined;
  try {
    const url = new URL(uri);
    return url.username === '' ? undefined : decodeURIComponent(url.username);
  } catch {
    return undefined;
  }
}

/**
 * Decide se as credenciais do banco servem para a API subir.
 *
 * Três coisas são recusadas:
 *   1. a senha do papel é um valor de EXEMPLO (prefixo `CHANGE_ME…`/`***`)
 *      ou é curta demais para um papel gerenciado (#133);
 *   2. falta o `SYSTEM_DATABASE_URL` — o bucket de sistema não abre sem a
 *      credencial que o concede;
 *   3. as DUAS credenciais nomeiam o MESMO papel gerenciado — a separação
 *      da #118 invertida (#133).
 *
 * ⚠️ O item 2 é **default-DENY**: a credencial é exigida em TODO ambiente
 * que não seja `development`. MEDIDO: a versão anterior exigia só quando
 * `NODE_ENV === 'production'` — a string EXATA. `prod`, `Prod`, `staging` e
 * `NODE_ENV` ausente passavam todos, a API SOBIA, e o primeiro login
 * estourava: `clienteDeSistema()` LANÇA, e o `Error` cru vira 500 no
 * cadastro. O cabeçalho deste arquivo prometia o contrário ("a API precisa
 * dizer isso no boot, e não no primeiro cadastro") e a mensagem do erro
 * afirma "a API não sobe" — mas a API subia; o que não funcionava era o
 * serviço.
 *
 * É a MESMA polaridade do `decisaoDoAdminLocal` (PR #115) e do `JWT_SECRET`
 * (ADR-0002): `development` é o único ambiente com direito ao atalho.
 */
export function verificarCredenciaisDoBanco(env: AmbienteDoBanco): VereditoCredenciais {
  const ambiente = env.NODE_ENV?.trim().toLowerCase();

  const usuarioRuntime = usuarioDaUri(env.DATABASE_URL);
  if (papelTrocado(usuarioRuntime, PAPEL_DE_RUNTIME)) {
    return {
      ok: false,
      motivo:
        `A credencial de RUNTIME (DATABASE_URL) está nomeando o papel ` +
        `'${usuarioRuntime}' — e a credencial que vive no container da API é a ` +
        `que NÃO abre o bucket de sistema (#118). A de SISTEMA é outra ` +
        `credencial, e o bucket de sistema é concedido por ela.`,
    };
  }

  const senhaRuntime = senhaDaUri(env.DATABASE_URL);
  if (senhaExposta(senhaRuntime, usuarioRuntime)) {
    return {
      ok: false,
      motivo:
        `A senha do papel de runtime é um valor de EXEMPLO ou é curta demais ` +
        `(${TAMANHO_MINIMO_DE_SENHA_DE_PAPEL} caracteres, no mínimo). ` +
        `Gere uma nova (openssl rand -hex 32) e aplique no papel antes de subir.`,
    };
  }

  if (env.SYSTEM_DATABASE_URL === undefined || env.SYSTEM_DATABASE_URL.trim() === '') {
    if (ambiente !== 'development') {
      return {
        ok: false,
        motivo:
          `SYSTEM_DATABASE_URL é obrigatório: é a credencial que abre o bucket de ` +
          `SISTEMA (#118). Sem ela, o bucket de sistema não abre — e o primeiro ` +
          `login devolve 500.`,
      };
    }
    return { ok: true };
  }

  const usuarioSistema = usuarioDaUri(env.SYSTEM_DATABASE_URL);
  if (papelTrocado(usuarioSistema, PAPEL_DE_SISTEMA)) {
    return {
      ok: false,
      motivo:
        `A credencial de SISTEMA (SYSTEM_DATABASE_URL) está nomeando o papel ` +
        `'${usuarioSistema}' — e o bucket de sistema é concedido ao papel ` +
        `'${PAPEL_DE_SISTEMA}' (a credencial que abre o bucket é a de SISTEMA, ` +
        `não a que vive no container da API).`,
    };
  }

  const senhaSistema = senhaDaUri(env.SYSTEM_DATABASE_URL);
  if (senhaExposta(senhaSistema, usuarioSistema)) {
    return {
      ok: false,
      motivo:
        `A senha do papel de SISTEMA é um valor de EXEMPLO ou é curta demais ` +
        `(${TAMANHO_MINIMO_DE_SENHA_DE_PAPEL} caracteres, no mínimo). ` +
        `Gere uma nova (openssl rand -hex 32) e aplique no papel antes de subir.`,
    };
  }

  return { ok: true };
}
