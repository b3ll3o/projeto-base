# Fase 3 — Apps Scaffold (Parte 3/4)

> **Continuação** da Fase 3. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold.md)
>
> Esta é a parte 3 de 4 da Fase 3. Pule para a próxima parte ao final.

---

  --color-foreground: 222.2% 84%;
  /* shadcn/ui tokens podem ser adicionados depois */
}

body {
  background-color: hsl(var(--color-background));
  color: hsl(var(--color-foreground));
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 4: Criar `app/layout.tsx`**

```typescript
// apps/web/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Projeto Base',
  description: 'Aplicação Next.js 15 do projeto base',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Criar `app/page.tsx`**

```typescript
// apps/web/app/page.tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold tracking-tight">Projeto Base</h1>
      <p className="mt-4 text-lg text-gray-600">
        Monorepo Next.js 15 + Tailwind 4 + DDD/Hexagonal
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/tsconfig.json apps/web/next-env.d.ts apps/web/app
git commit -m "feat(web): scaffold Next.js 15 App Router with Tailwind 4

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.9: Cliente HTTP do Next para a API

**Files:**
- Create: `apps/web/lib/api-client.ts`

- [ ] **Step 1: Criar client**

```typescript
// apps/web/lib/api-client.ts
import type { ProblemDetailsDto } from '@projeto/shared-types';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
}

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, init);
  }
  async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, { ...init, body: JSON.stringify(body) });
  }
  async patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>('PATCH', path, { ...init, body: JSON.stringify(body) });
  }
  async delete<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, init);
  }

  private async request<T>(method: string, path: string, init?: RequestInit): Promise<T> {
    const token = this.config.getToken?.();
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);

    const res = await fetch(`${this.config.baseUrl}${path}`, { method, ...init, headers });
    if (!res.ok) {
      const problem = (await res.json()) as ProblemDetailsDto;
      throw new ApiError(problem.title, problem.code, problem.status, problem);
    }
    return res.json() as Promise<T>;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly problem: ProblemDetailsDto,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 2: Teste unitário**

```typescript
// apps/web/lib/api-client.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { ApiClient } from './api-client.js';

describe('ApiClient', () => {
  it('GET retorna JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    const client = new ApiClient({ baseUrl: 'http://api', getToken: () => 'tok' });
    await client.get('/x', { fetch: fetchMock as any });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api/x',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lança ApiError em resposta não-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          type: 't',
          title: 't',
          status: 404,
          detail: 'd',
          instance: 'i',
          code: 'NOT_FOUND',
          traceId: 'tr',
        }),
    });
    const client = new ApiClient({ baseUrl: 'http://api' });
    await expect(client.get('/x', { fetch: fetchMock as any })).rejects.toThrow('t');
  });
});
```

- [ ] **Step 3: Adicionar config Vitest no web**

```json
// apps/web/vitest.config.ts (novo arquivo)
{
  "test": {
    "environment": "node",
    "include": ["lib/**/*.spec.ts", "components/**/*.spec.ts"]
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib apps/web/vitest.config.ts
git commit -m "feat(web): add ApiClient with RFC 7807 error handling

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.10: Página de listagem de users (placeholder)

**Files:**
- Create: `apps/web/app/users/page.tsx`

- [ ] **Step 1: Criar página Server Component**

```typescript
// apps/web/app/users/page.tsx
import { ApiClient } from '@/lib/api-client';
import type { UserOutputDto, PaginatedResponse } from '@projeto/shared-types';

// Server Component: fetch direto, sem useEffect
export default async function UsersPage() {
  const api = new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
  });

  let data: PaginatedResponse<UserOutputDto> | null = null;
  let error: string | null = null;
  try {
    data = await api.get<PaginatedResponse<UserOutputDto>>('/users?limit=20');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="mt-4 text-red-600">Erro ao carregar: {error}</p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <ul className="mt-6 space-y-2">
        {data?.data.map((u) => (
          <li key={u.id} className="rounded border p-4">
            <div className="font-medium">{u.name}</div>
            <div className="text-sm text-gray-600">{u.email}</div>
            <div className="mt-1 text-xs text-gray-400">v{u.version}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Adicionar `.env.example` no web**

```text
# apps/web/.env.example
API_BASE_URL=http://localhost:3000/api/v1
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/users apps/web/.env.example
git commit -m "feat(web): users list page (Server Component + API client)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
