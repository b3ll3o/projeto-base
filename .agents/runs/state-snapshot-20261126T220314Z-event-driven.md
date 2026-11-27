---
generated_at: 2026-11-26T22:03:14Z
agent: specialist-router
demand_slug: "aplicacao-event-driven"
branch_at_snapshot: feature/event-driven-app
main_sha: 1d75c1a24df1513edc4a72a32a5075780ffa7
template_version_tag: v1.39.0
working_tree: dirty
working_tree_files:
  - ".agents/agents/event-driven-auditor.md (novo)"
  - ".agents/memory/event-driven-auditor.md (novo)"
  - ".agents/skills/event-driven-audit/SKILL.md (novo)"
  - ".agents/specs/conventions/event-driven.md (novo)"
  - ".tooling/scripts/ci/check-event-driven.ts (novo)"
  - ".tooling/scripts/ci/check-event-driven.spec.ts (novo)"
  - ".tooling/scripts/ci/excecoes-event-driven.json (novo)"
  - "apps/api/src/modules/profiles/domain/events/profile-{created,updated,deleted}.event.ts (nome canônico)"
  - "apps/api/src/modules/profiles/domain/profile.aggregate.spec.ts (3 asserções)"
  - "registros: AGENTS.md, .agents/README.md, .agents/specs/conventions/{README,ci-defense-in-depth,ci-defense-in-depth-dentes,specialist-routing}.md, docs/fluxo-desenvolvimento.md, .husky/pre-commit, preflight{,-gates}.ts, check-audit-skills{,.spec}.ts, excecoes-de-skills-audit.json"
last_commit:
  sha: 1d75c1a24df1513edc4a72a32a5075780ffa7
  author: Leonardo Andreazzi
  message: "docs(issues): o plano das 10 issues do scan, e o encerramento das 2 que o main já corrigiu (#195)"
  conventional: true
schema_drift_prisma: none
schema_drift_prisma_evidence: "PR #189 reconciliou o schema com o banco; esta demanda NÃO toca `apps/api/prisma/` (ver `git diff --stat`)"
coverage_aggregate_lines: nao_mediado
coverage_aggregate_branches: nao_mediado
coverage_aggregate_funcs: nao_mediado
coverage_threshold_met: nao_mediado
preflight_checks: all_passed
preflight_checks_evidence: "pnpm ci:preflight — medido no fim desta demanda (ver §Saída do plano)"
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
written_at: 2026-11-26T22:03:14Z
preflight_skipped:
  - "cobertura (mede o aggregate de linhas/branches/funcs): o `ci:local` completo exige Postgres local e a e2e web; esta demanda não muda código de produção da API além do NOME de 3 eventos, e a cobertura não é o risco em jogo"
  - "health endpoint (api/web): a aplicação não sobe nesta demanda (`ci:boot` exige o Postgres local, que é pré-requisito do ambiente, não do repo)"
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "A demanda é de REGRA e INSTRUMENTO, não de migração: a regra nova mede o que existe hoje, o plano descreve a migração, e o gate fica verde porque o que ele reprova está declarado no registro. Nenhum gap bloqueia."

gaps_detectados:
  - id: G-001
    categoria: "Nenhum evento tem handler nomeado"
    severity: major
    file: "apps/api/src/modules/users/application/user-use-cases.ts"
    rationale: "Os 7 eventos de domínio são emitidos pelo aggregate e drenados pelo use case por `endsWith('.created.v1')` — nenhum consumidor nomeado. Os 3 de `profiles` não são drenados por ninguém (eventos mortos)."
    source: "Leitura do código (explorer) + o próprio gate `check-event-driven` na árvore de 2026-11-26"
    status: open
    resolved_at: ""
    resolved_by: ""
    resolucao: ""
  - id: G-002
    categoria: "Efeito colateral escrito direto pela camada application"
    severity: major
    file: "apps/api/src/modules/users/application/user-use-cases.ts"
    rationale: "`this.auditService.record(...)` no caminho de tenancy grava a auditoria FORA da transação da mutação (`TODO(#184)`), e a application escreve o efeito colateral em vez de publicar o evento."
    source: "Leitura do código + gate `check-event-driven` (ED6)"
    status: open
    resolved_at: ""
    resolved_by: ""
    resolucao: ""
  - id: G-003
    categoria: "O evento não carrega o dado que o consumidor precisa"
    severity: major
    file: "apps/api/src/shared/domain/domain-event.ts"
    rationale: "O contrato do evento é `eventName` + `occurredAt` + `aggregateId` (+ `version`): quase nenhum payload. Um handler de fora não conseguiria construir o registro de auditoria a partir do evento — o que torna a Fase 1 do plano dependente de enriquecer o payload, não só de criar o handler."
    source: "Leitura do código (explorer) — os 4 eventos de `users` e os 3 de `profiles`"
    status: open
    resolved_at: ""
    resolved_by: ""
    resolucao: ""
  - id: G-004
    categoria: "Duas formas de nome de evento convivendo"
    severity: minor
    file: "apps/api/src/modules/profiles/domain/events/profile-created.event.ts"
    rationale: "`users.user.created.v1` (prefixo derivável do caminho) convivia com `profile.created.v1`. O consumidor casa por SUFIXO (`endsWith('.created.v1')`), e um evento novo com outro nome quebra o `throw` de 'Operação desconhecida' — em runtime, com o dado já gravado."
    source: "Leitura do código (explorer)"
    status: resolved
    resolved_at: 2026-11-26T22:03:14Z
    resolved_by: "esta demanda — os 3 eventos de `profiles` passaram a `profiles.profile.*.v1`, com as 3 asserções do spec atualizadas"
    resolucao: "O gate ED1 deriva o prefixo esperado do caminho e exige `<bc>.<agregado>.<ação>.vN`; o nome legado não passaria."
  - id: G-005
    categoria: "Nenhum instrumento para a regra event-driven"
    severity: blocker
    file: ".tooling/scripts/ci/"
    rationale: "A aplicação já emitia eventos e nenhuma regra do repo era verificável: nome, emissão, consumo, efeito colateral e segredo no payload eram convenção oral."
    source: "Levantamento da demanda"
    status: resolved
    resolved_at: 2026-11-26T22:03:14Z
    resolved_by: "esta demanda — convenção `event-driven.md`, gate `check-event-driven` (com spec de 40 testes e 15 mutações medidas), agent `event-driven-auditor` e skill `event-driven-audit`"
    resolucao: "A regra tem instrumento executável, roda no preflight (camadas A e B) e no hook de commit, e a dívida que existe está no registro versionado."

gap_blocker: false
---

# State snapshot — aplicação event-driven (2026-11-26)

> Gerado pela camada 0 do pre-planner
> ([`state-aware-planning.md`](../../.agents/specs/conventions/state-aware-planning.md)).
> Alimenta a camada 1 (`specialist-router`).

## O que a medição encontrou (com o comando)

| medida | comando | resultado |
|--------|---------|-----------|
| eventos de domínio | `find apps/api/src/modules -path '*/domain/events/*.event.ts' \| wc -l` | **7** (4 em `users`, 3 em `profiles`) |
| eventos com handler nomeado | `pnpm tsx .tooling/scripts/ci/check-event-driven.ts` | **0** |
| escrita de efeito colateral na `application` | idem | **1** (`auditService.record`, caminho de tenancy) |
| módulos com evento | `ls apps/api/src/modules/*/domain/events -d` | **2** (`users`, `profiles`) |
| módulos sem evento | idem | **4** (`auth`, `tenancy`, `feature-flags`, `health`) |
| barramento / broker / outbox | `grep -rn "EventBus\|outbox\|bullmq\|kafkajs" apps/api/src apps/api/package.json` | **0** |

## A lacuna (AS-IS → TO-BE)

**AS-IS:** a aplicação tem eventos de domínio, e o evento é drenado e interpretado
pelo próprio use case (`mapEventNameToOperation`, por `endsWith`). O acoplamento
entre o que muda e o que reage é uma chamada — e o `users` guarda a auditoria
numa transação separada no caminho de tenancy.

**TO-BE:** o evento é o contrato versionado; a application publica; o handler
escreve o efeito colateral; a mutação e o registro são a mesma transação.

O caminho é o plano
[`docs/superpowers/plans/2026-11-26-event-driven.md`](../../docs/superpowers/plans/2026-11-26-event-driven.md).

## O que este snapshot NÃO mediu

- cobertura (exige `ci:local` completo com Postgres local)
- health endpoint da aplicação (exige o app no ar)
- comportamento em runtime do consume de evento (não há handler ainda — é o gap G-001)
