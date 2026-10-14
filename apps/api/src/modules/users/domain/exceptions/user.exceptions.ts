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

/**
 * A pessoa autenticada tentou operar sobre o registro de **outro** usuário.
 *
 * pt-BR (2026-10-13): MEDIDO ao vivo antes desta exceção existir — um token
 * válido da conta A recebia `200`/`204` sobre o id da conta B em `PATCH`,
 * `DELETE`, `restore`, `GET :id` e `GET :id/history`. A branch entregava
 * **autenticação sem autorização**: "sou alguém" sem "esse registro é meu".
 *
 * A mensagem NÃO embute os dois ids. Um id de vítima no corpo do erro é
 * confirmação de que o registro existe para quem só podia chutar o id — que é
 * exatamente o que o 403 já está dizendo.
 */
export class UserOwnershipViolationException extends Error {
  constructor() {
    super('Você só pode operar sobre o próprio registro');
    this.name = 'UserOwnershipViolationException';
    Object.setPrototypeOf(this, UserOwnershipViolationException.prototype);
  }
}

/**
 * Invariante de value object violada — o `nome` ou o `email` está fora da
 * faixa que o VO aceita.
 *
 * pt-BR (2026-10-08): os VOs lançavam `Error` puro. `mapExceptionToHttp`
 * não conhece `Error`, então caía no `return` final e o cliente recebia
 * **500 INTERNAL** com a mensagem interna do VO no `detail` — medido:
 * `detail="UserName: muito curto (mín 2 chars)"` para um nome de 1 char.
 * Violação de invariante é erro do **caller**, não falha interna: 400.
 *
 * O `campo` e o `motivo` existem para o boundary montar um `errors[]` de
 * RFC 7807 que diga o que fazer, sem vazar a string da assertção.
 */
export class UserValidationException extends Error {
  constructor(
    public readonly campo: string,
    public readonly motivo: string,
  ) {
    // pt-BR: a mensagem aqui é a que VAI para o cliente — não repete o
    // nome da classe nem a sintaxe do VO, que é detalhe de implementação.
    super(`${campo} inválido: ${motivo}`);
    this.name = 'UserValidationException';
    Object.setPrototypeOf(this, UserValidationException.prototype);
  }
}
