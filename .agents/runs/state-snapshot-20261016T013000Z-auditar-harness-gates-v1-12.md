---
generated_at: 2026-10-16T01:30:00Z
agent: specialist-router
demand_slug: auditar-gates-harness-v1-12
branch_at_snapshot: main
main_sha: 30b9480de53c1aa881dfdc81d5b955fd311dfa8e
template_version_tag: v1.11.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 30b9480
  author: "Leonardo Andreazzi"
  message: "ci(gates): corrige turbo-redirect-differential sandbox e unifica review:lint motor (#82)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: null
coverage_aggregate_branches: null
coverage_aggregate_funcs: null
coverage_threshold_met: null
preflight_checks: 19_passed_1_failed_2_skipped
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed

# Estado do projeto no início da demanda
current_state:
  - main_sha: 30b9480 (PR #82 mergeado — auditoria de gates já fechada 1ª volta)
  - tag: v1.11.0
  - prs_abertas: 0
  - issues_abertas: 0
  - branches_remotas_vivas: ['main', 'feat/login-usuario-senha']  # WIP mantida
  - preflight: 19✓ + 1✗ (G-003 cristalização, design) + 2 skipped (archive vazio, sem agent alterado)

# Inventário de gates
preflight_gates_inventario:
  total: 21
  arquivos_unicos: 20  # eslint-drift entra 2x
  duplicatas:
    - check-eslint-drift (apps + packages)
  pendencias_abertas_declaradas: 8
  pendencias_fechadas: 7

# Áreas SEM gate explícito
areas_sem_gate:
  - OTel Collector config drift (infra/otelcol/config.yaml vs docker-compose)
  - Drift entre .agents/agents/ e matriz de routing
  - Cobertura agregada (não roda no preflight — convenção sem medição)
  - .env.example vs .env (drift de schema — convenção cita, gate não)
  - Prisma schema vs migrations (migrate status não roda no preflight)
  - Memory corpus = 0 (classe 5 — dado ausente — gate não força)
  - check-package-json-drift só varre raiz (apps/*/package.json escapa — pendência)
  - Harness "pr-refresh" só roda no CI (não roda local — pendência)
  - check-self-firing-guard: 0 → 0 ainda é verde (classe 3 — isenção inerte)
  - Workflows YAML (nenhum tooling lê .github/workflows/ — pendência)

# Gaps detectados nesta auditoria
gaps_detectados:
  - id: G-H-01
    categoria: "engines drift entre raiz e apps"
    severity: major
    file: "apps/*/package.json vs package.json raiz"
    rationale: "engines.node declarado em raiz (>=22.6.0) não é verificado em apps/*/package.json — apps podem usar Node 18 sem detecção"
    source: "Análise manual desta demanda"
    proposed_check: "check-engines-consistency.ts — varre apps/*/package.json#engines.node, exige coerência com raiz ou flag explícita"
    estimated_loc: 120
    estimated_spec_tests: 6
    references:
      - "pendência explícita: 'check-package-json-drift só varre o package.json raiz' (linha 208)"
      - "issue #48 histórico"

  - id: G-H-02
    categoria: "OTel Collector config drift"
    severity: major
    file: "infra/otelcol/config.yaml + docker-compose.yml"
    rationale: "Otel Collector config pode ter processadores/exports/pipelines fora de sync com o que docker-compose monta — o `memory_limiter` do issue #75 entrou isolado, sem gate que confirme paridade"
    source: "Análise manual desta demanda"
    proposed_check: "check-otelcol-compose-parity.ts — valida que receivers/processors/exporters declarados no config.yaml têm serviço correspondente no compose, e que digest pinning bate"
    estimated_loc: 180
    estimated_spec_tests: 8
    references:
      - "issue #68, #75 (digests + memory_limiter)"
      - "OTel Collector validado uma vez via docker run --rm; gate nenhum mantém"

  - id: G-H-03
    categoria: "drift agents vs matriz de routing"
    severity: major
    file: ".agents/agents/ + .agents/specs/conventions/specialist-routing.md"
    rationale: "check-agent-memory-drift cobre comportamento vs memória, mas NÃO cobre a existência do agent na matriz de routing. Um agent pode virar documentado sem entrar no roteador — verde em todos os gates, mas nenhum dispatch o alcança"
    source: "Análise manual desta demanda"
    proposed_check: "check-agent-routing-coverage.ts — lê .agents/agents/*.md e confere que cada um tem entrada em specialist-routing.md (ou flag explícita de 'não-routed')"
    estimated_loc: 150
    estimated_spec_tests: 7
    references:
      - "27 agents vs matriz (número medido nesta demanda)"

  - id: G-H-04
    categoria: "claim numérico que envelhece no preflight-gates.ts"
    severity: minor
    file: ".tooling/scripts/ci/preflight-gates.ts"
    rationale: "O claim '21 entradas / 20 arquivos' na pendência já é uma classe 7 que depende de `grep -cE`. Sem gate que rode este grep e afirme a contagem, qualquer pessoa que adicione um gate fica sem sinal automático"
    source: "Classe 7 de guard-classes.md, aplicada à tabela"
    proposed_check: "check-teeth-count.ts — afirma via comando que a contagem em preflight-gates.ts bate com a contagem no array PREFLIGHT_CHECKS"
    estimated_loc: 60
    estimated_spec_tests: 3
    references:
      - "pendência explícita: 'A tabela de Checks acima é completa' (linha 86)"

  - id: G-H-05
    categoria: "Cobertura agregada não roda no preflight"
    severity: major
    file: "vitest.config.ts + package.json#scripts"
    rationale: "Convenção cobertura-testes.md exige ≥80% agregado, mas o preflight não mede. Quem rodar só preflight e qualidade pode passar com cobertura 0% no agregado (a Camada 3 mede por pacote, não agregado)"
    source: "Convenção cobertura-testes.md §CI Defense in Depth"
    proposed_check: "check-coverage-aggregate.ts — roda `vitest run --coverage` (com cache) e valida que lines+branches+funcs ≥ 80% agregado"
    estimated_loc: 200
    estimated_spec_tests: 5
    risk: "CUSTO ALTO (>=15s no preflight); pode quebrar a invariante '< 15s'"
    references:
      - "estado-aware-planning §1 'Cobertura de testes agregada ≥ 80%'"
      - "medido n=3 em main: coverage não é parte do preflight"

  - id: G-H-06
    categoria: "Harness de PR refresh sem versão local"
    severity: minor
    file: "tooling/scripts/pr-refresh-gate.ts"
    rationale: "O gate do marcador pr-refresh roda SÓ no CI (pendência linha 139). Localmente, um dev com `<!--pr-refresh:live-->` errado descobre só quando abre o PR. Adicionar uma versão local que roda em ~2s (sem chamadas API) fecharia a camada 0"
    source: "Pendência explícita"
    proposed_check: "Modo dry-run do pr-refresh-gate que valida a FORMA do marcador sem ler o body da API"
    estimated_loc: 80
    estimated_spec_tests: 4
    references:
      - "pendência linha 139 (issue #45 item 4)"

  - id: G-H-07
    categoria: "self-firing-guard só detecta SE houver mutações"
    severity: major
    file: ".tooling/scripts/ci/check-self-firing-guard.ts"
    rationale: "Classe 3: o guard dispara em si mesmo quando alguém PLANEJA a isenção. Mas se a isenção virar rotina e o corpus nunca mais tiver mutações reais, 0 → 0 é verde — verde por ausência, mesma forma da classe 5"
    source: "guard-classes.md §3, classe 3"
    proposed_check: "Variante: SE corpus_total == 0 E ultimo_ajuste > 30d, verde por inércia. Solução: registrar a data do último hit, e warn se > 60d sem hits (não erro — observability)"
    estimated_loc: 40
    estimated_spec_tests: 2
    references:
      - "guard-classes.md §3, classe 3 + classe 7"
      - "comentário no gate '0 → 0 aqui significa isenção inerte'"

  - id: G-H-08
    categoria: "Workflow YAML sem leitor"
    severity: major
    file: ".github/workflows/*.yml"
    rationale: "Nenhum tooling parseia ci.yml/release-template.yml/review-stack.yml. Mudanças nessas 3 files passam sem gate; mesmo padrão de PREFLIGHT_GATES antes de 4.1"
    source: "Pendência linha 38 (achado da revisão adversarial do PR)"
    proposed_check: "check-workflow-yaml.ts — parseia cada workflow, exige 'ref:' em checkout, 'fetch-depth: 0' onde aplicável, e regras de permissions consistentes com docs"
    estimated_loc: 220
    estimated_spec_tests: 9
    references:
      - "pendência linha 38: 'Nenhum tooling lê .github/workflows/ci.yml'"

  - id: G-H-09
    categoria: "Harness typecheck:tooling silencioso em falha sem diagnóstico"
    severity: minor
    file: ".tooling/scripts/ci/check-tooling-typecheck.ts"
    rationale: "Dentes já cobrem 4 de 12 com parseTscDiagnostics sempre []. O caso é: tsc falha com exit 1 MAS sem stderr (caso real medido na issue #46). O gate hoje detecta, mas se o switch do output evoluir (TSC 5.x) pode regredir silencioso"
    source: "pendência fechada de 2026-10-08"
    proposed_check: "Adicionar test que roda tsc em código propositalmente quebrado e confere que a falha é detectada MESMO quando stderr é vazio"
    estimated_loc: 30
    estimated_spec_tests: 2
    references:
      - "pendência fechada linha 104 (tooling typecheck)"
      - "tabela de dentes linha 122"

  - id: G-H-10
    categoria: "tools/scripts e .tools/scripts (drift de prefixo)"
    severity: minor
    file: "tooling/ + .tooling/ (2 diretórios irmãos)"
    rationale: "Convenção tácita: gates em .tooling/scripts/ci/, scripts de tooling em tooling/scripts/. Convenção não tem gate. Risco: alguém cria um check- em tooling/ pensando que está no lugar certo"
    source: "ci-defense-in-depth.md linha 252 'A armadilha de ler este registro por nome de arquivo'"
    proposed_check: "check-harness-location.ts — afirma que .ts em tooling/scripts/ NÃO começam com 'check-' e vice-versa"
    estimated_loc: 50
    estimated_spec_tests: 4
    references:
      - "armadilha documentada em ci-defense-in-depth.md"

# Estado do pré-flight e da cobertura
estado_preflight_atual:
  total: 21
  passados: 19
  falhas: 1  # G-003 cristalização, design
  skipped: 2
  custo_total: "~10.8s"  # medido 2026-10-05; pós-PR-82 com o diff sh não mudou materialmente

# Análise do trabalho necessário
complexidade_estimada_total:
  novos_gates: 8  # G-H-01..08 são gates novos
  melhorias: 2  # G-H-09, G-H-10 são extensões de gates existentes
  loc_estimada: ~1130
  spec_estimada: ~48 testes
  tempo_estimado_camadas: "1 PR unificado (alinhado com preferência do user em T1)"

# Plano de ataque recomendado
recomendacao:
  1_camada_especialistas:
    - monorepo-specialist: G-H-01 (engines drift), G-H-08 (workflows)
    - observability-specialist (não existe, fallback para stack-code-reviewer): G-H-02 (otelcol)
    - agents-coordinate: G-H-03 (agents vs routing), G-H-10 (location)
    - code-quality: G-H-04 (claim aging), G-H-09 (typecheck silent)
    - learning-observation: G-H-07 (self-firing inércia)
    - ci-defense-in-depth (skill local): G-H-05 (cobertura), G-H-06 (pr-refresh local)

  2_pedidos_ao_user:
    - prioridade 1: G-H-01 (engines drift — é um footgun real)
    - prioridade 2: G-H-08 (workflows — pendência declarada)
    - prioridade 3: G-H-02 (otelcol)
    - prioridade 4: G-H-03 (agents coverage)
    - prioridade 5: G-H-04 (auto-checagem do preflight)
    - prioridade 6: G-H-10 (location)
    - prioridade 7: G-H-09 (regressão typecheck)
    - prioridade 8: G-H-07 (observability do self-firing)
    - NÃO prioritários: G-H-05 (custo), G-H-06 (feature, não gap)

  3_pr_estrategia: "1 PR unificado com 8 novos gates + 2 melhorias (mesma preferência de T1)"

  4_risco_residual:
    - custo do preflight pode crescer de ~10.8s para ~13-15s (G-H-05 é o vilão, marcar como opt-in ou skip)
    - dependência entre gates (G-H-01 lê todos os package.json; G-H-08 lê YAML — adicionar parser)
    - refatorar check-types.ts para proibir `ok: true` com `errors` não-vazio (pendência linha 237 — não foi corrigido)

gap_blocker: false
---
