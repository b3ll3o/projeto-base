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

/**
 * Erro de domínio lançado quando `AuditContextStore.get()` é chamado fora
 * de um scope `run()`. Indica bug de programação (chamada perdida, hook
 * NestJS não configurado, etc.) — não condição de negócio esperada.
 */
export class AuditContextMissingError extends Error {
  constructor() {
    super('AuditContextStore: nenhum AuditContext no scope atual');
    this.name = 'AuditContextMissingError';
    Object.setPrototypeOf(this, AuditContextMissingError.prototype);
  }
}

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
   * Lança `AuditContextMissingError` se chamado fora de run().
   */
  get(): AuditContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new AuditContextMissingError();
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
