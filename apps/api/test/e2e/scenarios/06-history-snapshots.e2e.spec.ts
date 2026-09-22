// apps/api/test/e2e/scenarios/06-history-snapshots.e2e.spec.ts
//
// Cenário E2E 06: Histórico preserva snapshots completos por versão (Fase 9 Task 9.7).
//
// Fluxo: INSERT (v1) → UPDATE nome (v2) → UPDATE email (v3).
// Verifica que /history devolve 3 entries e que cada uma carrega o estado
// completo DO MOMENTO (não do estado atual). Também valida previousVersion
// encadeando v1 → v2 → v3.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
} from '../test-app.helper.js';

describe('E2E 06: Histórico preserva snapshots por versão', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e.ctx);
  });

  it('cada entry contém snapshot da sua versão + previousVersion encadeia', async () => {
    const { app } = e2e;

    // pt-BR: API atual só expõe PATCH de nome (PATCH /users/:id chama
    // use case 'renomear'). Por isso o cenário testa 3 updates de nome.
    // Em v3 do projeto, se houver endpoint de email, adicionar mais uma
    // mutation aqui para cobrir dois campos.

    // INSERT → v1
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Snap v1', email: 'snap-v1@b.com' },
    });
    const userId = (JSON.parse(c.body) as { id: string }).id;

    // UPDATE nome → v2
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Snap v2' },
    });

    // UPDATE nome → v3
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v2"' },
      payload: { novoNome: 'Snap v3' },
    });

    // GET /history
    const h = await app.inject({ method: 'GET', url: `/api/v1/users/${userId}/history` });
    expect(h.statusCode).toBe(200);
    const body = JSON.parse(h.body) as {
      entries: Array<{
        operation: string;
        version: number;
        previousVersion: number | null;
        snapshot: { id: string; nome: string; email: string };
      }>;
    };

    expect(body.entries).toHaveLength(3);

    // Indexa por versão
    const byV: Record<number, (typeof body.entries)[number]> = {};
    for (const e of body.entries) byV[e.version] = e;

    // Garante todas as versões presentes antes de dereferenciar (senão TypeError
    // mascara falha de contrato).
    expect(byV[1]).toBeDefined();
    expect(byV[2]).toBeDefined();
    expect(byV[3]).toBeDefined();

    // v1: INSERT com nome/email originais
    // `!` é seguro porque o `.toBeDefined()` acima garante a presença em runtime;
    // TS não narrow o tipo sozinho em index access com `noUncheckedIndexedAccess`.
    const v1 = byV[1]!;
    const v2 = byV[2]!;
    const v3 = byV[3]!;

    expect(v1.operation).toBe('INSERT');
    expect(v1.snapshot.nome).toBe('Snap v1');
    expect(v1.snapshot.email).toBe('snap-v1@b.com');
    expect(v1.previousVersion).toBeNull();

    // v2: UPDATE com nome atualizado
    expect(v2.operation).toBe('UPDATE');
    expect(v2.snapshot.nome).toBe('Snap v2');
    expect(v2.snapshot.email).toBe('snap-v1@b.com');
    expect(v2.previousVersion).toBe(1);

    // v3: UPDATE com nome atualizado novamente
    expect(v3.operation).toBe('UPDATE');
    expect(v3.snapshot.nome).toBe('Snap v3');
    expect(v3.snapshot.email).toBe('snap-v1@b.com');
    expect(v3.previousVersion).toBe(2);
  });
});
