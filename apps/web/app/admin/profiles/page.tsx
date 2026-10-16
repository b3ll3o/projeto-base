// apps/web/app/admin/profiles/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): lista de perfis (apenas admin).
// Server Component: chama `listarPerfis()`. O guard do backend rejeita
// a request se o user não for admin — mas aqui no front não duplicamos
// a checagem (a API é a fonte da verdade).

import type * as React from 'react';
import Link from 'next/link';
import { listarPerfis } from '../../../lib/perfil';
import { obterMeuPerfil } from '../../../lib/perfil';

export const dynamic = 'force-dynamic';

export default async function AdminProfilesPage(): Promise<React.JSX.Element> {
  const me = await obterMeuPerfil();
  if (me === null || me.isAdmin !== true) {
    return (
      <main>
        <h1>Acesso restrito</h1>
        <p>Esta página exige perfil de administrador.</p>
      </main>
    );
  }

  const profiles = await listarPerfis();

  return (
    <main>
      <h1>Perfis de acesso</h1>

      <p>
        <Link href="/admin/profiles/new">+ Novo perfil</Link>
      </p>

      <table>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Nome</th>
            <th>Admin?</th>
            <th>Sistema?</th>
            <th>Version</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id}>
              <td>
                <code>{p.slug}</code>
              </td>
              <td>{p.name}</td>
              <td>{p.isAdmin ? '✅' : '—'}</td>
              <td>{p.isSystem ? '✅' : '—'}</td>
              <td>{p.version}</td>
              <td>
                <Link href={`/admin/profiles/${p.slug}`}>editar</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
