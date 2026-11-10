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
// Antes, a senha de runtime vivia aqui E na migration, em texto puro, num
// repositório público. Uma migration não lê env — e foi por isso que a senha
// foi parar ali. Agora:
//
//   - a migration cria o papel SEM senha (`NOLOGIN`);
//   - o setup (entrypoint do container, helper de testcontainers) aplica a
//     senha a partir de `DATABASE_URL` / `SYSTEM_DATABASE_URL`, que são
//     variáveis de ambiente;
//   - este arquivo tem os CRITÉRIOS que recusam uma senha que não serve —
//     o prefixo de exemplo e o tamanho mínimo — e nenhuma lista por valor
//     (#133: escrever o valor publicado aqui era outra forma de publicá-lo).

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
 * ⚠️ (#133) A lista por VALOR saiu — e a senha que o repositório publicou
 * saiu com ela. A razão é que a lista por valor só funciona enquanto o valor
 * está no repositório: escrevê-lo aqui era uma FORMA de publicá-lo, e o
 * critério de aceite da #133 é que o `git grep` do literal não encontre nada.
 *
 * O que substitui a lista é um critério que não depende do valor:
 *
 *   1. o PREFIXO de exemplo (`CHANGE_ME…`, `***`) — o valor que o
 *      `.env.production.example` entrega;
 *   2. o TAMANHO — e ele é o que barra a senha publicada, que tinha 15
 *      caracteres (abaixo de `TAMANHO_MINIMO_DE_SENHA_DE_PAPEL`).
 *
 * E há uma segunda barreira, que é ESTRUTURAL e não é uma lista: a senha
 * publicada deixou de autenticar em qualquer banco. A migration
 * `20261020000000` faz o papel nascer sem senha, e a
 * `20261108000001_papel_runtime_sem_senha_publicada` limpa (`PASSWORD NULL`)
 * o hash que existia em quem já rodou a versão velha. MEDIDO: depois dela,
 * `rolcanlogin = f` e `rolpassword IS NULL = t` — o segredo não existe mais
 * em lugar nenhum.
 */

/**
 * O tamanho mínimo de uma senha de PAPEL do banco (#133).
 *
 * 24 caracteres — o dobro do mínimo de 16 que o repositório usava, e o que
 * a senha publicada (15 caracteres) ficava ABAIXO.
 *
 * ⚠️ O DONO DO BANCO não tem mínimo aqui: a credencial dele é a
 * `DIRECT_DATABASE_URL`, que o `prepara-papeis.sh` também lê (e valida) —
 * mas o guard de boot da API não a recebe, e o dono é Superuser por
 * definição (ou CREATEROLE). A regra do dono é do `prepara-papeis.sh`.
 *
 * ⚠️ O número mora AQUI e no `prepara-papeis.sh` (que é shell, e não lê
 * TypeScript). O `papel-de-runtime.spec.ts` RECONCILIA os dois — sem isso,
 * os dois números divergem em silêncio e a regra da camada que escreve
 * deixa de valer.
 */
export const TAMANHO_MINIMO_DE_SENHA_DE_PAPEL = 24;

/**
 * Os papéis cujas senhas são GERIDAS pelo repositório.
 *
 * São eles que o mínimo de tamanho alcança. O DONO (`projeto` no Compose) não
 * entra: o guard roda no boot da API, e o Compose de DEV conecta como o dono
 * com a senha `projeto` (6 caracteres) — MEDIDO: `verificarCredenciaisDoBanco`
 * devolvia `{"ok":true}` para ela, e um mínimo sem esta exceção derrubaria o
 * ambiente de desenvolvimento no primeiro boot.
 */
export const PAPEIS_COM_SENHA_GERIDA: readonly string[] = [PAPEL_DE_RUNTIME, PAPEL_DE_SISTEMA];

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

/**
 * O orçamento de tempo de uma statement, para os papéis do banco.
 *
 * pt-BR (2026-11-10 — conformidade do system design): fecha a lacuna
 * declarada em `docs/system-design/operacao.md` §6 — "API → banco: **nenhum**
 * timeout — não há `statement_timeout` no papel de runtime, e a query espera
 * o Postgres desistir". Sem orçamento, um `SELECT` lento segura a conexão do
 * pool até o Postgres desistir — e o pool é o limite de escala da API.
 *
 * ⚠️ POR QUE 8s, E NÃO OUTRO NÚMERO: o orçamento fica **abaixo** do timeout
 * do cliente web (10 s — o fallback de `apps/web/lib/api-client.ts`), para a
 * API responder com erro **antes** de o cliente desistir; e **acima** do prazo
 * de transação interativa do Prisma (5 s, o default documentado em
 * `escopo.ts`), que é o que corta a transação primeiro.
 *
 * ⚠️ O número mora AQUI e na migration que o aplica (que é SQL, e não lê
 * TypeScript). O `papel-de-runtime.spec.ts` RECONCILIA os dois — o mesmo
 * mecanismo que reconcilia o tamanho mínimo da senha de papel.
 */
export const STATEMENT_TIMEOUT_DO_PAPEL = '8s';

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
