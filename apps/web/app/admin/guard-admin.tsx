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
import { obterMeuPerfil, obterMeuPerfilGlobal } from '../../lib/perfil';
import type { MeProfileDto } from '@projeto/shared-types';

/**
 * Tela de serviço indisponível — com retry, que é o que a pessoa pode fazer.
 *
 * ⚠️ EXPORTADA porque `/me/profile` precisa da mesma (achado 3). Duas cópias
 * do mesmo texto divergem sozinhas: foi assim que a segunda nasceu do
 * conserto da primeira.
 */
export function ServicoIndisponivel(): React.JSX.Element {
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
 * O discriminante `bloqueio` é `true`/`false` explícito nos DOIS ramos, e não
 * uma chave ausente no ramo do `me`. Com `{ me }` sem `bloqueio`, o TypeScript
 * não estreita a união em `guarda.bloqueio` e a tela não compila — o que é o
 * comportamento desejado: o discriminante tem que ser total.
 */
type Bloqueio = { bloqueio: true; tela: React.JSX.Element };
type Liberado = { bloqueio: false; me: MeProfileDto };

/**
 * Resolve o perfil do ator para uma tela `/admin/*` decidir o que renderizar.
 *
 * ## Por que isto NÃO é `exigirAdmin(): Promise<MeProfileDto>`
 *
 * A primeira versão devolvia o perfil e as telas faziam `await exigirAdmin()`.
 * MEDIDO: isso renderizou o FORMULÁRIO INTEIRO para quem não é admin — os e2e
 * F10/F11/F12 caíram juntos vendo o formulário vazado, e o `as never` usado
 * para calar o compilador foi o que escondeu o erro de tipo. O `await` de uma
 * função que retorna JSX **descarta** o JSX: só executa o efeito colateral e
 * joga o valor fora.
 *
 * Por isso o retorno é o que a página precisa RENDERIZAR, e o tipo é
 * discriminated: `bloqueio: true` nunca convive com `me`. Não há `as never`
 * aqui — o compilador passa a conferir que a tela devolve o que recebeu.
 */
export async function exigirAdmin(): Promise<Bloqueio | Liberado> {
  return avaliarAcesso(obterMeuPerfil);
}

/**
 * O MESMO guard, mas lendo o perfil GLOBAL (`obterMeuPerfilGlobal`).
 *
 * pt-BR (visão de admin, 2026-10-22 — D8): por que o global e não o da
 * empresa. Os DOIS `isAdmin` não são a mesma pessoa: o da empresa é o perfil
 * de DONO — `true` em toda empresa nova (MEDIDO:
 * `prisma-tenant-onboarding.repository.ts:202`) — e o global é o do bucket de
 * SISTEMA. D2 exige o global (`ehAdministradorDeSistema`: `tenantId === null &&
 * isAdmin`), e é o que a API olha: autorizar pelo `isAdmin` da empresa
 * mostraria o inventário inteiro para um gerente que a API recusa com 403.
 *
 * A distinção 401 → login / 403 → restrito / 5xx → retry NÃO é reescrita
 * aqui: as DUAS funções caem no mesmo `avaliarAcesso`, e é esse o motivo de
 * ele existir — duas cópias do `if` são dois lugares para o defeito do #107
 * voltar.
 */
export async function exigirAdminDoSistema(): Promise<Bloqueio | Liberado> {
  return avaliarAcesso(obterMeuPerfilGlobal);
}

/**
 * O veredito comum aos DOIS guards: quem é o ator, e o que a tela mostra.
 *
 * `lerPerfil` é a ÚNICA diferença entre eles — e ela fica na ASSINATURA, e
 * não dentro do corpo, para que a tabela 401/403/5xx exista em UM lugar só.
 */
async function avaliarAcesso(
  lerPerfil: () => Promise<MeProfileDto | null>,
): Promise<Bloqueio | Liberado> {
  let me: MeProfileDto | null;
  try {
    me = await lerPerfil();
  } catch (erro) {
    // Rede caída / DNS / conexão recusada não chega como `ApiError`: o fetch
    // falhou antes de haver status. É infraestrutura, não autorização.
    if (erro instanceof ApiTimeoutError || !(erro instanceof ApiError)) {
      return { bloqueio: true, tela: ServicoIndisponivel() };
    }
    // ⚠️ (achado 8) NÃO HÁ RAMO 401 AQUI, e não por esquecimento:
    // `obterMeuPerfil` converte 401 em `null` antes de propagar, então o `me ===
    // null` logo abaixo É o tratamento do 401. Um `if (status === 401)` aqui
    // nunca dispararia — e num arquivo cuja razão de existir é a tabela
    // 401 → login / 403 → restrito / 5xx → retry, o único caminho morto é o que
    // a próxima pessoa leria como comportamento documentado.
    if (erro.status === 403) return { bloqueio: true, tela: AcessoRestrito() };
    // Qualquer outro 4xx/5xx da API: o servidor respondeu, então ele é a
    // fonte. Um 500 é falha do serviço, não negativa da conta.
    return { bloqueio: true, tela: ServicoIndisponivel() };
  }

  // `null` aqui só pode ser "sem sessão" ou 401 — as duas são levadas ao login.
  // Um 403 nunca chega: foi tratado acima, como 403.
  if (me === null) return redirect('/login');

  if (me.isAdmin !== true) return { bloqueio: true, tela: AcessoRestrito() };
  return { bloqueio: false, me };
}
