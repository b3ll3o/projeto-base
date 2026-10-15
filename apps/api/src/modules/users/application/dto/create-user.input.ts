/**
 * Input do use case `criarUser`. Recebe strings brutas; o use case converte
 * para VOs (`Email.create`, `UserName.create`).
 *
 * `senha` é a SENHA EM CLARO, e é o único lugar do fluxo onde isso é verdade.
 * O use case a entrega ao `PasswordHasherPort` e só então cria o
 * `PasswordHash` que entra no agregado — o agregado, o repositório e o
 * snapshot de auditoria nunca veem este valor. Por isso o tipo é `string` e
 * não `PasswordHash`: o VO pertence à camada de baixo, e o input pertence à
 * fronteira.
 */
export interface CreateUserInput {
  nome: string;
  email: string;
  /** Senha em claro. Nunca é logada nem persistida — ver `UserUseCases.criarUser`. */
  senha: string;
}
