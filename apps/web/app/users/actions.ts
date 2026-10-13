// apps/web/app/users/actions.ts
//
// Server Actions da listagem de usuários.
//
// pt-BR: mora em `app/users/` e não em `app/login/` porque quem a chama é a
// tela de listagem — a tela de login não tem "Sair", porque ninguém chegou
// nela logado.
//
// pt-BR (por que o `redirect` depois de limpar): sem ele, o Next responderia a
// Server Action re-renderizando a MESMA página, agora com o cookie removido.
// A listagem chama `exigirSessao()` no topo, que por sua vez redireciona — ou
// seja, a pessoa veria a listagem piscar antes de ir para o login. Com o
// redirect aqui, a ida é uma navegação só.

'use server';

import { redirect } from 'next/navigation';
import { limparSessao } from '@/lib/sessao';

/** Apaga os cookies de sessão e devolve a pessoa para a tela de login. */
export async function sair(_formData: FormData): Promise<void> {
  await limparSessao();

  redirect('/login');
}
