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
import { Botao } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Campo } from '@/components/ui/campo';
import { Container } from '@/components/ui/container';
import {
  obterPerfilPorSlug,
  listarPermissoes,
  trocarPermissoes,
  atualizarPerfil,
} from '../../../../lib/perfil';
import { exigirAdmin } from '../../guard-admin';
import { CLASSE_CHECKBOX } from '@/components/ui/campo';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AdminProfileDetailPage({
  params,
}: PageProps): Promise<React.JSX.Element> {
  const guarda = await exigirAdmin();
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return, e foi o que impediu o formulário de vazar para quem não
  // é admin (MEDIDO nos e2e F10/F11/F12 — ver o cabeçalho de guard-admin.tsx).
  if (guarda.bloqueio) return guarda.tela;

  const { slug } = await params;

  const [profile, catalogo] = await Promise.all([
    // pt-BR: `null` = o slug não existe (a função só devolve isso nesse caso) e
    // vira `notFound()`. Token expirado, 500 e rede caída PROPAGAM — o antigo
    // `.catch(() => null)` transformava os três na mesma tela de "não encontrado",
    // um erro de servidor vestindo a roupa do 404.
    obterPerfilPorSlug(slug),
    listarPermissoes(),
  ]);
  if (profile === null) {
    notFound();
  }

  const atribuidas = new Set(profile.permissions);

  // pt-BR (#97, M1): o gate é `isSystem`, não `isAdmin`. Medido em
  // `profiles.use-cases.ts` — `atribuir`/`revogar` recusam com
  // `ProfileSystemProtectedException` só quando `isSystem()`; `isAdmin` só é
  // bloqueado no RENAME (`atualizar`), que esta tela não chamava quando este
  // comentário foi escrito (2026-10-19 passou a chamar — gate abaixo). Renderizar o
  // form num perfil de sistema dava duas falhas: erro na API ao marcar, e —
  // pior — com zero mudanças o diff é vazio, nada sai, e o "Salvar" parece ter
  // funcionado. `admin` e `viewer`, os dois do seed, são `isSystem: true`.

  // pt-BR (admin editar perfil, 2026-10-19): `name` e `description` viram
  // formulário. Gate é `isSystem || isAdmin` — `atualizar` recusa os dois
  // (`profiles.use-cases.ts:268,271`) —, ao contrário do gate de PERMISSÕES
  // acima, que é só `isSystem`. Sem a condição, o clique leva 403 garantido.
  async function salvarMetadados(formData: FormData): Promise<void> {
    'use server';
    // shortcut: nenhum `version` viaja com o PATCH, então dois admins na mesma
    // tela sobrescrevem em silêncio — o mesmo limite de `trocarPermissoes`
    // (`lib/perfil.ts:254-259`). O lock otimista do repositório existe
    // (`prisma-profile.repository.ts` compara `version`), mas ele compara contra
    // a versão lida na MESMA requisição, nunca contra a do render — por isso
    // `page.tsx` mostra `versão {n}` na tela sem nada mandar de volta. Quando a
    // API aceitar `If-Match`, o número exibido vira o baseline enviado.
    //
    // shortcut: erro sobe como exceção para o `app/error.tsx` da raiz, igual ao
    // `saveAuthorizations` desta tela e ao `criarPerfil` de `new/page.tsx:50-53`.
    // O 4xx alcançável daqui é só o `ProfileName`: o `minLength={2}` do browser
    // conta comprimento CRU, então `"  a  "` passa e o VO — que mede depois do
    // trim (`profile-name.vo.ts:23-28`) — recusa com 400, e a página inteira
    // some atrás do copy genérico do boundary. Mensagem inline exige
    // `useActionState` + client component; quando o erro esperado aqui for
    // frequente, vale pagar esse custo.
    //
    // `name` NÃO é aparado aqui: o VO já faz isso, e um `.trim()` antes seria
    // redundante. `description` é, porque não tem VO — sem isso o admin "limpa"
    // e grava `" "`, invisível em todo render. E string vazia é "limpar": o que
    // se manda é o que o browser entregou, sem o `...(description !== '' ? …)`
    // de `new/page.tsx:57`.
    const name = String(formData.get('name') ?? '');
    const description = String(formData.get('description') ?? '').trim();
    await atualizarPerfil(profile!.id, { name, description });
    revalidatePath(`/admin/profiles/${profile!.slug}`);
    revalidatePath('/admin/profiles');
  }

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
    <Container>
      <CabecalhoPagina
        titulo={`Perfil: ${profile.name}`}
        descricao={
          <>
            <code>{profile.slug}</code> · versão {profile.version}
          </>
        }
      />

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Flags</h2>
        <ul className="mt-3 space-y-1 text-sm text-foreground">
          <li>isAdmin: {profile.isAdmin ? '✅' : '—'} (bypass total no guard)</li>
          <li>isSystem: {profile.isSystem ? '✅' : '—'} (protegido contra DELETE)</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Metadados</h2>
        {profile.isSystem || profile.isAdmin ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Perfil de {profile.isSystem ? 'sistema' : 'administrador'}: nome e descrição são{' '}
            <strong>somente leitura</strong>. A API recusa alterações.
          </p>
        ) : (
          <form action={salvarMetadados} className="mt-3 space-y-4 text-sm">
            <Campo
              id="name"
              rotulo="Nome"
              type="text"
              name="name"
              defaultValue={profile.name}
              required
              minLength={2}
              maxLength={80}
            />
            <Campo
              id="description"
              rotulo="Descrição"
              type="text"
              name="description"
              defaultValue={profile.description ?? ''}
            />
            <Botao type="submit">Salvar metadados</Botao>
          </form>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">
          Permissões ({profile.permissions.length})
        </h2>
        {profile.isSystem ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Perfil de sistema: as permissões são <strong>somente leitura</strong>. A API recusa
              alterações com <code>ProfileSystemProtectedException</code>.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-foreground">
              {catalogo.map((k) => (
                <li key={k}>
                  <code>{k}</code> {atribuidas.has(k) ? '✅' : '—'}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <form action={saveAuthorizations} className="mt-3">
            <ul className="space-y-1">
              {catalogo.map((k) => (
                <li key={k}>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="permissionKey"
                      value={k}
                      defaultChecked={atribuidas.has(k)}
                      className={CLASSE_CHECKBOX}
                    />
                    <code>{k}</code>
                  </label>
                </li>
              ))}
            </ul>
            <Botao type="submit" className="mt-4">
              Salvar
            </Botao>
          </form>
        )}
      </section>
    </Container>
  );
}
