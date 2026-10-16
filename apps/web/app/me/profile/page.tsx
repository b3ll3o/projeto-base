// apps/web/app/me/profile/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): página "meu perfil" — mostra o
// profile do user logado e suas permissões efetivas. Read-only no
// front (a UI admin fica em /admin/profiles).
//
// Server Component: pega os dados via `obterMeuPerfil()` e renderiza.

import type * as React from 'react';
import { redirect } from 'next/navigation';
import { obterMeuPerfil } from '../../../lib/perfil';

export const dynamic = 'force-dynamic';

export default async function MeProfilePage(): Promise<React.JSX.Element> {
  const me = await obterMeuPerfil();
  if (me === null) {
    redirect('/login');
  }

  return (
    <main className="me-profile-page">
      <h1>Meu perfil</h1>

      <section>
        <h2>Identidade</h2>
        <dl>
          <dt>User ID</dt>
          <dd>{me.userId}</dd>
          <dt>Perfil</dt>
          <dd>
            {me.profile ? (
              <>
                <strong>{me.profile.name}</strong> <code>({me.profile.slug})</code>
              </>
            ) : (
              <em>Sem perfil — deny-by-default</em>
            )}
          </dd>
          <dt>Admin?</dt>
          <dd>{me.isAdmin ? 'Sim (bypass total)' : 'Não'}</dd>
        </dl>
      </section>

      <section>
        <h2>Permissões ({me.permissions.length})</h2>
        {me.permissions.length === 0 ? (
          <p>
            <em>
              Sem permissões explícitas.{' '}
              {me.isAdmin ? 'Mas você é admin, então passa em qualquer guard.' : ''}
            </em>
          </p>
        ) : (
          <ul>
            {me.permissions.map((k) => (
              <li key={k}>
                <code>{k}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
