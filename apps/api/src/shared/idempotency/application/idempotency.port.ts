/**
 * IdempotencyPort — interface do port (DDD).
 *
 * pt-BR (2026-11-10 — conformidade do system design): o contrato da chave
 * de idempotência de escrita. Fecha a lacuna declarada em
 * `docs/system-design/dados.md` §6 — "retry não é seguro: um cliente que
 * repete por timeout **não tem como saber** se a primeira gravou, e recebe
 * 409 no lugar de 201".
 *
 * A decisão (o que a chave significa, quem a usa, por quanto tempo vale) mora
 * no [ADR-0011](../../../../docs/adr/0011-idempotencia-de-escrita.md).
 */

/** O header que o cliente manda para pedir retry seguro. */
export const HEADER_DE_IDEMPOTENCIA = 'idempotency-key';

/** O header que a API devolve quando a resposta veio da reserva. */
export const HEADER_DE_REPLAY = 'idempotency-replayed';

/**
 * O ator anônimo — a rota `POST /users` é `@Public()`, e não há `sub` para
 * escopar a chave.
 *
 * ⚠️ A chave do ator anônimo continua sendo protegida pela **impressão do
 * pedido**: o replay só acontece com o MESMO método, rota e corpo. Um
 * terceiro que chute a chave e mande outro corpo leva 409, não a resposta.
 */
export const ATOR_ANONIMO = 'anônimo';

/**
 * Validade da chave, em horas.
 *
 * O retry de um cliente acontece em minutos — por timeout, por rede instável,
 * por deploy no meio da requisição. 24 h cobrem isso com folga, e o
 * registro não fica para sempre.
 */
export const VALIDADE_DA_CHAVE_HORAS = 24;

/** O que a reserva de uma chave devolveu. */
export type ReservaDeChave =
  /** A chave é minha: pode executar a operação. */
  | { estado: 'livre' }
  /** A operação já rodou: devolve a MESMA resposta, sem executar de novo. */
  | { estado: 'replay'; status: number; resposta: unknown }
  /** A chave existe com OUTRO pedido: o cliente reusou a chave por engano. */
  | { estado: 'conflito' }
  /** A chave está reservada e a operação ainda não terminou. */
  | { estado: 'em_voo' };

/** O que identifica um pedido, para casar o replay. */
export interface ImpressaoDePedido {
  /** A chave que o cliente mandou. */
  chave: string;
  /** Quem pediu — o `sub` do token, ou `ATOR_ANONIMO`. */
  ator: string;
  /** A rota que respondeu (o template, não a URL com query). */
  rota: string;
  /** A impressão do pedido: método + rota + corpo. */
  impressao: string;
}

export interface IdempotencyPort {
  /**
   * Reserva a chave para este pedido.
   *
   * ⚠️ O contrato é o de "reservar antes de executar": a reserva é
   * COMMITADA antes de a operação rodar, para que dois requests com a mesma
   * chave não executem ao mesmo tempo.
   */
  reservar(pedido: ImpressaoDePedido): Promise<ReservaDeChave>;

  /** Grava a resposta da operação — só quando ela deu 2xx. */
  guardar(input: { chave: string; ator: string; status: number; resposta: unknown }): Promise<void>;

  /**
   * Libera a chave — quando a operação NÃO deu 2xx.
   *
   * Sem isso, um erro do servidor (ou uma validação) deixaria a chave
   * reservada, e o retry do cliente levaria 409 em vez de executar.
   */
  liberar(input: { chave: string; ator: string }): Promise<void>;
}
