/**
 * Entrada de `POST /auth/login`.
 *
 * pt-BR: interface pura, sem decorator de classe-validator. A validação
 * acontece no boundary HTTP (`LoginSchema`, Zod) e de novo aqui via VO
 * (`Email.create`). `senha` NÃO tem VO: o `PasswordHash` é VO do HASH,
 * e a senha em claro não tem onde ser guardada em segurança — ela é
 * consumida pelo `PASSWORD_HASHER_PORT.verify()` e some.
 */
export interface LoginInput {
  email: string;
  senha: string;
}
