// apps/api/src/shared/domain/concurrency-exception.ts
//
// pt-BR: exception base para conflitos de versão otimista. O `aggregate`
// é o nome do BC que disparou — útil em logs cross-BC (ex: 'Profile'
// vs 'User'). O construtor aceita a versão esperada e a atual; o
// GlobalExceptionFilter mapeia para 409 Conflict.

export class ConcurrencyException extends Error {
  readonly code = 'CONCURRENCY_CONFLICT' as const;
  constructor(
    public readonly aggregate: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      `Conflito de versão em ${aggregate}: esperado v${expectedVersion}, atual v${actualVersion ?? '<inexistente>'}`,
    );
    Object.setPrototypeOf(this, ConcurrencyException.prototype);
  }
}
