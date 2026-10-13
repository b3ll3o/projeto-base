import type { UserOutput } from '../../../users/application/dto/user.output.js';

/**
 * Saída de `POST /auth/login`: o par de tokens e o usuário.
 *
 * ⚠️ `user` é o `UserOutput` de `toUserOutput` — o mesmo objeto que
 * alimenta `users_history.snapshot` e `users_archive.snapshot`. É ele
 * que garante, por construção, que o hash da senha não entre na
 * resposta: `toUserOutput` não lê o campo, e `PasswordHash.toString()`
 * devolve `[redacted]`. Uma segunda barreira, e as duas são
 * independentes de propósito (ver `password-hash.vo.ts`).
 */
export interface AuthSessionOutput {
  accessToken: string;
  refreshToken: string;
  user: UserOutput;
}

/**
 * Saída de `POST /auth/refresh`: par novo, sem o usuário.
 *
 * Sem `user` porque o refresh não recarrega o perfil — ele só renova a
 * janela. O cliente que quiser o dado fresco tem `GET /auth/me`.
 */
export interface RefreshOutput {
  accessToken: string;
  refreshToken: string;
}
