---
generated_at: 2026-11-03T14:42:53Z
agent: claude-code
demand_slug: "start-local-sem-p1001"
branch_at_snapshot: main
main_sha: 027095bc547a7f4810e06d5f26fc6404a853d22e
template_version_tag: v1.17.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 027095bc547a7f4810e06d5f26fc6404a853d22e
  author: "Leonardo Andreazzi <andreazzi-leonardo@hotmail.com>"
  message: "fix(security): a RCE do next, a CSP do web, as actions por SHA — e o gate que mede (#143)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: 90.43
coverage_aggregate_branches: 93.0
coverage_aggregate_funcs: 90.73
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: ok
otel_env_vars_declared:
  - OTEL_DEPLOYMENT_ENVIRONMENT
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_EXPORTER_OTLP_PROTOCOL
  - OTEL_LOGS_EXPORTER
  - OTEL_METRICS_EXPORTER
  - OTEL_RESOURCE_ATTRIBUTES
  - OTEL_SDK
  - OTEL_SDK_DISABLED
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
  - OTEL_TRACES_EXPORTER
  - OTEL_TRACES_SAMPLER
  - OTEL_TRACES_SAMPLER_ARG
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-11-03T14:48:00Z
preflight_skipped:
  - "archive integrity (.agents/runs/archive/*.md) — skipped: archive vazio (0 arquivo .md)"
  - "drift agent↔memória — skipped: nenhum agent alterado em origin/main...HEAD"
matrix_specialist_routing_warnings: 2
matrix_specialist_routing_warnings_detail: "path_glob com blocking:true sem rationale (illegível): pnpm-workspace.yaml, turbo.json"
proceed: true
proceed_rationale: "Nenhum gap com severity blocker. O preflight passou (0 erro, 2 skipped), o schema Prisma está em dia (15 migrations aplicadas), a cobertura agregada está em 90.43% (>= 80%) e o health responde. Os gaps abertos são major/info e tratáveis dentro do próprio plano."

gaps_detectados:
  - id: G-001
    categoria: "`pnpm dev` não tem preflight de banco — o P1001 do Prisma é a primeira coisa que a pessoa vê"
    severity: major
    file: "package.json (scripts.dev) / apps/api/src/shared/infrastructure/prisma/prisma.service.ts"
    rationale: "MEDIDO: `turbo run dev` -> `tsx watch src/main.ts` -> Nest bootstrap -> Prisma onModuleInit -> PrismaClientInitializationError P1001 cru (stack de 20 linhas, sem causa nem remédio). O `tsx watch` SOBREVIVE ao crash (medido: pid 91529 vivo 15min depois do erro), então o terminal parece pendurado com a API morta. O conhecimento do remédio (o `postgres` do compose não publica porta desde o #91; precisa de container próprio) existe SÓ em README e docs/como-rodar.md §1.1."
    source: "diagnóstico ao vivo da sessão de 2026-11-03 (stack do erro + docker inspect + ss -ltnp)"
    status: open
  - id: G-002
    categoria: "README Opção B manda `docker run --name projeto-base-pg-local` — que FALHA se o container já existe"
    severity: minor
    file: "README.md (linha ~123)"
    rationale: "MEDIDO: `projeto-base-pg-local` já existe na máquina (criado em 2026-10, parado há 13h antes desta sessão). `docker run` com nome ocupado responde 'name already in use' e a pessoa fica sem saída; o runbook §1.1 tem o `docker start`, o README não."
    source: "leitura do README + docker ps -a"
    status: open
  - id: G-003
    categoria: "Porta 3000 do host ocupada pelo container `projeto-base-api` — o próximo erro depois do P1001 é EADDRINUSE"
    severity: info
    file: "docker-compose.yml (serviço api, ports 3000->3000)"
    rationale: "MEDIDO: `docker ps` mostra `projeto-base-api 0.0.0.0:3000->3000/tcp` (Up, healthy) e `ss -ltnp` confirma o host sem dono visível (docker-proxy). CONFIRMADO AO VIVO em 2026-11-03 11:51:45: com o banco no ar, `cd apps/api && timeout 30 pnpm exec tsx src/main.ts` conectou o Prisma ('Prisma conectado'), o Nest subiu ('Nest application successfully started') e MORREU em `listen EADDRINUSE: address already in use 0.0.0.0:3000`. Evidência: 20261103T144253Z-boot-eaddrinuse.txt. docs/como-rodar.md §1.6 já registra que 'ambiente 1 e 3 não podem coexistir'."
    source: "docker ps + ss -ltnp + boot ao vivo (20261103T144253Z-boot-eaddrinuse.txt) + docs/como-rodar.md §1.6"
    status: open
  - id: G-004
    categoria: "Nenhuma verificação mede que o `pnpm dev` da pessoa realmente sobe — só o `ci:boot` mede"
    severity: info
    file: ".tooling/scripts/ci/boot-local.ts"
    rationale: "MEDIDO: o `ci:boot` (pre-push) sobe a API em porta LIVRE e espera /api/v1/health com checks.database == 'ok', e o hook .husky/pre-push imprime 'docker start projeto-base-pg-local' no erro. O `pnpm dev` — o caminho que a pessoa usa — não tem NENHUMA dessas garantias, e é o único que a pessoa roda."
    source: "leitura de boot-local.ts + .husky/pre-push"
    status: open
---

# State snapshot — start-local-sem-p1001

O repositório está **saudável** no que diz respeito a gates: preflight 0 erro
(2 checks pulados por ausência de material), schema Prisma em dia (15
migrations aplicadas, `prisma migrate status` → "Database schema is up to
date!"), cobertura agregada em **90.43%** (ponderada api+web; api 88.08% /
web 98.47% de statements) acima do limiar de 80%, matriz de roteamento
passando (2 avisos de rationale). A tag do template é v1.17.0 e o HEAD é
`027095b` (#143).

O problema que motivou a demanda **não é um bug do código de aplicação**: é
uma lacuna de ** ergonomia de start**. O `pnpm dev` não tem nenhum preflight,
então o primeiro contato com a aplicação é o erro cru do Prisma (`P1001`),
cuja causa — o `postgres` do Compose não publica porta no host desde o #91 —
só está escrita no README e no runbook §1.1. E o `tsx watch` **sobrevive ao
crash** (medido: o processo ficou vivo depois do erro), o que faz o terminal
parecer pendurado com a API já morta.

## Comandos executados

Evidência bruta em `.agents/runs/20261103T144253Z-*.txt`:

- `20261103T144253Z-wt.txt` — working tree limpo no início (o único item
  listado é o próprio arquivo de evidência, artefato do `>` do comando)
- `20261103T144253Z-branch.txt` — `main`
- `20261103T144253Z-main-sha.txt` — `027095bc547a7f4810e06d5f26fc6404a853d22e`
- `20261103T144253Z-last-commit.txt` — #143
- `20261103T144253Z-template-tag.txt` — `v1.17.0`
- `20261103T144253Z-deps.txt` — deps de api/web/tooling (`jq` não existe nesta
  máquina; extraído com `node -e`, 45 linhas)
- `20261103T144253Z-prisma-migrate.txt` — "Database schema is up to date!"
- `20261103T144253Z-coverage.txt` — aggregate ponderado 90.43%
- `20261103T144253Z-preflight.txt` — 0 erro(s), 2 check(s) skipped
- `20261103T144253Z-health.json` — `{"status":"ok","checks":{"database":"ok"}}`
- `20261103T144253Z-otel-vars.txt` — 13 chaves `OTEL_*` (só nomes, sem valores)
- `20261103T144253Z-matrix-lint.txt` — passed, 2 warnings

Comandos de contexto (sem arquivo de evidência, por serem medição do
diagnóstico): `docker ps -a`, `docker inspect`, `ss -ltnp`, `ps aux`,
`curl /api/v1/health`, `curl :3001/api/health`.

## Gaps principais

1. **G-001 (major)** — `pnpm dev` não verifica o banco antes de subir a API;
   o P1001 cru é a primeira e única pista.
2. **G-002 (minor)** — o README manda `docker run --name projeto-base-pg-local`,
   que falha quando o container já existe (e ele já existe nesta máquina).
3. **G-003 (info)** — a 3000 do host está com o container da API; o próximo
   erro do `pnpm dev` é EADDRINUSE.
4. **G-004 (info)** — só o `ci:boot` mede que a aplicação sobe; o caminho do
   desenvolvedor não tem garantia nenhuma.

## Decisão

`proceed: true` — camada 1 (specialist-router) pode ser despachada com este
snapshot como contexto. Nenhum gap `blocker`; os gaps major/info são o
**objeto** do plano, não um bloqueio para planejá-lo.
