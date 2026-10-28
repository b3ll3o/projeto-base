// apps/api/src/shared/infrastructure/prisma/papel-de-runtime.ts
//
// pt-BR (Fase 9 — RLS, 2026-10-17): o papel Postgres que a APLICAÇÃO usa em
// tempo de execução, e o parâmetro de sessão que carrega o escopo da empresa.
//
// Por que existe um papel e não é a mesma conta das migrations: superuser tem
// BYPASS de RLS por construção (MEDIDO nesta campanha, antes desta fase), então
// uma policy escrita e lida por superuser não protege nada — é código que
// aparenta proteger. O dono do schema continua conectando para migrar e semear; a
// aplicação conecta por aqui, e é sobre esta sessão que as policies valem.
//
// #118: a senha do papel saiu do FONTE.
//
// Antes, `SENHA_DE_RUNTIME_DEV` vivia aqui E na migration (`PASSWORD
// 'app_runtime_dev'`), em texto puro, num repositório público. Uma migration
// não lê env — e foi por isso que a senha foi parar ali. Agora:
//
//   - a migration cria o papel SEM senha (`NOLOGIN`);
//   - o setup (entrypoint do container, helper de testcontainers) aplica a
//     senha a partir de `DATABASE_URL` / `SYSTEM_DATABASE_URL`, que são
//     variáveis de ambiente;
//   - este arquivo tem uma LISTA DE SENHAS EXPOSTAS (uma denylist), e não um
//     default: o valor conhecido está aqui porque precisa ser RECUSADO, e
//     porque ele já é público — tê-lo no repositório não piora o que a
//     exposição já piorou. O que importa é que ele não seja mais o padrão.

/** Nome do papel de runtime. Tem de bater com o `CREATE ROLE` da migration. */
export const PAPEL_DE_RUNTIME = 'app_runtime';

/**
 * Nome do papel de SISTEMA (#118).
 *
 * É o papel que concede o bucket de sistema — e o que o concede é a
 * CREDENCIAL, não um valor de GUC. `current_user = 'app_system'` na policy,
 * e a sessão `app_runtime` não chega lá: `current_user` vem da credencial.
 *
 * `app_runtime` NÃO é membro de `app_system`: se fosse, um `SET ROLE`
 * bastaria e o furo voltaria pela porta dos fundos.
 */
export const PAPEL_DE_SISTEMA = 'app_system';

/**
 * Senhas que NUNCA podem estar em uso.
 *
 * ⚠️ NÃO é um default — é uma denylist. O primeiro valor é a senha que o
 * repositório publikou (`app_runtime_dev`): ela está no histórico do Git, e
 * qualquer pessoa que leia o repositório a conhece. O segundo é o prefixo do
 * placeholder do `.env.production.example`.
 *
 * A segunda linha de defesa é o TAMANHO: `segredoDeServico` recusa segredos
 * com menos de 32 bytes, e `app_runtime_dev` tem 16. A denylist existe para
 * o caso em que alguém aumente o tamanho do placeholder e a recusa por
 * tamanho deixe de pegar.
 */
export const SENHAS_EXPOSTAS: readonly string[] = ['app_runtime_dev'];

/**
 * Prefixos de senha que denunciam um valor de EXEMPLO.
 *
 * O placeholder do `.env.production.example` é
 * `CHANGE_ME_gerar_com_openssl_rand_base64_48` — e o prefixo `CHANGE_ME` é o
 * que denuncia, não o valor inteiro (o sufixo muda com o tamanho pedido).
 *
 * Comparados em minúsculas, no início do valor.
 *
 * ⚠️ O `***` é o placeholder que o `.env.production.example` JÁ TRUXE para as
 * duas credenciais dos papeis — e ele NÃO é recusado por nenhum destes
 * prefixos: `***` não começa com `change_me`, e não é a senha publicada.
 * MEDIDO: o guard aceitava `***`, o boot passava, e o `prepara-papeis.sh`
 * aplicava `***` como a senha VIVA do papel de produção. A isca não pode
 * passar — e o `.env.production.example` diz do `JWT_SECRET` que "ele é a
 * isca, e a isca não pode passar". Para a credencial do BANCO, a isca passava.
 */
export const PREFIXOS_DE_SENHAS_EXPOSTAS: readonly string[] = ['change_me', '***'];

/**
 * Escopo que significa "bucket de sistema": o admin global, que enxerga todas
 * as empresas. É o valor com que o bucket `tenantId === null` da aplicação
 * entra no banco.
 *
 * ⚠️ #118: desde a migration `20261027000001_papel_de_sistema`, este valor
 * NÃO concede nada sozinho. Ele é o valor que a aplicação ESCREVE; quem
 * concede o bucket de sistema é a credencial (`current_user = 'app_system'`).
 */
export const ESCOPO_DE_SISTEMA = '*';

/**
 * Parâmetro de sessão (GUC) que carrega o escopo. `'*'` = sistema, um UUID =
 * aquela empresa, **ausente ou vazio = fail-closed** (não vê nada).
 */
export const PARAMETRO_DE_ESCOPO = 'app.tenant_id';

/** Troca o usuário e a senha da URI pelo papel de runtime, preservando o resto. */
export function uriComoPapelDeRuntime(uriDoDono: string, senha: string): string {
  return uriComPapel(uriDoDono, PAPEL_DE_RUNTIME, senha);
}

/**
 * Troca o usuário e a senha da URI pelo papel de SISTEMA (#118).
 *
 * É a credencial que o bucket de sistema exige — e ela é SEPARADA da de
 * runtime, que é o ponto: a credencial que vive no container da API (a que
 * mais vaza — está no env, em log, em mensagem de erro) deixa de dar acesso
 * ao bucket de sistema.
 */
export function uriComoPapelDeSistema(uriDoDono: string, senha: string): string {
  return uriComPapel(uriDoDono, PAPEL_DE_SISTEMA, senha);
}

/** O núcleo comum dos dois: troca usuário e senha, preservando host/porta/banco. */
function uriComPapel(uriDoDono: string, papel: string, senha: string): string {
  const url = new URL(uriDoDono);
  url.username = papel;
  url.password = senha;
  return url.toString();
}
