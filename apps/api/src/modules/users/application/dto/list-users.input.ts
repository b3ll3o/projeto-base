export interface ListUsersInput {
  cursor?: string | null;
  limit: number;
  includeDeleted?: boolean;
  /**
   * pt-BR (2026-10-17): restringe a página a UM usuário. É o que a rota
   * `GET /users` preenche quando o ator não tem perfil — o bucket `'*'`
   * devolveria a base inteira, e quem não tem `users.read` precisa ver alguma
   * coisa (a si mesmo), não 403.
   *
   * `null`/`undefined` = sem restrição. Quem decide quem tem permissão é o
   * controller, a partir do perfil hidratado; o repositório só obedece.
   */
  somenteUsuarioId?: string | null;
}
