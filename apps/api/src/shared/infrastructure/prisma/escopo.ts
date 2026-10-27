// apps/api/src/shared/infrastructure/prisma/escopo.ts
//
// pt-BR (Fase 9 — RLS, 2026-10-17): a costura que dá sentido às policies.
//
// O QUE ESTE ARQUIVO É
// Uma policy de RLS só existe para ser lida por uma sessão que sabe qual empresa
// está falando. Essa sessão carrega um parâmetro (`app.tenant_id`) que é
// **LOCAL** à transação. Este arquivo é o único lugar do sistema que escreve
// esse parâmetro — concentra-lo aqui é o que permite a afirmação "toda leitura
// de dado multi-tenant abre o escopo antes de tocar a tabela", e é o que faz
// uma rota nova esquecer o escopo aparecer como **zero linhas** (fail-closed),
// e não como dado de outra empresa.
//
// POR QUE SEMPRE `$transaction`, E NUNCA UM `SET` SOLTO
// `set_config(..., true)` morre no fim da transação; com `false` o parâmetro
// vaza no pool de conexões e a REQUISIÇÃO SEGUINTE herda o escopo da anterior —
// o defeito clássico de `SET` em conexão com pool. `comEscopo` por isso sempre
// abre a transação, e a transação é o que garante a conexão pinada.
//
// O QUE ESTE ARQUIVO NAO FAZ: nao e um middleware, nao deduplica escopo por
// requisicao e nao abre uma transacao por request. Um interceptor faria isso —
// e mudaria a semantica de transacao de todo o repositorio. O escopo e aberto
// pelo repositorio, que e quem sabe de que tabela esta falando.

import { PrismaClient } from '@prisma/client';
import { ESCOPO_DE_SISTEMA, PARAMETRO_DE_ESCOPO } from './papel-de-runtime.js';

export type ClienteTransacional = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Abre o escopo DENTRO de uma transacao ja aberta.
 *
 * Separado de `comEscopo` porque `provisionarEmpresaPropria` so sabe o id da
 * empresa DEPOIS de cria-la, dentro da mesma transacao — e o `WITH CHECK` do
 * perfil avalia o GUC no momento do insert. Ver o comentario do metodo.
 *
 * O `.toLowerCase()` e o UNICO lugar onde a forma canonica do escopo e
 * garantida, e ele existe por uma MEDIDA. `no_escopo_atual` compara por TEXTO
 * (`alvo::text = escopo_atual()`) porque o escopo pode valer `'*'`, que
 * estouraria em `'*'::uuid`; e o Postgres canoniza `uuid` para MINUSCULAS ao
 * converter para texto. Logo, um escopo em caixa alta nao casa com nada e o
 * efeito nao e erro: e ZERO LINHAS. Membro legitimo com o header em caixa
 * alta recebia 403 em todas as rotas de empresa, com dado existente, token
 * valido e escopo valido.
 *
 * ⚠️ Por que aqui e nao no SQL: o banco nao tem como saber que o chamador
 * quis dizer um uuid valido, e `lower()` no predicado transformaria um erro de
 * validacao em silencio. Normalizar e translacao, e translacao pertence a
 * quem traduz. `abrirEscopo` e o unico escritor do GUC do sistema, entao e o
 * chocalho que cobre todos os call sites — inclusive o `tenant.id` do
 * onboarding, que nao passa por `escopoDoTenant`.
 */
export async function abrirEscopo(tx: ClienteTransacional, escopo: string): Promise<void> {
  await tx.$queryRaw`SELECT set_config(${PARAMETRO_DE_ESCOPO}, ${escopo.toLowerCase()}, true)`;
}

/**
 * O cliente do bucket de SISTEMA (#118).
 *
 * O bucket de sistema deixou de ser concedido por um valor de GUC e passou a
 * ser concedido pela CREDENCIAL: a policy compara `current_user` com
 * `app_system`. Uma sessao `app_runtime` que escreva `'*'` no GUC nao abre
 * mais nada — e quem abre e o cliente de sistema, que conecta com a
 * `SYSTEM_DATABASE_URL`.
 *
 * ⚠️ O cliente e um singleton preguiçoso, e ele CONECTA com a credencial do
 * ambiente — nunca com a do dono. A `DIRECT_DATABASE_URL` e superuser: dar
 * ao runtime o poder do dono trocaria um furo de ESCOPO por um furo de
 * PRIVILEGIO.
 */
let clienteDeSistemaCache: PrismaClient | null = null;

/** O cliente que abre o bucket de sistema, criado a partir da `SYSTEM_DATABASE_URL`. */
export function clienteDeSistema(): PrismaClient {
  if (clienteDeSistemaCache !== null) return clienteDeSistemaCache;

  const url = process.env['SYSTEM_DATABASE_URL'];
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'SYSTEM_DATABASE_URL é obrigatório: é a credencial que abre o bucket de SISTEMA (#118). ' +
        'Sem ela, o bucket de sistema não abre — e a API não sobe.',
    );
  }

  clienteDeSistemaCache = new PrismaClient({ datasourceUrl: url });
  return clienteDeSistemaCache;
}

/**
 * Roda `fn` numa transacao com o escopo de SISTEMA, na CREDENCIAL de sistema.
 *
 * #118: e o equivalente de `comEscopo(prisma, ESCOPO_DE_SISTEMA, fn)` — mas na
 * sessao certa. O GUC continua sendo `'*'` (a aplicacao nao muda de forma);
 * o que muda e QUEM abre a transacao, e por isso o que a policy ve.
 *
 * A funcao nao recebe o client: ele vem do ambiente, e o ponto do desenho e
 * que o codigo de aplicacao NAO possa escolher com que credencial abre o
 * bucket de sistema. Um `comEscopo(prisma, ESCOPO_DE_SISTEMA, …)` deixaria
 * essa escolha no call site — e o call site e o que o furo explorava.
 */
export async function comEscopoDeSistema<T>(
  fn: (tx: ClienteTransacional) => Promise<T>,
): Promise<T> {
  const prisma = clienteDeSistema();
  return prisma.$transaction(async (tx) => {
    await abrirEscopo(tx, ESCOPO_DE_SISTEMA);
    return fn(tx);
  });
}

/**
 * Roda `fn` numa transacao com o escopo definido.
 *
 * `escopo` e o id da empresa, ou `ESCOPO_DE_SISTEMA` para o bucket global.
 *
 * ⚠️ #118: `ESCOPO_DE_SISTEMA` aqui NAO abre o bucket de sistema — a policy
 * exige a credencial. Use `comEscopoDeSistema` para esse caso. O escopo de
 * empresa (um uuid) continua funcionando igual, e é o caminho normal.
 */
export async function comEscopo<T>(
  prisma: PrismaClient,
  escopo: string,
  fn: (tx: ClienteTransacional) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await abrirEscopo(tx, escopo);
    return fn(tx);
  });
}

/**
 * O escopo correspondente a um `tenantId` da aplicacao.
 *
 * `null` e o bucket de SISTEMA (D3: perfil global, admin do seed) e vira `'*'`.
 *
 * ATENCAO: isto e uma TRADUCAO, nao uma autorizacao — passar `null` onde o
 * chamador queria uma empresa nao abre nada restrito, abre o bucket de sistema.
 * Quem valida se o ator pode ler a linha que quer continua sendo a query e a
 * guarda de aplicacao; a policy e a segunda linha.
 */
export function escopoDoTenant(tenantId: string | null): string {
  return tenantId ?? ESCOPO_DE_SISTEMA;
}
