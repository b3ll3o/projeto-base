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
  /**
   * Verdadeiro quando o check não pôde rodar (pré-requisito ausente).
   *
   * Sem este campo, `{ ok: true, errors: [] }` é indistinguível entre
   * *"verifiquei e passou"* e *"não havia o que verificar"* — e o painel
   * imprimia o mesmo `✓` nos dois casos. Um check que faz early-return por
   * diretório/arquivo ausente é teatro: ele reporta sucesso sem ter
   * verificado nada.
   */
  skipped?: boolean;
  /** Motivo do skip, exibido no painel ao lado da marca. */
  reason?: string;
  /**
   * Ressalvas: conteúdo que o check QUER dizer mas que NÃO é defeito.
   *
   * Exemplo canônico — "medido contra a ref `origin/main` local; se ela
   * estiver velha, este verde subdeclara". Descartá-la seria perder o alerta;
   * pô-la em `errors` seria pior: o painel soma `errors.length` e
   * anunciava "2 erro(s)" para um defeito só, mandando quem lê procurar um
   * segundo bug que não existe.
   *
   * Regra: entra em `advisories` o que é **verdade sobre a própria medição**.
   * Entra em `errors` o que é defeito no objeto medido.
   */
  advisories?: string[];
}
