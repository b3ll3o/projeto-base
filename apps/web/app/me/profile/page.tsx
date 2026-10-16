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
    // pt-BR: `me-profile-page` não existe em `globals.css` — a tela renderizava
    // como texto solto, sem hierarquia visível. Mesmos utilitários de `/users`
    // e `/login`, que são o padrão do resto do app.
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Meu perfil</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Identidade</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <dt className="font-medium text-slate-500">Perfil</dt>
          <dd className="text-slate-900">
            {me.profileName !== null ? (
              <>
                <strong>{me.profileName}</strong> <code>({me.profileSlug})</code>
              </>
            ) : (
              <em>Sem perfil — deny-by-default</em>
            )}
          </dd>
          <dt className="font-medium text-slate-500">Admin?</dt>
          <dd className="text-slate-900">{me.isAdmin ? 'Sim (bypass total)' : 'Não'}</dd>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Permissões ({me.permissions.length})</h2>
        {me.permissions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            <em>
              Sem permissões explícitas.{' '}
              {me.isAdmin ? 'Mas você é admin, então passa em qualquer guard.' : ''}
            </em>
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {me.permissions.map((k) => (
              <li key={k} className="text-sm text-slate-900">
                <code>{k}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
