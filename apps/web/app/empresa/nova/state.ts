// apps/web/app/empresa/nova/state.ts
//
// Estado do formulário de criação de empresa.
//
// pt-BR: fica num arquivo separado de `actions.ts` pelo mesmo motivo do
// cadastro e do login — um arquivo com `'use server'` só pode exportar
// funções async, então uma constante exportada de lá quebra o build do Next.
// O TIPO também mora aqui para que a Action e o formulário compartilhem uma
// única definição do formato do estado.
//
// ⚠️ Diferença do cadastro: aqui NÃO há segredo no estado. Nome e
// identificador de empresa são dados de negócio, e voltar eles no payload da
// Server Action é o que evita obrigar a pessoa a redigitar depois de um erro.

import type { CampoEmpresa } from '@/lib/empresa-schema';

/** O que a Action devolve ao `useActionState` a cada envio. */
export interface EmpresaState {
  /** `true` quando a empresa foi criada (a Action redireciona antes de devolver). */
  ok: boolean;
  /** Erro por campo — o formulário mostra a mensagem junto do input. */
  fieldErrors: Partial<Record<CampoEmpresa, string>>;
  /** Erro que não pertence a um campo — aparece no topo do formulário. */
  formError: string | null;
  /** O que a pessoa digitou, para o formulário não limpar o que ela preencheu. */
  valores: { nome: string; slug: string };
}

export const EMPRESA_INICIAL: EmpresaState = {
  ok: false,
  fieldErrors: {},
  formError: null,
  valores: { nome: '', slug: '' },
};

/**
 * Mensagem para qualquer falha que não sabemos atribuir a um campo.
 *
 * pt-BR: NÃO usamos `problem.title` da API — os títulos são escritos para
 * consumo de máquina/log. O traceId vai junto porque é o que permite retomar
 * a conversa com o suporte.
 */
export const ERRO_GENERICO =
  'Não foi possível criar a empresa. Verifique a conexão e tente novamente.';

/** Anexa o traceId ao fim da mensagem, quando existe. */
export function comTraceId(mensagem: string, traceId?: string): string {
  return traceId ? `${mensagem} Código de rastreamento: ${traceId}.` : mensagem;
}
