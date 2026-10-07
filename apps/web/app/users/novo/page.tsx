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

import { CadastroUsuarioForm } from '@/components/cadastro-usuario-form';
import { cadastrarUsuario } from './actions';

export default function NovoUsuarioPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Cadastrar usuário</h1>
      <p className="mt-1 text-sm text-slate-500">
        Preencha os dados abaixo. O email identifica o usuário e não pode ser repetido.
      </p>
      <div className="mt-8">
        <CadastroUsuarioForm action={cadastrarUsuario} />
      </div>
    </main>
  );
}
