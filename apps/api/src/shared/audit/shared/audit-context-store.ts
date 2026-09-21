/**
 * AuditContextStore — wrapper sobre node:async_hooks.AsyncLocalStorage.
 *
 * Propaga o AuditContext ao longo de toda a cadeia async (HTTP request →
 * use case → audit.record) sem precisar passá-lo como argumento explícito.
 *
 * pt-BR: singleton module-level. Não é injetável; é API estática.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuditContext } from '../domain/audit-context.vo.js';

const storage = new AsyncLocalStorage<AuditContext>();

export const AuditContextStore = {
  /**
   * Executa `fn` dentro de um scope onde `get()` retorna `ctx`.
   * Aceita função sync ou async; retorna o resultado de `fn`.
   */
  run<T>(ctx: AuditContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },

  /**
   * Retorna o AuditContext do scope atual.
   * Lança Error se chamado fora de run().
   */
  get(): AuditContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error('AuditContextStore: nenhum AuditContext no scope atual');
    }
    return ctx;
  },

  /**
   * Variante não-throwing de get(): retorna undefined se fora de run().
   */
  tryGet(): AuditContext | undefined {
    return storage.getStore();
  },
} as const;
