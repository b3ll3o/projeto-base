// apps/api/src/modules/auth/infrastructure/http/auth.schemas.ts
//
// Zod schemas do boundary HTTP de auth.
//
// ── A SENHA DO LOGIN NÃO USA A POLÍTICA DO CADASTRO ───────────────────────
//
// `LoginSchema.senha` é `min(1)` e NÃO `min(SENHA_MIN)`. Isto é
// deliberado e contraintuitivo, então vale o porquê:
//
//   A política de senha (8..72) responde "esse valor serve como senha".
//   O login responde "essa senha abre ESTA conta". São perguntas
//   diferentes, e no login a segunda não implica a primeira: quem tem
//   senha de 4 caracteres e conta criada antes da regra deve conseguir
//   entrar.
//
//   Se o boundary rejeitasse senha curta com 400, um e-mail inexistente
//   (que cai no VO `Email`, ou seja 400) e uma senha curta (400) dariam
//   o MESMO status, mas o corpo diria qual foi. E para quem tem a conta,
//   o 400 chega com um campo que ele não pode corrigir ali — o conserto
//   é "crie outra senha", que é uma tela que não existe.
//
//   `min(1)` continua sendo necessário: sem ele, `senha: ''` passaria e o
//   argon2 gastaria ~48 ms de CPU verificando string vazia.
//
// Os limites NÃO são reescritos aqui: vêm do VO, como em
// `users.schemas.ts`. Um `.max(72)` literal seria uma transcrição que
// envelhece sozinha — foi exatamente assim que `CreateUserSchema` ficou
// com `.max(120)` contra o VO que recusava 100.

import { z } from 'zod';
import { MAX_LENGTH as SENHA_MAX } from '../../../users/domain/value-objects/password-hash.vo.js';
import { MAX_LENGTH as EMAIL_MAX } from '../../../users/domain/value-objects/email.vo.js';

/** Body de `POST /auth/login`. */
export const LoginSchema = z.object({
  email: z.string().email().max(EMAIL_MAX),
  // Ver o cabeçalho: `min(1)` é "tem algo para verificar", não a política.
  senha: z.string().min(1).max(SENHA_MAX),
});

export type LoginDto = z.infer<typeof LoginSchema>;

/** Body de `POST /auth/refresh`. */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshDto = z.infer<typeof RefreshSchema>;
