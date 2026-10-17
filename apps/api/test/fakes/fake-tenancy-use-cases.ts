// apps/api/test/fakes/fake-tenancy-use-cases.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-17): dublê de `TenancyUseCases` para os
// specs de `UserUseCases`.
//
// Existe porque `UserUseCases` passou a ter uma 4ª dependência (a entrada na
// empresa) e nenhum spec de `criarUser` sem `destino` deveria tocá-la. Um
// `vi.fn()` silencioso esconderia um branch chamado por engano atrás de um
// teste verde; um `reject` é o sinal mais barato de que a montagem do spec
// está errada.
//
// Um arquivo e não dois: a mesma regra escrita em dois specs diverge em um
// deles. Precedente do padrão: `test/fakes/fake-password-hasher.ts`.

import type { TenancyUseCases } from '../../src/modules/tenancy/application/tenancy.use-cases.js';

export function tenancyQueNaoDeveSerChamado(): TenancyUseCases {
  return {
    provisionarEmpresaPropria(): Promise<void> {
      return Promise.reject(
        new Error('`destino` ausente: `provisionarEmpresaPropria` não deveria ter sido chamada'),
      );
    },
    criarContaPorConvite(): Promise<void> {
      return Promise.reject(
        new Error('`destino` ausente: `criarContaPorConvite` não deveria ter sido chamada'),
      );
    },
  } as unknown as TenancyUseCases;
}
