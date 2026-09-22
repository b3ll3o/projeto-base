/**
 * Input do use case `criarUser`. Recebe strings brutas; o use case converte
 * para VOs (`Email.create`, `UserName.create`).
 */
export interface CreateUserInput {
  nome: string;
  email: string;
}
