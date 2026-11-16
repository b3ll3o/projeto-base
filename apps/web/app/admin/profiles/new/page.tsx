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
import { Botao } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Campo } from '@/components/ui/campo';
import { Container } from '@/components/ui/container';
import { criarPerfil, listarPermissoes } from '../../../../lib/perfil';
import { exigirAdmin } from '../../guard-admin';
import { CLASSE_CHECKBOX } from '@/components/ui/campo';

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
  const guarda = await exigirAdmin();
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return, e foi o que impediu o formulário de vazar para quem não
  // é admin (MEDIDO nos e2e F10/F11/F12 — ver o cabeçalho de guard-admin.tsx).
  if (guarda.bloqueio) return guarda.tela;

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
    <Container>
      <CabecalhoPagina titulo="Novo perfil" />

      <form action={create} className="mt-8 space-y-4 text-sm">
        <Campo
          id="slug"
          rotulo="Slug"
          type="text"
          name="slug"
          required
          minLength={3}
          maxLength={40}
          pattern={SLUG_PATTERN}
        />
        <Campo id="name" rotulo="Nome" type="text" name="name" required maxLength={80} />
        <Campo id="description" rotulo="Descrição" type="text" name="description" />

        <fieldset className="rounded-md bg-surface p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Permissões</legend>
          <ul className="space-y-1">
            {catalogo.map((k) => (
              <li key={k}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="permissionKey"
                    value={k}
                    className={CLASSE_CHECKBOX}
                  />
                  <code>{k}</code>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <Botao type="submit">Criar perfil</Botao>
      </form>
    </Container>
  );
}
