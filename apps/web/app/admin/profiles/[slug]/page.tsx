// apps/web/app/admin/profiles/[slug]/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): detalhe de um perfil — mostra
// metadados (slug, name, isAdmin, isSystem) e a lista de permissões.
// Form simples para togglar permissões (Server Action).
//
// pt-BR (#97): a URL continua sendo `[slug]` — é o que o admin digita e o que
// fica nos links — mas o slug é RESOLVIDO para o UUID antes de qualquer
// mutação. Antes, o slug ia cru pro path de um `:id` que a API faz por
// `findById`, e a página dava 404 sempre. O catálogo de permissões vem de
// `GET /admin/permissions` (antes era uma lista hardcoded que envelhecia
// junto com a API) e as permissões atuais vêm do próprio `ProfileDetail`.

import type * as React from 'react';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  obterMeuPerfil,
  obterPerfilPorSlug,
  listarPermissoes,
  trocarPermissoes,
} from '../../../../lib/perfil';

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

  const [profile, catalogo] = await Promise.all([
    obterPerfilPorSlug(slug).catch(() => null),
    listarPermissoes(),
  ]);
  if (profile === null) {
    notFound();
  }

  const atribuidas = new Set(profile.permissions);

  // pt-BR (#97, M1): o gate é `isSystem`, não `isAdmin`. Medido em
  // `profiles.use-cases.ts` — `atribuir`/`revogar` recusam com
  // `ProfileSystemProtectedException` só quando `isSystem()`; `isAdmin` só é
  // bloqueado no RENAME (`atualizar`), que esta tela não chama. Renderizar o
  // form num perfil de sistema dava duas falhas: erro na API ao marcar, e —
  // pior — com zero mudanças o diff é vazio, nada sai, e o "Salvar" parece ter
  // funcionado. `admin` e `viewer`, os dois do seed, são `isSystem: true`.

  async function saveAuthorizations(formData: FormData): Promise<void> {
    'use server';
    const desejadas = formData.getAll('permissionKey').map(String);
    // Falha não é engolida: sem revalidate, o erro sobe e a tela não recarrega
    // fingindo sucesso sobre um estado parcial (ver `trocarPermissoes`).
    // Sem `error.tsx` no app, quem vê isso é a página de erro genérica do Next —
    // a garantia é a de não haver "salvo" falso, não a de exibir a mensagem.
    await trocarPermissoes(profile!.id, profile!.permissions, desejadas);
    revalidatePath(`/admin/profiles/${profile!.slug}`);
    revalidatePath('/admin/profiles');
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
        <h2>Permissões ({profile.permissions.length})</h2>
        {profile.isSystem ? (
          <>
            <p>
              Perfil de sistema: as permissões são <strong>somente leitura</strong>. A API recusa
              alterações com <code>ProfileSystemProtectedException</code>.
            </p>
            <ul>
              {catalogo.map((k) => (
                <li key={k}>
                  <code>{k}</code> {atribuidas.has(k) ? '✅' : '—'}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <form action={saveAuthorizations}>
            <ul>
              {catalogo.map((k) => (
                <li key={k}>
                  <label>
                    <input
                      type="checkbox"
                      name="permissionKey"
                      value={k}
                      defaultChecked={atribuidas.has(k)}
                    />
                    <code>{k}</code>
                  </label>
                </li>
              ))}
            </ul>
            <button type="submit">Salvar</button>
          </form>
        )}
      </section>
    </main>
  );
}
