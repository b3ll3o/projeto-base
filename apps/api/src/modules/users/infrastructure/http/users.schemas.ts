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
// - Limites de tamanho: IMPORTADOS do VO, não reescritos aqui.
//
//     nome:  UserName.MIN_LENGTH..UserName.MAX_LENGTH  (2..100)
//     email: Email.MAX_LENGTH                          (254)
//
//   MEDIDO 2026-10-08: este arquivo declarava `min(1).max(120)` e
//   `.max(255)` — enquanto o VO recusava 2..100 e 254. O comentário
//   abaixo dizia "espelha `UserName` VO": espelhava em 118 e 20. A
//   consequência era um nome de 1 char (ou de 101..120) passando o
//   boundary e virando **500** no VO, com a mensagem interna do VO
//   vazada no `detail`. Rejeitar cedo no boundary é a razão de o schema
//   existir — e para isso ele precisa concordar com a regra que aplica.
//
//   RFC 5321 §4.5.3.1.3 dá 254 octetos de "addr-spec" — que é o número
//   que o `Email` VO já usava. A "margem para o @" do comentário
//   anterior somava 1 octeto que o VO não aceitava.
//
//   Os números NÃO são reescritos aqui de propósito: um `.max(120)`
//   literal é uma transcrição que envelhece sozinha. Importar do VO torna
//   a divergência um erro de compilação.
//
// - `novoNome` no PATCH é OBRIGATÓRIO: o endpoint atual é rename-only,
//   e o pipe Zod centraliza a rejeição 400. PATCH parcial (alguns campos
//   opcionais) será modelado em issue próprio, com schema dedicado e
//   `setRequiredByRoute()`.

import { z } from 'zod';
import {
  MIN_LENGTH as NOME_MIN,
  MAX_LENGTH as NOME_MAX,
} from '../../domain/value-objects/user-name.vo.js';
import { MAX_LENGTH as EMAIL_MAX } from '../../domain/value-objects/email.vo.js';

/**
 * Schema do body de `POST /users`. Valida `nome` e `email` no boundary
 * HTTP antes do `UserUseCases.criarUser` (que repete a validação via
 * `UserName.create` / `Email.create`).
 *
 * Os limites vêm do VO. Mudar o VO muda o boundary — que é o ponto: os
 * dois não podem discordar sem que o compilador reclame.
 */
export const CreateUserSchema = z.object({
  nome: z.string().min(NOME_MIN).max(NOME_MAX),
  email: z.string().email().max(EMAIL_MAX),
});

/** Tipo inferido do `CreateUserSchema` — consumido pelo controller. */
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

/**
 * Schema do body de `PATCH /users/:id`. Endpoint rename-only:
 * `novoNome` é obrigatório (2..100 chars, os limites do `UserName`).
 * PATCH parcial será modelado em issue próprio com schema dedicado.
 */
export const UpdateUserSchema = z.object({
  novoNome: z.string().min(NOME_MIN).max(NOME_MAX),
});

/** Tipo inferido do `UpdateUserSchema` — consumido pelo controller. */
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
