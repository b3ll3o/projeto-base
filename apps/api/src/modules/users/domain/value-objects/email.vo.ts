const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

export class Email {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): Email {
    if (typeof raw !== 'string') {
      throw new Error('Email: valor deve ser string');
    }
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) {
      throw new Error(`Email: tamanho inválido (max ${MAX_LENGTH})`);
    }
    if (!EMAIL_RE.test(trimmed)) {
      throw new Error('Email: formato inválido');
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
