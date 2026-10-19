// apps/api/src/modules/feature-flags/infrastructure/persistence/prisma-feature-flag.repository.spec.ts
//
// pt-BR (feature-flags, 2026-10-18): o que o unitário PRVE e o que ele NÃO
// prova.
//
// PRVE: que `definir` é um upsert de verdade (cria quando falta, atualiza
// quando existe) e que `listar` traz só as linhas gravadas.
//
// NÃO PRUVA: que a linha gravada sobrevive à conexão e que o `DEFAULT true` do
// banco bate com a linha ausente = ATIVADA (D4). Um mock responde a qualquer
// `where` e não conhece DEFAULT — quem mede isso é
// `prisma-feature-flag.repository.integration.spec.ts`, contra Postgres real.

import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaFeatureFlagRepository } from './prisma-feature-flag.repository.js';

class FakePrisma {
  #linhas = new Map<string, { chave: string; ativada: boolean; updatedAt: Date }>();

  featureFlag = {
    findMany: async () =>
      [...this.#linhas.values()].map((l) => ({ chave: l.chave, ativada: l.ativada })),
    upsert: async (args: {
      where: { chave: string };
      create: { chave: string; ativada: boolean };
      update: { ativada: boolean };
    }) => {
      const anterior = this.#linhas.get(args.where.chave);
      const linha = anterior
        ? { ...anterior, ativada: args.update.ativada, updatedAt: new Date() }
        : {
            chave: args.create.chave,
            ativada: args.create.ativada,
            updatedAt: new Date(),
          };
      this.#linhas.set(linha.chave, linha);
      return { ...linha };
    },
  };
}

describe('PrismaFeatureFlagRepository', () => {
  let repo: PrismaFeatureFlagRepository;

  beforeEach(() => {
    repo = new PrismaFeatureFlagRepository(new FakePrisma() as never);
  });

  it('lista vazio quando ninguém desligou nada', async () => {
    await expect(repo.listar()).resolves.toEqual([]);
  });

  it('grava a linha que não existia e a devolve na listagem', async () => {
    await repo.definir('tenancy.invites', false);

    await expect(repo.listar()).resolves.toEqual([{ chave: 'tenancy.invites', ativada: false }]);
  });

  it('atualiza a linha que já existia em vez de duplicar', async () => {
    await repo.definir('tenancy.invites', false);
    await repo.definir('tenancy.invites', true);

    // Uma linha só. Duas linhas para a mesma chave é o sintoma de um `create`
    // onde havia `upsert` — e o banco deixaria passar, porque a chave é a
    // PRIMARY KEY (segundo `create` falharia, mas o erro viria como 500).
    await expect(repo.listar()).resolves.toEqual([{ chave: 'tenancy.invites', ativada: true }]);
  });

  it('guarda linhas de chaves diferentes lado a lado', async () => {
    await repo.definir('tenancy.invites', false);
    await repo.definir('tenancy.outra', false);

    await expect(repo.listar()).resolves.toHaveLength(2);
  });
});
