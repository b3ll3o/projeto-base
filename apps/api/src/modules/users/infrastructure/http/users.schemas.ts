// apps/api/src/modules/users/infrastructure/http/users.schemas.ts
//
// Zod schemas para validação de payloads HTTP no BC Users (Task 7.4).
//
// pt-BR:
// - Defense-in-depth na borda HTTP: o use case JÁ valida (VOs `Email`/
//   `UserName` lançam em formato inválido), mas queremos rejeitar 400
//   cedo com mensagens úteis para o cliente, sem depender da ordem
//   `parse → VO.create → save` para falhar tarde.
// - Aplicados via `@Body(new ZodValidationPipe(CreateUserSchema))` em
//   cada rota do `UsersController`. O pipe global noop (`z.any()`)
//   registrado em main.ts fica como fallback; cada rota sobrescreve.
// - Limites de tamanho:
//
//     nome:        1..120 chars (espelha `UserName` VO; >120 é absurdo
//                 para nome humano e infla indevidamente o payload HTTP)
//     email:       1..255 chars (RFC 5321 §4.5.3.1.3 — limite prático
//                 de 254 octetos na "addr-spec"; usamos 255 para margem
//                 inclusive do "@")
//
// - `novoNome` no PATCH é `.optional()` para forward-compat com PATCH
//   parcial (issue de follow-up: PATCH/name + PATCH/email separados).
//   Hoje o controller exige `novoNome`, mas o schema aceita omissão
//   para não acoplar evoluções HTTP à evolução do schema.

import { z } from 'zod';

/**
 * Schema do body de `POST /users`. Valida `nome` e `email` no boundary
 * HTTP antes do `UserUseCases.criarUser` (que repete a validação via
 * `UserName.create` / `Email.create`).
 */
export const CreateUserSchema = z.object({
  nome: z.string().min(1).max(120),
  email: z.string().email().max(255),
});

/** Tipo inferido do `CreateUserSchema` — consumido pelo controller. */
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

/**
 * Schema do body de `PATCH /users/:id`. Hoje só suporta rename; `novoNome`
 * é opcional para forward-compat com PATCH parcial futuro.
 */
export const UpdateUserSchema = z.object({
  novoNome: z.string().min(1).max(120).optional(),
});

/** Tipo inferido do `UpdateUserSchema` — consumido pelo controller. */
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
