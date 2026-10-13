// apps/api/src/modules/auth/domain/exceptions/auth.exceptions.ts
//
// Exceção de domínio do LOGIN (contrato E). Registro obrigatório em
// `shared/infrastructure/http/domain-exception-to-http.ts` → 401 /
// INVALID_CREDENTIALS; sem esse registro ela cai no `return` final do
// mapper e o cliente recebe 500 num erro de credencial.
//
// ── POR QUE ESTA EXCEÇÃO É DIFERENTE DA `InvalidTokenException` ────────────
//
// A distinção (do `token.exceptions.ts`, que é a outra face do mesmo
// módulo) é real e não é estilo:
//
//   InvalidTokenException       → o TOKEN apresentado não serve.
//   InvalidCredentialsException → o LOGIN falhou.
//
// `GET /users` com token expirado NÃO é INVALID_CREDENTIALS — o cliente
// não presented credencial nenhuma, e dizer "credenciais inválidas"
// manda quem está de volta ao formulário de login. `/auth/login` com
// senha errada NÃO é token inválido — o token nunca chegou a existir.
//
// ── POR QUE A MENSAGEM É FIXA E NÃO TEM PARÂMETROS ─────────────────────────
//
// "e-mail não encontrado" e "senha incorreta" são o mesmo `Error` com a
// mesma string. Isso não é conveniência de log: é o requisito de não
// enumeração de contas. Um endpoint de login que responde
// `detail="usuário não encontrado"` para um e-mail livre e 401 genérico
// para um e-mail existente é um oráculo de cadastro — e cadastro
// válido é o que o atacante quer.
//
// O construtor aceita mensagem para o servidor (log de aplicação),
// mas o CAMINHO DE LOGIN não passa nenhum: `login()` e `renovar()`
// levantam `new InvalidCredentialsException()` sem argumento.

/**
 * Credenciais de login recusadas — e-mail inexistente, senha errada,
 * usuário soft-deleted, ou sessão cujo usuário deixou de existir.
 *
 * Deliberadamente NÃO diz qual dos quatro foi. Ver a nota no topo.
 */
export class InvalidCredentialsException extends Error {
  constructor(message = 'Credenciais inválidas.') {
    super(message);
    this.name = 'InvalidCredentialsException';
    // pt-BR: mesma razão dos outros `*.exceptions.ts` do repo — sem isto,
    // `err instanceof InvalidCredentialsException` dá false para a
    // exceção vinda de outro arquivo já transpilado, e o mapper cai no
    // 500 em vez do 401.
    Object.setPrototypeOf(this, InvalidCredentialsException.prototype);
  }
}
