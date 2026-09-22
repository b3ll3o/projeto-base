const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

export class UserName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): UserName {
    if (typeof raw !== 'string') {
      throw new Error('UserName: valor deve ser string');
    }
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) {
      throw new Error('UserName: nome vazio');
    }
    if (trimmed.length < MIN_LENGTH) {
      throw new Error(`UserName: muito curto (mín ${MIN_LENGTH} chars)`);
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new Error(`UserName: muito longo (max ${MAX_LENGTH} chars)`);
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
