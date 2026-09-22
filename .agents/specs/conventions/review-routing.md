---
name: review-routing
version: 1
updated: 2026-09-22
maintainer: review-router
description: "Matriz de roteamento de revisores consultada pelo review-router"
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
    rationale: "Pureza DDD é crítica em domain/"

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
    reviewers: [nextjs-specialist, stack-code-reviewer]

  - pattern: "apps/web/components/**"
    reviewers: [nextjs-specialist]

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

  - pattern: ".agents/skills/**"
    reviewers: [agent-architect, doc-sync]

  - pattern: ".agents/workflows/**"
    reviewers: [agent-architect]

  - pattern: ".agents/specs/**"
    reviewers: [doc-sync]

  - pattern: ".agents/memory/**"
    reviewers: [agent-architect]

  - pattern: "docs/**"
    reviewers: [doc-sync, doc-writer]

  - pattern: "docs/adr/**"
    reviewers: [doc-writer]

  - pattern: "tooling/scripts/ci/**"
    reviewers: [monorepo-specialist]

  - pattern: ".github/workflows/**"
    reviewers: [monorepo-specialist, security-auditor]

  - pattern: "**/auth/**"
    reviewers: [security-auditor, nestjs-specialist]

  - pattern: "**/*.test.ts"
    reviewers: [test-writer]

  - pattern: "**/*.spec.ts"
    reviewers: [test-writer]
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
  - regex: "bcrypt|argon2|hash\\(|jwt\\.sign|jwt\\.verify"
    reviewers_added: [security-auditor]
    blocking: true
  - regex: "process\\.env\\.|secrets?\\.|credentials?\\."
    reviewers_added: [security-auditor]
    blocking: true
  - regex: "\\$queryRaw|\\$executeRaw"
    reviewers_added: [security-auditor]
  - regex: "workspace:\\*"
    reviewers_added: [monorepo-specialist]
```

## 4. SKIP HEURISTICS

```yaml
skip_rules:
  spec-compliance-reviewer:
    skip_if:
      - "task.scope == 'trivial' AND files_changed <= 1"
      - "commit_type == 'chore' AND task.scope != 'large'"
    rationale: "Spec irrelevante para housekeeping"
  code-quality-reviewer:
    skip_if:
      - "all_changed_paths endsWith .md OR .txt"
      - "task.scope == 'docs'"
    rationale: "Sem código, sem quality de código"

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

### Cenário C: feat em NestJS domain (3 arquivos)

```text
paths:  [apps/api/src/users/domain/user.ts,
         apps/api/src/users/domain/user.spec.ts,
         apps/api/src/users/application/create-user.usecase.ts]
commits: ["feat(users): adicionar entidade User com use case de criação"]
scope:  medium
```

Resultado esperado:

- `nestjs-specialist` + `stack-code-reviewer` DISPATCHED — `path_glob apps/api/**/domain/**` e `apps/api/**/application/**`
- `spec-compliance-reviewer` DISPATCHED — `commit_type feat` (não em skip list)
- `code-quality-reviewer` DISPATCHED — há `.ts` files

## 6. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| 1 | 2026-09-22 | Versão inicial |
| 1.1 | 2026-09-22 | Adicionar exemplos de uso (Seção 5) — usado como fixture no pilot run do review-router |
