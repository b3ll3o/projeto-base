// apps/web/app/admin/profiles/new/page.tsx
//
// pt-BR (#97): criação de perfil. A rota `/admin/profiles/new` já era
// linkada em `/admin/profiles` desde o #93.1 mas a pasta não existia — o
// botão "+ Novo perfil" dava 404.
//
// `isAdmin`/`isSystem` NÃO aparecem no formulário e não são enviados: a API
// os ignora de todo jeito (só o seed/migration criam admin), e oferecer o
// campo na tela seria mentir sobre o que o sistema faz.

import type * as React from 'react';
import { redirect } from 'next/navigation';
import { obterMeuPerfil, criarPerfil, listarPermissoes } from '../../../../lib/perfil';

export const dynamic = 'force-dynamic';

/**
 * Mesmo formato de `SLUG_REGEX` de
 * `apps/api/src/modules/profiles/domain/value-objects/profile-slug.vo.ts`,
 * mas só no *formato*: o VO normaliza com `trim().toLowerCase()` antes de
 * testar e este `pattern` não. Por isso a Server Action normaliza também —
 * sem isso, `Editor` e ` editor ` passariam pelo browser e seriam recusados
 * pela API (o inverso de hoje, em que o browser bloqueia o que a API aceitaria).
 * `minLength`/`maxLength` aqui são 3/40, os mesmos do VO, e incidem sobre o
 * valor ORIGINAL — a API segue sendo a fonte da verdade do comprimento.
 */
const SLUG_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';

export default async function NewProfilePage(): Promise<React.JSX.Element> {
  const me = await obterMeuPerfil();
  if (me === null || me.isAdmin !== true) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Acesso restrito</h1>
        <p className="mt-1 text-sm text-slate-500">Esta página exige perfil de administrador.</p>
      </main>
    );
  }

  const catalogo = await listarPermissoes();

  async function create(formData: FormData): Promise<void> {
    'use server';
    // `toLowerCase()` espelha a normalização do VO (`trim().toLowerCase()`), senão
    // o `pattern` acima rejeita no browser o que a API aceitaria.
    const slug = String(formData.get('slug') ?? '')
      .trim()
      .toLowerCase();
    const name = String(formData.get('name') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const permissionKeys = formData.getAll('permissionKey').map(String);

    // shortcut: erro sobe como exceção (409 de slug duplicado vira 500), igual
    // ao `saveAuthorizations` da página de detalhe. Trocar por mensagem inline
    // exige `useActionState` + client component — quando existir um form cujo
    // erro esperado seja frequente, vale pagar esse custo.
    const criado = await criarPerfil({
      slug,
      name,
      ...(description !== '' ? { description } : {}),
      ...(permissionKeys.length > 0 ? { initialPermissions: permissionKeys } : {}),
    });

    redirect(`/admin/profiles/${criado.slug}`);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Novo perfil</h1>

      <form action={create} className="mt-8 space-y-4 text-sm">
        <p>
          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Slug</span>
            <input
              className="block w-full rounded-md border border-slate-300 px-3 py-2"
              type="text"
              name="slug"
              required
              minLength={3}
              maxLength={40}
              pattern={SLUG_PATTERN}
            />
          </label>
        </p>
        <p>
          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Nome</span>
            <input
              className="block w-full rounded-md border border-slate-300 px-3 py-2"
              type="text"
              name="name"
              required
            />
          </label>
        </p>
        <p>
          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Descrição</span>
            <input
              className="block w-full rounded-md border border-slate-300 px-3 py-2"
              type="text"
              name="description"
            />
          </label>
        </p>

        <fieldset className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Permissões</legend>
          <ul className="space-y-1">
            {catalogo.map((k) => (
              <li key={k}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="permissionKey" value={k} />
                  <code>{k}</code>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Criar perfil
        </button>
      </form>
    </main>
  );
}
