# ADR-0001: Arquitetura DDD + Hexagonal + Auditoria completa

- **Status:** Aceito
- **Data:** 2026-09-21
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-design.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-design.md)

## Contexto

Implementação do cadastro de usuários no monorepo `projeto-base` exige:

1. **Audit fields obrigatórios** em todas as entidades (`createdAt/By`, `updatedAt/By`, `version`).
2. **Soft delete + restore** com rastreabilidade de quem deletou e por quê.
3. **Histórico completo** de todas as versões anteriores.
4. **Concorrência segura** (dois clients editando o mesmo recurso).
5. **Camadas bem definidas** que possibilitem trocar ORM, framework, transporte.

A solução precisa funcionar em NestJS (backend) e ser compatível com a evolução do front (Next.js).

## Decisão

Adotamos **DDD + Hexagonal (Ports & Adapters)** como paradigma obrigatório em todo o monorepo, com:

### Estrutura obrigatória

```text
apps/api/src/modules/<feature>/
  domain/         # TypeScript puro, zero framework
  application/    # Use cases, depende só de ports
  infrastructure/ # http/, persistence/
```

### Auditoria via 3 tabelas por entidade

```text
users          # estado atual (1 linha por entidade)
users_history  # 1 linha por versão (snapshot JSONB)
users_archive  # lixeira viva (soft delete)
```

Convenção obrigatória: ao criar `X`, criar também `XHistory` e `XArchive`.

### Optimistic locking

- Campo `version: Int` em toda entidade.
- HTTP usa header `If-Match: W/"v<N>"` para PATCH/DELETE/restore.
- Resposta de sucesso retorna header `ETag: W/"vN"`.
- Conflito → `412 Precondition Failed` com code `CONCURRENCY_CONFLICT`.

### Ports & Adapters

- `AuditServicePort` (interface) — implementações `InMemoryAuditService` (tests) e `PrismaAuditService` (prod).
- `UserRepositoryPort` (interface) — implementações `InMemoryUserRepository` (tests) e `PrismaUserRepository` (prod).
- Use cases só conhecem ports; DI wire em `UsersModule`.

### Auditoria transversal

- `AuditContext` (VO) propagado via `AsyncLocalStorage` no escopo da request.
- Use cases gravam `record()` (history) e `archive()` (archive) via port.
- Eventos de domínio (`UserCreated`, `UserUpdated`, `UserDeleted`, `UserRestored`) são emitidos pelo aggregate.

## Consequências

### Positivas

- **Testabilidade.** Domain puro (alvo de cobertura máxima na prática via TDD) + use cases com mocks.
- **Troca fácil de ORM.** `PrismaUserRepository` pode ser substituído por TypeORM/Sequelize.
- **Evolução de stack.** Front em qualquer framework consome API HTTP.
- **Auditoria pronta.** Qualquer entidade segue o mesmo padrão.
- **Agents automáticos.** `stack-code-reviewer` valida pureza do domain via regras custom em TypeScript (script `tooling/scripts/stack-code-reviewer.ts`).

### Negativas

- **Mais código boilerplate.** Mapper, port, impl real, impl in-memory.
- **Onboarding mais lento.** Time precisa entender DDD + Hexagonal.
- **Decisões explícitas.** Onde colocar uma classe? Domain vs application? (skill de validação resolve)

### Trade-offs aceitos

- 3 tabelas por entidade (vs 1 com JSON histórico): escolhida para queries simples + soft delete rápido.
- AsyncLocalStorage para AuditContext (vs param explícito): escolhida para manter use cases limpos.

## Validação contínua

1. **Script `stack-code-reviewer`** (`tooling/scripts/stack-code-reviewer.ts`) detecta imports proibidos em `domain/` via análise estática do AST TypeScript. Roda em pre-commit + CI em toda alteração de código. Substitui a abordagem ESLint rule original (a estrutura flat config + plugin dedicado ficaria subutilizada para uma única regra).
2. **Skill `ddd-hexagonal-validation`** (a ser criada em `.agents/skills/ddd-hexagonal-validation/SKILL.md`) guia auditoria manual de limites em PR de novos módulos. Trigger: "validar DDD/Hexagonal", "verificar boundaries", "auditar módulo".
3. **Cobertura** segue a regra global do projeto documentada em `.agents/specs/conventions/cobertura-testes.md`: **80% agregado por vitest project** (lines/functions/branches/statements). Não há regra por camada; a qualidade da boundary é garantida pelos checks do `stack-code-reviewer` + revisão humana.
4. **Agent `code-reviewer`** complementa focando em qualidade geral (bugs, design, naming).

## Alternativas consideradas

### A1: CRUD tradicional com NestJS services

- ❌ Mistura regra de negócio com ORM.
- ❌ Auditoria manual repetida em cada endpoint.
- ❌ Não escala para múltiplas entidades.

### A2: Event sourcing puro

- ❌ Complexidade alta para o caso de uso.
- ❌ Necessário reprojetar queries.
- ❌ Reconstruir estado a cada leitura é caro.

### A3: 1 tabela com JSON column de histórico

- ❌ Soft delete + restore mais complexo.
- ❌ Queries paginadas do histórico custosas.
- ❌ Single source of truth = single point of failure.

## Notas de migração

Para cada entidade existente adicionar:

1. Colunas `createdAt/By`, `updatedAt/By`, `version` (default 1).
2. Tabela `<entity>_history` com snapshot JSONB.
3. Tabela `<entity>_archive` para soft delete.
4. Aggregate + port `UserRepositoryPort`-like.
5. Use cases CRUD + `Restore<entity>`.
6. Endpoints HTTP com If-Match.

## Referências

- Vaughn Vernon — *Implementing Domain-Driven Design* (Addison-Wesley, 2013)
- Eric Evans — *Domain-Driven Design: Tackling Complexity in the Heart of Software* (Addison-Wesley, 2003)
- Alistair Cockburn — *Hexagonal Architecture* (2005)
- Prisma docs — <https://www.prisma.io/docs>
- RFC 7807 — *Problem Details for HTTP APIs* (March 2016)
- RFC 7232 — *HTTP Conditional Requests* — If-Match / ETag semantics (April 2014)
