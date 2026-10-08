import { UserValidationException } from '../exceptions/user.exceptions.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// pt-BR: exportado pelo mesmo motivo de `UserName.MIN_LENGTH`/`MAX_LENGTH` —
// o Zod do boundary importa daqui em vez de reescrever o número. MEDIDO
// 2026-10-08: `max(255)` no Zod contra `254` aqui dava 500 para um email de
// exatamente 255 chars.
export const MAX_LENGTH = 254;

export class Email {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): Email {
    if (typeof raw !== 'string') {
      throw new UserValidationException('email', 'o valor deve ser um texto.');
    }
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0) {
      throw new UserValidationException('email', 'o email não pode ficar em branco.');
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new UserValidationException(
        'email',
        `pode ter no máximo ${MAX_LENGTH} caracteres (recebido: ${trimmed.length}).`,
      );
    }
    if (!EMAIL_RE.test(trimmed)) {
      throw new UserValidationException('email', 'o formato esperado é nome@dominio.com.');
    }
    return new Email(trimmed);
  }

  equals(other: Email | null | undefined): boolean {
    return !!other && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
