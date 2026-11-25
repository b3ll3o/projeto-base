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

/**
 * A conta está TRAVADA por tentativas de login malsucedidas (issue #182).
 *
 * ⚠️ POR QUE UM ERRO PRÓPRIO, E NÃO O `InvalidCredentialsException`
 *
 * O lockout é por CONTA: a chave é o e-mail normalizado, e a janela é de 15
 * minutos. Antes do lockout, o único limite era por `(IP, e-mail)` — e o
 * número do NIST (5 tentativas por conta) nunca se aplicava a uma conta
 * só: MEDIDO no guard real do `@nestjs/throttler`, 10 IPs distintos × 5
 * tentativas contra a MESMA conta davam 50 de 50 permitidas.
 *
 * O erro é DISTINTO do `InvalidCredentialsException` porque a resposta que o
 * cliente precisa dar é diferente: "credencial errada" manda voltar para o
 * formulário; "conta travada" manda esperar e volver depois. Um 401
 * genérico para os dois casos não informa nada — e o usuário legítimo
 * ficaria tentando a senha certa sem entender o que acontece.
 *
 * ⚠️ E NÃO É ORACLE DE ENUMERAÇÃO
 *
 * O contador é por e-mail, e ele conta tentativas de login de QUALQUER
 * e-mail — inclusive de um e-mail que não existe na base. O atacante não
 * aprende nada sobre a existência da conta: ele já sabe que o e-mail existe
 * (ele é quem mandou a senha). E a mensagem não diz quantas tentativas
 * faltam nem quando a janela expira — o tempo é da resposta, não do corpo.
 */
export class ContaBloqueadaException extends Error {
  constructor(message = 'Conta temporariamente bloqueada por tentativas de login malsucedidas.') {
    super(message);
    this.name = 'ContaBloqueadaException';
    // pt-BR: mesma razão dos outros `*.exceptions.ts` do repo — sem isto,
    // `err instanceof ContaBloqueadaException` dá false para a exceção vinda
    // de outro arquivo já transpilado, e o mapper cai no 500 em vez do 423.
    Object.setPrototypeOf(this, ContaBloqueadaException.prototype);
  }
}
