---
generated_at: 2026-10-29T22:55:19Z
agent: controller
demand_slug: correcoes-pr129-review
branch_at_snapshot: docs/melhoria-documentacao-aplicacao
main_sha: 194d305b88b176139379330baf07b622d3939910
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files: [".agents/runs/*-pr129.md (artefato de execução)"]
last_commit:
  sha: b46287c17785ec20a7d0c25a85892d8aa225b06f
  author: CEO Agent
  message: "fix(ci): o runner deixa de ser `ubuntu-latest`, que se moveu debaixo dos pés"
  conventional: true
schema_drift_prisma: not_applicable
coverage_aggregate_lines: 0
coverage_threshold_met: unknown
preflight_checks: all_passed
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
written_at: 2026-10-29T22:55:19Z
preflight_skipped: ["check-memory-crystallization (corpus de memória vive em $HOME, fora do repo)"]
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "A demanda é de correção sobre um PR já verde no CI. Nenhum gap bloqueante: as duas ressalvas da revisão foram reproduzidas localmente (gate cego a route group; execução avulsa sem IIFE) e as três melhorias são aditivas. A preflight desta branch passa."
gaps_detectados:
  - id: G-001
    categoria: "Gate não vê rota dentro de route group"
    severity: major
    file: ".tooling/scripts/ci/check-doc-coverage.ts:102"
    rationale: "SEGMENTOS_NAO_ROTA = /^[()@]/ pula a subárvore inteira de (grupo) e @slot. O grupo NÃO materializa segmento na URL, mas a página DENTRO dele é rota (/inicio). MEDIDO: plantar apps/web/app/(marketing)/inicio/page.tsx deixa o gate verde (ok=true, errors=0)."
    source: "Revisão do PR #129, comentário inline em check-doc-coverage.ts:102"
    status: open
  - id: G-002
    categoria: "Gate sem IIFE — execução avulsa não mede nada"
    severity: major
    file: ".tooling/scripts/ci/check-doc-coverage.ts"
    rationale: "Rodar 'pnpm exec tsx .tooling/scripts/ci/check-doc-coverage.ts' devolve exit 0 e nenhuma saída, mesmo com uma rota plantada e um doc de BC removido. O gate só roda pelo mapa RUNNERS do preflight."
    source: "Revisão do PR #129, comentário inline em check-doc-coverage.ts:243"
    status: open
  - id: G-003
    categoria: "Spec codifica a premissa errada como regressão"
    severity: major
    file: ".tooling/scripts/ci/check-doc-coverage.spec.ts:83"
    rationale: "O caso 'ignora route group (grupo) e slot paralelo (@slot)' afirma que a página dentro de (grupo) NÃO é rota — premissa FALSA no App Router. O toEqual([]) fixa a versão quebrada como se fosse a correta."
    source: "Revisão do PR #129, comentário inline em check-doc-coverage.spec.ts:83"
    status: open
  - id: G-004
    categoria: "Convenção prescreve exceção que o gate não implementa"
    severity: minor
    file: ".agents/specs/conventions/documentacao.md:148"
    rationale: "'Exceção não declarada = gate quebrado. Hoje o gate não tem exceção' é honesto, mas a regra segue sem instrumento: no primeiro caso legítimo a saída será afrouxar o gate ou apagar a exceção."
    source: "Revisão do PR #129, comentário inline em documentacao.md:148"
    status: open
  - id: G-005
    categoria: "Forma abreviada de rota lê como caminho de raiz"
    severity: minor
    file: "docs/api/users.md:27"
    rationale: "O parêntese ('GET', 'PATCH', 'DELETE', 'POST /:id/restore', 'GET /:id/history') usa forma curta com ':id' — que não é a notação do contrato ('{id}') — e lê como rota de raiz."
    source: "Revisão do PR #129, comentário inline em docs/api/users.md:27"
    status: open
gap_blocker: false
---
