export class UserNotFoundException extends Error {
  constructor(public readonly userId: string) {
    super(`User não encontrado: ${userId}`);
    this.name = 'UserNotFoundException';
  }
}

export class EmailAlreadyInUseException extends Error {
  constructor(public readonly email: string) {
    super(`Email já em uso: ${email}`);
    this.name = 'EmailAlreadyInUseException';
  }
}

export class ConcurrencyException extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      `Concurrency: versão esperada ${expectedVersion}, encontrada ${actualVersion ?? '(ausente)'}`,
    );
    this.name = 'ConcurrencyException';
  }
}

export class UserDeletedException extends Error {
  constructor(public readonly userId: string) {
    super(`User já deletado (soft delete): ${userId}`);
    this.name = 'UserDeletedException';
  }
}

export class InvalidRestoreException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRestoreException';
  }
}
