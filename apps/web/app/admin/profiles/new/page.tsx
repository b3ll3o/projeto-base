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
      <main>
        <h1>Acesso restrito</h1>
        <p>Esta página exige perfil de administrador.</p>
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
    <main>
      <h1>Novo perfil</h1>

      <form action={create}>
        <p>
          <label>
            Slug:{' '}
            <input
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
          <label>
            Nome: <input type="text" name="name" required />
          </label>
        </p>
        <p>
          <label>
            Descrição: <input type="text" name="description" />
          </label>
        </p>

        <fieldset>
          <legend>Permissões</legend>
          <ul>
            {catalogo.map((k) => (
              <li key={k}>
                <label>
                  <input type="checkbox" name="permissionKey" value={k} />
                  <code>{k}</code>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <button type="submit">Criar perfil</button>
      </form>
    </main>
  );
}
