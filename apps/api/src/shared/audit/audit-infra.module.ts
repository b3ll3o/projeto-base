import { Module } from '@nestjs/common';
import { AUDIT_SERVICE_PORT } from './shared/audit.tokens.js';
import { InMemoryAuditService } from './application/in-memory-audit-service.js';

/**
 * Stub de infraestrutura do módulo de auditoria.
 *
 * pt-BR: na Fase 6 este módulo será estendido (ou substituído) para
 * usar PrismaAuditService em produção. Como use cases dependem apenas
 * do port, a troca não exige mudanças fora deste arquivo.
 */
@Module({
  providers: [
    {
      provide: AUDIT_SERVICE_PORT,
      useClass: InMemoryAuditService,
    },
  ],
  exports: [AUDIT_SERVICE_PORT],
})
export class AuditInfraModule {}
