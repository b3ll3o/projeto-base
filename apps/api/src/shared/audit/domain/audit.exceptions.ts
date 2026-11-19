/**
 * Domain exceptions do shared/audit.
 *
 * pt-BR: erros de domínio puros. Mapeamento HTTP acontece no
 * GlobalExceptionFilter (Fase 7) — 404 para history, 410 para archive.
 *
 * Convenção: constructors aceitam objeto estruturado (structured-args)
 * para eliminar risco de troca de ordem posicional. Validação acontece
 * no próprio construtor (fail-fast em vez de falhar tarde no HTTP layer).
 */

export interface AuditHistoryNotFoundProps {
  entityName: string;
  entityId: string;
  version: number;
}

export interface AuditArchiveNotFoundProps {
  entityName: string;
  entityId: string;
}

/**
 * Lançada quando uma entrada específica de histórico (entityName, entityId, version)
 * não é encontrada.
 *
 * Mapeamento HTTP no GlobalExceptionFilter (Fase 7): 404 Not Found.
 *
 * @throws {TypeError} se `entityName` ou `entityId` forem vazios após trim,
 *                     ou se `version` for menor que 1.
 */
export class AuditHistoryNotFoundException extends Error {
  public readonly entityName: string;
  public readonly entityId: string;
  public readonly version: number;

  constructor(props: AuditHistoryNotFoundProps) {
    const entityName = props.entityName?.trim() ?? '';
    const entityId = props.entityId?.trim() ?? '';
    if (entityName === '') {
      throw new TypeError('AuditHistoryNotFoundException: entityName inválido (vazio)');
    }
    if (entityId === '') {
      throw new TypeError('AuditHistoryNotFoundException: entityId inválido (vazio)');
    }
    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new TypeError(
        `AuditHistoryNotFoundException: version inválida (esperado: inteiro >= 1, recebido: ${props.version})`,
      );
    }

    super(`Entrada de histórico ${entityName}#${entityId} v${props.version} não encontrada.`);
    this.name = 'AuditHistoryNotFoundException';
    this.entityName = entityName;
    this.entityId = entityId;
    this.version = props.version;
    Object.setPrototypeOf(this, AuditHistoryNotFoundException.prototype);
  }
}

/**
 * Lançada quando o CURSOR da paginação não é uma linha da trilha que está
 * sendo lida.
 *
 * pt-BR (2026-11-17): o cursor é o id da LINHA de `users_history`, e ele é
 * resolvido **dentro da entidade** — um cursor de outra trilha é recusado.
 * Antes, o cursor entrava como subselect (`version >= (SELECT version …
 * WHERE id = $2)`), e o subselect **não filtrava por `entity_id`**: o cursor
 * de outra trilha devolvia uma página **errada** (a partir de uma versão
 * alheia) em vez de um erro. "Página errada" é pior que "erro" — a pessoa
 * lê uma trilha que não pediu.
 *
 * A resposta é a MESMA para "o cursor não existe" e para "o cursor é de outra
 * trilha": 400, e nada que diga se aquele id existe.
 *
 * Mapeamento HTTP no GlobalExceptionFilter: 400 VALIDATION_ERROR.
 *
 * ⚠️ O `entityId` é OPCIONAL de fato: a lista do ARCHIVE não é por entidade
 * (a tabela tem uma só), e o cursor dela não tem trilha para nomear.
 */
export class AuditCursorInvalidoException extends Error {
  public readonly entityId: string;
  public readonly cursor: string;

  constructor(props: { entityId: string; cursor: string }) {
    const entityId = props.entityId?.trim() ?? '';
    // ⚠️ O `entityId` pode ser VAZIO, e é de propósito: a lista do ARCHIVE
    // não é POR ENTIDADE (a tabela tem uma só), e o cursor dela não tem
    // trilha para nomear. Com o nome, a mensagem diz de qual trilha é o
    // cursor; sem ele, a mensagem é a mesma para os dois casos.
    super(
      entityId === ''
        ? 'Cursor de paginação inválido.'
        : `Cursor de paginação inválido para a trilha ${entityId}.`,
    );
    this.name = 'AuditCursorInvalidoException';
    this.entityId = entityId;
    this.cursor = props.cursor;
    Object.setPrototypeOf(this, AuditCursorInvalidoException.prototype);
  }
}

/**
 * Lançada quando uma entrada de arquivo (entityName, entityId) não é encontrada.
 *
 * Mapeamento HTTP no GlobalExceptionFilter (Fase 7): 410 Gone.
 *
 * @throws {TypeError} se `entityName` ou `entityId` forem vazios após trim.
 */
export class AuditArchiveNotFoundException extends Error {
  public readonly entityName: string;
  public readonly entityId: string;

  constructor(props: AuditArchiveNotFoundProps) {
    const entityName = props.entityName?.trim() ?? '';
    const entityId = props.entityId?.trim() ?? '';
    if (entityName === '') {
      throw new TypeError('AuditArchiveNotFoundException: entityName inválido (vazio)');
    }
    if (entityId === '') {
      throw new TypeError('AuditArchiveNotFoundException: entityId inválido (vazio)');
    }

    super(`Entrada de arquivo ${entityName}#${entityId} não encontrada.`);
    this.name = 'AuditArchiveNotFoundException';
    this.entityName = entityName;
    this.entityId = entityId;
    Object.setPrototypeOf(this, AuditArchiveNotFoundException.prototype);
  }
}
