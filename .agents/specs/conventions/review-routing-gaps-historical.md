---
name: review-routing-gaps-historical
version: 1.0
updated: 2026-10-08
maintainer: review-router
description: "Apêndice histórico de gaps conhecidos resolvidos em versões anteriores de review-routing (v1.2 e v1.3). Movido da §6 do review-routing.md para preservar o limite de 300 linhas do spec canônico. Apenas leitura — não editar."
---

# Apêndice: Histórico de Gaps Conhecidos — review-routing

> Este arquivo é histórico. A matriz canônica está em
> [review-routing.md](./review-routing.md). Este apêndice existe para
> preservar rastreabilidade dos gaps resolvidos em v1.2 e v1.3 sem
> estourar o limite de 300 linhas do spec principal.
>
> **Não edite este arquivo.** Ele é apenas leitura. Novos gaps vão
> para a §6 do `review-routing.md` e, se a §6 crescer, migram pra cá.

## Resolvidos em v1.2

### Antigo P1 #1 — `blocking: true` em path_globs não propagado

**Resolvido em v1.2** (`e4c0971`): flag `blocking: true` propaga de
`path_globs` para exit code (4 alvos: `PathGlobRule`, `PathMatch`,
`matchPathGlobs()`, `classify()`). 2 entries blocking
(`pnpm-workspace.yaml`, `turbo.json`) disparam exit 3; 3 testes TDD em
`review-router.spec.ts` (`eb0b6fd`).

### Antigo P1 #2 — FP de regex `bcrypt|argon2|hash\(|jwt\.sign|jwt\.verify`

**Resolvido em v1.2** (este commit): narrowing do regex para
call-site anchored. Novo regex:

```regex
bcrypt\.hash(?:Sync)?\(|bcrypt\.compare(?:Sync)?\(|argon2\.hash(?:Sync)?\(|argon2\.verify\(|jwt\.(?:sign|verify|decode)\(
```

Cobre: hash/hashSync/compare/compareSync (bcrypt);
hash/hashSync/verify (argon2); sign/verify/decode (jwt). Não cobre:
bare `bcrypt`/`argon2` tokens (low signal).

**Verificação no Pilot Task 1** (commit `7ddb93e`): o broad regex
produzia 10 matches no classifier scan window de 50KB e 20 matches
no diff completo (136977 bytes). Distribuição: ~14 em test fixtures,
~5 em plan/spec docs quotando o regex, ~1 na própria matrix YAML.
**Total: 0 matches em production code.**

O narrow regex tem **1 match** nesse diff: a fixture legítima em
`review-router.spec.ts` (preservado por design — production signal
sem FP).

## Resolvidos em v1.3

### Antigo P2 #3 — `domains[]` em `ClassifyResult` sempre `[]`

**Resolvido em v1.3** (PR #20): `PathGlobRule.domain?` propaga via
`matchPathGlobs()` → `classify()` dedupe em `Set<string>`. 5 testes
TDD; 2 regras anotadas em Seção 1 (`agents-specs`, `agents-meta`).
Zero breaking change.

### Antigo P2 #5 — `blocking: true` em paths ilegíveis (lint silenciava)

**Resolvido em v1.3** (PR #21): lint emite WARNING (não error — não
bloqueia exit) quando `path_globs.blocking: true` casa files
ilegíveis (no-match OU todos em `.gitignore`). +3 helpers
(`globToRegexLocal`, `getTrackedFiles`, `isPathGitignored`) + bloco
`if (rule.blocking === true)` em `lintMatrix`; +4 testes TDD. Matrix
atual (tracked) → 0 warnings.

### Antigo P2 #4 — coverage scenarios multi-commit / multi-path

**Resolvido em v1.3** (PR #22): Cenários D + E migrados para
[review-routing-examples.md](./review-routing-examples.md)
(apêndice, ~102 linhas) preservando limite de 300 linhas. Zero
breaking change — aditivo.

## Adicionado em v1.4 — diff_patterns OpenTelemetry

**Adicionado em v1.4** (T6.2): roteamento de PRs com código OTel
(`@Trace\(` / `@Span\(` decorators NestJS, `SpanKind\.`,
`context\.with\(`, `\.setAttribute\(`) e paths OTel
(`apps/api/**/telemetry/**`, `apps/web/**/instrumentation*`,
`infra/otelcol/**`) para `telemetry-specialist`. Aditivo — sem
breaking change. Verifica com lint script
(`pnpm tooling:test -- lint-review-routing`).
