/**
 * O input da leitura de histórico pelo ADMIN DO SISTEMA.
 *
 * pt-BR: `id` é o da PESSOA lida — e não o do ATOR. É a diferença entre esta
 * leitura e a do DONO (`GET /users/:id/history`), onde o `id` da rota é o
 * `sub` do token e o `UserOwnershipGuard` cobra a igualdade.
 *
 * `cursor` e `limit` são o mesmo contrato de paginação das outras surfaces
 * (`PaginacaoQuerySchema`) — o cursor é o `users_history.id`, opaco.
 */
export interface ListUserHistoryInput {
  /** O id da pessoa cujo histórico é lido. */
  id: string;
  cursor?: string | null;
  limit: number;
}
