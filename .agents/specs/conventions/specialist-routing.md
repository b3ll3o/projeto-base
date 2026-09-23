---
name: specialist-routing
version: 1.1
updated: 2026-09-23
maintainer: specialist-router
description: "Matriz canônica de roteamento de demanda — mapeia paths/keywords/scopes para 8 specialists. Source of truth para o classificador headless (tooling/scripts/specialist-router.ts) e para o lint da matriz. Atualizada por PR."
---

# Convenção: specialist-routing (matriz de roteamento de specialists)

> Fonte da verdade que o `specialist-router` consulta para classificar
> uma demanda (texto + paths + scope) e despachar os specialists
> apropriados. Edite aqui quando:
> - Novo specialist agent for criado em `.agents/agents/`
> - Nova classe de arquivos surgir (ex: novo app `apps/landing/`)
> - Regra de skip precisar ajuste
> - Demand keyword/escopo novo for identificado (≥ 3 demandas)

## 1. PATH GLOBS

```yaml
path_globs:
  - pattern: "apps/api/**"
    specialists: [nestjs-specialist]
    rationale: "Backend NestJS (controllers, use cases, Prisma, infra)"

  - pattern: "apps/api/**/domain/**"
    specialists: [nestjs-specialist]
    stacks: [ddd-hexagonal]
    rationale: "Pureza DDD é crítica em domain/"

  - pattern: "apps/api/**/application/**"
    specialists: [nestjs-specialist]
    stacks: [ddd-hexagonal]

  - pattern: "apps/api/**/infrastructure/**"
    specialists: [nestjs-specialist]

  - pattern: "**/prisma/**"
    specialists: [nestjs-specialist]
    rationale: "Schema, migrations, seed"

  - pattern: "**/auth/**"
    specialists: [security-auditor]
    rationale: "Auth code (guards, strategies, JWT handlers)"

  - pattern: "**/secrets/**"
    specialists: [security-auditor]
    rationale: "Secrets/credentials storage"

  - pattern: "**/.env*"
    specialists: [security-auditor]
    rationale: "Environment files (may contain secrets)"

  - pattern: "apps/web/**"
    specialists: [nextjs-specialist]
    rationale: "Frontend Next.js (app/, components/, lib/, styles/)"

  - pattern: "apps/web/components/**"
    specialists: [nextjs-specialist]

  - pattern: "packages/**"
    specialists: [monorepo-specialist]

  - pattern: "pnpm-workspace.yaml"
    specialists: [monorepo-specialist]
    blocking: true

  - pattern: "turbo.json"
    specialists: [monorepo-specialist]
    blocking: true

  - pattern: "tsconfig*.json"
    specialists: [monorepo-specialist]

  - pattern: "**/Dockerfile*"
    specialists: [docker-specialist]
    rationale: "Dockerfile multi-stage dev+prod"

  - pattern: "**/docker-compose*.yml"
    specialists: [docker-specialist]
    rationale: "Compose stacks + override files"

  - pattern: "**/.dockerignore"
    specialists: [docker-specialist]

  - pattern: ".github/workflows/**"
    specialists: [monorepo-specialist, security-auditor]

  - pattern: "**/.agents/**"
    specialists: [refactorer, doc-writer]
    domain: "agents-meta"

  - pattern: "tooling/scripts/**"
    specialists: [refactorer]
    rationale: "Scripts TS puros (classifiers, linters, helpers)"

  - pattern: "docs/**"
    specialists: [doc-writer]

  - pattern: "docs/adr/**"
    specialists: [doc-writer]

  - pattern: "**/*.md"
    specialists: [doc-writer]
    rationale: "Markdown files anywhere in repo (docs, agents, specs)"

  - pattern: "**/*.spec.ts"
    specialists: [test-writer]

  - pattern: "**/*.test.ts"
    specialists: [test-writer]
```

## 2. DEMAND KEYWORDS

```yaml
demand_keywords:
  - regex: "(?i)docker(izar|ize)?|container(iza[çc][ãa]o)?|compose"
    specialists: [docker-specialist]
    rationale: "Demanda sobre containerização"

  - regex: "(?i)monorepo|workspace|\\bturbo\\b|pnpm.?workspace"
    specialists: [monorepo-specialist]
    rationale: "Mudança estrutural no monorepo"

  - regex: "(?i)nestjs|fastify|prisma|controller|module"
    specialists: [nestjs-specialist]
    rationale: "Demanda backend NestJS"

  - regex: "(?i)next\\.?js|nextjs|react|tailwind|rsc|server.?component"
    specialists: [nextjs-specialist]
    rationale: "Demanda frontend Next.js"

  - regex: "(?i)seguran[çc]a|vulnerab|owasp|secrets?|cve|exploit|\\bauth\\b|\\bjwt\\b"
    specialists: [security-auditor]
    rationale: "Demanda de auditoria/segurança"

  - regex: "(?i)refactor|simplificar|simplify|dry|limpar|cleanup"
    specialists: [refactorer]
    rationale: "Demanda de refactor"

  - regex: "(?i)\\btest(es)?\\b|tdd|cobertura|coverage|\\bspec\\b"
    specialists: [test-writer]
    rationale: "Demanda sobre testes"

  - regex: "(?i)\\bdoc(umenta[çc][ãa]o)?\\b|readme|adr|spec(ification)?"
    specialists: [doc-writer]
    rationale: "Demanda sobre documentação"
```

## 3. DEMAND SCOPES

```yaml
demand_scopes:
  feat:
    specialists_added: [test-writer, doc-writer]
    rationale: "Nova feature exige cobertura de testes + docs atualizadas"

  fix:
    specialists_added: [test-writer]
    rationale: "Bug fix deve vir com regression test"

  refactor:
    specialists_added: [refactorer]
    rationale: "Refactor confirmado pelo scope"

  infra:
    specialists_added: [docker-specialist, monorepo-specialist]
    rationale: "Infra tipicamente toca docker + config monorepo"

  security:
    specialists_added: [security-auditor]
    rationale: "Scope security sempre dispara auditoria"

  docs:
    specialists_added: [doc-writer]
    rationale: "Scope docs"

  test:
    specialists_added: [test-writer]
    rationale: "Scope test"

  perf:
    specialists_added: []
    rationale: "P3 — perf-specialist não existe em v1.0; v1.1 deve incluir"
```

## 4. SKIP HEURISTICS

```yaml
skip_rules:
  nestjs-specialist:
    skip_if: "todos os paths estão em apps/web/** E nenhum path em apps/api/** E nenhum keyword nestjs|fastify|prisma|controller|module match"
    rationale: "Demanda puramente frontend não precisa de nestjs-specialist"

  nextjs-specialist:
    skip_if: "todos os paths estão em apps/api/** E nenhum path em apps/web/** E nenhum keyword nextjs|react|tailwind|rsc match"
    rationale: "Demanda puramente backend não precisa de nextjs-specialist"

  docker-specialist:
    skip_if: "scope != infra E nenhum keyword docker|container|compose match E nenhum path **/Dockerfile*|**/docker-compose*|**/.dockerignore"
    rationale: "Demanda sem menção a containerização não precisa de docker-specialist"

  security-auditor:
    skip_if: "scope != security E nenhum keyword segurança|vulnerab|owasp|secrets|cve|exploit|auth|jwt match"
    rationale: "Auditoria só dispara quando demanda explicitamente toca segurança"

  refactorer:
    skip_if: "nenhum path em tooling/scripts/** nem .agents/** E nenhum keyword refactor|simplificar|dry|limpar match E scope != refactor"
    rationale: "Refactorer só quando paths ou keywords sinalizam refactor"

always_on:
  - monorepo-specialist
```

## 5. EXEMPLOS

> Veja [specialist-routing-examples.md](./specialist-routing-examples.md)
> para os 3 cenários E2E (D: docker+monorepo, E: security+test,
> F: refactor simples) com demands, paths, scopes, expected output
> e justificativas.

## 6. GAPS CONHECIDOS (v1.0)

> pt-BR: gaps remanescentes do lançamento v1.0; avaliados em B22 e
> considerados fora do escopo do polish (P3 todos). Mantidos para
> rastreabilidade até v1.2/v2.0.

| # | Severidade | Gap | Mitigação |
|---|------------|-----|-----------|
| G1 | P3 | `docker-specialist` referenciado na matriz mas agent definition só será criado na Task 9. Mitigação: lint da matriz (Task 5) deve permitir a referência enquanto agent não existe, OU criar agent placeholder antes da Task 4 | Aceito em v1.0; lint permite ref pendente |
| G2 | P3 | `perf` scope não adiciona nenhum specialist (sem `perf-specialist` em v1.0) | v1.1 deve incluir perf-specialist OU adicionar keyword/scope para `nestjs-specialist` + `nextjs-specialist` quando paths estão em apps/api ou apps/web |
| G3 | P3 | Demand keywords regex é ingênuo (não semântico) — pode dar FP em demandas com "docker" como adjetivo ("docker hub" sem ser containerização real) | Adicionar `scope_filter: infra` para keywords docker; refinar após 5 demandas reais |
| G4 | P3 | Skip rules são textuais (não programáticas) — futuro v2 pode parsear YAML para skip_if estruturado | Aceito em v1.0; alinhado com review-router (também usa strings textuais) |
| G5 | P3 | `blocking` em path_globs v1.0 só aplicado a `pnpm-workspace.yaml` e `turbo.json`; paths em `apps/api/**` e `apps/web/**` são `blocking: false` mesmo quando mudança é cross-cutting | v1.1 deve anotar blocking por path_glob baseado em criticidade (security/auth, infra monorepo, etc.) |
| G6 | P3 | **Retro B21 Gap #1:** heurística `diff_pattern: 'COPY.*--from=builder' + paths vs build context` não implementada — alto risco de FP. Sugerida após bug `COPY --from=builder /repo/pnpm-lock.yaml pnpm-workspace.yaml ./` (path relativo-Workdir, fixado em e4c4212) | Marcada para v1.2 após 5 demandas reais com dockerização. Implementação requer classificador de diff entre src paths do repo vs paths no Dockerfile (alto custo; ROI incerto) |
| G7 | P3 | **Retro B21 Gap #3:** ordem processual "skill antes de agent na matriz" não codificada na matriz. Em B21 Fase 2, agent foi criado em Task 9 e skill em Task 10 — agent despachado antes da skill existir (funcionou, mas não garante consistência futura) | Codificar como convenção operacional em `.agents/specs/conventions/evolucao-agents.md` (v1.2). Matriz não é lugar natural para regra processual |

## 7. DERIVED TAGS (v1.1)

> Tags derivadas da análise de paths que sinalizam requisitos
> técnicos implícitos (não especialistas). O classificador
> `tooling/scripts/specialist-router.ts` expoe `derived_tags` em
> `ClassifyResult` para que o controller saiba aplicar convenções
> específicas (ex: ENTRYPOINT usa `pnpm exec prisma`, compose precisa
> de healthcheck block).

```yaml
derived_tags:
  prisma_binary:
    path_match: "**/prisma/schema.prisma"
    rationale: "Prisma CLI precisa do binary engine debian-openssl-3.0.x (não alpine). ENTRYPOINT em Dockerfile prod deve usar `pnpm exec prisma` (pnpm strict layout não cria .bin/prisma)."
  compose_with_healthcheck:
    path_match: "**/docker-compose*.yml"
    rationale: "Compose services com /health endpoint devem declarar block `healthcheck:` (compose level) — Dockerfile HEALTHCHECK sozinho não é suficiente para `docker compose ps` mostrar healthy."
```

## 8. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| 1.1 | 2026-09-23 | Adiciona `derived_tags` (prisma_binary + compose_with_healthcheck). Atualiza `classify()` para retornar `derived_tags` no resultado. Atualiza skill docker com checklist healthcheck. B22 polish. |
| 1.0 | 2026-09-23 | Lançamento inicial: 8 specialists (monorepo, nestjs, nextjs, docker, security-auditor, test-writer, doc-writer, refactorer); 21 path_globs; 8 demand_keywords; 8 demand_scopes; 5 skip_rules; `monorepo-specialist` always-on. Source of truth para classificador headless e lint. |
