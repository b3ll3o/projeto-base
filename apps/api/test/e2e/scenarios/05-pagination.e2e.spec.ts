// apps/api/test/e2e/scenarios/05-pagination.e2e.spec.ts
//
// Cenário E2E 05: Cursor pagination + includeDeleted (Fase 9 Task 9.6).
//
// Cobre:
//  - Paginação cursor: cria 5 users, itera com limit=2, percorre TODAS as
//    páginas até hasMore=false, espera ver exatamente 5 ids únicos.
//  - includeDeleted: cria 2 users (um é soft-deletado). Lista normal NÃO
//    inclui o deletado. Lista com ?includeDeleted=true inclui ambos.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  criarUsuarioAutenticado,
  type E2EContext,
  SENHA_DE_TESTE,
  EMAIL_DA_SESSAO,
} from '../test-app.helper.js';

describe('E2E 05: Cursor pagination + includeDeleted', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e);
  });

  it('cursor pagination percorre todas as páginas sem duplicar nem perder ids', async () => {
    const { injetar } = e2e;

    // Cria 5 users
    const createdIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await injetar({
        method: 'POST',
        url: '/api/v1/users',
        payload: { nome: `P${i}`, email: `p${i}@b.com`, senha: SENHA_DE_TESTE },
      });
      createdIds.push((JSON.parse(c.body) as { id: string }).id);
    }

    // Itera com limit=2
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    while (true) {
      const url = cursor
        ? `/api/v1/users?limit=2&cursor=${encodeURIComponent(cursor)}`
        : '/api/v1/users?limit=2';
      const r = await injetar({ method: 'GET', url });
      expect(r.statusCode).toBe(200);
      const body = JSON.parse(r.body) as {
        users: Array<{ id: string; email: string }>;
        nextCursor: string | null;
      };
      // ⚠️ A conta de sessão do harness é admin global e aparece no diretório
      // (MEDIDO 2026-10-17: `seen.size` deu 6 com as 5 deste spec). Ela é
      // excluída da contagem — e a linha de baixo é o CONTROLE POSITIVO que
      // impede essa exclusão de mascarar uma página perdida: todo id criado
      // tem de estar em `seen`.
      for (const u of body.users) {
        if (u.email !== EMAIL_DA_SESSAO) seen.add(u.id);
      }
      pages++;
      if (body.nextCursor === null) break;
      cursor = body.nextCursor;
      if (pages > 10) throw new Error('infinite loop guard');
    }

    // Todos os ids criados, atravessando todas as páginas
    expect(seen.size).toBe(createdIds.length);
    for (const id of createdIds) expect(seen.has(id)).toBe(true);
  });

  it('?includeDeleted=true inclui soft-deleted; lista normal oculta', async () => {
    const { injetar } = e2e;

    // Cria 2 users
    const keep = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Keep', email: 'keep@b.com', senha: SENHA_DE_TESTE },
    });
    const keepId = (JSON.parse(keep.body) as { id: string }).id;

    // Romeo precisa do token DELE: o `DELETE` abaixo é por-id, e a política
    // de propriedade compara o `sub` com o `:id` da rota.
    const romeo = await criarUsuarioAutenticado(e2e, { nome: 'Romeo', email: 'rm@b.com' });
    const rmId = romeo.id;

    // Soft-delete o segundo
    const d = await injetar({
      method: 'DELETE',
      url: `/api/v1/users/${rmId}`,
      headers: { ...romeo.headers, 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    // Lista normal: NÃO vê o deletado
    const normal = await injetar({ method: 'GET', url: '/api/v1/users?limit=100' });
    expect(normal.statusCode).toBe(200);
    const normalBody = JSON.parse(normal.body) as { users: Array<{ id: string }> };
    expect(normalBody.users.find((u) => u.id === rmId)).toBeUndefined();
    expect(normalBody.users.find((u) => u.id === keepId)).toBeDefined();

    // Lista com includeDeleted=true: vê ambos
    const withDel = await injetar({
      method: 'GET',
      url: '/api/v1/users?limit=100&includeDeleted=true',
    });
    expect(withDel.statusCode).toBe(200);
    const withDelBody = JSON.parse(withDel.body) as { users: Array<{ id: string }> };
    expect(withDelBody.users.find((u) => u.id === rmId)).toBeDefined();
    expect(withDelBody.users.find((u) => u.id === keepId)).toBeDefined();
  });
});
