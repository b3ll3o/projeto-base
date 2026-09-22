/**
 * Tipos compartilhados pelos checks de preflight.
 *
 * Cada check individual (check-doc-refs, check-tsconfig-drift, etc.)
 * retorna este mesmo formato padronizado, permitindo que o
 * orquestrador (preflight.ts) processe resultados uniformes.
 */
export interface CheckResult {
  ok: boolean;
  errors: string[];
}
