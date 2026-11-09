// apps/api/src/modules/auth/domain/ports/token-issuer.port.ts
//
// Port de emissão/validação de token (DDD/Hexagonal).
//
// ── POR QUE ESTE PORT EXISTE E NÃO SÓ UM `JwtService` ─────────────────────
//
// O domínio de `auth/` descreve QUE precisa de um par de tokens e que um
// token se identifica por `sub` + `email` + `typ`. NÃO descreve como o
// token é assinado. `JwtService` do Nest é infraestrutura: importá-lo aqui
// arrastaria `@nestjs/*` para dentro de `domain/`, que é TypeScript puro
// (`stack-code-reviewer` bloqueia no pre-commit).
//
// O símbolo `typ` é o ponto. Ele existe porque os DOIS tokens que saem de
// um login não valem a mesma coisa: o access token (15 min) abre a API, o
// refresh token (7 dias) só troca access token. Sem um discriminador no
// próprio token, `validarAccessToken` não tem como saber o que tem na mão e
// aceita qualquer token assinado — um refresh token viraria access token e
// o acesso duraria 7 dias em vez de 15 minutos.
//
// ── POR QUE OS MÉTODOS LançAM E NÃO DEVOLVEM `null` ───────────────────────
//
// `validar*Token` tem tipo de retorno `Promise<TokenSubject>`, não
// `Promise<TokenSubject | null>`. Token inválido é um resultado que o
// CHAMADOR trata como exceção, não um valor de retorno: no `JwtAuthGuard`
// (fase 6) isso vira 401, e o tipo impede que alguém escreva
// `const sub = await validar(...)` e siga com `sub.sub` num `undefined`.
// A exceção é convertida em 401 na fronteira HTTP.
//
// A mensagem de erro NUNCA distingue "expirado" de "assinatura inválida" de
// "typ errado" para quem está de fora — o port não define isso, mas quem
// implementa precisa saber: o filtro de exceção transforma tudo em
// INVALID_CREDENTIALS/UNAUTHORIZED.

/** Token de injeção de dependência para `TokenIssuerPort`. */
export const TOKEN_ISSUER_PORT = Symbol('TokenIssuerPort');

/**
 * O que um token carrega de útil. `typ` é o discriminador que impede um
 * refresh token de virar access token.
 */
export interface TokenSubject {
  /** Id do usuário — é o que a auditoria grava como `actorId`. */
  sub: string;
  email: string;
  typ: 'access' | 'refresh';
}

/**
 * O assunto de um REFRESH token — e o `jti` é obrigatório aqui (#132).
 *
 * ⚠️ Por que um subtipo, e não um `jti?` no `TokenSubject`: o
 * `TokenSubject` é o retorno do `validarAccessToken` TAMBÉM, e o guard não
 * usa `jti` — mas o `logout` e a rotação precisam dele, e precisam dele
 * GARANTIDO. Um `jti` opcional faria o logout virar um no-op silencioso
 * (revogar um `jti` que não existe não falha — e o token continua valendo).
 */
export interface RefreshSubject extends TokenSubject {
  typ: 'refresh';
  /** A identidade do token — é o que o registro de revogação indexa. */
  jti: string;
}

/** Par emitido em um login (e em cada refresh). */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /**
   * O `jti` do REFRESH token (#132) — é o que a revogação indexa, e é o
   * que o `logout` revoga.
   */
  refreshJti: string;
  /**
   * Quando o refresh token expira (#132) — o `exp` do próprio token. A
   * revogação precisa dele para podar o registro: sem prazo, a tabela só
   * cresce.
   */
  refreshExpiresAt: Date;
}

export interface TokenIssuerPort {
  /**
   * Assina um par de tokens para o assunto informado.
   *
   * Os dois tokens saem de uma chamada porque eles precisam ser coerentes
   * entre si: mesmo `sub`, mesmo `email`, e expiração do refresh sempre
   * depois da do access.
   *
   * @returns o par `{ accessToken, refreshToken, refreshJti, refreshExpiresAt }`
   */
  emitir(assunto: { sub: string; email: string }): Promise<TokenPair>;

  /**
   * Verifica assinatura, expiração E que `typ === 'access'`.
   *
   * @throws quando o token não é válido para uso como access token.
   */
  validarAccessToken(token: string): Promise<TokenSubject>;

  /**
   * Verifica assinatura, expiração E que `typ === 'refresh'`.
   *
   * @throws quando o token não é válido para uso como refresh token — e
   *         também quando é válido mas NÃO tem `jti` (#132): um token sem
   *         identidade não tem como ser revogado.
   */
  validarRefreshToken(token: string): Promise<RefreshSubject>;
}
