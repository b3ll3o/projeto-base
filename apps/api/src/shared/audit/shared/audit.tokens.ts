/**
 * DI tokens do shared/audit.
 *
 * pt-BR: tokens NestJS para DI. AUDIT_SERVICE_PORT é resolvido pela
 * AuditInfraModule (binding InMemoryAuditService em testes, PrismaAuditService
 * em produção na Fase 6).
 *
 * Adicione novos tokens do módulo aqui; se >5 tokens ou concerns distintos,
 * criar audit.<concern>.tokens.ts.
 */

export const AUDIT_SERVICE_PORT = Symbol.for('@projeto/api/shared/audit/AuditServicePort');
