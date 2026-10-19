// apps/web/app/me/profile/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): página "meu perfil" — mostra o
// profile do user logado e suas permissões efetivas. Read-only no
// front (a UI admin fica em /admin/profiles).
//
// Server Component: pega os dados via `obterMeuPerfil()` e renderiza.

import type * as React from 'react';
import { redirect } from 'next/navigation';
import { obterMeuPerfil } from '../../../lib/perfil';
import { ApiError } from '../../../lib/api-client';
import { ServicoIndisponivel } from '../../admin/guard-admin';

export const dynamic = 'force-dynamic';

export default async function MeProfilePage(): Promise<React.JSX.Element> {
  // pt-BR (achado 5): `obterMeuPerfil` passou a propagar 403/5xx/timeout/rede
  // (conserto do #107). Esta tela é o TERCEIRO chamador, e o PR atualizou o
  // guard de `/admin/*` e o `Sidebar` — esqueceu este.
  //
  // MEDIDO: logada em `/me/profile` com a API em 502, o Server Component
  // lançava e a resposta era 500 sem tela de retry. Antes renderizava
  // "Sem perfil — deny-by-default", que era um erro silencioso em direção
  // oposta (ela era administradora legítima e via "sem perfil").
  //
  // ⚠️ pt-BR (2ª revisão, achado 3) `.catch(() => null)` era o defeito que a
  // issue #107 existe para matar, reintroduzido aqui: 403/5xx/timeout/rede
  // viravam `null` e caíam no `redirect('/login')`. A administradora legítima
  // com a API fora do ar era mandada para o login — que é exatamente o que o
  // #107 conserta no guard (`guard-admin.tsx`, onde 403 e 5xx NÃO viram
  // `null`). A soma dos dois revisores está certa: o 500 cru some, mas o
  // sintoma vira "sessão expirada".
  //
  // Aqui a distinção é a mesma do guard:
  //   sem sessão / 401 → login
  //   403                → acesso restrito (é administradora, falta permissão)
  //   5xx / timeout / rede → serviço fora, com retry
  let me;
  try {
    me = await obterMeuPerfil();
  } catch (erro) {
    if (erro instanceof ApiError && (erro.status === 401 || erro.status === 403)) {
      redirect('/login');
    }
    return ServicoIndisponivel();
  }
  if (me === null) {
    redirect('/login');
  }

  return (
    // pt-BR: `me-profile-page` não existe em `globals.css` — a tela renderizava
    // como texto solto, sem hierarquia visível. Mesmos utilitários de `/users`
    // e `/login`, que são o padrão do resto do app.
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Meu perfil</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Identidade</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <dt className="font-medium text-slate-500">Perfil</dt>
          <dd className="text-slate-900">
            {me.profileName !== null ? (
              <>
                <strong>{me.profileName}</strong> <code>({me.profileSlug})</code>
              </>
            ) : (
              <em>Sem perfil — deny-by-default</em>
            )}
          </dd>
          <dt className="font-medium text-slate-500">Admin?</dt>
          <dd className="text-slate-900">{me.isAdmin ? 'Sim (bypass total)' : 'Não'}</dd>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Permissões ({me.permissions.length})</h2>
        {me.permissions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            <em>
              Sem permissões explícitas.{' '}
              {me.isAdmin ? 'Mas você é admin, então passa em qualquer guard.' : ''}
            </em>
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {me.permissions.map((k) => (
              <li key={k} className="text-sm text-slate-900">
                <code>{k}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
