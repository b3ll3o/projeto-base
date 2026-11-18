export interface RestoreUserInput {
  id: string;
  /**
   * O MOTIVO da restauração — e ele é `null` quando ninguém disse um.
   *
   * ⚠️ pt-BR (2026-11-17, revisão do PR #171): o motivo era aceito pelo
   * contrato e DESCARTADO no caminho — a trilha de auditoria ficava sem o
   * porquê da restauração. Agora ele viaja até o evento, e a trilha o
   * grava.
   */
  reason?: string | null;
  /**
   * Versão que o cliente leu antes de aplicar a mutação (vinda do header
   * `If-Match: W/"v<n>"` na Fase 7). Se a versão persistida divergir,
   * a operação falha com ApplicationConcurrencyException (HTTP 412).
   */
  expectedVersion: number;
}
