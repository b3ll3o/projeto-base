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
    // pt-BR: `sidebar`/`sidebar-footer` não existem em `globals.css` — o menu
    // renderizava como texto corrido, com link azul padrão do browser, colado
    // no conteúdo. Utilitários Tailwind, como o resto do app.
    <nav aria-label="Navegação principal" className="w-64 shrink-0 border-r border-slate-200 p-8">
      <ul className="space-y-1">
        <li>
          <Link className="text-sm font-medium text-slate-700 hover:text-slate-900" href="/">
            Início
          </Link>
        </li>
        <li>
          <Link className="text-sm font-medium text-slate-700 hover:text-slate-900" href="/users">
            Usuários
          </Link>
        </li>
        <li>
          <Link
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
            href="/me/profile"
          >
            Meu perfil
          </Link>
        </li>
        {me?.isAdmin === true ? (
          <>
            <li>
              <hr className="my-4 border-slate-200" />
            </li>
            <li>
              <strong className="text-xs uppercase tracking-wide text-slate-400">Admin</strong>
            </li>
            <li>
              <Link
                className="text-sm font-medium text-slate-700 hover:text-slate-900"
                href="/admin/profiles"
              >
                Perfis
              </Link>
            </li>
            <li>
              <Link
                className="text-sm font-medium text-slate-700 hover:text-slate-900"
                href="/admin/users"
              >
                Atribuir perfis
              </Link>
            </li>
          </>
        ) : null}
      </ul>

      {me !== null ? (
        <p className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          {me.profileName ?? 'Sem perfil'} · {me.isAdmin ? 'admin' : 'usuário'}
        </p>
      ) : null}
    </nav>
  );
}
