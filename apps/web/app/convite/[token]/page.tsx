// apps/web/app/convite/[token]/page.tsx
//
// A porta de entrada do convite.
//
// pt-BR (onboarding de empresa, 2026-10-21): quem recebeu o convite chega
// aqui, e há DOIS caminhos:
//
//  - SEM sessão: a pessoa precisa de uma conta. Ela vai para o cadastro COM
//    o token, e a conta nasce na empresa que convidou (o `destino` do
//    `POST /users`).
//  - COM sessão: a conta já existe, e o que falta é o vínculo. O aceite é
//    uma Server Action — e não um `fetch` no render — por um motivo
//    TÉCNICO que decide o desenho: `cookies().set` (o cookie `tenant_id`,
//    que faz a sessão agir na empresa que convidou) só pode ser escrito em
//    Server Action ou Route Handler. No render da página, o Next recusa.
//
// ⚠️ A página NÃO aceita o convite sozinha: ela pergunta, e o aceite é um
// clique. Um GET que consome um convite é acionado por prefetch, por crawler
// e por "abrir link em nova aba" — e um convite aceito não pode ser
// reaceito.
//
// Um `h1` por tela: a listagem (`/users`) já tem o dela, e são telas
// diferentes.

import { redirect } from 'next/navigation';
import { CONVITE_INVALIDO } from '@/lib/convite-mensagens';
import { ehTokenDeConvite } from '@/lib/convite-schema';
import { lerTokens } from '@/lib/sessao';
import { AceitarConvite } from './aceitar-convite';

export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!ehTokenDeConvite(token)) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Convite inválido</h1>
        <p className="mt-1 text-sm text-slate-500">{CONVITE_INVALIDO}</p>
      </main>
    );
  }

  // pt-BR: sem sessão, o caminho é o CADASTRO com o token — a conta nasce
  // na empresa que convidou, e o `destino` do `POST /users` faz isso. O
  // token vai na query porque a página de cadastro é a porta de entrada
  // pública; ele volta no FormData, e a Action o valida de novo.
  const { accessToken } = await lerTokens();
  if (!accessToken) {
    redirect(`/users/novo?convite=${token}`);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Convite para uma empresa</h1>
      <p className="mt-1 text-sm text-slate-500">
        Você foi convidado para entrar em uma empresa. Ao aceitar, sua conta entra na empresa que
        convidou.
      </p>
      <div className="mt-8">
        <AceitarConvite token={token} />
      </div>
    </main>
  );
}
