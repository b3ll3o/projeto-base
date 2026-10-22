// apps/web/app/convite/[token]/state.ts
//
// Estado da tela de convite.
//
// pt-BR: fica num arquivo separado de `actions.ts` porque um arquivo com
// `'use server'` só pode exportar funções async — exportar uma constante de
// lá quebra o build do Next. Mesmo motivo do `app/users/novo/state.ts`.
//
// ⚠️ As MENSAGENS do convite não moram aqui, e sim em
// `@/lib/convite-mensagens`: o convite tem DUAS portas de entrada (a tela de
// aceite e a tela de cadastro) e as duas precisam do mesmo motivo por status.

/** O que a Action devolve ao `useActionState` a cada envio. */
export interface ConviteState {
  ok: boolean;
  /** Erro que não pertence a um campo — aparece no topo do formulário. */
  formError: string | null;
}

export const CONVITE_INICIAL: ConviteState = { ok: false, formError: null };

/** Anexa o traceId ao fim da mensagem, quando existe. */
export function comTraceId(mensagem: string, traceId?: string): string {
  return traceId ? `${mensagem} Código de rastreamento: ${traceId}.` : mensagem;
}
