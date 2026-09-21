import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserUpdatedEvent implements DomainEvent {
  readonly eventName = 'users.user.updated.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly previousVersion: number;

  constructor(aggregateId: string, version: number, previousVersion: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.previousVersion = previousVersion;
    this.occurredAt = occurredAt;
  }
}
