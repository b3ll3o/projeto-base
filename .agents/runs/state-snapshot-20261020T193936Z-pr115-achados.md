---
generated_at: 2026-10-20T19:39:36Z
agent: specialist-router
demand_slug: "pr115-achados-da-revisao"
branch_at_snapshot: feat/admin-editar-perfis
main_sha: 74dccba226b7f2a44b65832529845bfc3d73c4c3
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files:
  - "perfil-editado.png (untracked, screenshot do usuário — NÃO entra no commit)"
last_commit:
  sha: 76aa247
  author: "CEO Agent"
  message: "fix(admin): os shortcuts de erro e de lost update, na prosa da action"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: 87.12
coverage_aggregate_branches: 93.23
coverage_aggregate_funcs: 88.82
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: not_running
otel_env_vars_declared: []
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-10-20T19:41:00Z
preflight_skipped:
  - "2 check(s) do painel não rodaram — a mesma saída que o PR #115 mediu e Declarou; o painel lista os ✓/✗, não a razão do skip, então o nominal vive só no stdout do preflight."
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "Nenhum gap blocker. preflight 0 erros, schema em dia, API healthy, e o PR #115 está CI 8/8. Os 4 achados da revisão são nenhum bug de comportamento e todos têm correção declarada — nenhum deles trava o plano sobre estado quebrado."

gaps_detectados:
  - id: G-001
    categoria: "`.trim()` da description sem nenhum teste"
    severity: major
    file: "apps/web/app/admin/profiles/[slug]/page.tsx:94"
    rationale: "MEDIDO pelo revisor: removendo o `.trim()`, o spec unitário continua 3/3 verde. O e2e F15 cobre `''`, não espaços em volta — que é exatamente a metade que o comentário do código diz que o trim existe para impedir (`\" \"` invisível em todo render)."
    source: "comentário de revisão no PR #115 (id=6299589954), achado 1"
    status: open
  - id: G-002
    categoria: "Guard do seed é o único ponto do PR sem spec e sem gate"
    severity: major
    file: "apps/api/prisma/seed.ts:125-128"
    rationale: "`apps/api/prisma/` não tem um único `*.spec.ts` e o projeto `unit` do Vitest só include `src/**/*.spec.ts` + `test/config/**/*.spec.ts` — logo um spec escrito ao lado do seed NUNCA rodaria. A falha deste guard é um admin com senha pública e TODAS as permissions num banco que não é de dev, e o próprio código diz que estes são os dois únicos controles."
    source: "comentário de revisão no PR #115 (id=6299589954), achado 2"
    status: open
  - id: G-003
    categoria: "Regra de doc sem a regra que a medição provou"
    severity: minor
    file: "docs/como-rodar.md §1.7"
    rationale: "A tabela nomeia `postgres` como destino válido sem dizer que a checagem é sobre o HOSTNAME que a URL resolve — que, dentro do container, é o nome do serviço do Compose. Quem tem um Postgres remoto de dev chamado `postgres` lê a tabela e conclui que é permitido."
    source: "comentário de revisão no PR #115 (id=6299589954), achado 3"
    status: open
  - id: G-004
    categoria: "Mitigação do 400 do ProfileName vive num comentário"
    severity: none
    file: "apps/web/app/admin/profiles/[slug]/page.tsx:79-86"
    rationale: "Não é defeito — é decisão consciente e já documentada. O revisor registrou que a mitigação proposta (`useActionState` + client component) é o tipo de coisa que se perde quando o comentário é reescrito."
    source: "comentário de revisão no PR #115 (id=6299589954), achado 4"
    status: open

gap_blocker: false
---

# State snapshot — PR #115, achados da revisão

**Demanda:** os 4 achados do comentário de revisão do PR #115 (nenhum é bug de
comportamento), corrigidos pelo fluxo canônico de desenvolvimento.

## O que cada achado realmente é

| # | Severidade | Onde | Correção |
|---|---|---|---|
| 1 | major | `page.tsx:94` | 1 caso e2e que preenche espaços e afirma `''` no banco |
| 2 | major | `seed.ts:125-128` | extrair a decisão para função pura testável + spec |
| 3 | minor | `como-rodar.md §1.7` | 1 linha dizendo que a checagem é no hostname resolvido |
| 4 | none | `page.tsx:79-86` | **nenhuma** — decisão consciente já documentada |

## Medições que decidem o plano

- **`unit` do api não vê `prisma/`.** `apps/api/vitest.workspace.ts:47` →
  `include: ['src/**/*.spec.ts', 'test/config/**/*.spec.ts']`. Um spec escrito ao
  lado de `seed.ts` seria verde por ausência — o gate do achado 2 **tem** de morar
  em `src/`.
- **`prisma migrate status` não roda do host** (`P1001`: o compose não publica a
  porta do postgres). Medido dentro do container: `Database schema is up to date!`.
- **Cobertura `unit` do api antes da mudança:** 87.12% linhas / 93.23% branches /
  88.82% funcs, contra o piso de 80. Margem para o arquivo novo.
- **`preflight`: `⚠ 0 erro(s); 2 check(s) não rodaram (skipped)`** — a mesma saída
  que o corpo do PR #115 mede. `proceed: true`.
