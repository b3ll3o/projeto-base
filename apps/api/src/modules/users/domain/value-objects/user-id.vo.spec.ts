import { describe, it, expect } from 'vitest';
import { UserId } from './user-id.vo.js';

describe('UserId', () => {
  it('cria a partir de UUID válido', () => {
    const id = UserId.create('0190a8b6-1234-7abc-9def-000000000001');
    expect(id.value).toBe('0190a8b6-1234-7abc-9def-000000000001');
  });

  it('gera novo UUID quando omitido', () => {
    const id = UserId.create();
    expect(id.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('rejeita UUID inválido', () => {
    expect(() => UserId.create('não-é-uuid')).toThrow(/UUID/);
  });

  it('dois UserIds com mesmo valor são iguais', () => {
    expect(
      UserId.create('0190a8b6-1234-7abc-9def-000000000002').equals(
        UserId.create('0190a8b6-1234-7abc-9def-000000000002'),
      ),
    ).toBe(true);
  });

  it('equals retorna false para valores diferentes', () => {
    expect(
      UserId.create('0190a8b6-1234-7abc-9def-000000000003').equals(
        UserId.create('0190a8b6-1234-7abc-9def-000000000004'),
      ),
    ).toBe(false);
  });

  it('congelado (imutável)', () => {
    const id = UserId.create('0190a8b6-1234-7abc-9def-000000000005');
    expect(Object.isFrozen(id)).toBe(true);
  });
});
