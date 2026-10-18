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
  /**
   * pt-BR (Fase 10+, 2026-10-17): a empresa do ator, ou `null` para o bucket de
   * SISTEMA. Mora AQUI, e não como parâmetro à parte de `record`/`archive`, por
   * uma razão que é o que impede o erro: quem é o ator (`actorId`) e de onde ele
   * vem (`tenantId`) é o MESMO dado de contexto. Passar os dois por caminhos
   * separados admite a combinação `actorId` da empresa A com `tenantId` da
   * empresa B, e essa combinação é uma escalada silenciosa — o registro de
   * auditoria da empresa A nasceria gravado no escopo da B.
   */
  tenantId?: string | null;
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
  /** Empresa do ator; `null` = bucket de SISTEMA. Ver `AuditContextProps`. */
  public readonly tenantId: string | null;

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
    this.tenantId = props.tenantId ?? null;

    Object.freeze(this);
  }

  /**
   * Factory para contexto de sistema (sem ator humano, ex: job scheduler).
   *
   * pt-BR: sem `tenantId`, e portanto SISTEMA — que é o que a factory promete
   * ("contexto de sistema"). Quem quiser um bucket de empresa constrói o
   * contexto à mão, com o `tenantId` explícito.
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
      tenantId: this.tenantId,
    };
  }
}
