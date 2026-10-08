import { UserValidationException } from '../exceptions/user.exceptions.js';

// pt-BR: os limites são EXPORTADOS porque a fonte da verdade é o VO, e o
// schema Zod do boundary importa daqui em vez de reescrever os números.
// MEDIDO 2026-10-08: com `min(1).max(120)` no Zod e `2..100` aqui, um nome
// de 1 char passava o boundary e virava 500 no VO. O comentário do schema
// dizia "espelha `UserName` VO" — espelhava, em 118 e 20.
export const MIN_LENGTH = 2;
export const MAX_LENGTH = 100;

export class UserName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): UserName {
    if (typeof raw !== 'string') {
      throw new UserValidationException('nome', 'o valor deve ser um texto.');
    }
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) {
      throw new UserValidationException('nome', 'o nome não pode ficar em branco.');
    }
    if (trimmed.length < MIN_LENGTH) {
      throw new UserValidationException(
        'nome',
        `precisa de pelo menos ${MIN_LENGTH} caracteres (recebido: ${trimmed.length}).`,
      );
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new UserValidationException(
        'nome',
        `pode ter no máximo ${MAX_LENGTH} caracteres (recebido: ${trimmed.length}).`,
      );
    }
    return new UserName(trimmed);
  }

  equals(other: UserName | null | undefined): boolean {
    return !!other && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
