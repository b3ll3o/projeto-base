---
name: openapi-audit
version: 1.0
updated: 2026-10-29
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
  controllers: ["apps/api/src/modules/*/infrastructure/http/"]
  dtos: ["apps/api/src/modules/*/application/dto/"]
  prisma_schema: "apps/api/prisma/schema.prisma"
  base_branch: "main"   # para diff de breaking changes
```

## Passo 1 — Re-gerar spec e diff

> **Gate:** `skip` — re-gera a spec com o toolchain e escreve o arquivo versionado

```bash
cd apps/api
pnpm openapi:export   # gera apps/api/openapi.json (pode falhar se faltar script)
git diff apps/api/openapi.json | head -100
```

Se `openapi.json` não existe no repo (gerado on-demand): rodar e commitar antes de auditar.

## Passo 2 — Detectar drift DTO ↔ Prisma

> **Gate:** `run` — compara DTO e Prisma pelo NOME do campo — é o passo que gerava falso positivo

```bash
# 2.1 Campos em DTOs (subset tipado de Prisma esperado)
# MEDIDO em 2026-10-29: este passo comparava DOIS FORMATOS DIFERENTES — o lado
# do DTO saía como "arquivo: campo: tipo;" e o do Prisma como "campo" — então o
# diff acusava 100 linhas ("1,55c1,43") e a regra "DTO deve ser subset" não
# podia ser lida. Agora os dois lados são normalizados: só o nome do campo.
grep -hE "^\s+[a-zA-Z]+:" apps/api/src/modules/*/application/dto/*.ts \
  | sed 's/^ *//' | cut -d: -f1 | sort -u > /tmp/dto-fields.txt

# 2.2 Campos em Prisma models
grep -E "^\s+[a-zA-Z]+\s+" apps/api/prisma/schema.prisma | awk '{print $1}' | sort -u > /tmp/prisma-fields.txt

# 2.3 Diff
diff /tmp/dto-fields.txt /tmp/prisma-fields.txt | head -50

# 2.4 O QUE É DRIFT (o diff acima é ruído — os dois lados têm FORMATOS
# diferentes; compare os NOMES). E a premissa "DTO é subset do Prisma" é
# FALSA neste codebase: a API expõe campos que não são coluna, por design
# (alias pt-BR, request-only, output computado). Medido em 2026-10-29: 13
# campos de DTO que não existem no Prisma, e NENHUM é erro —
#   alias do schema:  nome→name, senhaHash→passwordHash
#   só na API:        accessToken, refreshToken, expectedVersion, isDeleted,
#                     limit, nextCursor, perfilEfetivo, agora,
#                     novoEmail, novoNome, senha (request-only)
# Então o finding real é um campo DESCONHECIDO fora desta lista:
comm -23 /tmp/dto-fields.txt /tmp/prisma-fields.txt \
  | grep -vE '^(accessToken|refreshToken|expectedVersion|isDeleted|limit|nextCursor|perfilEfetivo|agora|novoEmail|novoNome|senha|nome|senhaHash)$'
# Saída vazia = nenhum drift. Saída não vazia = campo de DTO que não existe
# nem no Prisma nem na lista de aliases: ACHAR o porque antes de reportar.
#
# E o passo AFIRMA que os dois lados foram lidos: se o glob dos DTO ou o grep
# do schema parassem de casar, a comparação viraria "nenhuma diferença" e
# nenhum drift apareceria — o "não achei" viraria "não medi".
if [ ! -s /tmp/dto-fields.txt ] || [ ! -s /tmp/prisma-fields.txt ]; then
  echo "✗ um dos lados da comparação ficou vazio — o passo não mediu drift"
fi
```

## Passo 3 — Cobertura de decorators Swagger

> **Gate:** `run` — confere os decorators Swagger de cada controller

```bash
# 3.1 Controllers sem @ApiTags
grep -rn "@Controller" apps/api/src/modules/*/infrastructure/http/ -l | while read f; do
  grep -q "@ApiTags" "$f" || echo "✗ $f missing @ApiTags"
done

# 3.2 Endpoints sem @ApiOperation
# MEDIDO em 2026-10-29: a versão anterior acusava 2 FALSOS positivos.
# (1) `grep -rnE "@(Get|Post|...)"` casa dentro de COMENTÁRIO — o
#     `@Get('me')` de um JSDoc @example em `current-user.decorator.ts` contava
#     como endpoint. O decorator de verdade é o que está no INÍCIO da linha.
# (2) a janela de 5 linhas não alcançava o `@ApiOperation` quando há um
#     comentário longo entre o decorator da rota e o da doc (o
#     `users.controller.ts` tem 7 linhas de comentário no meio). A janela é
#     de -10 a +10: o `@ApiOperation` pode estar antes ou depois.
grep -rnE "^\s*@(Get|Post|Put|Patch|Delete)\(" apps/api/src/modules/*/infrastructure/http/ | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  lineno=$(echo "$line" | cut -d: -f2)
  context=$(sed -n "$((lineno-10)),$((lineno+10))p" "$file")
  if ! echo "$context" | grep -q "@ApiOperation"; then
    echo "✗ $file:$lineno missing @ApiOperation"
  fi
done

# 3.3 DTOs sem @ApiProperty / @ApiPropertyOptional
grep -rL "@ApiProperty" apps/api/src/modules/*/application/dto/ 2>/dev/null | head -10
```

## Passo 4 — Detectar breaking changes vs base_branch

> **Gate:** `skip` — precisa da ref local `main`, que o checkout do CI não tem

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

> **Gate:** `run` — lista os `throw new` e as exceptions custom

```bash
# 5.1 Shapes de exception (esperado: NestJS built-in ou Problem Details RFC 7807)
grep -rn "throw new " apps/api/src/modules/*/infrastructure/http/ | head -20

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
