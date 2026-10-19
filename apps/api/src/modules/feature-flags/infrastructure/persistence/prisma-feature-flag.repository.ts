// apps/api/src/modules/feature-flags/infrastructure/persistence/prisma-feature-flag.repository.ts
//
// pt-BR (feature-flags, 2026-10-18): implementação Prisma do
// `FeatureFlagRepositoryPort`.
//
// Sem `comEscopo`, e essa é a diferença com TODO outro repositório do app.
// `escopo.ts` existe para pôr `app.tenant_id` na sessão e deixar a RLS filtrar
// por empresa — mas a tabela `feature_flags` não tem `tenant_id` (D1): a flag
// vale para o sistema inteiro. Abrir escopo aqui seria colocar um filtro de
// empresa numa consulta que não é por empresa.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import type {
  FeatureFlagEstado,
  FeatureFlagRepositoryPort,
} from '../../domain/ports/feature-flag-repository.port.js';

@Injectable()
export class PrismaFeatureFlagRepository implements FeatureFlagRepositoryPort {
  /** pt-BR: `@Inject(PrismaService)` explícito — `PrismaClient` é interface
   *  material e some em runtime; sem o token o Nest LANÇA no boot. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /**
   * Só o que existe. A regra "chave ausente = ATIVADA" (D4) NÃO mora aqui:
   * este método devolve linhas, e quem decide o estado final de cada chave é o
   * use case, que cruza esta lista com o catálogo. Um `default: true` dentro
   * deste método pareceria mais curto e esconderia a regra atrás de um valor.
   */
  async listar(): Promise<FeatureFlagEstado[]> {
    const rows = await this.prisma.featureFlag.findMany({
      select: { chave: true, ativada: true },
      orderBy: { chave: 'asc' },
    });
    return rows;
  }

  /**
   * `upsert` e não `update`: ligar a flag pela PRIMEIRA vez é o mesmo ato que
   * desligá-la. Com `update`, a primeira vez devolveria null/erro e o admin
   * teria de "desligar antes de poder ligar" — o caminho inverso do que a tela
   * promete.
   */
  async definir(chave: string, ativada: boolean): Promise<void> {
    await this.prisma.featureFlag.upsert({
      where: { chave },
      create: { chave, ativada },
      update: { ativada },
    });
  }
}
