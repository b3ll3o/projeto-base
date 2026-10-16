// apps/web/app/admin/users/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): lista de users com select para
// atribuir/trocar profile. Server Component + form com Server Action.

import type * as React from 'react';
import { revalidatePath } from 'next/cache';
import {
  obterMeuPerfil,
  listarPerfis,
  atribuirPerfil,
  decidirAtribuicaoPerfil,
} from '../../../lib/perfil';
import { ApiClient } from '../../../lib/api-client';
import { exigirSessao } from '../../../lib/sessao';
import type { UserOutputDto, UsersPageDto } from '@projeto/shared-types';

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
    const selecionado = String(formData.get('profileId') ?? '');
    // O perfil atual vem da MESMA fonte que o `defaultValue` do select, então
    // comparar contra ele é o que distingue "não toquei em nada" de "escolhi
    // a opção vazia de propósito".
    const atual = String(formData.get('profileIdAtual') ?? '') || null;

    // pt-BR (#97, M3): a decisão é fail-safe. A opção vazia limpa o perfil com
    // o MESMO PUT e `profileId: null` (não existe DELETE para isso) — mas só
    // quando havia perfil. Sem isso, `Salvar` sem tocar em nada removia o
    // perfil de quem já estava sem perfil.
    if (userId) {
      const decisao = decidirAtribuicaoPerfil({ selecionado, atual });
      if (decisao.tipo === 'atribuir') {
        await atribuirPerfil(userId, decisao.profileId);
      } else if (decisao.tipo === 'remover') {
        await atribuirPerfil(userId, null);
      }
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
            const atual = profiles.find((p) => p.id === u.profileId);
            return (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email}</td>
                <td>{atual ? <code>{atual.slug}</code> : <em>sem perfil</em>}</td>
                <td>
                  <form action={atribuir} style={{ display: 'inline-block' }}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="profileIdAtual" value={u.profileId ?? ''} />
                    <select name="profileId" defaultValue={atual?.id ?? ''}>
                      <option value="">— sem perfil —</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.slug} {p.isAdmin ? '(admin)' : ''}
                        </option>
                      ))}
                    </select>
                    <button type="submit">Salvar</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
