import { describe, it, expect } from 'vitest';
import { UserName } from './user-name.vo.js';

describe('UserName', () => {
  it('aceita nome válido e trim', () => {
    const n = UserName.create('  João Silva  ');
    expect(n.value).toBe('João Silva');
  });

  it('rejeita vazio', () => {
    expect(() => UserName.create('   ')).toThrow(/vazio/);
  });

  it('rejeita nome > 100 chars', () => {
    expect(() => UserName.create('a'.repeat(101))).toThrow(/100/);
  });

  it('rejeita nome < 2 chars (após trim)', () => {
    expect(() => UserName.create('a')).toThrow(/2/);
  });

  it('congelado', () => {
    expect(Object.isFrozen(UserName.create('João'))).toBe(true);
  });
});
