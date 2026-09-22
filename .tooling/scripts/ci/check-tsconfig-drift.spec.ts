import { describe, it, expect } from 'vitest';
import { checkTsconfigDrift } from './check-tsconfig-drift';
import * as path from 'node:path';

const FIXTURES = '/tmp/ci-fixtures/tsconfig';

describe('checkTsconfigDrift', () => {
  it('deve passar quando strict e noUncheckedIndexedAccess são consistentes', async () => {
    const result = await checkTsconfigDrift({
      tsconfigsRoot: path.join(FIXTURES, 'consistent'),
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve falhar quando noUncheckedIndexedAccess=true em um tsconfig e false em outro', async () => {
    const result = await checkTsconfigDrift({
      tsconfigsRoot: path.join(FIXTURES, 'drift'),
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('noUncheckedIndexedAccess'))).toBe(true);
  });
});
