/**
 * DI tokens do shared/audit.
 *
 * pt-BR: tokens NestJS para DI. AUDIT_SERVICE_PORT é resolvido pela
 * AuditInfraModule (binding InMemoryAuditService em testes, PrismaAuditService
 * em produção na Fase 6).
 */

export const AUDIT_SERVICE_PORT = Symbol.for('@projeto/api/AuditServicePort');
