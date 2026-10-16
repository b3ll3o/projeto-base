import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class ProfileDeletedEvent implements DomainEvent {
  readonly eventName = 'profile.deleted.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    id: string,
    readonly version: number,
    readonly reason: string | null,
    occurredAt: Date,
  ) {
    this.aggregateId = id;
    this.occurredAt = occurredAt;
  }
}
