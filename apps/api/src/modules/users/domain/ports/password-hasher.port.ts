// apps/api/src/modules/users/domain/ports/password-hasher.port.ts
//
// Port de hashing de senha (DDD/Hexagonal).
//
// ── POR QUE ESTE PORT MORA EM `users/` E NÃO EM `auth/` ───────────────────
//
// A dependência entre os módulos é `auth → users`, um caminho só. Se o
// port morasse em `auth`, o `UserUseCases` (que está em `users/`) teria
// que importar `auth/` para tipar sua dependência, e o módulo `auth` —
// que precisa de `UserUseCases` para autenticar — importaria `users/` de
// volta. Isso é um ciclo de import ES: em ESM o ciclo não "funciona às
// vezes", ele executa o módulo parcialmente inicializado, e a classe que
// fica exportada no momento do acesso é `undefined`.
//
// Colocando o port em `users/domain/ports/`, `auth/` o implementa (a
// direção correta) e ninguém precisa importar ninguém.
//
// ── POR QUE O DOMÍNIO NÃO IMPLEMENTA ISSO ─────────────────────────────────
//
// `argon2` é um módulo nativo com dependência de plataforma. Um VO de
// domínio que importe `argon2` quebraria a regra de `domain/` ser
// TypeScript puro (`stack-code-reviewer` bloqueia no pre-commit). O
// domínio conhece a NECESSIDADE ("a senha precisa ser transformada antes
// de ser guardada"); a infraestrutura conhece o COMO.

/** Token de injeção de dependência para `PasswordHasherPort`. */
export const PASSWORD_HASHER_PORT = Symbol('PasswordHasherPort');

export interface PasswordHasherPort {
  /**
   * Transforma a senha em claro no hash que vai para `users.password_hash`.
   *
   * ⚠️ O argumento é a senha em claro e a saída é opaca. Quem chama é
   * responsável por NÃO logar nenhum dos dois, e por descartar o primeiro
   * assim que a segunda existe.
   *
   * @param senhaPlana a senha como a pessoa a digitou
   * @returns hash argon2id no formato canônico (`$argon2id$v=…$salt$digest`)
   */
  hash(senhaPlana: string): Promise<string>;

  /**
   * Confere a senha em claro contra o hash armazenado.
   *
   * Deve ser tempo-constante por construção (é o que `argon2.verify` faz).
   *
   * @returns `true` só quando a senha confere. Um hash que não é argon2id
   *          também devolve `false` — nunca lança, para que o chamador não
   *          distinga "senha errada" de "registro corrompido" no login.
   */
  verify(senhaPlana: string, hashArmazenado: string): Promise<boolean>;
}
