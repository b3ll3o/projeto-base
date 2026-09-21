---
name: nestjs-specialist-memory
description: Memória acumulada do agent nestjs-specialist — decisões sobre arquitetura backend NestJS
---

# Memória: `nestjs-specialist`

> Arquivo de memória do agent `nestjs-specialist`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-21 — Stack backend definido

**Contexto:** Backend do monorepo será NestJS.

**Decisão:**

- **Versão:** NestJS 11 (latest estável) + Node.js 20 LTS
- **Adapter HTTP:** Fastify (performance superior ao Express)
- **ORM:** Prisma 6 (type-safe, migrations versionadas, generators)
- **Validação:** `class-validator` + `class-transformer` com `ValidationPipe` global
- **Documentação:** `@nestjs/swagger` em `/docs`
- **Testes:** Jest (default NestJS) + Supertest (e2e) + Testcontainers (Postgres real)
- **Logging:** Pino (estruturado JSON) + OpenTelemetry
- **Filas:** BullMQ + Redis (quando necessário)
- **Arquitetura preferida:** Feature modules + camadas Controller/Service/Repository + Domain opcional (Hexagonal)

## Padrões Descobertos

- Controllers sempre magros (HTTP only) — Service tem a lógica
- Repository abstrai Prisma — Domain não conhece ORM
- DTOs validados globalmente via `app.useGlobalPipes(new ValidationPipe(...))`
- Filtro de exceção global para respostas RFC 7807 (Problem Details)
- Config tipada com `@nestjs/config` + schema validation (Joi ou Zod)

## Lições Aprendidas

- ❌ Lógica de negócio em controller é o smell mais comum
- ❌ Retornar `User` Prisma do service vaza schema interno no response
- ❌ Esquecer de registrar módulo em `AppModule` quebra DI silenciosamente

## Sugestões de Evolução

- [ ] Criar template de módulo NestJS (scaffold via `nest g` customizado)
- [ ] Adicionar suporte a CQRS quando domínio for complexo
- [ ] Documentar padrão de feature flag (Unleash / LaunchDarkly)
