// tooling/scripts/review-router.ts
//
// pt-BR: Classificador headless do review-router. Recebe paths +
// commits + diff, retorna reviewers despachados baseado na matriz
// de roteamento. Implementação completa virá em Tasks 1.3-1.7.

export interface ClassifyInput {
  paths: string[];
  commits: string[];
  diff: string;
}

export interface ClassifyResult {
  domains: string[];
  reviewers: string[];
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  signal: 'path_glob' | 'commit_type' | 'diff_pattern';
  pattern: string;
  reviewers_added: string[];
}

export function classify(_input: ClassifyInput): ClassifyResult {
  return { domains: [], reviewers: [], evidence: [] };
}

// CLI entrypoint (placeholder — implementação completa em Task 1.7)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('CLI not yet implemented');
}
