// apps/web/components/login-form.tsx
//
// Formulário de login.
//
// pt-BR: é Client Component porque valida no navegador enquanto a pessoa
// digita e precisa reagir sem recarregar a página. O dado vai para uma
// Server Action — não há `fetch` no cliente, e é por isso que o token nunca
// passa pelo browser.
//
// As decisões de estrutura ESPELHAM `cadastro-usuario-form.tsx`, e as
// justificativas estão lá; aqui vai só o que muda.
//
// 1. A Action entra por PROP (`action`), com a real como padrão. É o padrão
//    suportado pelo Next para Server Action em Client Component, e o tipo é
//    declarado aqui (não importado de `actions.ts`) porque arquivo
//    `'use server'` só exporta async.
//
// 2. O formulário NÃO tem `action={fn}` e o despacho é manual, dentro de
//    `startTransition`. Medido no cadastro: `preventDefault()` segura o
//    envio (0 pedidos com o atributo, 0 pedidos sem ele também — o que
//    despacha é o `startTransition`), e sem a transition o React avisa que
//    `isPending` não vai atualizar e o botão continua habilitado.
//
// 3. A senha NÃO volta preenchida depois de um erro. A Action devolve
//    `valores.senha` vazia (ver `state.ts`) e o `useEffect` de repovoamento
//    reescreve o campo com ''. O preço é a pessoa redigitar; a alternativa
//    é o segredo no payload da Server Action.
//
// pt-BR (o desenho visual NÃO é novo): as classes Tailwind são as MESMAS do
// campo de e-mail e do campo de senha de `cadastro-usuario-form.tsx`,
// copiadas. O design system deste repositório é a repetição dessas classes
// inline, e introduzir um componente de campo aqui criaria duas maneiras de
// escrever o mesmo campo sem apagar nenhuma das duas.
//
// pt-BR (os dois `role="alert"`): o aviso genérico de credencial e os erros
// de campo são nós diferentes, cada um anunciado quando aparece, sem mover o
// foco. Eles ficam DENTRO do formulário — ver o comentário sobre `within` em
// `login-form.spec.tsx`: uma consulta de `role="alert"` na página inteira
// devolve o do formulário, um vazio e a live-region do Next Dev Tools.

'use client';

import { startTransition, useActionState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { entrar } from '@/app/login/actions';
import { LOGIN_INICIAL, type LoginState } from '@/app/login/state';
import { EMAIL_MAX, SENHA_MAX } from '@/lib/cadastro-usuario-schema';
import { loginSchema, type CampoLogin, type LoginInput } from '@/lib/login-schema';

type ActionLogin = (estado: LoginState, formData: FormData) => Promise<LoginState>;

export function LoginForm({
  action = entrar,
  aviso,
  convite,
}: {
  action?: ActionLogin;
  /**
   * Confirmação de que a tela foi aberta por um cadastro recém-concluído.
   *
   * ⚠️ A tela de login era o destino de um `redirect` que não dizia nada:
   * a pessoa chegava, digitava e-mail e senha, e não havia nenhum vínculo
   * com o que tinha acabado de acontecer. É texto pronto — quem decide a
   * frase é a página dona do fluxo, e este componente não conhece a query
   * string.
   *
   * O `| undefined` explícito é **obrigatório** sob `exactOptionalPropertyTypes`
   * (tsconfig.base.json:20): `aviso?: string` proíbe a propriedade de existir
   * com valor `undefined`, e a página passa `aviso={aviso}` incondicionalmente,
   * com `aviso: string | undefined` vindo da query string (page.tsx:42). Sem o
   * `| undefined`, `tsc` reprova — e a suíte continua verde, porque o Vitest e
   * o Playwright transpilam sem typecheck. Aqui "ausente" e "`undefined`" são
   * a mesma coisa: o consumo é `{aviso ? … : …}` (abaixo), um teste de
   * veracidade que não distingue os dois. Apontar o call-site como spread
   * condicional também resolveria, e é a opção se algum dia essa distinção
   * virar regra em vez de convenção.
   */
  aviso?: string | undefined;
  /**
   * O token do convite, quando a pessoa chegou aqui por um link de convite
   * com a sessão vencida.
   *
   * pt-BR (2026-10-21): a sessão vence em 15 min, e o aceite do convite
   * devolve 401 quando isso acontece. O token viaja na query string porque o
   * CONVITE É uma URL — e é por isso que ele precisa sobreviver ao login: sem
   * ele, a pessoa entra no login sem convite nenhum, o funil pergunta "qual
   * empresa?" e a responde `/empresa/nova`, porque o convite AINDA NÃO foi
   * aceito e a conta não tem membership nenhuma.
   *
   * O `| undefined` explícito é obrigatório sob `exactOptionalPropertyTypes`
   * — o mesmo motivo do `aviso` acima: a página passa a prop
   * incondicionalmente, e `aviso?: string` proíbe a propriedade de existir
   * com valor `undefined`.
   */
  convite?: string | undefined;
}) {
  const [estado, despachar, pendente] = useActionState<LoginState, FormData>(action, LOGIN_INICIAL);

  const form = useForm<LoginInput>({
    defaultValues: { email: '', senha: '' },
  });

  const { register, getValues, setError } = form;

  const erroDe = (campo: CampoLogin): string | undefined =>
    form.formState.errors[campo]?.message ?? estado.fieldErrors[campo];

  // Repõe no formulário o que a Action devolveu depois de uma falha.
  //
  // pt-BR: seguro pelos mesmos motivos do cadastro — os campos ficam
  // `disabled` enquanto a requisição está em voo, então a pessoa não pode
  // corrigir o campo durante o POST e ver o reset trocar o texto novo pelo
  // valor antigo.
  useEffect(() => {
    if (estado.formError || Object.keys(estado.fieldErrors).length > 0) {
      form.reset(estado.valores);
    }
    // pt-BR: só `estado` muda quando a Action devolve. Incluir `form` aqui
    // reexecutaria o efeito a cada render.
  }, [estado, form]);

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();

    const resultado = loginSchema.safeParse(getValues());
    if (!resultado.success) {
      // foca o PRIMEIRO campo inválido: é onde a pessoa está olhando depois
      // de apertar o botão.
      const [primeiro] = resultado.error.issues;
      // pt-BR: um mesmo campo gera VÁRIOS issues (e-mail vazio reprova em
      // `min(1)` E em `email()`), e o que a pessoa precisa é o primeiro.
      const jaTratados = new Set<string>();
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0];
        if (campo !== 'email' && campo !== 'senha') continue;
        if (jaTratados.has(campo)) continue;
        jaTratados.add(campo);
        setError(
          campo,
          { type: issue.code, message: issue.message },
          { shouldFocus: campo === primeiro?.path[0] },
        );
      }
      return;
    }

    // pt-BR: vai o valor JÁ APARADO pelo schema, e não o que está no DOM.
    // O e-mail aparado, a senha CRUA — aparar um segredo é mutá-lo em
    // silêncio.
    const dadosFormulario = new FormData();
    dadosFormulario.set('email', resultado.data.email);
    dadosFormulario.set('senha', resultado.data.senha);
    // pt-BR: o token do convite viaja no MESMO FormData, porque o formulário
    // é despachado à mão (ponto 2 do cabeçalho) — não há campo oculto no
    // DOM que o browser anexasse sozinho. A Action valida o formato antes de
    // usar; aqui o valor só é carregado.
    if (convite) {
      dadosFormulario.set('convite', convite);
    }
    // pt-BR: o despacho PRECISA estar dentro de `startTransition` (ver o
    // ponto 2 do cabeçalho).
    startTransition(() => despachar(dadosFormulario));
  };

  return (
    <form
      onSubmit={aoEnviar}
      // pt-BR: `noValidate` desliga a validação nativa do navegador. Sem
      // isto, `<input type="email">` com valor malformado BLOQUEIA o evento
      // `submit` antes do React ver qualquer coisa, e quem mostra a mensagem
      // passa a ser o balão do navegador — texto do sistema, sem
      // equivalente para o campo de senha.
      noValidate
      aria-busy={pendente}
      className="max-w-md space-y-5"
    >
      {aviso ? (
        // pt-BR: `role="status"`, e NÃO `role="alert"`. O aviso é uma
        // confirmação — o leitor de tela deve anunciá-la, mas sem interromper
        // o que a pessoa já está fazendo (`alert` é `assertive` e corta a
        // fala em curso). E `aria-live="polite"` é redundante aqui por
        // construção: `status` já é polite por definição, e escrever os dois
        // cria um segundo lugar onde o comportamento do aviso mora.
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {aviso}
        </p>
      ) : null}

      {estado.formError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {estado.formError}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-900">
          E-mail
        </label>
        <input
          id="email"
          {...register('email')}
          type="email"
          maxLength={EMAIL_MAX}
          autoComplete="email"
          disabled={pendente}
          aria-invalid={Boolean(erroDe('email'))}
          aria-describedby={erroDe('email') ? 'email-erro' : undefined}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none aria-[invalid=true]:border-red-500"
        />
        {erroDe('email') ? (
          // pt-BR: `role="alert"` anuncia a mensagem assim que ela aparece,
          // sem mover o foco. É o que faz o erro chegar a quem não enxerga o
          // campo vermelho.
          <p id="email-erro" role="alert" className="mt-1 text-sm text-red-700">
            {erroDe('email')}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="senha" className="block text-sm font-medium text-slate-900">
          Senha
        </label>
        <input
          id="senha"
          {...register('senha')}
          type="password"
          maxLength={SENHA_MAX}
          // pt-BR: `current-password` e não `new-password` — é o valor que
          // faz o gerenciador de senhas PREENCHER o campo em vez de
          // OFERECER GERAR uma senha nova. Este formulário não cria conta:
          // quem está aqui já tem uma.
          autoComplete="current-password"
          disabled={pendente}
          aria-invalid={Boolean(erroDe('senha'))}
          aria-describedby={erroDe('senha') ? 'senha-erro' : undefined}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none aria-[invalid=true]:border-red-500"
        />
        {erroDe('senha') ? (
          <p id="senha-erro" role="alert" className="mt-1 text-sm text-red-700">
            {erroDe('senha')}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pendente}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {pendente ? 'Entrando…' : 'Entrar'}
        </button>
        {/* pt-BR: quem não tem conta precisa de uma saída. Sem este link a
            tela de login é um beco sem saída para quem ainda não se
            cadastrou. */}
        <Link
          href="/users/novo"
          className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
        >
          Criar conta
        </Link>
      </div>
    </form>
  );
}
