---
name: nestjs-specialist-memory
description: Memória acumulada do agent nestjs-specialist — decisões sobre arquitetura backend NestJS
---

# Memória: `nestjs-specialist`

> Arquivo de memória do agent `nestjs-specialist`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-21 — Stack backend definido

**Contexto:** Backend do monorepo será NestJS.

> ⚠️ **Corrigido em 2026-10-13 contra o disco.** Este bloco descrevia a stack
> *pretendida*; cinco das linhas descreviam bibliotecas que o repositório nunca
> instalou. A memória existe para lembrar o que foi decidido **e aplicado** —
> uma decisão que nunca virou dependência é uma intenção, e intention obscure as
> facts. Comando de verificação ao lado de cada linha corrigida.

**Decisão (medida em `apps/api/package.json`, 2026-10-13):**

- **Versão:** NestJS 11 + Node.js **≥ 22.6.0** (`engines.node` da raiz — era "20 LTS", e a imagem base é `node:22-bookworm-slim`)
- **Adapter HTTP:** Fastify (performance superior ao Express)
- **ORM:** Prisma 6 (type-safe, migrations versionadas, generators)
- **Validação:** **Zod** + `ZodValidationPipe` próprio, aplicado por rota com `@Body(new ZodValidationPipe(Schema))`. ❌ `class-validator`, ❌ `class-transformer`, ❌ `ValidationPipe` global — nenhum dos três está instalado (`grep -rl '"class-validator"' --include=package.json` → nada). O ganho do Zod aqui é o mesmo schema rodando no cliente do web e no boundary da API
- **Documentação:** `@nestjs/swagger` em `/api/docs`
- **Testes:** **Vitest** (`vitest run --project unit|integration|e2e`) + **Testcontainers** (`@testcontainers/postgresql`, Postgres real) + `app.inject` do Fastify no e2e. ❌ Jest não está instalado; `supertest` é devDep mas **não é importada em nenhum arquivo** — o harness e2e commenta que `app.inject` é "equivalente ao supertest mas" sem ele
- **Logging:** Pino (estruturado JSON) + OpenTelemetry
- **Filas / Cache:** **não adotados.** ❌ BullMQ e ❌ Redis (ioredis) não estão em nenhum `package.json`, e não há serviço de fila/cache no `docker-compose.yml`
- **Arquitetura preferida (SUPERADA em 2026-09-22):** ~~Feature modules + camadas Controller/Service/Repository + Domain opcional (Hexagonal)~~ — ver decisão seguinte (DDD/Hexagonal virou paradigma obrigatório via ADR-0001).

### 2026-09-22 — DDD/Hexagonal adotado como paradigma canônico

**Contexto:** ADR-0001 (docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md, status Aceito 2026-09-21) promulgou DDD + Hexagonal (Ports & Adapters) como paradigma arquitetural OBRIGATÓRIO em apps backend, com auditoria via 3 tabelas por entidade e optimistic locking via If-Match/ETag (RFC 7232).

**Decisão:** nestjs-specialist aplica a lens DDD/Hexagonal em todo módulo NestJS — validar boundaries `domain/application/infrastructure`, despachar skill `.agents/skills/ddd-hexagonal-validation/SKILL.md` antes de finalizar módulo, e remover linguagem "Domain opcional (Hexagonal)" (pré-ADR-0001).

**Consequências:**

- Migrations agora exigem 3 tabelas por entidade (`X`, `XHistory`, `XArchive`) + audit fields obrigatórios
- Skill `ddd-hexagonal-validation` é o gatekeeper manual; `stack-code-reviewer` (D11) é o gate automatizado
- BC `users` validado end-to-end (HTTP + E2E + 250 testes) como template canônico

## Padrões Descobertos

- Controllers sempre magros (HTTP only) — Service tem a lógica
- Repository abstrai Prisma — Domain não conhece ORM
- Schemas Zod por rota via `@Body(new ZodValidationPipe(Schema))` — **não** existe `ValidationPipe` global, e os DTOs são `z.infer<typeof Schema>`, não classes com decorators
- Filtro de exceção global para respostas RFC 7807 (Problem Details) — `GlobalExceptionFilter` + mapper puro `domain-exception-to-http`
- Config tipada com `@nestjs/config` (Zod, sem Joi)
- ⚠️ `@Inject(TOKEN)` explícito em todo construtor: o `tsx`/esbuild **não** emite `design:paramtypes`, e sem o token o Nest injeta `undefined` — defeito que só aparece em runtime, nunca no build

## Lições Aprendidas

- ❌ Lógica de negócio em controller é o smell mais comum
- ❌ Retornar `User` Prisma do service vaza schema interno no response
- ❌ Esquecer de registrar módulo em `AppModule` quebra DI silenciosamente

## Sugestões de Evolução

- [ ] Criar template de módulo NestJS (scaffold via `nest g` customizado)
- [ ] Adicionar suporte a CQRS quando domínio for complexo
- [ ] Documentar padrão de feature flag (Unleash / LaunchDarkly)
