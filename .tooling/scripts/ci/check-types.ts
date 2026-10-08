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

/**
 * Tudo o que o check tem a dizer, na ordem em que deve sair.
 *
 * Um check carrega três coisas: defeito no objeto medido (`errors`), ressalva
 * sobre a própria medição (`advisories`) e o motivo de não ter rodado
 * (`skipped`/`reason`). Quem imprime tem de imprimir **as três** — omitir a
 * ressalva troca um defeito (contar demais) por outro (esconder o aviso que dá
 * sentido ao número).
 *
 * MEDIDO 2026-10-07: `check-branch-up-to-date` passou a devolver a ressalva em
 * `advisories`, o painel do `preflight` passou a imprimi-la, e o modo CLI do
 * próprio arquivo — a seis linhas de distância — continuava imprimindo só
 * `errors`. Rodar o check isolado sumia com a ressalva, sem nenhum sinal, e
 * nenhum teste caía: o caminho de impressão era um bloco `if` sob
 * `process.argv[1]`, fora do alcance de qualquer spec.
 *
 * Vive aqui, e não em cada consumidor, porque dois lugares que imprimem por
 * conta própria divergem no primeiro check que ganha uma quarta categoria.
 */
export function linhasDoRelato(r: CheckResult): string[] {
  return [...r.errors, ...(r.advisories ?? []), ...(r.skipped ? [`(skipped: ${r.reason})`] : [])];
}
