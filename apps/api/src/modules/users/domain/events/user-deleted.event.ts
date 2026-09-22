import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserDeletedEvent implements DomainEvent {
  readonly eventName = 'users.user.deleted.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly reason: string | null;

  constructor(aggregateId: string, version: number, reason: string | null, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.reason = reason;
    this.occurredAt = occurredAt;
  }
}
