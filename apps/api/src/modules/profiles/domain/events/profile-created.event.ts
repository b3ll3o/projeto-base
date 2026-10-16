import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class ProfileCreatedEvent implements DomainEvent {
  readonly eventName = 'profile.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    id: string,
    readonly version: number,
    occurredAt: Date,
  ) {
    this.aggregateId = id;
    this.occurredAt = occurredAt;
  }
}
