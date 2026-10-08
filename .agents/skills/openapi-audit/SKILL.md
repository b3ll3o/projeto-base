---
name: openapi-audit
version: 1.0
updated: 2026-10-08
description: "Processo determinístico de auditoria OpenAPI — re-gera spec, detecta drift DTO↔Prisma, valida cobertura de decorators Swagger, identifica breaking changes. Carregado por `openapi-contract-specialist` quando a task é de auditoria (não criação de spec). Use para scan periódico ou revisão pré-merge de contrato HTTP."
---

# Skill: openapi-audit

> **Quem invoca:** `openapi-contract-specialist` (papel, princípios, anti-padrões ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** revisão periódica (cron), PR que toca `controllers/` ou `*.dto.ts`, pré-tag.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria spec | detecção drift DTO↔Prisma | cobertura decorators>"

context:
  scope: "drift|breaking|coverage|full"
  openapi_path: "apps/api/openapi.json"
  controllers: ["apps/api/src/modules/*/controllers/"]
  dtos: ["apps/api/src/modules/*/application/dto/"]
  prisma_schema: "apps/api/prisma/schema.prisma"
  base_branch: "main"   # para diff de breaking changes
```

## Passo 1 — Re-gerar spec e diff

```bash
cd apps/api
pnpm openapi:export   # gera apps/api/openapi.json (pode falhar se faltar script)
git diff apps/api/openapi.json | head -100
```

Se `openapi.json` não existe no repo (gerado on-demand): rodar e commitar antes de auditar.

## Passo 2 — Detectar drift DTO ↔ Prisma

```bash
# 2.1 Campos em DTOs (subset tipado de Prisma esperado)
grep -E "^\s+[a-zA-Z]+:" apps/api/src/modules/*/application/dto/*.ts | sort -u > /tmp/dto-fields.txt

# 2.2 Campos em Prisma models
grep -E "^\s+[a-zA-Z]+\s+" apps/api/prisma/schema.prisma | awk '{print $1}' | sort -u > /tmp/prisma-fields.txt

# 2.3 Diff
diff /tmp/dto-fields.txt /tmp/prisma-fields.txt | head -50
# DTO deve ser subset (nunca mais) — campos em DTO que não existem em Prisma = finding DRIFT
```

## Passo 3 — Cobertura de decorators Swagger

```bash
# 3.1 Controllers sem @ApiTags
grep -rn "@Controller" apps/api/src/modules/*/controllers/ -l | while read f; do
  grep -q "@ApiTags" "$f" || echo "✗ $f missing @ApiTags"
done

# 3.2 Endpoints sem @ApiOperation
grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/api/src/modules/*/controllers/ | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  lineno=$(echo "$line" | cut -d: -f2)
  context=$(sed -n "${lineno},$((lineno+5))p" "$file")
  if ! echo "$context" | grep -q "@ApiOperation"; then
    echo "✗ $file:$lineno missing @ApiOperation"
  fi
done

# 3.3 DTOs sem @ApiProperty / @ApiPropertyOptional
grep -rL "@ApiProperty" apps/api/src/modules/*/application/dto/ 2>/dev/null | head -10
```

## Passo 4 — Detectar breaking changes vs base_branch

```bash
# 4.1 Mudanças em path/method/param
git diff main..HEAD -- apps/api/src/modules/ \
  | grep -E "^\+.*@(Get|Post|Put|Patch|Delete|Body|Param|Query)" \
  | head -30

# 4.2 Mudanças em shape de response
git diff main..HEAD -- apps/api/src/modules/ \
  | grep -E "^\+.*(@ApiResponse|@ApiProperty|@Expose|@Transform)" \
  | head -30

# 4.3 Remoções = potencialmente breaking
git diff main..HEAD -- apps/api/src/modules/ \
  | grep -E "^-.*@(Get|Post|Put|Patch|Delete)" \
  | head -10
```

## Passo 5 — Validar error responses padronizados

```bash
# 5.1 Shapes de exception (esperado: NestJS built-in ou Problem Details RFC 7807)
grep -rn "throw new " apps/api/src/modules/*/controllers/ | head -20

# 5.2 Onde estão as exceptions custom
find apps/api/src -name "*-exception.ts" -o -name "*exception.filter.ts" 2>/dev/null
```

## Passo 6 — Persistir findings

```yaml
- id: openapi-DRIFT-001
  title: "DTO CreateUserDto tem 7 campos, Prisma model User tem 11"
  severity: P1
  location: "apps/api/src/modules/users/application/dto/create-user.dto.ts"
  cause: "DTO omitiu 4 campos opcionais; client espera-os ausentes do response."
  impact: "Confusão no front (apps/web), bugs em edge cases (soft-delete visibility)."
  evidence: "Diff entre DTO e model User."
  fix: "Adicionar campos faltantes como @ApiPropertyOptional com description."
  breaking_change: false
  spec_drift: true
```

## Passo 7 — Devolver ao `finding-orchestrator`

Ele decide se vira issue (P0/P1) ou só relatório (P2). Breaking changes = sempre P0.

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `pnpm openapi:export` falha | Script de export não configurado ou app sem Swagger module | Reportar como GAP — spec precisa ser gerável |
| `openapi.json` não committed | Gerado on-demand, não versionado | Decidir política: gerar e commitar OU .gitignore + export no CI |
| Diff vazio mas ainda há findings | Mudanças em decorators não viram diff de openapi.json (cache) | `rm apps/api/openapi.json && pnpm openapi:export` |
| Breaking change em `@Body()` type | Type mudou de `string` para `number` silenciosamente | Finding P0 sempre — auditar diff de types DTO |

## Saída

- `findings.yaml` com lista canônica
- Marcador `breaking_change: true` para qualquer finding em path/method/param removido ou tipo incompatível
- Cobertura calculada: `controllers_with_apitags / total_controllers` (em %)

## Referências

- Agent: `.agents/agents/openapi-contract-specialist.md`
- OpenAPI 3.1: <https://spec.openapis.org/oas/v3.1.0>
- NestJS Swagger: <https://docs.nestjs.com/openapi/introduction>
- RFC 7807 (Problem Details): <https://www.rfc-editor.org/rfc/rfc7807>
