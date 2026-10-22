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
//
// ── O `?cadastrado=1` QUE ABRE ESTA TELA ────────────────────────────────────
//
// MEDIDO 2026-10-13: `POST /users` é `@Public()` e não emite sessão, então
// quem acabou de se cadastrar chega aqui SEM cookie. Antes disso o cadastro
// mandava para `/users`, que chama `exigirSessao()` e volta para cá — dois
// redirecionamentos e um formulário mudo, com a pessoa obrigada a lembrar
// por que está numa tela de login.
//
// A página é quem traduz o sinal em frase, porque é a DONA do texto: o
// Client Component recebe uma string pronta e não conhece a query string.
// `searchParams` é uma PROMISE no Next 15 (`await` obrigatório), e a
// assinatura que o Next impõe não aceita tipar o objeto recebido — daí o
// `Record` explícito no lugar de `SearchParams`.

import { LoginForm } from '@/components/login-form';
import { ehTokenDeConvite, PARAM_CONVITE } from '@/lib/convite-schema';
import { entrar } from './actions';
import {
  AVISO_CADASTRO_CONCLUIDO,
  AVISO_EMPRESA_PENDENTE,
  PARAM_CADASTRO_CONCLUIDO,
  PARAM_EMPRESA_PENDENTE,
} from './state';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const sinal = params[PARAM_CADASTRO_CONCLUIDO];
  // ⚠️ `string | string[]`: um `?cadastrado=1&cadastrado=2` chega como
  // array, e comparar array com string nunca seria verdadeiro — o aviso
  // sumiria em vez de aparecer. `Array.isArray` fecha esse caso pelo mesmo
  // motivo que fecha o resto dos params duplicados do Next.
  //
  // ⚠️ A ORDEM dos dois sinais: o da EMPRESA PENDENTE é o mais acionável
  // dos dois — a pessoa sabe exatamente o que fazer depois de entrar, e é
  // ele que a traz de volta para `/empresa/nova`.
  const sinalEmpresa = params[PARAM_EMPRESA_PENDENTE];
  const aviso =
    sinalEmpresa !== undefined
      ? AVISO_EMPRESA_PENDENTE
      : sinal !== undefined
        ? AVISO_CADASTRO_CONCLUIDO
        : undefined;

  // pt-BR: o token do convite ATRAVESSA o login. A sessão vence em 15 min, e
  // o aceite do convite devolve 401 quando isso acontece — o token precisa
  // sobreviver ao login, ou a pessoa perde a empresa que a convidou (e o
  // funil a leva a criar a PRÓPRIA empresa, que ela não queria).
  //
  // O token é validado AQUI e de novo na Action: a query string é entrada de
  // usuário, e o que ela decide é para onde a pessoa vai depois de entrar.
  const brutoConvite = params[PARAM_CONVITE];
  const convite =
    typeof brutoConvite === 'string' && ehTokenDeConvite(brutoConvite) ? brutoConvite : undefined;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Entrar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Use o e-mail e a senha da sua conta para acessar o sistema.
      </p>
      <div className="mt-8">
        <LoginForm action={entrar} aviso={aviso} convite={convite} />
      </div>
    </main>
  );
}
