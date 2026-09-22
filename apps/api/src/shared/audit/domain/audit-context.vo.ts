/**
 * AuditContext — VO de domínio puro.
 *
 * Representa o contexto de auditoria: QUEM está executando a operação,
 * em QUAL request (correlationId), DE ONDE vem a chamada (source),
 * e QUANDO ocorreu (timestamp).
 *
 * pt-BR: imutável; usado para propagar info de auditoria pelo código
 * sem acoplar a frameworks.
 */

export type AuditSource = 'http' | 'cli' | 'job' | 'event' | 'migration';

const VALID_SOURCES: readonly AuditSource[] = ['http', 'cli', 'job', 'event', 'migration'];

export interface AuditContextProps {
  actorId: string | null;
  correlationId: string;
  source: AuditSource;
  timestamp: Date;
}

/**
 * Constrói um AuditContext validando os campos.
 * Lança Error se inválido.
 */
export class AuditContext {
  public readonly actorId: string | null;
  public readonly correlationId: string;
  public readonly source: AuditSource;
  public readonly timestamp: Date;

  constructor(props: AuditContextProps) {
    const correlationId = props.correlationId?.trim() ?? '';
    if (correlationId === '') {
      throw new Error('AuditContext: correlationId não pode ser vazio');
    }
    if (!(props.timestamp instanceof Date) || Number.isNaN(props.timestamp.getTime())) {
      throw new Error('AuditContext: timestamp deve ser um Date válido');
    }
    if (!VALID_SOURCES.includes(props.source)) {
      throw new Error(
        `AuditContext: source inválido "${props.source}" (esperado: ${VALID_SOURCES.join('|')})`,
      );
    }

    this.actorId = props.actorId;
    this.correlationId = correlationId;
    this.source = props.source;
    this.timestamp = props.timestamp;

    Object.freeze(this);
  }

  /**
   * Factory para contexto de sistema (sem ator humano, ex: job scheduler).
   */
  static system(correlationId: string, timestamp: Date = new Date()): AuditContext {
    return new AuditContext({
      actorId: null,
      correlationId,
      source: 'job',
      timestamp,
    });
  }

  /**
   * Representação serializável (sem Date → ISO string).
   */
  toJSON(): Record<string, unknown> {
    return {
      actorId: this.actorId,
      correlationId: this.correlationId,
      source: this.source,
      timestamp: this.timestamp.toISOString(),
    };
  }
}
