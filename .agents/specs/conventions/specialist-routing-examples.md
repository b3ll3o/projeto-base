---
name: specialist-routing-examples
version: 1.0
updated: 2026-09-23
maintainer: specialist-router
description: "Apêndice de cenários E2E para a matriz specialist-routing v1.0"
---

# Convenção: Exemplos E2E da Matriz specialist-routing

> **Apêndice de [specialist-routing.md](./specialist-routing.md) Seção 5.**
> Contém 3 cenários end-to-end (D, E, F) cobrindo os principais padrões
> de despacho: infra multi-stack, security scoped, refactor simples.

## Cenário D — dockerizar monorepo (multi-stack, scope=feat+infra)

```text
demand: "dockerizar apps/api e apps/web com compose"
paths:  [apps/api/Dockerfile,
         apps/web/Dockerfile,
         docker-compose.yml,
         docker-compose.dev.yml]
scope:  feat,infra
```

Resultado esperado:

```yaml
specialists:
  - monorepo-specialist   # always_on
  - docker-specialist     # keyword "docker" + scope=infra + path Dockerfile* + docker-compose*
  - nestjs-specialist     # path apps/api/**
  - nextjs-specialist     # path apps/web/**
  - test-writer           # scope=feat (dockerizar = nova capacidade)
  - doc-writer            # scope=feat (dockerizar = nova capacidade, Seção 3)
blocking: false
gap_detected: false
```

Justificativa:

- **`monorepo-specialist`** — always_on (despachado em qualquer demanda, mesmo isolada)
- **`docker-specialist`** — keyword `docker|dockerizar|container|compose` na demand + scope `infra` (adiciona docker + monorepo) + paths `**/Dockerfile*` e `**/docker-compose*.yml` (múltiplos matches)
- **`nestjs-specialist`** — path `apps/api/Dockerfile` casa path_glob `apps/api/**`
- **`nextjs-specialist`** — path `apps/web/Dockerfile` casa path_glob `apps/web/**`
- **`test-writer`** — scope `feat` (interpretado de "dockerizar" = nova capacidade) adiciona `test-writer` (Seção 3)
- **`doc-writer`** — scope `feat` adiciona `doc-writer` (Seção 3 — matriz é source of truth, sem heurística implícita)
- **Skip rules aplicadas:** nenhuma (docker-specialist justificado por scope infra + keyword; security-auditor sem keyword de segurança)
- **`blocking: false`** — match com a matriz atual (paths `apps/api/**` e `apps/web/**` são `blocking: false` em v1.0); blocking inferido por criticidade da demanda é G5 (P3, v1.1)

## Cenário E — correção de segurança (scoped security+fix)

```text
demand: "auditar vulnerabilidade de SQL injection no módulo users"
paths:  [apps/api/src/modules/users/infra/persistence/user.repository.ts,
         apps/api/src/modules/users/application/queries/get-user.usecase.ts]
scope:  security,fix
```

Resultado esperado:

```yaml
specialists:
  - monorepo-specialist   # always_on
  - nestjs-specialist     # path apps/api/**
  - security-auditor      # scope=security + keyword "vulnerab"
  - test-writer           # scope=fix (auditar vulnerab = corrigir)
blocking: false
gap_detected: false
```

Justificativa:

- **`monorepo-specialist`** — always_on
- **`nestjs-specialist`** — path `apps/api/src/modules/users/**` casa path_glob `apps/api/**`; também `prisma` keyword pode casar se repository usa Prisma (repository.ts + "SQL injection")
- **`security-auditor`** — scope `security` adiciona security-auditor (sempre, Seção 3) + keyword `vulnerab|owasp|secrets` na demand text match
- **`test-writer`** — scope `fix` (auditar vulnerabilidade = corrigir) adiciona test-writer (regression test, Seção 3)
- **Skip rules aplicadas (Seção 4):**
  - `docker-specialist` SKIPPED — scope != infra + nenhum keyword docker/container/compose + nenhum path Dockerfile/compose
  - `nextjs-specialist` SKIPPED — paths todos em apps/api/** (backend puro) + nenhum keyword nextjs/react/tailwind
  - `refactorer` SKIPPED — paths não estão em tooling/scripts/** nem .agents/** + nenhum keyword refactor + scope != refactor
  - `doc-writer` SKIPPED — scope != feat (não adiciona doc-writer via scope); paths não são docs/**
- **`blocking: false`** — match com a matriz atual (paths em `apps/api/**` são `blocking: false` em v1.0); blocking inferido por criticidade é G5 (P3, v1.1)

## Cenário F — refactor simples (tooling)

```text
demand: "simplificar o helper de validação em tooling/scripts"
paths:  [tooling/scripts/lib/validation.ts]
scope:  refactor
```

Resultado esperado:

```yaml
specialists:
  - monorepo-specialist  # always_on
  - refactorer           # path tooling/scripts/** + keyword "simplificar" + scope=refactor
blocking: false
gap_detected: false
```

Justificativa:

- **`monorepo-specialist`** — always_on (mesmo em demanda isolada em tooling/)
- **`refactorer`** — path `tooling/scripts/lib/validation.ts` casa path_glob `tooling/scripts/**` + keyword `simplificar|refactor|dry|limpar` na demand + scope `refactor` adiciona refactorer
- **Skip rules aplicadas (Seção 4):**
  - `nestjs-specialist` SKIPPED — paths não estão em apps/api/** + nenhum keyword nestjs/fastify/prisma/controller/module
  - `nextjs-specialist` SKIPPED — paths não estão em apps/web/** + nenhum keyword nextjs/react/tailwind
  - `docker-specialist` SKIPPED — scope != infra + nenhum keyword docker/container/compose + nenhum path Dockerfile/compose
  - `security-auditor` SKIPPED — scope != security + nenhum keyword segurança/vulnerab/owasp/secrets
  - `test-writer` SKIPPED — scope != feat/fix/test + paths não são .spec.ts/.test.ts (é .ts em tooling/)
  - `doc-writer` SKIPPED — paths não são docs/** nem .md (é .ts em tooling/scripts) + scope != feat
- **`blocking: false`** — nenhum path com `blocking: true` (tooling/scripts/** é `blocking: false` na v1.0; demanda não toca infra crítica)

## Cross-refs

- [specialist-routing.md](./specialist-routing.md) — matriz canônica (4 seções YAML + 7 seções Markdown)
- [tooling/scripts/specialist-router.ts](../../../tooling/scripts/specialist-router.ts) — classificador headless (Task 4)
- [tooling/scripts/lint-specialist-routing.ts](../../../tooling/scripts/lint-specialist-routing.ts) — linter da matriz (Task 5)
- [2026-09-23-specialist-router-docker-design.md §5.3](../../../docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md) — design §5.3 define os 8 specialists da matriz v1.0
