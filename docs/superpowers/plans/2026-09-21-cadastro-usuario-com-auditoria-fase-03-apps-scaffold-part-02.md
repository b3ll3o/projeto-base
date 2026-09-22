# Fase 3 — Apps Scaffold (Parte 2/4)

> **Continuação** da Fase 3. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold.md)
>
> Esta é a parte 2 de 4 da Fase 3. Pule para a próxima parte ao final.

---

export class AuditInfraModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/audit/audit-infra.module.ts
git commit -m "feat(shared-audit): wire AuditInfraModule with InMemory binding (Prisma na Fase 6)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.5: Smoke test do NestJS bootstrap

**Files:**
- Create: `apps/api/src/main.spec.ts`
- Create: `apps/api/vitest.config.ts`

- [ ] **Step 1: Criar vitest config**

```typescript
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        // Fase 3: cobertura baixa (só smoke). Sobe nas Fases 4-7.
        lines: 30,
        functions: 30,
        branches: 30,
        statements: 30,
      },
    },
  },
  resolve: {
    alias: {
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 2: Smoke test**

```typescript
// apps/api/src/main.spec.ts
import { describe, it, expect } from 'vitest';
import { GlobalExceptionFilter } from './shared/infrastructure/http/global-exception.filter.js';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('GlobalExceptionFilter', () => {
  it('converte HttpException em Problem Details', () => {
    const filter = new GlobalExceptionFilter();
    const fakeReply = {
      status: () => ({ send: (body: unknown) => body }),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => fakeReply,
        getRequest: () => ({ url: '/api/v1/users/u-1', method: 'GET', id: 'req-1' }),
      }),
    } as any;
    const payload = filter.catch(
      new HttpException('Não encontrado', HttpStatus.NOT_FOUND),
      host,
    );
    expect(payload).toBeUndefined(); // chamada void, send acontece internamente
  });
});
```

- [ ] **Step 3: Adicionar scripts no `apps/api/package.json`**

```json
{
  "scripts": {
    "test:unit": "vitest run --coverage",
    "test:integration": "echo 'integration tests na Fase 6' && exit 0",
    "test:e2e": "echo 'e2e tests na Fase 9' && exit 0",
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js"
  }
}
```

- [ ] **Step 4: Rodar teste + commit**

Run: `pnpm --filter @projeto/api test:unit 2>&1 | tail -30`
Expected: 1 passed (smoke).

```bash
git add apps/api/vitest.config.ts apps/api/src/main.spec.ts apps/api/package.json
git commit -m "test(api): smoke test for GlobalExceptionFilter (RFC 7807)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.6: Criar `apps/web/package.json` (Next.js 15 + Tailwind 4)

**Files:**
- Create: `apps/web/package.json`

- [ ] **Step 1: Criar package.json do web**

```json
{
  "name": "@projeto/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "clean": "rm -rf .next .turbo"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@projeto/tsconfig": "workspace:*",
    "@projeto/eslint-config": "workspace:*",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^20.16.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^9.12.0",
    "eslint-config-next": "^15.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Instalar + commit**

```bash
pnpm install
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): scaffold Next.js 15 + React 19 + Tailwind 4 deps

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.7: Configurar Tailwind 4

**Files:**
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Criar `postcss.config.js`**

```javascript
// apps/web/postcss.config.js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: Criar `tailwind.config.ts`**

```typescript
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/postcss.config.js apps/web/tailwind.config.ts
git commit -m "chore(web): configure Tailwind 4 + PostCSS

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.8: Criar `apps/web/app/` (App Router)

**Files:**
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`

- [ ] **Step 1: Criar `tsconfig.json`**

```json
{
  "extends": "@projeto/tsconfig/react.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Criar `next-env.d.ts`**

```typescript
// apps/web/next-env.d.ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 3: Criar `app/globals.css`**

```css
/* apps/web/app/globals.css */
@import 'tailwindcss';

@theme {
  --color-background: 0 0% 100%;
