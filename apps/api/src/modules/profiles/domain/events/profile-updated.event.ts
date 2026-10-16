import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class ProfileUpdatedEvent implements DomainEvent {
  readonly eventName = 'profile.updated.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    id: string,
    readonly version: number,
    readonly previousVersion: number,
    occurredAt: Date,
  ) {
    this.aggregateId = id;
    this.occurredAt = occurredAt;
  }
}
