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
import { useForm } from 'react-hook-form';
import { Alerta } from '@/components/ui/alerta';
import { Botao } from '@/components/ui/botao';
import { Campo } from '@/components/ui/campo';
import { cadastrarUsuario } from '@/app/users/novo/actions';
import { CADASTRO_INICIAL, type CadastroUsuarioState } from '@/app/users/novo/state';
import type { CampoCadastro } from '@/lib/cadastro-usuario-schema';
import { LinkTexto } from '@/components/ui/link-texto';
import { PARAM_CONVITE } from '@/lib/convite-schema';
import {
  cadastroUsuarioSchema,
  EMAIL_MAX,
  NOME_MAX,
  SENHA_MAX,
  type CadastroUsuarioInput,
} from '@/lib/cadastro-usuario-schema';

type ActionCadastro = (
  estado: CadastroUsuarioState,
  formData: FormData,
) => Promise<CadastroUsuarioState>;

export function CadastroUsuarioForm({
  action = cadastrarUsuario,
  convite,
}: {
  action?: ActionCadastro;
  /**
   * pt-BR (onboarding de empresa, 2026-10-21): o token do convite, quando a
   * pessoa chegou por um link de convite. Ele viaja no MESMO FormData do
   * cadastro, porque é o que diz que a conta nasce NA empresa que convidou
   * (o `destino` do `POST /users`). Sem ele, a conta nasce sem empresa
   * nenhuma e o funil do login leva a pessoa à página de criação de
   * empresa — o oposto do que o convite pediu.
   *
   * ⚠️ O `| undefined` explícito é exigência do `exactOptionalPropertyTypes`
   * (ligado no `tsconfig.base.json`): sem ele, a página não pode passar
   * `undefined` para a prop — teria de omitir a propriedade inteira.
   */
  convite?: string | undefined;
}) {
  const [estado, despachar, pendente] = useActionState<CadastroUsuarioState, FormData>(
    action,
    CADASTRO_INICIAL,
  );

  const form = useForm<CadastroUsuarioInput>({
    defaultValues: { nome: '', email: '', senha: '' },
  });

  const { register, getValues, setError } = form;

  const erroDe = (campo: CampoCadastro): string | undefined =>
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
      // pt-BR: `senha: ''` AQUI, e não só do lado do servidor. A Action já
      // apaga o segredo antes de devolver (`valoresSemSegredo` em
      // `actions.ts`), mas um `form.reset(estado.valores)` cru repõe
      // o que vier — e um caminho de erro novo que esqueça essa barreira
      // colocaria a senha digitada de volta no DOM. `type="password"` só a
      // mascara na tela; o valor continua no documento, no `value` e no que
      // qualquer script da página consiga ler.
      form.reset({ ...estado.valores, senha: '' });
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
        if (campo !== 'nome' && campo !== 'email' && campo !== 'senha') continue;
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
    // pt-BR: a senha vai CRUA, sem o `.trim()` que nome e email levam. O
    // motivo está no schema: aparar um segredo é mutá-lo em silêncio. O
    // `resultado.data.senha` aqui é exatamente o que a pessoa digitou.
    dadosFormulario.set('senha', resultado.data.senha);
    // pt-BR: o token do convite viaja no mesmo FormData — ver a prop
    // `convite`. A Action o valida de novo antes de mandar qualquer coisa.
    if (convite) {
      dadosFormulario.set('convite', convite);
    }
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
      {estado.formError ? <Alerta variante="erro">{estado.formError}</Alerta> : null}

      <Campo
        id="nome"
        rotulo="Nome"
        erro={erroDe('nome')}
        {...register('nome')}
        type="text"
        maxLength={NOME_MAX}
        autoComplete="name"
        disabled={pendente}
      />

      <Campo
        id="email"
        rotulo="Email"
        erro={erroDe('email')}
        {...register('email')}
        type="email"
        maxLength={EMAIL_MAX}
        autoComplete="email"
        disabled={pendente}
      />

      <Campo
        id="senha"
        rotulo="Senha"
        erro={erroDe('senha')}
        {...register('senha')}
        type="password"
        maxLength={SENHA_MAX}
        // pt-BR: `new-password` e não `current-password`. O valor do
        // atributo é o que o gerenciador de senhas usa para decidir entre
        // PREENCHER um campo que é senha nova (oferece gerar uma) e
        // PREENCHER-AGORA um que a pessoa já tem. Este formulário cria a
        // conta, então é senha nova — e é o valor que faz o Chrome e o
        // Safari oferecerem uma sugestão forte em vez de repetir a senha
        // do próprio site.
        autoComplete="new-password"
        disabled={pendente}
      />

      <div className="flex items-center gap-3 pt-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Cadastrando…' : 'Cadastrar usuário'}
        </Botao>
        {/* pt-BR: cancelar é uma ação, não um sumiço. Um formulário sem
            saída visível obriga a pessoa a voltar pelo navegador. */}
        <LinkTexto href="/users">Cancelar</LinkTexto>
        {/* pt-BR (onboarding de empresa, 2026-10-21): quem JÁ TEM CONTA e
            chegou pelo link de convite cai NESTA tela — e sem esta saída o
            caminho fica sem volta: o e-mail dela já está cadastrado, o
            cadastro recusa com "este email já está cadastrado", e a pessoa
            não descobre que o que ela precisa é ENTRAR. O token viaja na
            query porque o login sabe levá-lo até a tela de aceite
            (`/login?convite=…` → `/convite/<token>`). */}
        {convite ? (
          <LinkTexto href={`/login?${PARAM_CONVITE}=${convite}`}>Já tenho conta</LinkTexto>
        ) : null}
      </div>
    </form>
  );
}
