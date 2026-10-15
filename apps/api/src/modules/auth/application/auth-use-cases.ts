// apps/api/src/modules/auth/application/auth-use-cases.ts
//
// Casos de uso do BC Auth: login, renovação e "quem sou eu".
//
// pt-BR: a aresta é `auth → users`. Este arquivo importa o
// `UserRepositoryPort` e o `PasswordHasherPort` de `users/` — nunca o
// contrário. O port de hash mora em `users/domain/ports/` por isso
// (ver o cabeçalho do próprio port): se morasse aqui, `UserUseCases`
// teria que importar `auth/` para tipar a mesma dependência, e o par
// viraria um ciclo de import ES.
//
// ── A REGRA DO LOGIN ───────────────────────────────────────────────────────
//
// Três invariantes, nesta ordem, e as três são testadas:
//
//  1. **NÃO ENUMERA CONTAS.** E-mail inexistente e senha errada levantam
//     a MESMA `InvalidCredentialsException`, com a MESMA mensagem. Um
//     `detail` diferente por caso é um oráculo de cadastro.
//
//  2. **TEMPO CONSTANTE.** `verify()` roda mesmo sem usuário
//     encontrado, contra um hash descartável gerado de verdade. Um
//     `if (user === null) throw` antes do `verify` responderia em ~1 ms
//     para e-mail inexistente e ~48 ms para e-mail existente — a mesma
//     informação, entregue pelo relógio. Por isso o hash de isca é um
//     argon2 real e não `''`: `argon2.verify('')` não custaria nada.
//
//  3. **O HASH NÃO SAI.** O retorno passa por `toUserOutput`, que não
//     lê `senhaHash`. Não há outro caminho de leitura aqui.

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { InvalidCredentialsException } from '../domain/exceptions/auth.exceptions.js';
import { TOKEN_ISSUER_PORT, type TokenIssuerPort } from '../domain/ports/token-issuer.port.js';
import { Email } from '../../users/domain/value-objects/email.vo.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from '../../users/domain/ports/password-hasher.port.js';
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from '../../users/domain/ports/user-repository.port.js';
import { toUserOutput, type UserOutput } from '../../users/application/dto/user.output.js';

import type { LoginInput } from './dto/login.input.js';
import type { RefreshInput } from './dto/refresh.input.js';
import type { AuthSessionOutput, RefreshOutput } from './dto/auth-session.output.js';

export const AUTH_USE_CASES = Symbol.for('@projeto/api/auth/AuthUseCases');

/**
 * Hash de isca para o caminho "e-mail não existe".
 *
 * Gerado UMA vez por processo e memoizado: custa ~48 ms na primeira
 * chamada e zero nas seguintes, e o valor nunca é reutilizado para
 * verificar nada de verdade — ele existe só para que `verify()` pague o
 * mesmo preço nos dois caminhos.
 *
 * ⚠️ Não pode ser uma constante string no fonte. Um literal fixo
 * acabaria no `git log` e, pior, daria a um atacante com acesso ao
 * repositório um par (senha-hipotética, hash) para testar a
 * configuração do hasher. `randomBytes` elimina as duas saídas.
 */
let hashIsca: Promise<string> | null = null;

/**
 * pt-BR: decorado com `@Injectable()` + `@Inject(TOKEN)` explícito em
 * cada parâmetro porque os tipos são interfaces — apagadas em runtime.
 * Sem token explícito o container passa `undefined` e o defeito só
 * aparece em produção, no primeiro login (é o mesmo modo de falha que
 * o `UserUseCases` documenta no construtor).
 */
@Injectable()
export class AuthUseCases {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT) private readonly passwordHasher: PasswordHasherPort,
    @Inject(TOKEN_ISSUER_PORT) private readonly tokenIssuer: TokenIssuerPort,
  ) {}

  // ─── login ───────────────────────────────────────────────────────────────

  /**
   * Autentica por e-mail + senha e emite o par de tokens.
   *
   * @throws InvalidCredentialsException — e-mail inexistente, senha
   * errada, ou usuário soft-deleted. Os três são indistinguíveis.
   */
  async login(input: LoginInput): Promise<AuthSessionOutput> {
    // A MESMA normalização do cadastro (trim + toLowerCase). Sem ela,
    // ` Joao@Example.com ` não encontraria `joao@example.com`.
    const email = Email.create(input.email);
    const user = await this.userRepo.findByEmail(email);

    // ── Timing: verify() roda nos DOIS caminhos ───────────────────────────
    const hashArmazenado = user === null ? await this.hashDescartavel() : user.senhaHash().value;
    const senhaConfere = await this.passwordHasher.verify(input.senha, hashArmazenado);

    if (user === null || user.isDeleted() || !senhaConfere) {
      throw new InvalidCredentialsException();
    }

    const { accessToken, refreshToken } = await this.tokenIssuer.emitir({
      sub: user.id().value,
      email: user.email().value,
    });

    return { accessToken, refreshToken, user: toUserOutput(user) };
  }

  // ─── renovar ─────────────────────────────────────────────────────────────

  /**
   * Troca um refresh token válido por um par novo.
   *
   * Recarrega o usuário antes de emitir, e isso não é redundância: o JWT
   * é stateless e vive 7 dias, então um refresh token legitimately válido
   * pode pertencer a uma conta que foi soft-deleted no meio do caminho.
   * Sem esta checagem, "apagar a conta" não tiraria ninguém da sessão.
   *
   * @throws InvalidCredentialsException — token recusado pelo emissor, ou
   * usuário que não existe mais.
   */
  async renovar(input: RefreshInput): Promise<RefreshOutput> {
    // A rejeição de token vem do próprio `tokenIssuer` (InvalidTokenException);
    // ela sobe como está — quem a converte em 401 é o boundary HTTP.
    const subject = await this.tokenIssuer.validarRefreshToken(input.refreshToken);

    const user = await this.userRepo.findById(UserId.create(subject.sub));
    if (user === null || user.isDeleted()) {
      throw new InvalidCredentialsException();
    }

    return this.tokenIssuer.emitir({
      sub: user.id().value,
      email: user.email().value,
    });
  }

  // ─── eu ──────────────────────────────────────────────────────────────────

  /**
   * Devolve o perfil do usuário do token (`GET /auth/me`).
   *
   * ⚠️ `@CurrentUser()` entrega `TokenSubject | undefined`, e o guard é
   * da Fase 6. O `undefined` é tratado pelo controller, não aqui.
   *
   * @throws InvalidCredentialsException — usuário não existe mais.
   * 401 e não 404 de propósito: um token cuja assinatura passou mas cujo
   * usuário sumiu é um token AUTÊNTICO, e um 404 confirmaria isso a quem
   * o apresenta.
   */
  async eu(userId: string): Promise<UserOutput> {
    const user = await this.userRepo.findById(UserId.create(userId));
    if (user === null) {
      throw new InvalidCredentialsException();
    }
    return toUserOutput(user);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * Hash descartável para o caminho "e-mail não existe".
   *
   * Memoizado por processo: o primeiro login de um e-mail inexistente
   * paga os ~48 ms do argon2 e os seguintes não pagam — o que é
   * exatamente o que o atacante mede, então o valor é o MESMO dos dois
   * lados, e o que importa (igualdade) se mantém.
   */
  private async hashDescartavel(): Promise<string> {
    hashIsca ??= this.passwordHasher.hash(randomBytes(32).toString('hex'));
    return hashIsca;
  }
}
