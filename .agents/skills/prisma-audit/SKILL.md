---
name: prisma-audit
version: 1.0
updated: 2026-10-08
description: "Processo determinístico de auditoria Prisma — mapeia schema/migrations/queries, valida lens DDD/H1-H6, detecta N+1, audita audit fields. Carregado por `prisma-db-specialist` quando a task é de auditoria (não criação). Use para scan periódico via `finding-orchestrator` ou revisão sob demanda."
---

# Skill: prisma-audit

> **Quem invoca:** `prisma-db-specialist` (papel, princípios, anti-padrões ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** revisão periódica automatizada (cron `weekly-findings-scan`), pré-tag, on-demand do user ("audite o schema Prisma").

## Inputs (do controller)

```yaml
task:
  description: "<auditoria schema Prisma | detecção N+1 | validação lens DDD>"

context:
  scope: "schema|migrations|queries|full"  # full = tudo
  prisma_path: "apps/api/prisma/"
  modules_path: "apps/api/src/modules/"
  migration_target: "<prev-tag-or-sha>"   # opcional; sem = desde último commit
```

## Passo 1 — Mapear estado AS-IS

```bash
# 1.1 Schema
cat apps/api/prisma/schema.prisma

# 1.2 Migrations em ordem
ls -la apps/api/prisma/migrations/

# 1.3 Onde Prisma é importado
grep -rln "@prisma/client" apps/api/src/ | head -30

# 1.4 Índices declarados
grep -E "@@index|@@unique|@@id" apps/api/prisma/schema.prisma

# 1.5 Audit fields presentes
grep -E "(createdAt|updatedAt|deletedAt)" apps/api/prisma/schema.prisma
```

## Passo 2 — Validar lens DDD/H1-H6

```bash
# H1: domain/ NÃO importa @prisma/client (boundary violation)
grep -rn "@prisma/client" apps/api/src/modules/*/domain/ 2>/dev/null \
  && echo "✗ LENS H1 VIOLADA" || echo "✓ H1 clean"

# H2: repositories em infrastructure/persistence/
find apps/api/src/modules -name "*repository.ts" -o -name "*prisma-repository.ts" \
  | grep -v "infrastructure/persistence/" \
  && echo "✗ repositórios fora de infrastructure/" || echo "✓ H2 clean"

# H3-H6: ver convenção ddd-hexagonal-validation
```

## Passo 3 — Detectar N+1 e missing indexes

```bash
# 3.1 findMany dentro de loop sem include/select
grep -rn -B 2 "findMany\|findFirst" apps/api/src/modules/ \
  | grep -B 2 "for.*of\|forEach\|for (" \
  | head -30

# 3.2 relações sem índices
grep -B 1 "@@index\|@@unique\|@@id" apps/api/prisma/schema.prisma | head -40

# 3.3 findMany sem take (risco de listagem sem paginação)
grep -rn "findMany(" apps/api/src/modules/ | grep -v "take:" | head -20
```

## Passo 4 — Validar migration safety

```bash
# 4.1 Status atual
pnpm prisma migrate status

# 4.2 Diff de schema (gera SQL que seria aplicado)
pnpm prisma migrate diff \
  --from-schema-datamodel apps/api/prisma/schema.prisma \
  --to-schema-datasource apps/api/prisma/schema.prisma --script
```

## Passo 5 — Auditar audit fields por model

```bash
# Para cada model, checar createdAt/updatedAt/deletedAt
grep -E "^model " apps/api/prisma/schema.prisma | while read m; do
  model=$(echo "$m" | awk '{print $2}')
  echo "=== $model ==="
  grep -A 30 "^model $model " apps/api/prisma/schema.prisma \
    | grep -E "(createdAt|updatedAt|deletedAt)" \
    || echo "  ✗ missing audit fields"
done
```

## Passo 6 — Persistir findings (formato canônico)

```yaml
# findings.yaml (em ~/.hermes/cron/output/findings-<ts>/ ou local)
- id: prisma-N1-001
  title: "Query N+1 em UserRepository.findAllWithRoles"
  severity: P1
  location: "apps/api/src/modules/users/infrastructure/persistence/user.prisma-repository.ts:42"
  cause: "findMany() sem include/select; cada iteração busca roles em query separada."
  impact: "Latência p95 12ms → 380ms com N=50; satura connection pool."
  evidence: "EXPLAIN mostra 51 queries; log mostra N+1 repetido."
  fix: "prisma.user.findMany({ include: { roles: true } }) ou dataloader."
  breaking_change: false
  lens_violated: []   # ex: ["H1"] se for boundary DDD
```

## Passo 7 — Devolver ao `finding-orchestrator`

Ele classifica severity final, deduplica contra issues abertas via `gh issue list --search`, e decide P0/P1 viram issue (P2 só relatório).

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `pnpm prisma migrate status` falha com "schema drift" | Migrations locais não commitadas ou schema sem migration | `pnpm prisma migrate dev` (só dev) ou `prisma migrate deploy` (CI) |
| `grep @prisma/client` retorna vazio em modules | Modules não usam Prisma direto (correto — repository pattern) | Esperado; não reportar como finding |
| `find` retorna vazio em `*repository.ts` | Repositories nomeados fora do padrão (ex: `users.repo.ts`) | Não é finding; ajustar grep se quiser cobrir mais patterns |
| Auditoria roda em main com migrations não-deployadas | Working tree dirty | `git status` antes; abortar se houver migrations uncommitted |

## Saída

- `findings.yaml` com lista canônica (id, title, severity, location, cause, impact, evidence, fix)
- Sucesso = `findings_count` numérico; nenhuma exception; nenhum comando retornou código não-zero sem tratamento

## Referências

- Agent: `.agents/agents/prisma-db-specialist.md` (papel, coordenação, anti-padrões)
- Convenção: `.agents/specs/conventions/evolucao-agents.md`
- ADR-0001: DDD/Hexagonal + auditoria
- Prisma docs: <https://www.prisma.io/docs>
