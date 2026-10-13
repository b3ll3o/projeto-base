/**
 * Entrada de `POST /auth/refresh`.
 *
 * O refresh token vem no BODY, não num cookie: a decisão D-1 é sessão
 * JWT stateless, sem tabela de revogação, e o web guarda os dois tokens
 * em cookies httpOnly e os reenvia pelo Server Action.
 */
export interface RefreshInput {
  refreshToken: string;
}
