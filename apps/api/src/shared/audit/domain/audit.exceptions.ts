/**
 * Domain exceptions do shared/audit.
 *
 * pt-BR: erros de domínio puros. Mapeamento HTTP acontece no
 * GlobalExceptionFilter (Fase 7) — 404 para history, 410 para archive.
 */

/**
 * Lançada quando uma entrada específica de histórico (entityId, version)
 * não é encontrada.
 */
export class AuditHistoryNotFoundException extends Error {
  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
    public readonly version: number,
  ) {
    super(`AuditHistoryNotFound: ${entityName}#${entityId} v${version} não encontrada`);
    this.name = 'AuditHistoryNotFoundException';
    Object.setPrototypeOf(this, AuditHistoryNotFoundException.prototype);
  }
}

/**
 * Lançada quando uma entrada de arquivo (entityId) não é encontrada.
 */
export class AuditArchiveNotFoundException extends Error {
  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
  ) {
    super(`AuditArchiveNotFound: ${entityName}#${entityId} não encontrado no arquivo`);
    this.name = 'AuditArchiveNotFoundException';
    Object.setPrototypeOf(this, AuditArchiveNotFoundException.prototype);
  }
}
