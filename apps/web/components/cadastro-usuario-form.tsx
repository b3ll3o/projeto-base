// apps/web/components/cadastro-usuario-form.tsx
//
// Formulário de cadastro de usuário.
//
// pt-BR: é Client Component porque valida no navegador enquanto a pessoa
// digita e precisa reagir sem recarregar a página. O dado vai para uma
// Server Action — não há `fetch` no cliente.
//
// Quatro decisões, todas custando uma medição. Duas delas EURAM A MEDIÇÃO
// ERRADA e estão documentadas como tal abaixo — foi a verificação adversarial
// que derrubou ambas, e a correção foi do texto, não do código.
//
// 1. A Action entra por PROP (`action`), com a real como padrão. É o padrão
//    suportado pelo Next para Server Action em Client Component, e é o que
//    torna a tela testável sem rede. O tipo é declarado aqui, não importado
//    de `actions.ts`, porque arquivo `'use server'` só exporta async.
//
// 2. O formulário NÃO tem `action={fn}`, e o despacho é manual. A JUSTIFICATIVA
//    original está errada e foi removida: ela afirmava que, com `action={fn}`,
//    o React despacharia a Action mesmo com `preventDefault()` no `onSubmit`.
//    Medido ao contrário (formulário vazio, clique, com e sem o atributo):
//    **0 pedidos nos dois casos**; o contrafactual — desligar o
//    `preventDefault()` — é que produz 1 pedido. O `preventDefault()` segura.
//
//    O que sobra é um PREÇO real, não uma impossibilidade: sem `action`, o
//    formulário não submite sem JavaScript. A escolha é aceitável porque a
//    tela já exige JS (a validação sob demanda acontece no cliente), mas é
//    uma escolha — e voltar a `action={despachar}` é uma mudança de
//    comportamento deliberada, não um conserto.
//
// 3. O despacho vai dentro de `startTransition`. Fora dela o React avisa em
//    voz alta — "An async function with useActionState was called outside of
//    a transition … isPending will not update correctly" — e o botão
//    continua habilitado durante o envio. Medido: remover a transition
//    derruba o teste de envio em andamento.
//
// 4. `formState` NÃO é desestruturado aqui — mas a razão original também
//    estava errada. O Proxy do RHF está em `form.formState`, e desestruturar
//    `errors` no corpo do render lê o Proxy na hora e re-renderiza normal
//    (medido no jsdom e no Chrome). Manter a leitura por `form.formState.x`
//    é estilo, não correção.

'use client';

import { startTransition, useActionState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { cadastrarUsuario } from '@/app/users/novo/actions';
import { CADASTRO_INICIAL, type CadastroUsuarioState } from '@/app/users/novo/state';
import {
  cadastroUsuarioSchema,
  EMAIL_MAX,
  NOME_MAX,
  type CadastroUsuarioInput,
} from '@/lib/cadastro-usuario-schema';

type ActionCadastro = (
  estado: CadastroUsuarioState,
  formData: FormData,
) => Promise<CadastroUsuarioState>;

export function CadastroUsuarioForm({ action = cadastrarUsuario }: { action?: ActionCadastro }) {
  const [estado, despachar, pendente] = useActionState<CadastroUsuarioState, FormData>(
    action,
    CADASTRO_INICIAL,
  );

  const form = useForm<CadastroUsuarioInput>({
    defaultValues: { nome: '', email: '' },
  });

  const { register, getValues, setError } = form;

  const erroDe = (campo: 'nome' | 'email'): string | undefined =>
    form.formState.errors[campo]?.message ?? estado.fieldErrors[campo];

  // Repõe no formulário o que a Action devolveu depois de uma falha.
  //
  // pt-BR: isto é SEGURO porque os campos ficam `disabled` enquanto a
  // requisição está em voo (ver os dois `<input>`). Sem esse travamento a
  // pessoa podia corrigir o email durante o POST, e o reset que roda aqui ao
  // chegar da resposta apagaria a correção, trocando o texto novo pelo valor
  // antigo — perda de dado sem erro em lugar nenhum. O teste
  // "os campos ficam travados enquanto a requisição está em voo" é o que
  // segura essa invariante; se ele cair, este reset volta a ser um bug.
  useEffect(() => {
    if (estado.formError || Object.keys(estado.fieldErrors).length > 0) {
      form.reset(estado.valores);
    }
    // pt-BR: só `estado` muda quando a Action devolve. Incluir `form` aqui
    // reexecutaria o efeito a cada render.
  }, [estado, form]);

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();

    const resultado = cadastroUsuarioSchema.safeParse(getValues());
    if (!resultado.success) {
      // foca o PRIMEIRO campo inválido: é onde a pessoa está olhando
      // depois de apertar o botão.
      const [primeiro] = resultado.error.issues;
      // pt-BR: um mesmo campo gera VÁRIOS issues (email vazio reprova em
      // `min(1)` E em `email()`), e o que a pessoa precisa é o primeiro —
      // "Informe o email.", não "Email inválido. Exemplo: ...". Sem este
      // guarda o último sobrescreve o primeiro e o campo vazio é
      //accordionado por causa do formato. Medido no navegador.
      const jaTratados = new Set<string>();
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0];
        if (campo !== 'nome' && campo !== 'email') continue;
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
    const dadosFormulario = new FormData();
    dadosFormulario.set('nome', resultado.data.nome);
    dadosFormulario.set('email', resultado.data.email);
    // pt-BR: o despacho PRECISA estar dentro de `startTransition`. Fora
    // dela o React avisa em voz alta — "An async function with useActionState
    // was called outside of a transition ... isPending will not update
    // correctly" — e o botão continuava habilitado durante o envio.
    startTransition(() => despachar(dadosFormulario));
  };

  return (
    <form
      onSubmit={aoEnviar}
      // pt-BR: `noValidate` desliga a validação nativa do navegador. Sem
      // isto, `<input type="email">` com valor malformado BLOQUEIA o
      // evento `submit` antes do React ver qualquer coisa, e quem mostra a
      // mensagem passa a ser o balão do navegador — texto do sistema, sem
      // equivalente para o campo de nome. Duas vozes para o mesmo
      // formulário é pior do que uma. Medido: com a validação nativa,
      // `submit` não disparava e nenhuma mensagem nossa aparecia.
      noValidate
      aria-busy={pendente}
      className="max-w-md space-y-5"
    >
      {estado.formError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {estado.formError}
        </p>
      ) : null}

      <div>
        <label htmlFor="nome" className="block text-sm font-medium text-slate-900">
          Nome
        </label>
        <input
          id="nome"
          {...register('nome')}
          type="text"
          maxLength={NOME_MAX}
          autoComplete="name"
          disabled={pendente}
          aria-invalid={Boolean(erroDe('nome'))}
          aria-describedby={erroDe('nome') ? 'nome-erro' : undefined}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none aria-[invalid=true]:border-red-500"
        />
        {erroDe('nome') ? (
          // pt-BR: `role="alert"` anuncia a mensagem assim que ela aparece,
          // sem mover o foco. É o que faz o erro chegar a quem não enxerga
          // o campo vermelho.
          <p id="nome-erro" role="alert" className="mt-1 text-sm text-red-700">
            {erroDe('nome')}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-900">
          Email
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
          <p id="email-erro" role="alert" className="mt-1 text-sm text-red-700">
            {erroDe('email')}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pendente}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {pendente ? 'Cadastrando…' : 'Cadastrar usuário'}
        </button>
        {/* pt-BR: cancelar é uma ação, não um sumiço. Um formulário sem
            saída visível obriga a pessoa a voltar pelo navegador. */}
        <Link
          href="/users"
          className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
