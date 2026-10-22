// apps/web/lib/convite-mensagens.ts
//
// As mensagens do convite — compartilhadas pelas DUAS portas de entrada.
//
// pt-BR (onboarding de empresa, 2026-10-21): o convite tem duas portas, e as
// duas precisam falar a mesma língua:
//
//  1. `/convite/<token>` — quem JÁ TEM CONTA e o convite ainda não foi aceito.
//  2. `/users/novo?convite=<token>` — quem NÃO tem conta; a conta nasce na
//     empresa que convidou.
//
// A API responde `CONVITE_INVALIDO` com o motivo só no STATUS (o corpo não o
// diz, por decisão de segurança da API — o `detail` não pode confirmar a
// quem só tem o token que o convite existe). O status já distingue os
// casos, e a distinção é o que a pessoa precisa para agir: um convite
// VENCIDO pede um convite NOVO ao gerente da empresa; um convite de OUTRO
// e-mail pede entrar com a conta certa. Uma mensagem única para os quatro
// diria "não deu" e não diria o que fazer.
//
// ⚠️ O arquivo mora em `lib/` e não em `app/convite/[token]/state.ts` porque
// as DUAS portas precisam dele, e o arquivo de uma rota não é alcançável
// de outra sem um import relativo que atravessa a fronteira de rota.

/** O convite não existe (ou o token não bate com nenhum). */
export const CONVITE_NAO_ENCONTRADO = 'Convite não encontrado.';

/** O convite venceu. */
export const CONVITE_EXPIRADO = 'Este convite expirou. Peça um novo convite ao gerente da empresa.';

/** O convite já foi usado — não dá para aceitar duas vezes. */
export const CONVITE_JA_USADO = 'Este convite já foi usado.';

/** O convite foi emitido para outro e-mail. */
export const CONVITE_OUTRO_EMAIL =
  'Este convite foi enviado para outro e-mail. Entre com a conta que recebeu o convite.';

/** O token não tem o formato que a API aceita. */
export const CONVITE_INVALIDO = 'Convite inválido. Peça um novo convite ao gerente da empresa.';

/**
 * A conta JÁ é membro da empresa que convidou.
 *
 * pt-BR: este motivo é o ÚNICO que a API dá com `code` próprio
 * (`CONVITE_JA_MEMBRO`), e a razão é a segurança: os outros quatro motivos
 * são sobre o ESTADO do convite, e todos são alcançáveis por quem só tem o
 * token — um `code` por motivo diria a essa pessoa que o token é válido e o
 * e-mail é que não bate. `ja-membro` exige uma conta AUTENTICADA que já é
 * membro da empresa que convidou: a pessoa sabe que pertence à empresa, e a
 * resposta não diz nada sobre o token.
 *
 * E a mensagem é a que resolve: "já foi usado" mandaria pedir um convite
 * novo — que voltaria a dar 409, para sempre.
 */
export const CONVITE_JA_MEMBRO = 'Você já faz parte desta empresa.';

/** A mensagem da tela de ACEITE quando a falha não é um motivo de convite. */
export const CONVITE_ERRO_GENERICO =
  'Não foi possível aceitar o convite. Verifique a conexão e tente novamente.';

/**
 * O status HTTP → o MOTIVO do convite, ou `null` quando o status não diz.
 *
 * `null` (e não uma mensagem genérica) é o que deixa cada tela usar a SUA
 * mensagem genérica: a tela de aceite diz "não foi possível aceitar o
 * convite" e a de cadastro diz "não foi possível cadastrar o usuário" —
 * a mesma falha de rede, duas frases que descrevem o que a pessoa tentou.
 */
export function mensagemDeConvite(status: number, code?: string): string | null {
  // ⚠️ O `code` vem ANTES do status, e é por isso que ele é um parâmetro
  // separado: `ja-membro` e `ja-aceito` são o MESMO status (409), e o que os
  // distingue é o `code`. Sem esta linha, quem já é da empresa lia "Este
  // convite já foi usado" — e pedir um convite novo devolvia 409 de novo,
  // para sempre.
  if (code === 'CONVITE_JA_MEMBRO') {
    return CONVITE_JA_MEMBRO;
  }
  switch (status) {
    case 410:
      return CONVITE_EXPIRADO;
    case 409:
      return CONVITE_JA_USADO;
    case 403:
      return CONVITE_OUTRO_EMAIL;
    case 404:
      return CONVITE_NAO_ENCONTRADO;
    default:
      return null;
  }
}
