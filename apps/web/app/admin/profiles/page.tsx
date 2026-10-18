// apps/web/app/admin/profiles/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): lista de perfis (apenas admin).
// Server Component: chama `listarPerfis()`.
//
// pt-BR (#97): esta página checa `isAdmin` no front MESMO com a API como fonte
// da verdade — a checagem é duplicada de propósito. Ela é mais ESTRITA que a da
// API: um ator com `admin.manage-profiles` mas sem `isAdmin` passa pelo guard
// do backend e veria a tela; aqui ele vê "Acesso restrito". Aceitável nesta tela
// porque ela é a navegação de topo do admin — mostrar a lista de perfis para
// quem não tem o bypass de admin seria inconsistente com o resto da tela.

import type * as React from 'react';
import Link from 'next/link';
import { listarPerfis } from '../../../lib/perfil';
import { exigirAdmin } from '../guard-admin';

export const dynamic = 'force-dynamic';

export default async function AdminProfilesPage(): Promise<React.JSX.Element> {
  await exigirAdmin();

  const profiles = await listarPerfis();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Perfis de acesso</h1>

      <p className="mt-4">
        <Link
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          href="/admin/profiles/new"
        >
          + Novo perfil
        </Link>
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="py-2 pr-4 font-medium text-slate-500">Slug</th>
            <th className="py-2 pr-4 font-medium text-slate-500">Nome</th>
            <th className="py-2 pr-4 font-medium text-slate-500">Admin?</th>
            <th className="py-2 pr-4 font-medium text-slate-500">Sistema?</th>
            <th className="py-2 pr-4 font-medium text-slate-500">Permissões</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="py-3 pr-4">
                <code>{p.slug}</code>
              </td>
              <td className="py-3 pr-4 text-slate-900">{p.name}</td>
              <td className="py-3 pr-4">{p.isAdmin ? '✅' : '—'}</td>
              <td className="py-3 pr-4">{p.isSystem ? '✅' : '—'}</td>
              <td className="py-3 pr-4">{p.permissionCount}</td>
              <td className="py-3">
                <Link className="text-slate-700 underline" href={`/admin/profiles/${p.slug}`}>
                  editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
