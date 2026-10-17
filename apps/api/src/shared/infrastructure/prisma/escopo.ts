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

import type { PrismaClient } from '@prisma/client';
import { ESCOPO_DE_SISTEMA, PARAMETRO_DE_ESCOPO } from './papel-de-runtime.js';

export type ClienteTransacional = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Abre o escopo DENTRO de uma transacao ja aberta.
 *
 * Separado de `comEscopo` porque `provisionarEmpresaPropria` so sabe o id da
 * empresa DEPOIS de cria-la, dentro da mesma transacao — e o `WITH CHECK` do
 * perfil avalia o GUC no momento do insert. Ver o comentario do metodo.
 */
export async function abrirEscopo(tx: ClienteTransacional, escopo: string): Promise<void> {
  await tx.$queryRaw`SELECT set_config(${PARAMETRO_DE_ESCOPO}, ${escopo}, true)`;
}

/**
 * Roda `fn` numa transacao com o escopo definido.
 *
 * `escopo` e o id da empresa, ou `ESCOPO_DE_SISTEMA` para o bucket global.
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
