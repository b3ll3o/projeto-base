// apps/web/app/users/novo/state.ts
//
// Estado do formulário de cadastro.
//
// pt-BR: fica num arquivo separado de `actions.ts` porque um arquivo com
// `'use server'` só pode exportar funções async — exportar uma constante de
// lá quebra o build do Next. O TIPO também mora aqui para que a Action e o
// formulário compartilhem uma única definição, sem duplicar a forma do
// estado em dois lugares.

import type { CampoCadastro } from '@/lib/cadastro-usuario-schema';

/** O que a Action devolve ao `useActionState` a cada envio. */
export interface CadastroUsuarioState {
  /** `true` quando o usuário foi criado (a Action redireciona antes de devolver). */
  ok: boolean;
  /** Erro por campo — o formulário mostra a mensagem junto do input. */
  fieldErrors: Partial<Record<CampoCadastro, string>>;
  /** Erro que não pertence a um campo — aparece no topo do formulário. */
  formError: string | null;
  /** O que a pessoa digitou, para o formulário não limpar o que ela preencheu. */
  valores: { nome: string; email: string; senha: string };
}

export const CADASTRO_INICIAL: CadastroUsuarioState = {
  ok: false,
  fieldErrors: {},
  formError: null,
  // pt-BR: a senha volta VAZIA, nunca com o que foi digitado. Este estado é
  // devolvido ao Client Component e mora no payload da Server Action — um
  // segredo dentro dele viraria um segredo no histórico de rede do browser,
  // no DevTools e no log de qualquer proxy no caminho. O campo existe no
  // estado só para a forma ser uniforme com os outros; quem repõe os campos
  // depois de uma falha é o `useEffect` em `cadastro-usuario-form.tsx`, que
  // escreve `senha: ''` por conta própria. São DUAS barreiras independentes:
  // `valoresSemSegredo` em `actions.ts` apaga no servidor, e o `useEffect`
  // apaga no browser. Uma delas caindo ainda não expõe o segredo.
  valores: { nome: '', email: '', senha: '' },
};

/**
 * Mensagem para qualquer falha que não sabemos atribuir a um campo.
 *
 * pt-BR: NÃO usamos `problem.title` da API. Os títulos são escritos para
 * consumo de máquina/log ("Erro interno", "Erro de validação") e não são
 * explicação para quem está preenchendo um formulário. O traceId vai junto
 * porque é o que permite retomar a conversa com o suporte.
 */
export const ERRO_GENERICO =
  'Não foi possível cadastrar o usuário. Verifique a conexão e tente novamente.';

/** Anexa o traceId ao fim da mensagem, quando existe. */
export function comTraceId(mensagem: string, traceId?: string): string {
  return traceId ? `${mensagem} Código de rastreamento: ${traceId}.` : mensagem;
}
