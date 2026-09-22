import { randomBytes } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gera um UUID v7 (RFC 9562): 48 bits de timestamp ms + versão 7 + variante 10xx + random.
 * node:crypto.randomUUID() só gera v4, então implementamos manualmente.
 */
function generateUuidV7(): string {
  const bytes = randomBytes(16);
  const ts = Date.now();

  // primeiros 6 bytes = timestamp em ms (big-endian)
  bytes[0] = Math.floor(ts / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(ts / 0x100000000) & 0xff;
  bytes[2] = Math.floor(ts / 0x1000000) & 0xff;
  bytes[3] = Math.floor(ts / 0x10000) & 0xff;
  bytes[4] = Math.floor(ts / 0x100) & 0xff;
  bytes[5] = ts & 0xff;

  // nibble alto do byte 6 = versão 7 (alocação de 16 bytes garante índice)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;

  // 2 bits altos do byte 8 = variante 10xx
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export class UserId {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(value?: string): UserId {
    const v = value ?? generateUuidV7();
    if (!UUID_RE.test(v)) {
      throw new Error(`UserId: valor não é UUID v7 válido: '${value ?? '(undefined)'}'`);
    }
    return new UserId(v);
  }

  equals(other: UserId | null | undefined): boolean {
    return other !== null && other !== undefined && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
