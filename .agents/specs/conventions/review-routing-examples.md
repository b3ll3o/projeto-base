---
name: review-routing-examples
version: 1.0
updated: 2026-09-22
maintainer: review-router
description: "Apêndice de cenários avançados (multi-commit + multi-path) para a matrix review-routing"
---

# Convenção: Exemplos Avançados da Matriz review-router

> **Apêndice de [review-routing.md](./review-routing.md) Seção 5.**
> Contém cenários multi-commit + multi-path. Adicionado em v1.3 (PR #22)
> para resolver Gap #4 (P2 coverage) da Seção 6.

## Cenário D — feat multi-commit com breaking change (3 commits mistos)

```text
paths:  [apps/api/src/users/domain/user.aggregate.ts,
         apps/api/src/users/application/create-user.usecase.ts,
         apps/api/prisma/schema.prisma]
commits: ["feat(users)!: adicionar entidade User com use case de criação",
          "feat(users): adicionar migration Prisma para tabela users",
          "test(users): cobrir caso de uso create-user"]
scope:  medium
files:  3
```

Resultado esperado:

- `nestjs-specialist` + `stack-code-reviewer` DISPATCHED — path_globs DDD match
  (`apps/api/**/domain/**` + `apps/api/**/application/**` + `apps/api/prisma/**`)
- `test-writer` DISPATCHED — commit_type test + path_glob `**/*.test.ts`
  (combinados disparam o mesmo reviewer)
- `doc-sync` DISPATCHED — path_glob `apps/api/prisma/**` adiciona
  `doc-sync` (regra de Prisma schema)
- `spec-compliance-reviewer` DISPATCHED — commit_type feat (não em skip list);
  scope=medium, files=3 → skip rule 1 (`scope == 'trivial'`) NÃO match
- `code-quality-reviewer` DISPATCHED — há `.ts` files + commits feat
  (skip rule `all_changed_paths endsWith .md` é FALSE)
- **`blocking = false`** — nenhum `path_glob` blocking (`pnpm-workspace.yaml`
  ou `turbo.json`) casa os paths deste cenário; diff_patterns também
  não têm `blocking: true` aqui (sem bcrypt/jwt/raw SQL)
- `domains = []` — a matrix Seção 1 atualmente só anota `domain:` em
  `.agents/specs/**` (→ `agents-specs`) e `.agents/agents/**` (→
  `agents-meta`); a regra `apps/api/**` poderia ser anotada com
  `domain: "nestjs-domain"` em versão futura para popular este campo
  via enrich v1.3 (PR #20)

**Nota:** `!` no `feat(users)!:` marca breaking change (campo
`breaking: true` em `ParsedCommit`) mas não afeta dispatch — só sinaliza
para versionamento semântico.

## Cenário E — chore multi-path cross-cutting (3 paths em 2 áreas)

```text
paths:  [pnpm-workspace.yaml,
         turbo.json,
         .agents/specs/conventions/review-routing.md]
commits: ["chore(monorepo): bump pnpm 9 → 10",
          "chore(agents): adicionar exemplos de uso da matriz"]
scope:  large
files:  3
```

Resultado esperado:

- `monorepo-specialist` DISPATCHED — path_globs `pnpm-workspace.yaml`
  e `turbo.json` e `tooling/scripts/ci/**` (2 matches com
  `blocking: true`); também via commit_type `ci` se algum commit tiver
  `ci:` type
- `doc-sync` DISPATCHED — path_glob `.agents/specs/**` (regra
  `.agents/specs/**` na matrix Seção 1 só lista `[doc-sync]` como
  reviewer — diferentemente de `.agents/agents/**`/`.agents/skills/**`
  que também incluem `agent-architect`) + commit_type `chore(agents)`
  borderline; classificador pode interpretar `chore(agents):` como
  docs-style quando scope toca `.agents/specs/**`
- **`blocking = true`** — path_globs `pnpm-workspace.yaml` E `turbo.json`
  ambos com `blocking: true`; v1.2 fix propagou corretamente via
  `PathMatch.blocking` → `classify()` final OR
- `spec-compliance-reviewer` DISPATCHED — scope=large NÃO match skip
  rule 2 (`commit_type == 'chore' AND task.scope != 'large'` — scope É
  `large`, então regra NÃO aplica); scope=large também não match skip
  rule 1 (`scope == 'trivial'`)
- `code-quality-reviewer` DISPATCHED — `paths[2]` é `.md` MAS
  `paths[0]` e `paths[1]` são `.yaml`/`.json` →
  `all_changed_paths endsWith .md` é FALSE (a regra verifica TODOS os
  paths, não apenas um)
- `domains = ["agents-specs"]` — só `.agents/specs/conventions/review-routing.md`
  tem `domain: "agents-specs"` na matrix Seção 1; paths em `apps/api/**`
  não têm `domain:` anotado

**Nota sobre scope=large + chore:** este é um cenário chave onde skip
rule 2 (`commit_type == 'chore' AND task.scope != 'large'`) deixa de
aplicar. Chore trivial (Cenário A) tem `scope=trivial` → skip; chore
multi-path cross-cutting com `scope=large` → dispatch. Isso reflete a
intenção de que mudanças cross-cutting merecem atenção de spec mesmo
quando housekeeping.

## Cross-refs

- [review-routing.md](./review-routing.md) — matrix canônica (3 cenários A/B/C)
- [tooling/scripts/review-router.ts](../../../tooling/scripts/review-router.ts) — classifier headless
- [tooling/scripts/review-router.spec.ts](../../../tooling/scripts/review-router.spec.ts) — 30 testes TDD
- [tooling/scripts/lint-review-routing.ts](../../../tooling/scripts/lint-review-routing.ts) — linter da matrix
