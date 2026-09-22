import { Module } from '@nestjs/common';
import { AUDIT_SERVICE_PORT } from './shared/audit.tokens.js';
import { PrismaAuditService } from './infrastructure/prisma-audit.service.js';

/**
 * Módulo de infraestrutura da auditoria (Fase 6).
 *
 * pt-BR: desde a Fase 6 este módulo usa PrismaAuditService (produção).
 * O InMemoryAuditService permanece no código apenas para uso em testes
 * unitários que importam o módulo de auditoria em isolamento; ele NÃO
 * está registrado aqui.
 *
 * Requer `PrismaModule` no import graph (já é `@Global()`, auto-injetado).
 */
@Module({
  providers: [
    {
      provide: AUDIT_SERVICE_PORT,
      useClass: PrismaAuditService,
    },
  ],
  exports: [AUDIT_SERVICE_PORT],
})
export class AuditInfraModule {}
