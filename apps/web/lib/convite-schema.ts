// apps/web/lib/convite-schema.ts
//
// pt-BR (onboarding de empresa, 2026-10-21): o token de convite.
//
// O token é 32 bytes em hex — 64 caracteres de `0-9a-f`. É o MESMO formato
// em todas as portas que o recebem (`POST /users` com `destino.tipo='convite'`
// e `POST /invitations/accept`), e a cópia web existe para RECUSAR na entrada
// o que a API recusaria com 400 — e para o cadastro não mandar um token
// manifestamente inválido para o banco.
//
// É cópia deliberada do schema da API (o mesmo motivo do
// `empresa-schema.ts`): o frontend não arrasta dependência de código de
// servidor. A cópia é GUARDIADA pelo spec, que lê o fonte dos dois
// controllers e afirma que a expressão é a mesma — cópia sem guardião
// envelhece sozinha.

/** O formato que a API aceita: 64 caracteres hexadecimais minúsculos. */
export const CONVITE_TOKEN_REGEX = /^[0-9a-f]{64}$/;

/**
 * O token tem o formato que a API aceita?
 *
 * Não diz se o convite EXISTE, se VENCEU ou se foi usado — isso só a API
 * sabe. Diz apenas que o texto não é lixo, e é por isso que a recusa é
 * barata: um link de convite com o token adulterado morre aqui, sem ida ao
 * banco.
 */
export function ehTokenDeConvite(token: string): boolean {
  return CONVITE_TOKEN_REGEX.test(token);
}

/**
 * O parâmetro de query string que carrega o token do convite até o login.
 *
 * pt-BR (2026-10-21): a sessão vence em 15 min, e o aceite do convite devolve
 * 401 quando isso acontece. O token viaja na URL porque o CONVITE É uma URL —
 * e é por isso que ele precisa sobreviver ao login: sem ele, quem entra por
 * convite com a sessão vencida perde a empresa que a convidou.
 */
export const PARAM_CONVITE = 'convite';
