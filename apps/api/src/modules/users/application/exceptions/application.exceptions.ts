/**
 * Exceções da camada de aplicação (users).
 *
 * Diferem das exceções de domínio em duas dimensões:
 *
 * 1. **Origem**: domain exceptions sinalizam violações de invariantes do
 *    modelo (ex: `UserDeletedException` indica que o User está em estado
 *    soft-deleted). Application exceptions sinalizam falhas do caso de uso
 *    ou da borda externa (ex: input do caller não atende ao contrato).
 *
 * 2. **Consumidor**: domain exceptions são consumidas pelo próprio domain
 *    e re-propagadas. Application exceptions são consumidas pelo caller
 *    (HTTP handler, CLI, job) e mapeadas para o canal apropriado.
 *
 * pt-BR: o mapeamento final (HTTP status, RFC 7807 type) acontece no
 * GlobalExceptionFilter (Fase 3) ou no handler específico (Fase 7).
 */

/**
 * Falha de validação de input na borda do caso de uso.
 * Use quando o input do caller é estruturalmente incorreto
 * (campos faltando, tipos errados) — ANTES de chamar o domínio.
 *
 * NÃO usar para erros de invariante do domínio (esses já são
 * exceções de domínio, ex: EmailAlreadyInUseException).
 */
export class ApplicationValidationException extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`Validação falhou [${field}]: ${message}`);
    this.name = 'ApplicationValidationException';
    Object.setPrototypeOf(this, ApplicationValidationException.prototype);
  }
}

/**
 * Recurso não encontrado no nível do caso de uso (wrapper application-layer).
 * Use quando o use case não encontrou o recurso pedido, mesmo após todas as
 * verificações. Semanticamente equivalente a UserNotFoundException do domínio;
 * fornecido aqui para que callers application-layer não precisem importar
 * diretamente do domain (preserva Hexagonal inbound).
 */
export class ApplicationResourceNotFoundException extends Error {
  constructor(
    public readonly resource: string,
    public readonly id: string,
  ) {
    super(`${resource} não encontrado(a): ${id}`);
    this.name = 'ApplicationResourceNotFoundException';
    Object.setPrototypeOf(this, ApplicationResourceNotFoundException.prototype);
  }
}

/**
 * Conflito de versão no nível do caso de uso (optimistic locking).
 * Semantically equivalente a ConcurrencyException do domínio; fornecido aqui
 * para o mesmo motivo de boundary do ApplicationResourceNotFoundException.
 */
export class ApplicationConcurrencyException extends Error {
  constructor(
    public readonly resource: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      `${resource}: conflito de versão (esperada ${expectedVersion}, encontrada ${actualVersion ?? '(ausente)'})`,
    );
    this.name = 'ApplicationConcurrencyException';
    Object.setPrototypeOf(this, ApplicationConcurrencyException.prototype);
  }
}

/**
 * Tentativa de mutar um recurso em estado soft-deleted no nível do caso de uso.
 * Wrapper sobre UserDeletedException do domínio.
 */
export class ApplicationResourceDeletedException extends Error {
  constructor(
    public readonly resource: string,
    public readonly id: string,
  ) {
    super(`${resource} está soft-deleted: ${id}`);
    this.name = 'ApplicationResourceDeletedException';
    Object.setPrototypeOf(this, ApplicationResourceDeletedException.prototype);
  }
}

/**
 * Tentativa de restaurar um recurso que NÃO está soft-deleted.
 * Wrapper sobre InvalidRestoreException do domínio.
 */
export class ApplicationInvalidRestoreException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationInvalidRestoreException';
    Object.setPrototypeOf(this, ApplicationInvalidRestoreException.prototype);
  }
}

/**
 * Email já está em uso por outro recurso do mesmo tipo.
 * Wrapper sobre EmailAlreadyInUseException do domínio.
 */
export class ApplicationEmailAlreadyInUseException extends Error {
  constructor(public readonly email: string) {
    super(`Email já em uso: ${email}`);
    this.name = 'ApplicationEmailAlreadyInUseException';
    Object.setPrototypeOf(this, ApplicationEmailAlreadyInUseException.prototype);
  }
}
