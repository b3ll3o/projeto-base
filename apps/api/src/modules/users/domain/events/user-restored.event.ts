import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserRestoredEvent implements DomainEvent {
  readonly eventName = 'users.user.restored.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly restoredFromVersion: number;

  constructor(aggregateId: string, version: number, restoredFromVersion: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.restoredFromVersion = restoredFromVersion;
    this.occurredAt = occurredAt;
  }
}
