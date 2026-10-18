// apps/web/app/admin/users/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): lista de users com select para
// atribuir/trocar profile. Server Component + form com Server Action.

import type * as React from 'react';
import { revalidatePath } from 'next/cache';
import { listarPerfis, atribuirPerfil, decidirAtribuicaoPerfil } from '../../../lib/perfil';
import { exigirAdmin } from '../guard-admin';
import { ApiClient } from '../../../lib/api-client';
import { exigirSessao, lerTenant } from '../../../lib/sessao';
import type { UserOutputDto, UsersPageDto } from '@projeto/shared-types';

export const dynamic = 'force-dynamic';

async function listarUsers(): Promise<UserOutputDto[]> {
  const accessToken = await exigirSessao();
  const tenantId = await lerTenant();
  const client = new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
    getTenant: () => tenantId,
  });
  const pagina = await client.get<UsersPageDto>('/users?limit=100');
  return pagina.users;
}

export default async function AdminUsersPage(): Promise<React.JSX.Element> {
  const guarda = await exigirAdmin();
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return, e foi o que impediu o formulário de vazar para quem não
  // é admin (MEDIDO nos e2e F10/F11/F12 — ver o cabeçalho de guard-admin.tsx).
  if (guarda.bloqueio) return guarda.tela;

  const [users, profiles] = await Promise.all([listarUsers(), listarPerfis()]);

  async function atribuir(formData: FormData): Promise<void> {
    'use server';
    const userId = String(formData.get('userId') ?? '');
    const selecionado = String(formData.get('profileId') ?? '');
    // O perfil atual vem da MESMA fonte que o `defaultValue` do select, então
    // comparar contra ele é o que distingue "não toquei em nada" de "escolhi
    // a opção vazia de propósito".
    const atual = String(formData.get('profileIdAtual') ?? '') || null;

    // pt-BR (#97, M3): a decisão é fail-safe. A opção vazia limpa o perfil com
    // o MESMO PUT e `profileId: null` (não existe DELETE para isso) — mas só
    // quando havia perfil. Sem isso, `Salvar` sem tocar em nada removia o
    // perfil de quem já estava sem perfil.
    if (userId) {
      const decisao = decidirAtribuicaoPerfil({ selecionado, atual });
      if (decisao.tipo === 'atribuir') {
        await atribuirPerfil(userId, decisao.profileId);
      } else if (decisao.tipo === 'remover') {
        await atribuirPerfil(userId, null);
      }
    }
    revalidatePath('/admin/users');
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Atribuir perfis</h1>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="py-2 pr-4 font-medium text-slate-500">Nome</th>
            <th className="py-2 pr-4 font-medium text-slate-500">Email</th>
            <th className="py-2 pr-4 font-medium text-slate-500">Perfil atual</th>
            <th className="py-2 font-medium text-slate-500">Atribuir</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            // pt-BR (#106): o perfil exibido é o EFETIVO no escopo, não o global.
            // `profileId` (users.profile_id) é null para toda conta criada pelo
            // produto, então usá-lo fazia a coluna dizer "sem perfil" para quem
            // tem perfil — em toda linha, sempre.
            //
            // `perfilEfetivoNoEscopo` ausente = a pessoa não pertence a esta
            // empresa. Distinguir isso de "pertence sem perfil" é o que evita a
            // tela mentir duas vezes.
            const perfilIdNoEscopo = u.perfilEfetivoNoEscopo;
            const semVinculo = perfilIdNoEscopo === undefined;
            const atual = profiles.find((p) => p.id === perfilIdNoEscopo);
            return (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 text-slate-900">{u.nome}</td>
                <td className="py-3 pr-4">{u.email}</td>
                <td className="py-3 pr-4">
                  {atual ? (
                    <code>{atual.slug}</code>
                  ) : semVinculo ? (
                    <em>fora desta empresa</em>
                  ) : (
                    <em>sem perfil</em>
                  )}
                </td>
                <td className="py-3">
                  <form action={atribuir} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="profileIdAtual" value={perfilIdNoEscopo ?? ''} />
                    {/* pt-BR: sem nome acessível o leitor de tela anuncia um
                        combo box anônimo, 1× por linha. `aria-label` não cria
                        elemento — a estrutura que o e2e mede fica igual. */}
                    <select
                      aria-label={`Perfil de ${u.email}`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      defaultValue={atual?.id ?? ''}
                      name="profileId"
                    >
                      <option value="">— sem perfil —</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.slug} {p.isAdmin ? '(admin)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      Salvar
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
