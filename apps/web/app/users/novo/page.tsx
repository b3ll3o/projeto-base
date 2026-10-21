// apps/web/app/users/novo/page.tsx
//
// Tela de cadastro de usuário.
//
// pt-BR: Server Component deliberado — a página não busca nada, ela só
// entrega o formulário. A Action entra por prop (é o que o Next suporta em
// Client Component) em vez de o componente importar a própria Action, o que
// mantém a árvore de dependências explícita: a página é a dona do fluxo.
//
// Um único `h1` por tela: a listagem (`/users`) já tem o dela, e são telas
// diferentes.
//
// pt-BR (Fase 8, CORRIGIDO em 2026-10-13): esta tela exigia sessão, e a
// exigência foi REMOVIDA. O motivo de ter sido posta, e o de ter sido
// tirada, são o mesmo:
//
// `POST /users` é PÚBLICA na API (decisão D-2 — cadastro aberto). Exigir
// sessão aqui não impedia ninguém de criar conta: bastava um `curl`. O que
// ela impedia era a PESSOA — que precisa de conta para chegar ao formulário
// e precisa de conta para ter conta. Sem seed script no projeto, o beco era
// sem saída: o link "Criar conta" da tela de login apontava para cá e a
// pessoa voltava para o login. Um link que devolve para onde a pessoa veio é
// pior do que a ausência de link.
//
// A proteção que COMPRA algo continua: `/users`, a listagem, que é onde os
// dados estão. Cadastro é a porta de entrada; listagem é o produto.
//
// Quem muda esta linha muda o F8:32 (`/users/novo` sem cookie), que hoje
// afirma que a tela é alcançável sem sessão.

import { CadastroUsuarioForm } from '@/components/cadastro-usuario-form';
import { ehTokenDeConvite } from '@/lib/convite-schema';
import { cadastrarUsuario } from './actions';

// pt-BR (onboarding de empresa, 2026-10-21): a pessoa que chega por um link
// de convite (`/convite/<token>`) é mandada para cá COM o token, e é este
// token que faz a conta nascer na empresa que convidou.
export default async function NovoUsuarioPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string | string[] }>;
}) {
  const { convite } = await searchParams;

  // pt-BR: o token só é repassado se tem o formato que a API aceita. Um
  // `?convite=` adulterado não chega ao formulário — e a Action valida de
  // novo, porque o navegador não é fronteira de confiança.
  const token = typeof convite === 'string' && ehTokenDeConvite(convite) ? convite : undefined;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Cadastrar usuário</h1>
      <p className="mt-1 text-sm text-slate-500">
        {token
          ? 'Você recebeu um convite para uma empresa. Crie sua conta para entrar na empresa que convidou.'
          : 'Preencha os dados abaixo. O email identifica o usuário e não pode ser repetido.'}
      </p>
      <div className="mt-8">
        <CadastroUsuarioForm action={cadastrarUsuario} convite={token} />
      </div>
    </main>
  );
}
