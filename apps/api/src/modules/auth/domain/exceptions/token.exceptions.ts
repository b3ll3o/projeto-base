// apps/api/src/modules/auth/domain/exceptions/token.exceptions.ts
//
// Exceção de domínio para token ausente/inválido/expirado.
//
// ── POR QUE ELA EXISTE, E POR QUE NÃO É A DO LOGIN ─────────────────────────
//
// Há duas negativas de autenticação distintas e elas NÃO podem se confundir:
//
//   `InvalidTokenException`   — o TOKEN presented não serve (401).
//     Num guard: "Bearer expirado", "refresh no lugar de access".
//   `InvalidCredentialsException` (contrato E, Fase 5) — o LOGIN falhou
//     (401 INVALID_CREDENTIALS). Num login: e-mail não existe OU senha errada.
//
// A confusão entre as duas é a que gera resposta errada: `GET /users` com
// token expirado NÃO é `INVALID_CREDENTIALS` (o cliente não presented
// credencial nenhuma), e `/auth/login` com senha errada NÃO é token
// inválido (o token nunca foi emitido). Ambos são 401, com `code` distinto.
//
// ── POR QUE A MENSAGEM É GENÉRICA ───────────────────────────────────────────
//
// A exceção carrega um motivo interno (`motivo`) que NUNCA vai para o
// payload HTTP: o guard converte tudo no mesmo `detail`. Ver o comentário
// "POR QUE UM `detail` ÚNICO" em `jwt-auth.guard.ts`. Aqui o motivo serve
// ao log do servidor, que precisa distinguir "expirado" de "assinatura".

/**
 * Token de sessão ausente, malformado, expirado ou de tipo errado.
 *
 * Lançada por `JwtTokenService.validar*Token` e convertida em 401 pelo
 * `JwtAuthGuard` (ou por `domain-exception-to-http`, caso escape do guard).
 */
export class InvalidTokenException extends Error {
  /** Motivo interno, para log. Não é serializado no payload HTTP. */
  public readonly motivo: string;

  constructor(motivo: string) {
    // pt-BR: `super()` sem a mensagem interna como texto de erro evita que
    // stack-traces virarem payload. O `name` é o que o log greppa.
    super('InvalidTokenException');
    this.name = 'InvalidTokenException';
    this.motivo = motivo;
    Object.freeze(this);
  }
}
