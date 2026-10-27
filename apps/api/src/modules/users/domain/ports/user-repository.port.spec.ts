// apps/api/src/modules/users/domain/ports/user-repository.port.spec.ts
//
// pt-BR (#124): o `limit` era clampado SÓ no repositório em memória
// (`Math.max(1, Math.min(100, …))`) e não no de Prisma — as DUAS
// implementações do MESMO port discordavam sobre o MESMO input.
//
// A consequência medida: `limit=0` dava 200 com lista vazia no repositório
// em memória, e no de Prisma o `0` chegava cru ao `take:`. Um `limit` não
// numérico virava `NaN` — que no `take:` do Prisma é erro de banco (500) e
// no slice em memória é "lista vazia" (falha silenciosa).
//
// O clamp mora no PORT agora, e esta spec prende a decisão — inclusive o
// caso que os dois clamps antigos discordavam.

import { describe, it, expect } from 'vitest';
import {
  limitarPage,
  LIMITE_PADRAO,
  LIMITE_MINIMO,
  LIMITE_MAXIMO,
} from './user-repository.port.js';

describe('limitarPage() (#124)', () => {
  it('mantém um limit dentro da faixa', () => {
    expect(limitarPage(20)).toBe(20);
    expect(limitarPage(1)).toBe(1);
    expect(limitarPage(100)).toBe(100);
  });

  it('sobe um limit ABAIXO do mínimo até o mínimo', () => {
    expect(limitarPage(0)).toBe(LIMITE_MINIMO);
    expect(limitarPage(-5)).toBe(LIMITE_MINIMO);
  });

  it('desce um limit ACIMA do máximo até o máximo', () => {
    expect(limitarPage(101)).toBe(LIMITE_MAXIMO);
    expect(limitarPage(10_000)).toBe(LIMITE_MAXIMO);
  });

  it('trunca um limit fracionário', () => {
    expect(limitarPage(2.9)).toBe(2);
  });

  it('um limit NÃO numérico cai no default (e nunca em NaN)', () => {
    // `NaN` no `take:` do Prisma é erro de banco; no slice em memória é
    // "lista vazia". As duas coisas são falhas, e as duas são silenciosas
    // para quem olha só o status 200.
    expect(limitarPage(Number.NaN)).toBe(LIMITE_PADRAO);
    expect(Number.isNaN(limitarPage(Number.NaN))).toBe(false);
  });

  it('um limit INFINITO cai no default (nunca em Infinity)', () => {
    // A regra é "não-finite → default": um `Infinity` no `take:` do Prisma é
    // um pedido de "toda a tabela", e um `-Infinity` é um pedido de "menos
    // um". Nenhum dos dois é um page size.
    expect(limitarPage(Number.POSITIVE_INFINITY)).toBe(LIMITE_PADRAO);
    expect(limitarPage(Number.NEGATIVE_INFINITY)).toBe(LIMITE_PADRAO);
  });

  it('a faixa do clamp é a MESMA que a borda HTTP valida', () => {
    // Os números vivem no port e o schema Zod da query importa eles de lá.
    // Se alguém cambiar um dos lados sem o outro, a borda aceita e o
    // repositório recusa (ou o contrário) — e o cliente vê um 400 para um
    // valor que ele achou legítimo.
    expect(LIMITE_MINIMO).toBe(1);
    expect(LIMITE_MAXIMO).toBe(100);
    expect(LIMITE_PADRAO).toBe(20);
  });
});
