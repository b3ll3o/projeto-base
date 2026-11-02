---
generated_at: 2026-11-02T20:53:45Z
agent: controller
demand_slug: revisao-branch-documentacao
branch_at_snapshot: docs/melhoria-documentacao-aplicacao
main_sha: 194d305b88b176139379330baf07b622d3939910
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files:
  - ".agents/runs/20261029T221802Z-*.txt (artefato de execução)"
  - ".tooling/scripts/ci/check-doc-claims.ts + .spec.ts + doc-claims.json (NOVO)"
  - ".tooling/scripts/ci/check-doc-{coverage,size,path-alias}.ts + .spec.ts (modificado)"
  - "docs/superpowers/plans/2026-10-29-correcoes-review-pr129.md (plano da onda anterior)"
last_commit:
  sha: b46287c17785ec20a7d0c25a85892ff8d0e5b57
  author: CEO Agent
  message: "fix(ci): o runner deixa de ser `ubuntu-latest`, que se moveu debaixo dos pés"
  conventional: true
schema_drift_prisma: not_applicable
coverage_aggregate_lines: 0
coverage_threshold_met: unknown
preflight_checks: all_passed
preflight_skipped:
  - "check-memory-crystallization (corpus de memória vive em $HOME, fora do repo)"
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
written_at: 2026-11-02T20:53:45Z
proceed: true
proceed_rationale: "A demanda é a revisão da PRÓPRIA branch (10 commits + trabalho staged). Os gates passam e a revisão do PR #129 já foi endereçada no plano anterior; o que falta é auditar o resultado. Nenhum gap bloqueante — os achados desta rodada são de severidade major/minor e nenhum exige decisão de política antes de planejar."
gaps_detectados:
  - id: G-101
    categoria: "Gate mede um objeto diferente do comando que cita"
    severity: major
    file: ".tooling/scripts/ci/check-doc-claims.ts:130-141"
    rationale: "A derivação `contar-decoradores-http` com `arquivos` apontando para um DIRETÓRIO lê todos os `.ts` do diretório (inclusive `*.spec.ts`), enquanto o comando que o doc cita usa o glob `*.controller.ts`. MEDIDO 2026-11-02: plantar `apps/api/src/modules/tenancy/infrastructure/http/PLANT-sonda.controller.spec.ts` com um `@Get()` faz o gate acusar `docs/api/tenancy.md` ('afirma 5 e o código produz 6') — mas o comando do doc ainda devolve 5, ou seja, o DOC ESTÁ CORRETO e a mensagem manda corrigir o doc."
    source: "Revisão da branch, 2026-11-02"
    status: open
  - id: G-102
    categoria: "Claim envelhecido no mesmo commit que o cria"
    severity: major
    file: ".agents/specs/conventions/documentacao.md:191"
    rationale: "A §6 afirma `wc -l .agents/specs/conventions/ci-defense-in-depth-pendencias.md` → 230 linhas. MEDIDO 2026-11-02: 290. A branch adicionou 60 linhas ao MESMO arquivo que mede (333 → 290) — o número foi medido antes da adição. O gate novo NÃO cobre este doc (formato 3), então o drift é silencioso: a classe exata que a branch diz que mata."
    source: "Revisão da branch, 2026-11-02"
    status: open
  - id: G-103
    categoria: "A convenção não declara o comportamento quando a convenção falta"
    severity: minor
    file: ".agents/specs/conventions/documentacao.md:148-168"
    rationale: "A §5 descreve a leitura da tabela de exceções, mas não diz o que o gate faz quando a PRÓPRIA convenção está ausente. A implementação devolve ERRO ('sem ele este check é teatro'); o plano da onda anterior (T3) dizia `skipped` COM MOTIVO. O spec documenta o erro — a CONVENÇÃO é que não."
    source: "Revisão da branch, 2026-11-02"
    status: open
  - id: G-104
    categoria: "Contagem stale no binding .claude"
    severity: minor
    file: ".claude/README.md:262-267"
    rationale: "Os comentários do bloco de Verificação dizem 'skills: 15' e 'agents: 2'. MEDIDO 2026-11-02: `ls .claude/skills | wc -l` → 16 e `ls .claude/agents | wc -l` → 3. A branch atualizou o mapa (16 de 24, 3 de 28) e o §'Só 3 de 28 agents', mas não os comentários do bloco de Verificação."
    source: "Revisão da branch, 2026-11-02"
    status: open
gap_blocker: false
---
