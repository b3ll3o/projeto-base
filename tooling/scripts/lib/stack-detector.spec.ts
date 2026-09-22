// tooling/scripts/lib/stack-detector.spec.ts
//
// pt-BR: Testes do detector de arquivos → stacks. Cobre os 4 padrões
// principais (ddd-hexagonal, prisma, nextjs, monorepo) e o fallback
// `shared`.

import { describe, it, expect } from 'vitest';
import { detectStack } from './stack-detector.js';

describe('detectStack', () => {
  it('domain → ddd-hexagonal', () => {
    expect(detectStack('apps/api/src/modules/users/domain/user.aggregate.ts')).toContain(
      'ddd-hexagonal',
    );
  });

  it('prisma schema → prisma', () => {
    expect(detectStack('apps/api/prisma/schema.prisma')).toContain('prisma');
  });

  it('next page → nextjs', () => {
    expect(detectStack('apps/web/app/page.tsx')).toContain('nextjs');
  });

  it('shared package (tsconfig) → monorepo', () => {
    expect(detectStack('packages/tsconfig/base.json')).toContain('monorepo');
  });

  it('controller NestJS → nestjs', () => {
    expect(
      detectStack('apps/api/src/modules/users/infrastructure/http/users.controller.ts'),
    ).toContain('nestjs');
  });

  it('arquivo fora de apps/packages/tooling mas com /domain/ → ddd-hexagonal', () => {
    expect(detectStack('libs/users/domain/foo.ts')).toContain('ddd-hexagonal');
  });

  it('arquivo não mapeado cai em shared como único stack', () => {
    const stacks = detectStack('README.md');
    expect(stacks).toEqual(['shared']);
  });

  it('suporta separadores Windows (\\ convertidos para /)', () => {
    expect(detectStack(String.raw`apps\api\src\modules\users\domain\user.aggregate.ts`)).toContain(
      'ddd-hexagonal',
    );
  });

  it('prisma persistence infrastructure → prisma', () => {
    expect(
      detectStack(
        'apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts',
      ),
    ).toContain('prisma');
  });

  it('next.js app dir dentro de apps/web → nextjs', () => {
    expect(detectStack('apps/web/app/dashboard/page.tsx')).toContain('nextjs');
  });
});
