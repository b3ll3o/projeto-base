// apps/api/src/modules/auth/domain/ports/login-lockout.port.ts
//
// O PORT do LOCKOUT POR CONTA (issue #182, sec-N1-002).
//
// ── O QUE ELE FECHA ─────────────────────────────────────────────────────────
//
// O limite de login que existia era por `(IP, e-mail)` — o balde do
// `@Throttle` do controller. O número do NIST SP 800-63B (5 tentativas de
// autenticação) é POR CONTA, e ele nunca se aplicava a uma conta só:
// MEDIDO no guard real do `@nestjs/throttler`, 10 IPs distintos × 5
// tentativas contra a MESMA conta → 50 de 50 permitidas. E o mesmo IP
// distribuía as tentativas por 1000 e-mails (spraying de credenciais),
// porque cada e-mail tinha balde próprio.
//
// Este port é o CONTADOR POR CONTA: a chave é o e-mail NORMALIZADO, e a
// janela é a mesma para toda conta.
//
// ── POR QUE UM PORT E NÃO UM SERVIÇO ───────────────────────────────────────
//
// O lockout é uma política de AUTENTICAÇÃO, e a autenticação já tem a sua
// fronteira hexagonal (`auth-use-cases.ts` fala com ports, e o adaptador
//-Prisma mora em `infrastructure/persistence/`). Um serviço de aplicação
// aqui seria a segunda forma de falar com o banco dentro do BC.
//
// ── POR QUE O E-MAIL NORMALIZADO É A CHAVE ─────────────────────────────────
//
// O login normaliza o e-mail ANTES de procurar a conta (`Email.create` —
// trim + toLowerCase). Se o contador usasse o e-mail CRU, `Joao@Example.com`
// e `joao@example.com` teriam contadores separados — e o limite por conta
// seria meio limite, que é o mesmo defeito que o `@Throttle` tinha.

/** Token de injeção — sem token o Nest LANÇA (a interface é apagada em runtime). */
export const LOGIN_LOCKOUT_PORT = Symbol('LoginLockoutPort');

/**
 * O número de tentativas que a conta aguenta antes de ser travada.
 *
 * ⚠️ É o número do NIST SP 800-63B, e é POR CONTA — o que o limite do
 * `@Throttle` (por `IP:e-mail`) nunca foi. Os dois números são 5, e são
 * coisas diferentes: este conta tentativas da MESMA conta, o outro conta
 * requisições de um MESMO par (IP, e-mail).
 */
export const LIMITE_DE_TENTATIVAS_DE_LOGIN = 5;

/**
 * A janela do contador, em milissegundos (15 minutos).
 *
 * ⚠️ Depois de 5 falhas, a conta fica travada por ESTA janela. Um login
 * bem-sucedido zera o contador — é o que impede que um atacante trave a
 * conta de uma vítima de graça (o DoS de lockout).
 */
export const JANELA_DE_LOCKOUT_DE_LOGIN_MS = 15 * 60_000;

/**
 * O REGISTRO de tentativas de login de uma conta.
 *
 * As três operações são as três perguntas que o login faz:
 * - `tentativas`: quantas falhas a conta acumulou na janela?
 * - `registrarFalha`: a senha estava errada — conte.
 * - `limpar`: o login deu certo — zere (e abra a conta).
 */
export interface LoginLockoutPort {
  /**
   * Quantas falhas a conta acumulou dentro da janela.
   *
   * A janela expirada conta como ZERO — o contador zera sozinho, e quem
   * pergunta recebe 0 (a conta está livre).
   */
  tentativas(email: string): Promise<number>;

  /**
   * Registra UMA falha de login da conta.
   *
   * A contagem é ATÓMICA: dois logins errados simultâneos contra a mesma
   * conta contam 2, e não 1 (a leitura-e-escrita em duas consultas
   * perderia uma falha — e o limite seria maior do que o declarado).
   */
  registrarFalha(email: string): Promise<void>;

  /** Zera o contador da conta — o login deu certo. */
  limpar(email: string): Promise<void>;
}
