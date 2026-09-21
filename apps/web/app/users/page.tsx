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
