// apps/web/app/admin/profiles/[slug]/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): detalhe de um perfil — mostra
// metadados (slug, name, isAdmin, isSystem) e a lista de permissões.
// Form simples para togglar permissões (Server Action).

import type * as React from 'react';
import { notFound } from 'next/navigation';
import {
  listarPerfis,
  listarAutorizacoes,
  obterMeuPerfil,
  obterPerfil,
  sincronizarAutorizacoes,
} from '../../../../lib/perfil';
import type { PermissionKey } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AdminProfileDetailPage({
  params,
}: PageProps): Promise<React.JSX.Element> {
  const me = await obterMeuPerfil();
  if (me === null || me.isAdmin !== true) {
    return (
      <main>
        <h1>Acesso restrito</h1>
      </main>
    );
  }

  const { slug } = await params;
  let profile;
  try {
    profile = await obterPerfil(slug);
  } catch {
    notFound();
  }

  const [allProfiles, currentKeys] = await Promise.all([
    listarPerfis(),
    listarAutorizacoes(profile.id).catch(
      () => [] as Awaited<ReturnType<typeof listarAutorizacoes>>,
    ),
  ]);
  const assignedKeys = new Set(currentKeys.map((a) => a.permissionKey));
  void allProfiles; // (reserved for "copy from another profile" UI)

  const allPermissionKeys: readonly PermissionKey[] = [
    'users.read',
    'users.write',
    'users.delete',
    'admin.manage-profiles',
    'admin.manage-authorizations',
    'admin.manage-users',
    'audits.read',
  ];

  async function saveAuthorizations(formData: FormData): Promise<void> {
    'use server';
    const checked = formData.getAll('permissionKey').map(String) as PermissionKey[];
    await sincronizarAutorizacoes(profile!.id, checked);
  }

  return (
    <main>
      <h1>Perfil: {profile.name}</h1>
      <p>
        <code>{profile.slug}</code> · versão {profile.version}
      </p>

      <section>
        <h2>Flags</h2>
        <ul>
          <li>isAdmin: {profile.isAdmin ? '✅' : '—'} (bypass total no guard)</li>
          <li>isSystem: {profile.isSystem ? '✅' : '—'} (protegido contra DELETE)</li>
        </ul>
      </section>

      <section>
        <h2>Permissões ({currentKeys.length})</h2>
        <form action={saveAuthorizations}>
          <ul>
            {allPermissionKeys.map((k) => (
              <li key={k}>
                <label>
                  <input
                    type="checkbox"
                    name="permissionKey"
                    value={k}
                    defaultChecked={assignedKeys.has(k)}
                  />
                  <code>{k}</code>
                </label>
              </li>
            ))}
          </ul>
          <button type="submit">Salvar</button>
        </form>
      </section>
    </main>
  );
}
