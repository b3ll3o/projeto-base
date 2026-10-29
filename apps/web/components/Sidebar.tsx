// apps/web/components/Sidebar.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): navegação lateral com link admin
// condicional. Server Component: chama `obterMeuPerfil()` no servidor
// e decide inline se renderiza o link "Admin" — não vaza nada no
// client (não há JS para `localStorage` ler).

import type * as React from 'react';
import Link from 'next/link';
import type { MeProfileDto } from '@projeto/shared-types';
import { obterMeuPerfil, obterMeuPerfilGlobal } from '../lib/perfil';

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
  //
  // ⚠️ 2026-10-29 (revisão do PR #127): são DOIS perfis, e cada link é
  // mostrado sob o sinal que a SUA tela exige. Antes o bloco inteiro usava o
  // perfil EFETIVO (da empresa da sessão), e isso abria uma porta que não
  // abre: o DONO de uma empresa tem `isAdmin: true` no perfil efetivo DA
  // EMPRESA DELE, e `/admin/tenancy` (e `/admin/flags`) exigem o `isAdmin` do
  // bucket GLOBAL — então o menu oferecia um link que levava a "Acesso
  // restrito". E o inverso acontecia: o administrador do SISTEMA que tivesse
  // uma empresa selecionada no cookie perdia o link inteiro, sendo a única
  // pessoa autorizada a usá-lo.
  //
  // Os DOIS `isAdmin` são de pessoas diferentes, e é por isso que os DOIS são
  // lidos: o efetivo (da empresa) para o chrome e para os links que a empresa
  // autoriza, e o global para os links que exigem o administrador do SISTEMA.
  const [efetivo, global] = await Promise.allSettled([obterMeuPerfil(), obterMeuPerfilGlobal()]);
  const me: MeProfileDto | null = efetivo.status === 'fulfilled' ? efetivo.value : null;
  const meGlobal: MeProfileDto | null = global.status === 'fulfilled' ? global.value : null;

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
        {meGlobal?.isAdmin === true ? (
          <>
            <li>
              <hr className="my-4 border-slate-200" />
            </li>
            <li>
              <strong className="text-xs uppercase tracking-wide text-slate-400">Sistema</strong>
            </li>
            <li>
              <Link
                className="text-sm font-medium text-slate-700 hover:text-slate-900"
                href="/admin/flags"
              >
                Feature flags
              </Link>
            </li>
            <li>
              <Link
                className="text-sm font-medium text-slate-700 hover:text-slate-900"
                href="/admin/tenancy"
              >
                Empresas e usuários
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
