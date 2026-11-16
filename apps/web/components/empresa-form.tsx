// apps/web/components/empresa-form.tsx
//
// Formulário de criação de empresa.
//
// pt-BR: é Client Component porque valida no navegador enquanto a pessoa
// digita e precisa reagir sem recarregar a página. O dado vai para uma
// Server Action — não há `fetch` no cliente.
//
// O padrão é o do `cadastro-usuario-form.tsx` (mesmo `useActionState`, mesmo
// `useForm` do react-hook-form, mesmo despacho dentro de `startTransition`),
// e a divergência é só de campos: aqui não há segredo, então o estado volta
// com o que a pessoa digitou sem nada para apagar.
//
// 1. A Action entra por PROP (`action`), com a real como padrão. É o padrão
//    suportado pelo Next para Server Action em Client Component, e é o que
//    torna a tela testável sem rede.
// 2. O formulário NÃO tem `action={fn}`, e o despacho é manual: o
//    `preventDefault()` segura o submit nativo (MEDIDO no repo: 0 pedidos
//    com `preventDefault()`, 1 sem).
// 3. O despacho vai dentro de `startTransition`. Fora dela o React avisa em
//    voz alta e o botão continua habilitado durante o envio.

'use client';

import { startTransition, useActionState, useEffect, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Alerta } from '@/components/ui/alerta';
import { Botao } from '@/components/ui/botao';
import { Campo } from '@/components/ui/campo';
import { criarEmpresaDoAtor } from '@/app/empresa/nova/actions';
import { EMPRESA_INICIAL, type EmpresaState } from '@/app/empresa/nova/state';
import { NOME_MAX } from '@/lib/cadastro-usuario-schema';
import {
  empresaSchema,
  SLUG_MAX,
  type CampoEmpresa,
  type EmpresaInput,
} from '@/lib/empresa-schema';
import { LinkTexto } from '@/components/ui/link-texto';

type ActionEmpresa = (estado: EmpresaState, formData: FormData) => Promise<EmpresaState>;

export function EmpresaForm({ action = criarEmpresaDoAtor }: { action?: ActionEmpresa }) {
  const [estado, despachar, pendente] = useActionState<EmpresaState, FormData>(
    action,
    EMPRESA_INICIAL,
  );

  const form = useForm<EmpresaInput>({
    defaultValues: { nome: '', slug: '' },
  });

  const { register, getValues, setError } = form;

  const erroDe = (campo: CampoEmpresa): string | undefined =>
    form.formState.errors[campo]?.message ?? estado.fieldErrors[campo];

  // Repõe no formulário o que a Action devolveu depois de uma falha.
  //
  // pt-BR: isto é SEGURO porque os campos ficam `disabled` enquanto a
  // requisição está em voo. Sem esse travamento a pessoa podia corrigir o
  // identificador durante o POST, e o reset que roda aqui ao chegar a
  // resposta apagaria a correção — perda de dado sem erro em lugar nenhum.
  useEffect(() => {
    if (estado.formError || Object.keys(estado.fieldErrors).length > 0) {
      form.reset(estado.valores);
    }
    // pt-BR: só `estado` muda quando a Action devolve. Incluir `form` aqui
    // reexecutaria o efeito a cada render.
  }, [estado, form]);

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();

    const resultado = empresaSchema.safeParse(getValues());
    if (!resultado.success) {
      // foca o PRIMEIRO campo inválido: é onde a pessoa está olhando
      // depois de apertar o botão.
      const [primeiro] = resultado.error.issues;
      // pt-BR: um mesmo campo gera VÁRIOS issues (nome vazio reprova em
      // `min(1)` E em `min(2)`), e o que a pessoa precisa é o primeiro —
      // "Informe o nome da empresa.", não "O nome deve ter pelo menos 2
      // caracteres.".
      const jaTratados = new Set<string>();
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0];
        if (campo !== 'nome' && campo !== 'slug') continue;
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
    dadosFormulario.set('slug', resultado.data.slug);
    // pt-BR: o despacho PRECISA estar dentro de `startTransition`. Fora
    // dela o React avisa em voz alta — "An async function with useActionState
    // was called outside of a transition ... isPending will not update
    // correctly" — e o botão continuava habilitado durante o envio.
    startTransition(() => despachar(dadosFormulario));
  };

  return (
    <form
      onSubmit={aoEnviar}
      // pt-BR: `noValidate` desliga a validação nativa do navegador, para
      // que quem mostra a mensagem seja o formulário — e não o balão do
      // sistema, que não tem equivalente para o campo de identificador.
      noValidate
      aria-busy={pendente}
      className="max-w-md space-y-5"
    >
      {estado.formError ? <Alerta variante="erro">{estado.formError}</Alerta> : null}

      <Campo
        id="nome"
        rotulo="Nome da empresa"
        erro={erroDe('nome')}
        {...register('nome')}
        type="text"
        maxLength={NOME_MAX}
        autoComplete="organization"
        disabled={pendente}
      />

      {/* pt-BR: a dica fica NO campo, e não só no placeholder: o placeholder
          desaparece quando a pessoa digita — e o formato do identificador
          é a regra que ela mais erra (maiúscula, espaço, hífen na ponta).
          E ela é `text-sm` pelo mesmo motivo do erro: a dica que PREVINE o
          erro não pode ser menor que o erro. `text-xs` (12 px) era menor
          que o `text-sm` (14 px) do erro. */}
      <Campo
        id="slug"
        rotulo="Identificador"
        erro={erroDe('slug')}
        dica="Letras minúsculas, números e hífens. Ex.: acme-ltda"
        {...register('slug')}
        type="text"
        maxLength={SLUG_MAX}
        placeholder="acme-ltda"
        autoComplete="off"
        disabled={pendente}
      />

      <div className="flex items-center gap-3 pt-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Criando…' : 'Criar empresa'}
        </Botao>
        {/* pt-BR: cancelar é uma ação, não um sumiço. Um formulário sem
            saída visível obriga a pessoa a voltar pelo navegador. */}
        <LinkTexto href="/users">Cancelar</LinkTexto>
      </div>
    </form>
  );
}
