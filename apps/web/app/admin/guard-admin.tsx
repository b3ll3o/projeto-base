// apps/web/app/admin/guard-admin.tsx
//
// pt-BR (#107, 2026-10-18): o guard de `/admin/*`.
//
// Antes, as quatro telas admin faziam isto inline:
//
//   const me = await obterMeuPerfil();
//   if (me === null || me.isAdmin !== true) return <AcessoRestrito/>;
//   …resto da página
//
// e `obterMeuPerfil()` devolvia `null` para 401, 403, 5xx, timeout e rede
// caída. O `null` chegava ao `if` e virava a MESMA tela — "Esta página exige
// perfil de administrador" — para cinco causas que não têm nada entre si. A
// administradora legítima que abriu a página com a API caída lia uma tela
// afirmando que ela não era administradora.
//
// Este arquivo é o conserto, e é compartilhado de propósito: quatro cópias do
// mesmo `if` são quatro lugares para o defeito voltar. O que ele faz:
//
//   - **sem sessão / 401** → `redirect('/login')`. É o estado que o login
//     resolve; a resposta certa é uma tela que leva a pessoa até lá.
//   - **403** → "Acesso restrito". Ela é administradora e não tem a
//     permissão — o veredito da página é sobre a conta, e é verdadeiro.
//   - **5xx / timeout / rede** → erro de serviço com orientação a recarregar.
//     Um botão de retry, não uma negativa de acesso.
//
// Os três são respostas diferentes para três causas diferentes. O padrão de
// 401 já existia no repo em `app/users/page.tsx`; aqui ele vira o padrão das
// telas admin.

import type * as React from 'react';
import { redirect } from 'next/navigation';
import { ApiError, ApiTimeoutError } from '../../lib/api-client';
import { obterMeuPerfil } from '../../lib/perfil';
import type { MeProfileDto } from '@projeto/shared-types';

/** Tela de serviço indisponível — com retry, que é o que a pessoa pode fazer. */
function ServicoIndisponivel(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Serviço indisponível</h1>
      <p className="mt-1 text-sm text-slate-500">
        Não foi possível falar com a API agora. Isto não é sobre o seu perfil — recarregue em
        instantes.
      </p>
      <a
        href=""
        className="mt-4 inline-block rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
      >
        Tentar de novo
      </a>
    </main>
  );
}

/** Negativa de acesso — a pessoa não tem o que precisa. Aqui é verdade. */
function AcessoRestrito(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Acesso restrito</h1>
      <p className="mt-1 text-sm text-slate-500">Esta página exige perfil de administrador.</p>
    </main>
  );
}

/**
 * Resolve o perfil do ator e decide o que a página faz com isso.
 *
 * `redirect()` NÃO retorna — é `never`. Por isso o `return redirect(...)` é o
 * que satisfaz o compilador e não deixa fluxo cego depois dele.
 */
export async function exigirAdmin(): Promise<MeProfileDto> {
  let me: MeProfileDto | null;
  try {
    me = await obterMeuPerfil();
  } catch (erro) {
    // Rede caída / DNS / conexão recusada não chega como `ApiError`: o fetch
    // falhou antes de haver status. É infraestrutura, não autorização.
    if (erro instanceof ApiTimeoutError || !(erro instanceof ApiError)) {
      return ServicoIndisponivel() as never;
    }
    if (erro.status === 401) return redirect('/login');
    if (erro.status === 403) return AcessoRestrito() as never;
    // Qualquer outro 4xx/5xx da API: o servidor respondeu, então ele é a
    // fonte. Um 500 é falha do serviço, não negativa da conta.
    return ServicoIndisponivel() as never;
  }

  // `null` aqui só pode ser "sem sessão" ou 401 — as duas são levadas ao login.
  // Um 403 nunca chega: foi tratado acima, como 403.
  if (me === null) return redirect('/login');

  if (me.isAdmin !== true) return AcessoRestrito() as never;
  return me;
}
