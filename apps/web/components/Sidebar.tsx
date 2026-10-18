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
  // pt-BR (#107, 2026-10-18): este é o CHROME, e chrome não pode derrubar a
  // página. `obterMeuPerfil()` passou a propagar 403/5xx/timeout/rede — certo
  // para quem DECIDE (o guard de `/admin/*`, que distingue "acesso restrito"
  // de "serviço fora"), errado para quem só desenha navegação.
  //
  // MEDIDO: sem este `catch`, os e2e F1 e F5 caíram. Com a API fora do ar, o
  // Sidebar é renderizado pelo layout de TODAS as telas, e a exceção subia
  // junto: `/users` e `/users/novo` deixavam de responder, e o teste que
  // existe justamente para medir "a tela informa que não conseguiu carregar"
  // mediava uma página que nem renderizou.
  //
  // O `null` aqui significa "não sei quem é" — e a consequência é só não
  // desenhar o link "Admin". O chrome degrada, a página não. A distinção real
  // (401 vs 403 vs 5xx) continua mora no guard, que é quem tem o que fazer
  // com ela.
  let me: MeProfileDto | null = null;
  try {
    me = await obterMeuPerfil();
  } catch {
    // Deliberadamente engolido: ver acima. A tela que FALOU é a que chama a
    // API dela; o menu só não mostra um link.
  }

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
