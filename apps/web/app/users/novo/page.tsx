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
// pt-BR (Fase 8): esta tela passou a exigir sessão. `POST /users` é
// PÚBLICA na API (decisão D-2 — cadastro aberto), mas a TELA é protegida: a
// pessoa precisa entrar para usar o sistema. São coisas diferentes — a
// abertura do cadastro é uma decisão de produto sobre a API, e a proteção
// desta tela é sobre a navegação do web.
//
// O `await` é obrigatório: em Next 15 `cookies()` é assíncrono, e por isso
// `exigirSessao()` é uma função async e a página inteira precisa ser async.

import { CadastroUsuarioForm } from '@/components/cadastro-usuario-form';
import { exigirSessao } from '@/lib/sessao';
import { cadastrarUsuario } from './actions';

export default async function NovoUsuarioPage() {
  await exigirSessao();
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
