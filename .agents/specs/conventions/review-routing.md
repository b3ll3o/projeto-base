---
name: review-routing
version: 1.2
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

## 6. Gaps Conhecidos (forthcoming v1.3)

(v1.2 resolveu os 2 gaps P1 abaixo; ver Seção 7 para o changelog completo)

### Resolvidos em v1.2

#### Antigo P1 #1 — `blocking: true` em path_globs não propagado

**Resolvido em v1.2** (commit `e4c0971`): propagação do flag `blocking: true`
de `path_globs` entries para a final exit code decision do classifier.
Mudanças:

- `PathGlobRule` interface: adicionado `blocking?: boolean`
- `PathMatch` interface: adicionado `blocking: boolean`
- `matchPathGlobs()`: lê `rule.blocking` e popula `PathMatch.blocking`
- `classify()`: `blocking` movido para o topo do escopo; OR entre
  path_match blocking e dp_result blocking na decisão final

Verificação:

- 2 entries com `blocking: true` em path_globs (`pnpm-workspace.yaml`,
  `turbo.json`) agora corretamente disparam exit code 3 quando seus
  paths aparecem no diff
- 3 testes TDD cobrindo o comportamento (`review-router.spec.ts`,
  commit `eb0b6fd`)

#### Antigo P1 #2 — FP de regex `bcrypt|argon2|hash\(|jwt\.sign|jwt\.verify`

**Resolvido em v1.2** (este commit): narrowing do regex para call-site
anchored. Novo regex:

```regex
bcrypt\.hash(?:Sync)?\(|bcrypt\.compare(?:Sync)?\(|argon2\.hash(?:Sync)?\(|argon2\.verify\(|jwt\.(?:sign|verify|decode)\(
```

Cobre: hash/hashSync/compare/compareSync (bcrypt); hash/hashSync/verify
(argon2); sign/verify/decode (jwt). Não cobre: bare `bcrypt`/`argon2`
tokens (low signal).

Verificação no Pilot Task 1 (commit `7ddb93e`): broad regex tinha **10
matches** (todos FP — test fixtures, plan docs, spec docs, matrix YAML,
commit message); narrow regex tem **0 matches** nesse commit.
Production signal preservado (todas as variantes security-relevant
permanecem cobertas).

### Conhecidos (forthcoming v1.3)

(lista vazia — sem gaps conhecidos atualmente)

---

## 7. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| 1 | 2026-09-22 | Versão inicial |
| 1.1 | 2026-09-22 | Adicionar exemplos de uso (Seção 5) + Seção 6 "Gaps Conhecidos" priorizando 2 P1 + 2 P2 para v1.2; bump version frontmatter `1` → `1.1` (resolvia divergência entre `version: 1` declarado e docs que já referenciavam v1.1) |
| 1.2 | 2026-09-22 | 2 P1 gaps resolvidos: propagação de `blocking` em path_globs + narrowing do regex de segurança. Classifier agora propaga corretamente a flag `blocking: true` para a exit code; regex narrow elimina FPs em test fixtures e docs. (Seção 6) |
