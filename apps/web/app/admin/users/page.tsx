// apps/web/app/admin/users/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): lista de users com select para
// atribuir/trocar profile. Server Component + form com Server Action.

import type * as React from 'react';
import { revalidatePath } from 'next/cache';
import { obterMeuPerfil, listarPerfis, atribuirPerfil, removerPerfil } from '../../../lib/perfil';
import { ApiClient } from '../../../lib/api-client';
import { exigirSessao } from '../../../lib/sessao';
import type { UserOutputDto, UsersPageDto, AssignProfileInputDto } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

async function listarUsers(): Promise<UserOutputDto[]> {
  const accessToken = await exigirSessao();
  const client = new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://api:3000',
    getToken: () => accessToken,
  });
  const pagina = await client.get<UsersPageDto>('/api/v1/users?limit=100');
  return pagina.users;
}

export default async function AdminUsersPage(): Promise<React.JSX.Element> {
  const me = await obterMeuPerfil();
  if (me === null || me.isAdmin !== true) {
    return (
      <main>
        <h1>Acesso restrito</h1>
      </main>
    );
  }

  const [users, profiles] = await Promise.all([listarUsers(), listarPerfis()]);

  async function atribuir(formData: FormData): Promise<void> {
    'use server';
    const userId = String(formData.get('userId') ?? '');
    const profileId = String(formData.get('profileId') ?? '');
    if (userId && profileId) {
      const body: AssignProfileInputDto = { profileId };
      await atribuirPerfil(userId, profileId);
      void body;
    }
    revalidatePath('/admin/users');
  }

  async function limpar(formData: FormData): Promise<void> {
    'use server';
    const userId = String(formData.get('userId') ?? '');
    if (userId) {
      await removerPerfil(userId);
    }
    revalidatePath('/admin/users');
  }

  return (
    <main>
      <h1>Atribuir perfis</h1>

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Perfil atual</th>
            <th>Atribuir</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const atual = profiles.find((p) => p.id === (u as { profileId?: string | null }).profileId);
            return (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email}</td>
                <td>{atual ? <code>{atual.slug}</code> : <em>sem perfil</em>}</td>
                <td>
                  <form action={atribuir} style={{ display: 'inline-block' }}>
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="profileId" defaultValue={atual?.id ?? ''}>
                      <option value="">— escolha —</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.slug} {p.isAdmin ? '(admin)' : ''}
                        </option>
                      ))}
                    </select>
                    <button type="submit">Atribuir</button>
                  </form>
                  {atual ? (
                    <form action={limpar} style={{ display: 'inline-block', marginLeft: 8 }}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button type="submit">Limpar</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
