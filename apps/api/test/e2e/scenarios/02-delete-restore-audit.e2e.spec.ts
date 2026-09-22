// apps/api/test/e2e/scenarios/02-delete-restore-audit.e2e.spec.ts
//
// Cenário E2E 02: DELETE → RESTORE → audit trail completo (Fase 9 Task 9.3).
//
// Fluxo coberto:
//  - INSERT (v1) → UPDATE (v2) → UPDATE (v3) → DELETE (v4 === archive.version)
//  - POST /restore → v5
//  - GET /history devolve 5 entries com operations [DELETE, INSERT, RESTORE,
//    UPDATE, UPDATE] e cada entry tem snapshot completo (id, email, …).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

describe('E2E 02: DELETE → RESTORE → audit trail completo', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('audit trail completo: INSERT, UPDATE, UPDATE, DELETE, RESTORE', async () => {
    const { app, ctx } = e2e;

    // INSERT → v1
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Audit', email: 'audit@b.com' },
    });
    const userId = (JSON.parse(c.body) as { id: string }).id;

    // UPDATE → v2
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Audit 2' },
    });

    // UPDATE → v3
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v2"' },
      payload: { novoNome: 'Audit 3' },
    });

    // DELETE → v4 (archive.version)
    const d = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v3"' },
    });
    expect(d.statusCode).toBe(204);

    // pt-BR: tabela UserArchive guarda snapshot da versão pós-delete (v4).
    const archiveRow = await ctx.prisma.userArchive.findUnique({ where: { entityId: userId } });
    expect(archiveRow).not.toBeNull();
    expect(archiveRow?.version).toBe(4);

    // RESTORE → v5
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${userId}/restore`,
      headers: { 'if-match': 'W/"v4"' },
    });
    expect(r.statusCode).toBe(201);
    const restored = JSON.parse(r.body) as { version: number; isDeleted: boolean };
    expect(restored.version).toBe(5);
    expect(restored.isDeleted).toBe(false);

    // Histórico completo
    const h = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${userId}/history`,
    });
    expect(h.statusCode).toBe(200);
    const histBody = JSON.parse(h.body) as {
      entries: Array<{
        operation: string;
        version: number;
        snapshot: { id: string; email: string };
      }>;
    };

    const ops = histBody.entries.map((e) => e.operation).sort();
    expect(ops).toEqual(['DELETE', 'INSERT', 'RESTORE', 'UPDATE', 'UPDATE']);

    // Cada entrada tem snapshot completo (id + email pelo menos)
    for (const e of histBody.entries) {
      expect(e.snapshot).toHaveProperty('id');
      expect(e.snapshot).toHaveProperty('email');
    }
  });
});
