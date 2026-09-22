import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'users.user.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;

  constructor(aggregateId: string, version: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.occurredAt = occurredAt;
  }
}
