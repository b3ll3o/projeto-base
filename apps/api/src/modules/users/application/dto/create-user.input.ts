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
  /**
   * Para ONDE a conta entra (Fase 5, D5). Ausente = a conta solta de hoje.
   *
   * O use case NÃO cria a empresa nem aceita o convite: ele entrega o `users`
   * já pronto ao `TenancyUseCases`, que é quem tem a fronteira transacional
   * (usuário + empresa + perfil + membership caem juntos, ou não caem).
   */
  destino?:
    | { tipo: 'empresa'; nome: string; slug: string }
    | { tipo: 'convite'; token: string }
    // O `| undefined` explícito é exigência de `exactOptionalPropertyTypes`: o
    // body vem do Zod, onde `destino` ausente é `undefined` e não "campo
    // faltando" — e o `CreateUserDto` inteiro é repassado como `CreateUserInput`.
    | undefined;
}
