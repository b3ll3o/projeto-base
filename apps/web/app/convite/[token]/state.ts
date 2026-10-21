// apps/web/app/convite/[token]/state.ts
//
// Estado e mensagens da tela de convite.
//
// pt-BR: fica num arquivo separado de `actions.ts` porque um arquivo com
// `'use server'` só pode exportar funções async — exportar uma constante de
// lá quebra o build do Next. Mesmo motivo do `app/users/novo/state.ts`.

/** O que a Action devolve ao `useActionState` a cada envio. */
export interface ConviteState {
  ok: boolean;
  /** Erro que não pertence a um campo — aparece no topo do formulário. */
  formError: string | null;
}

export const CONVITE_INICIAL: ConviteState = { ok: false, formError: null };

/**
 * As mensagens do convite — uma por MOTIVO.
 *
 * pt-BR: a API responde `CONVITE_INVALIDO` com o motivo só no STATUS (o
 * corpo não o diz, por decisão de segurança da API — o `detail` não pode
 * confirmar a quem só tem o token que o convite existe). O status, esse sim,
 * já distingue os casos, e a distinção é o que a pessoa precisa: um convite
 * VENCIDO pede um convite NOVO ao dono da empresa; um convite de OUTRO
 * e-mail pede entrar com a conta certa. Uma mensagem única para os quatro
 * diria "não deu" e não diria o que fazer.
 */
export const CONVITE_INVALIDO =
  'Convite inválido. Peça um novo convite ao administrador da empresa.';

export const CONVITE_EXPIRADO =
  'Este convite expirou. Peça um novo convite ao administrador da empresa.';

export const CONVITE_JA_USADO = 'Este convite já foi usado.';

export const CONVITE_OUTRO_EMAIL =
  'Este convite foi enviado para outro e-mail. Entre com a conta que recebeu o convite.';

export const CONVITE_NAO_ENCONTRADO = 'Convite não encontrado.';

/** A mensagem de qualquer falha que não é um motivo de convite. */
export const CONVITE_ERRO_GENERICO =
  'Não foi possível aceitar o convite. Verifique a conexão e tente novamente.';

/** Anexa o traceId ao fim da mensagem, quando existe. */
export function comTraceId(mensagem: string, traceId?: string): string {
  return traceId ? `${mensagem} Código de rastreamento: ${traceId}.` : mensagem;
}
