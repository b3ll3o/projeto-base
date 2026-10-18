---
generated_at: 2026-10-17T03:25:00Z
agent: specialist-router
demand_slug: "atribuir-perfil-por-empresa"
branch_at_snapshot: feat/multi-tenant
main_sha: 32b285f7
template_version_tag: v1.6.0
working_tree: dirty
working_tree_files:
  - docs/superpowers/plans/2026-10-16-multi-tenant-plan.md   # 2 linhas da Fase 6 corrigidas (defasadas)
last_commit:
  sha: a47400d
  author: CEO Agent
  message: "feat(tenancy): entrada na empresa por convite com conta nova, e os 409 que o P2002 virava 500 (Fase 5)"
  conventional: true
schema_drift_prisma: applied
coverage_aggregate_lines: 86.42
coverage_aggregate_branches: 92.37
coverage_aggregate_funcs: 86.3
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
written_at: 2026-10-17T03:25:00Z
preflight_skipped: []
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "O gap é blocker de requisito central, e não de robustez. A leitura por empresa já existe (Fase 4) e está verificada; falta a ESCRITA. Sem ela, uma empresa recém-aberta tem exatamente um membro com perfil — o próprio dono — e qualquer pessoa convidada entra com `profile_id` NULL, que a Fase 4 resolve para zero permissões. A conta existe, mas não pode fazer nada. O pedido do usuário ('perfil diferente em cada empresa') fica pela metade até existir um caminho que atribua."

gaps_detectados:
  - id: G-001
    categoria: "Escrita de perfil por empresa ausente"
    severity: blocker
    file: "apps/api/src/modules/tenancy/domain/ports/tenant-membership-repository.port.ts"
    rationale: "MEDIDO: o port oferece `findProfileId` e `findRole` (leitura) e NENHUMA escrita. `grep -rn 'tenantMembership.update|create|upsert'` fora de spec devolve só as duas escritas de onboarding, que gravam o admin da própria empresa ou NULL. O comentário que a Fase 4 deixou em `profiles.use-cases.ts:587` diz 'Atribuir perfil POR EMPRESA é escrita nova, e é da Fase 6' — a própria linha que declara o gap."
    source: "Stream B — medição direta no disco (grep) nesta demanda"
    status: open

  - id: G-002
    categoria: "Pre-condição P2 do plano virou live"
    severity: blocker
    file: "apps/api/src/modules/profiles/application/profiles.use-cases.ts"
    rationale: "O plano condiciona P1/P2/P3 a 'no dia em que existir tenantMembership.create'. A Fase 5 criou esse método, então as três deixaram de ser condicionais. MEDIDO P2: `PUT /admin/users/:id/profile` -> `atribuirProfileAoUser` -> `user.atribuirPerfil`, que escreve a coluna GLOBAL `users.profile_id`. A leitura da Fase 4 resolve pela membership, então a rota responde 200 sem ter mudado nada que a leitura consulte."
    source: "Stream B — medição direta no disco"
    status: open

  - id: G-003
    categoria: "Invalidação de cache não é por empresa"
    severity: high
    file: "apps/api/src/shared/infrastructure/security/user-profile-cache.service.ts"
    rationale: "MEDIDO na Fase 3: a chave do cache é `(tenantId, userId)`. Qualquer escrita de perfil por empresa precisa invalidar por empresa, senão a troca de perfil fica invisível por até 5s só naquela empresa."
    source: "Stream B — leitura do serviço de cache"
    status: open

  - id: G-004
    categoria: "Auditoria não distingue empresa"
    severity: medium
    file: "apps/api/src/shared/audit/infrastructure/prisma-audit.service.ts"
    rationale: "MEDIDO: `grep -rn tenantId apps/api/src/shared/audit/` = 0. O snapshot de `UserHistory`/`UserArchive` é `toUserOutput(user)`, cujo `profileId` passou a ser NULL para toda conta criada pelo onboarding (Fase 5 grava `profileId: null` de propósito). Ou seja: o histórico registra 'sem perfil' para todo mundo, e não em qual empresa. NÃO é vazamento nem quebra — é perda de fidelidade. Correção exige um construtor de snapshot separado de `UserOutput`, porque `UserOutput` é o corpo de `GET /users` e incluir memberships ali vazaria as outras empresas."
    source: "Stream B — medição direta no disco"
    status: open

  - id: G-005
    categoria: "Linhas do plano desmentidas pela medição"
    severity: info
    file: "docs/superpowers/plans/2026-10-16-multi-tenant-plan.md"
    rationale: "Das 6 linhas da tabela da Fase 6, 4 eram falsas e foram corrigidas: `prisma/seed.ts` e `test/testcontainers-helper.ts` já estavam treated na Fase 2; `apps/web/e2e/support/rbac.ts` NÃO quebra (MEDIDO: web e2e 42/42 verde, porque o perfil semeado é global e o bucket global do fallback da Fase 4 o cobre); e os cenários e2e 01–10 da API também (MEDIDO: 863/863). P3 está fechado por construção: não existe caminho HTTP que escreva `tenant_memberships.profile_id`."
    source: "Stream B — execução das suítes e leitura do plano"
    status: resolved
---

## Por que isto é Fase 6 e não Fase 5

A Fase 5 entregou a **entrada** (empresa própria ou convite). O que falta é a
**administração depois da entrada**: quem concede perfil a quem, dentro da
empresa. Sem isso a Fase 5 produz contas que não podem fazer nada.

## O que NÃO é gap (medido, não suposto)

- P3 está **fechado por construção**: os únicos escritores de
  `tenant_memberships.profile_id` são `provisionarEmpresaPropria` e
  `consumirEEntrar`, que gravam o admin criado na própria transação ou `null`.
- RLS: medido INERTE sob a conexão superuser deste repo. Saiu do caminho crítico.
- `apps/web/e2e/support/rbac.ts`: **não quebra** (42/42 medido).