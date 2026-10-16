// apps/web/components/Sidebar.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): navegação lateral com link admin
// condicional. Server Component: chama `obterMeuPerfil()` no servidor
// e decide inline se renderiza o link "Admin" — não vaza nada no
// client (não há JS para `localStorage` ler).

import type * as React from 'react';
import Link from 'next/link';
import type { MeProfileDto } from '@projeto/shared-types';
import { obterMeuPerfil } from '../lib/perfil';

export async function Sidebar(): Promise<React.JSX.Element> {
  const me: MeProfileDto | null = await obterMeuPerfil();

  return (
    <nav aria-label="Navegação principal" className="sidebar">
      <ul>
        <li>
          <Link href="/">Início</Link>
        </li>
        <li>
          <Link href="/users">Usuários</Link>
        </li>
        <li>
          <Link href="/me/profile">Meu perfil</Link>
        </li>
        {me?.isAdmin === true ? (
          <>
            <li>
              <hr />
            </li>
            <li>
              <strong>Admin</strong>
            </li>
            <li>
              <Link href="/admin/profiles">Perfis</Link>
            </li>
            <li>
              <Link href="/admin/users">Atribuir perfis</Link>
            </li>
          </>
        ) : null}
      </ul>

      {me !== null ? (
        <p className="sidebar-footer">
          {me.profile?.name ?? 'Sem perfil'} · {me.isAdmin ? 'admin' : 'usuário'}
        </p>
      ) : null}
    </nav>
  );
}
