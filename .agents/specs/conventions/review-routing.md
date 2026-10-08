---
name: review-routing
version: 1.6
updated: 2026-10-08
maintainer: review-router
description: "Matriz de roteamento de revisores consultada pelo review-router — v1.5 (audit specialists) + v1.5 da main (UX) mergidas em v1.6."
---

# Convenção: review-routing (matriz de roteamento de revisores)

> Fonte da verdade que o `review-router` consulta para decidir quais
> reviewers despachar após cada task. Edite aqui quando:
> - Novo specialist agent for criado em `.agents/agents/`
> - Nova classe de arquivos surgir (ex: novo app `apps/landing/`)
> - Regra de skip precisar ajuste

## 1. PATH GLOBS

```yaml
path_globs:
  - pattern: "apps/api/**/domain/**"
    reviewers: [nestjs-specialist, stack-code-reviewer]
    stacks: [ddd-hexagonal]
  - pattern: "apps/api/**/application/**"
    reviewers: [nestjs-specialist, stack-code-reviewer]
    stacks: [ddd-hexagonal]
  - pattern: "apps/api/**/infrastructure/**"
    reviewers: [nestjs-specialist, stack-code-reviewer]
    stacks: [nestjs]

  - pattern: "apps/api/**/*.controller.ts"
    reviewers: [nestjs-specialist, stack-code-reviewer]

  - pattern: "apps/api/prisma/**"
    reviewers: [nestjs-specialist, stack-code-reviewer, doc-sync]
    stacks: [prisma]

  - pattern: "apps/web/app/**"
    reviewers: [nextjs-specialist, stack-code-reviewer, ux-design-specialist]

  - pattern: "apps/web/components/**"
    reviewers: [nextjs-specialist, ux-design-specialist]

  - pattern: "apps/web/app/globals.css"
    reviewers: [ux-design-specialist]

  - pattern: "packages/**"
    reviewers: [monorepo-specialist, stack-code-reviewer]

  - pattern: "pnpm-workspace.yaml"
    reviewers: [monorepo-specialist]
    blocking: true

  - pattern: "turbo.json"
    reviewers: [monorepo-specialist]
    blocking: true

  - pattern: "tsconfig*.json"
    reviewers: [monorepo-specialist]

  - pattern: ".agents/agents/**"
    reviewers: [agent-architect, doc-sync]
    domain: "agents-meta"

  - pattern: ".agents/skills/**"
    reviewers: [agent-architect, doc-sync]

  - pattern: ".agents/workflows/**"
    reviewers: [agent-architect]

  - pattern: ".agents/specs/**"
    reviewers: [doc-sync]
    domain: "agents-specs"

  - pattern: ".agents/memory/**"
    reviewers: [agent-architect]

  - pattern: "docs/**"
    reviewers: [doc-sync, doc-writer]

  - pattern: "docs/adr/**"
    reviewers: [doc-writer]

  - pattern: ".tooling/scripts/ci/**"
    reviewers: [monorepo-specialist]
    blocking: true

  - pattern: "tooling/scripts/**"
    reviewers: [monorepo-specialist]

  - pattern: ".github/workflows/**"
    reviewers: [monorepo-specialist, security-auditor]

  - pattern: "**/auth/**"
    reviewers: [security-auditor, nestjs-specialist]

  - pattern: "**/*.test.ts"
    reviewers: [test-writer]
  - pattern: "**/*.spec.ts"
    reviewers: [test-writer]

  # pt-BR: OpenTelemetry (T6.2 — v1.4). Paths canônicos do rollout telemetria.
  - pattern: "apps/api/**/telemetry/**"
    reviewers: [telemetry-specialist]
  - pattern: "apps/web/**/instrumentation*"
    reviewers: [telemetry-specialist]
  - pattern: "infra/otelcol/**"
    reviewers: [telemetry-specialist]
```

## 2. COMMIT TYPES (Conventional Commits)

```yaml
commit_types:
  feat:
    reviewers_added: [stack-code-reviewer]
  fix:
    reviewers_added: []
  refactor:
    reviewers_added: [stack-code-reviewer]
  perf:
    reviewers_added: []
  docs:
    reviewers_added: [doc-sync]
  chore:
    reviewers_added: []
  ci:
    reviewers_added: [monorepo-specialist]
  test:
    reviewers_added: [test-writer]
```

## 3. DIFF PATTERNS (regex)

```yaml
diff_patterns:
  - regex: "@(Injectable|Controller|Module|Get|Post|Put|Delete|Patch)\\("
    reviewers_added: [nestjs-specialist]
  - regex: "class-validator|@IsEmail|@IsUUID|@IsNotEmpty"
    reviewers_added: [nestjs-specialist]
  - regex: "'use client'|useEffect|useState"
    reviewers_added: [nextjs-specialist]
  - regex: "next/image|next/font"
    reviewers_added: [nextjs-specialist]
  - regex: "bcrypt\\.hash(?:Sync)?\\(|bcrypt\\.compare(?:Sync)?\\(|argon2\\.hash(?:Sync)?\\(|argon2\\.verify\\(|jwt\\.(?:sign|verify|decode)\\("
    reviewers_added: [security-auditor]
    blocking: true
  - regex: "process\\.env\\.|secrets?\\.|credentials?\\."
    reviewers_added: [security-auditor]
    blocking: true
  - regex: "\\$queryRaw|\\$executeRaw"
    reviewers_added: [security-auditor]
  - regex: "workspace:\\*"
    reviewers_added: [monorepo-specialist]
  - regex: "@Trace\\(|@Span\\(|SpanKind\\.|context\\.with\\(|\\.setAttribute\\("
    reviewers_added: [telemetry-specialist]

  # v1.5 da main — UX/design (PR #59)
  - regex: "className=|aria-|role=\"|<label|@Input\\(|\\bvariant=|\\bsize="
    reviewers_added: [ux-design-specialist]

  # v1.6 (meu) — diff_patterns para 4 specialists de auditoria
  - regex: "prisma\\.\\w+\\.(findMany|findFirst|findUnique|createMany|updateMany|deleteMany)"
    reviewers_added: [prisma-db-specialist]
  - regex: "@ApiTags|@ApiOperation|@ApiResponse|@ApiProperty"
    reviewers_added: [openapi-contract-specialist]
  - regex: "USER\\s+root|^USER\\s*$|privileged:\\s*true|--read-only|--cap-drop|--security-opt"
    reviewers_added: [docker-prod-specialist]
  - regex: "^!:\\s|\\nBREAKING CHANGE:"
    reviewers_added: [release-versioning-specialist]
  - regex: "\\*\\*[Vv]ers(?:ão|ao)[^:]*:\\*\\*\\s*v?[0-9]+\\.[0-9]+\\.[0-9]+"
    reviewers_added: [release-versioning-specialist]
```

## 4. SKIP HEURISTICS

```yaml
skip_rules:
  spec-compliance-reviewer:
    skip_if:
      - "task.scope == 'trivial' AND files_changed <= 1"
      - "commit_type == 'chore' AND task.scope != 'large'"
  code-quality-reviewer:
    skip_if:
      - "all_changed_paths endsWith .md OR .txt"
      - "task.scope == 'docs'"

always_on:
  - spec-compliance-reviewer
  - code-quality-reviewer
```

## 5. Exemplos de Uso

> Ilustram como o classificador headless + skip rules resolvem
> o conjunto de reviewers despachados em cenários típicos.

### Cenário A: chore em package de tooling (1 arquivo)

```text
paths:  [tooling/scripts/package.json]
commits: ["chore(tooling): bump v0.1.0 → v0.1.1"]
scope:  trivial
files:  1
```

Resultado esperado:

- `spec-compliance-reviewer` SKIPPED — `commit_type == 'chore' AND task.scope != 'large'` (skip rule 2)
- `code-quality-reviewer` DISPATCHED (path `package.json` não termina em `.md`/`.txt`, scope não é `docs`)
- Nenhum domain reviewer — nenhum path_glob match
- Nenhum diff_pattern match — bump de versão não toca código

### Cenário B: doc-only update (1 arquivo .md)

```text
paths:  [.agents/specs/conventions/review-routing.md]
commits: ["docs(agents): adicionar exemplos de uso"]
scope:  docs
files:  1
```

Resultado esperado:

- `spec-compliance-reviewer` DISPATCHED — `commit_type == 'docs'` (não casa nenhuma skip rule)
- `code-quality-reviewer` SKIPPED — `all_changed_paths endsWith .md` (skip rule 1)
- `doc-sync` DISPATCHED — `path_glob .agents/specs/**` + `commit_type docs`

> Os cenários que envolvem **vários** commits ou **vários** paths vivem no
> apêndice [`review-routing-examples.md`](./review-routing-examples.md)
> (cenários D e E). Aqui ficam só os de 1 commit / 1 path, que são os que
> cabem no exemplo curto. A extração do cenário C (v1.6) foi o que abriu
> espaço para as rotas de `tooling/` que a task 3.2 do plano
> [`guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md)
> precisou corrigir.


---

> **Histórico de gaps conhecidos (v1.2 e v1.3)** migrado para o apêndice
> [`review-routing-gaps-historical.md`](./review-routing-gaps-historical.md)
> (apenas leitura) para preservar o limite de 300 linhas deste spec.

## 7. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| 1.6 | 2026-10-08 | Resolve conflito: mergeia v1.5 (mine, audit specialists diff_patterns) + v1.5 da main (ux-design-specialist). Mantém ambos. Aditivo. |
| 1.5 | 2026-10-06 | Adicionar `ux-design-specialist` (UX/design de interface). 1 path_glob novo (`apps/web/app/globals.css`) + 1 diff_pattern novo. Aditivo. |
| 1.1 | 2026-09-22 | Adicionar exemplos de uso (Seção 5) + Seção 6 "Gaps Conhecidos" priorizando 2 P1 + 2 P2 para v1.2; bump version frontmatter `1` → `1.1` |
| 1.2 | 2026-09-22 | 2 P1 gaps resolvidos: propagação de `blocking` em path_globs (`e4c0971`) + narrowing do regex de segurança (`f496b05`). (Seção 6) |
| 1.3 | 2026-09-22 | 3 P2 gaps resolvidos: PR #20 (enrich `domains[]`), PR #21 (lint WARNING em `blocking`), PR #22 (cenários migrados para apêndice). Zero breaking change. (Seção 6) |
| 1.4 | 2026-09-23 | Adicionar diff_pattern OpenTelemetry + 3 path_globs (`apps/api/**/telemetry/**`, `apps/web/**/instrumentation*`, `infra/otelcol/**`) roteando para `telemetry-specialist`. Cobre NestJS decorators, OTel enums, context API e span API. Acionado por T6.2. Aditivo. |
| 1.5 | 2026-10-06 | Adicionar `ux-design-specialist` (UX/design de interface). 1 path_glob novo (`apps/web/app/globals.css`) + 1 diff_pattern novo. Aditivo. |
