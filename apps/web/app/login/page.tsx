// apps/web/app/login/page.tsx
//
// Tela de login.
//
// pt-BR: Server Component deliberado, pelo mesmo motivo do cadastro — a
// página não busca nada, ela só entrega o formulário. A Action entra por
// prop (é o que o Next suporta em Client Component) em vez de o componente
// importar a própria Action, o que mantém a árvore de dependências
// explícita: a página é a dona do fluxo.
//
// Um único `h1` por tela, como no resto do app.

import { LoginForm } from '@/components/login-form';
import { entrar } from './actions';

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Entrar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Use o e-mail e a senha da sua conta para acessar o sistema.
      </p>
      <div className="mt-8">
        <LoginForm action={entrar} />
      </div>
    </main>
  );
}
