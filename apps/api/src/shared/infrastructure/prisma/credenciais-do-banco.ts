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
// ⚠️ A SENHA CONHECIDA
//
// `app_runtime_dev` está no histórico do Git deste repositório. Quem leu o
// repositório, conhece. A recusa é explícita porque o valor é PÚBLICO: um
// guard que dependesse de "é aleatório o suficiente" deixaria passar uma
// senha que todo mundo já sabe.
//
// A decisão é uma FUNÇÃO PURA (o mesmo padrão do `decisaoDoAdminLocal` do
// PR #115 e do `segredoDeServico` do #120): decisão de segurança dentro de
// um construtor é decisão sem spec.

import { PREFIXOS_DE_SENHAS_EXPOSTAS, SENHAS_EXPOSTAS } from './papel-de-runtime.js';

/** O ambiente mínimo que a verificação precisa. */
export interface AmbienteDoBanco {
  // O `| undefined` explícito é exigência do `exactOptionalPropertyTypes`: sem
  // ele, `{ NODE_ENV: undefined }` não é atribuível a `{ NODE_ENV?: string }`.
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  SYSTEM_DATABASE_URL?: string | undefined;
}

/**
 * A senha é exposta?
 *
 * Duas formas: o valor EXATO está na denylist (a senha que o repositório
 * publicou), ou o valor COMEÇA com um prefixo de exemplo (`CHANGE_ME…`).
 */
function senhaExposta(senha: string | undefined): boolean {
  if (senha === undefined) return false;
  if (SENHAS_EXPOSTAS.includes(senha)) return true;
  const minusculo = senha.toLowerCase();
  return PREFIXOS_DE_SENHAS_EXPOSTAS.some((prefixo) => minusculo.startsWith(prefixo));
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
 * Decide se as credenciais do banco servem para a API subir.
 *
 * Em produção, duas coisas são recusadas:
 *   1. a senha do papel de runtime é uma das EXPOSTAS (o `app_runtime_dev`
 *      do repositório, ou o placeholder do example);
 *   2. falta o `SYSTEM_DATABASE_URL` — o bucket de sistema não abre sem a
 *      credencial que o concede.
 *
 * Fora de produção, o `SYSTEM_DATABASE_URL` ausente é só um aviso (o bucket
 * de sistema não abre, e o dev que não usa onboarding cross-tenant não
 * sente) — mas a senha exposta é recusada em TODO ambiente: uma senha
 * pública num banco de dev vaza para o de teste, e de lá para o de staging.
 */
export function verificarCredenciaisDoBanco(env: AmbienteDoBanco): VereditoCredenciais {
  const emProducao = env.NODE_ENV?.trim().toLowerCase() === 'production';

  const senhaRuntime = senhaDaUri(env.DATABASE_URL);
  if (senhaExposta(senhaRuntime)) {
    return {
      ok: false,
      motivo:
        `A senha do papel de runtime é uma senha EXPOSTA (publicada no repositório). ` +
        `Gere uma nova (openssl rand -base64 48) e aplique no papel antes de subir.`,
    };
  }

  if (env.SYSTEM_DATABASE_URL === undefined || env.SYSTEM_DATABASE_URL.trim() === '') {
    if (emProducao) {
      return {
        ok: false,
        motivo:
          `SYSTEM_DATABASE_URL é obrigatório em produção: é a credencial que abre o bucket de ` +
          `SISTEMA (#118). Sem ela, o bucket de sistema não abre.`,
      };
    }
    return { ok: true };
  }

  const senhaSistema = senhaDaUri(env.SYSTEM_DATABASE_URL);
  if (senhaExposta(senhaSistema)) {
    return {
      ok: false,
      motivo:
        `A senha do papel de SISTEMA é uma senha EXPOSTA (publicada no repositório). ` +
        `Gere uma nova (openssl rand -base64 48) e aplique no papel antes de subir.`,
    };
  }

  return { ok: true };
}
