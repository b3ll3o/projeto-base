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
import {
  bootstrapE2E,
  teardownE2E,
  criarUsuarioAutenticado,
  type E2EContext,
} from '../test-app.helper.js';

describe('E2E 02: DELETE → RESTORE → audit trail completo', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('audit trail completo: INSERT, UPDATE, UPDATE, DELETE, RESTORE', async () => {
    const { injetar } = e2e;

    // INSERT → v1. O helper já traz o login da MESMA pessoa: todas as rotas
    // por-id abaixo exigem que o `sub` do token seja o `:id` da rota.
    const dona = await criarUsuarioAutenticado(e2e, { nome: 'Audit', email: 'audit@b.com' });
    const userId = dona.id;

    // UPDATE → v2
    await injetar({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { ...dona.headers, 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Audit 2' },
    });

    // UPDATE → v3
    await injetar({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { ...dona.headers, 'if-match': 'W/"v2"' },
      payload: { novoNome: 'Audit 3' },
    });

    // DELETE → v4 (archive.version)
    const d = await injetar({
      method: 'DELETE',
      url: `/api/v1/users/${userId}`,
      headers: { ...dona.headers, 'if-match': 'W/"v3"' },
    });
    expect(d.statusCode).toBe(204);

    // pt-BR: HTTP contract — GET /history deve ter entry DELETE com
    // version=4 (que é o archiveRow.version). Validamos via contrato HTTP
    // em vez de acessar Prisma diretamente (acoplamento ao schema interno).
    const histAfterDelete = await injetar({
      method: 'GET',
      url: `/api/v1/users/${userId}/history`,
      headers: dona.headers,
    });
    expect(histAfterDelete.statusCode).toBe(200);
    const histBodyAfterDelete = JSON.parse(histAfterDelete.body) as {
      entries: Array<{ operation: string; version: number }>;
    };
    const deleteEntry = histBodyAfterDelete.entries.find((e) => e.operation === 'DELETE');
    expect(deleteEntry?.version).toBe(4);

    // RESTORE → v5
    const r = await injetar({
      method: 'POST',
      url: `/api/v1/users/${userId}/restore`,
      headers: { ...dona.headers, 'if-match': 'W/"v4"' },
    });
    expect(r.statusCode).toBe(201);
    const restored = JSON.parse(r.body) as { version: number; isDeleted: boolean };
    expect(restored.version).toBe(5);
    expect(restored.isDeleted).toBe(false);

    // Histórico completo
    const h = await injetar({
      method: 'GET',
      url: `/api/v1/users/${userId}/history`,
      headers: dona.headers,
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
