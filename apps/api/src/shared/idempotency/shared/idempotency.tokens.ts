/**
 * DI tokens do shared/idempotency.
 *
 * pt-BR: tokens NestJS para DI. IDEMPOTENCY_PORT é resolvido pela
 * IdempotencyInfraModule (binding do adapter Prisma em produção).
 */

export const IDEMPOTENCY_PORT = Symbol.for('@projeto/api/shared/idempotency/IdempotencyPort');
