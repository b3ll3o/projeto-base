import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserRestoredEvent implements DomainEvent {
  readonly eventName = 'users.user.restored.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly restoredFromVersion: number;
  /**
   * O MOTIVO da restauração — e ele é `null` quando ninguém disse um.
   *
   * ⚠️ pt-BR (2026-11-17, revisão do PR #171): o motivo era ACEITO pela API
   * (`RestoreUserInputDto.reason`) e DESCARTADO — o evento não o carregava, e
   * o `extractReason` só lia o evento de exclusão. O dado que o cliente
   * mandava sumia no caminho, e a trilha de auditoria ficava sem ele.
   */
  readonly reason: string | null;

  constructor(
    aggregateId: string,
    version: number,
    restoredFromVersion: number,
    occurredAt: Date,
    reason: string | null = null,
  ) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.restoredFromVersion = restoredFromVersion;
    this.occurredAt = occurredAt;
    this.reason = reason;
  }
}
