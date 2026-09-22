export interface RestoreUserInput {
  id: string;
  /**
   * Versão que o cliente leu antes de aplicar a mutação (vinda do header
   * `If-Match: W/"v<n>"` na Fase 7). Se a versão persistida divergir,
   * a operação falha com ApplicationConcurrencyException (HTTP 412).
   */
  expectedVersion: number;
}
