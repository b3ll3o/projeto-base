# 01 — Arquitetura DDD + Hexagonal (Regra Cross-Cutting)

> Documento: parte do design [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)

## §1. Princípios irrenunciáveis

| # | Princípio | Aplicação |
|---|-----------|-----------|
| 1 | **Domain puro** | `*/domain/**` NÃO importa de `@nestjs/*`, `@prisma/*`, `class-validator`, ORM, framework HTTP. Apenas TypeScript puro. |
| 2 | **Inversão de dependência** | Application depende de `ports/` (interfaces). Infrastructure implementa ports. |
| 3 | **Aggregates** | Toda entidade é raiz de aggregate; mutações só via root. |
| 4 | **Value Objects** | IDs, emails, versão, timestamps, audit metadata são VOs imutáveis. |
| 5 | **Domain Events** | `UserCreated`, `UserUpdated`, `UserDeleted`, `UserRestored` publicados via `EventBusPort`. |
| 6 | **Repositories retornam entidades** | Nunca modelo Prisma cru. Mappers obrigatórios. |
| 7 | **Use cases = 1 comando** | CQRS-lite. 1 use case por intenção (`CreateUserUseCase`, etc.). |
| 8 | **Testes por camada** | Domain 100% puro (sem mocks de framework); Application com mocks de ports; Infrastructure com Testcontainers. |
| 9 | **Code review por stack (D11)** | Agent `stack-code-reviewer` roda em **toda alteração de código** (pre-commit hook + CI). Detecta violações de padrão de stack (NestJS, NextJS, Prisma, DDD/Hexagonal). |
| 10 | **Sincronização de docs (D12)** | Agent `doc-sync` roda em **toda alteração de código** (pre-commit hook + CI). Revisa/atualiza/cria documentação afetada. Doc nunca fica desatualizada. |

## §2. Estrutura Obrigatória por Módulo

```text
apps/api/src/modules/<feature>/
├── domain/                    # NÚCLEO PURO (sem deps externas)
│   ├── entities/              # Agregados e entidades
│   ├── value-objects/         # VOs imutáveis
│   ├── events/                # Domain events
│   ├── services/              # Domain services (lógica intra-aggregate)
│   └── repositories/          # PORTS (interfaces)
├── application/               # Orquestração (use cases)
│   ├── use-cases/             # 1 arquivo por comando
│   ├── dto/                   # Input/Output tipados
│   └── ports/                 # Interfaces de infraestrutura
├── infrastructure/            # Adapters (detail)
│   ├── persistence/           # Prisma repositories + mappers
│   ├── http/                  # Controllers + presenters
│   ├── audit/                 # Implementação AuditServicePort
│   └── events/                # Implementação EventBusPort
└── <feature>.module.ts        # NestJS wiring (DI)
```

## §3. Camadas (Diagrama)

```text
┌──────────────────────────────────────────────────────────────┐
│ HTTP Layer (infrastructure/http)                            │
│ - Controller valida DTO (class-validator)                    │
│ - Extrai userId do JWT                                      │
│ - Chama use case                                            │
└─────────────────┬────────────────────────────────────────────┘
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ Application Layer (application/use-cases)                   │
│ - Use case orquestra: repository.save() + auditService      │
│ - Não conhece Prisma, HTTP, JWT                             │
└─────────────────┬────────────────────────────────────────────┘
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ Domain (puro) + Ports (interfaces)                          │
│ - Aggregate, VOs, Events                                    │
│ - UserRepositoryPort, AuditServicePort, EventBusPort        │
└─────────────────┬────────────────────────────────────────────┘
                  │ implementados por
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ Infrastructure (persistence + audit + events)               │
│ - PrismaUserRepository implements UserRepositoryPort        │
│ - PrismaAuditService implements AuditServicePort            │
│ - PrismaEventBus implements EventBusPort                    │
│ - Tudo dentro de prisma.$transaction()                      │
└──────────────────────────────────────────────────────────────┘
```

## §4. Regras de Camada — Boundaries Rígidos

| Camada | Pode importar de | NÃO pode importar de |
|--------|------------------|----------------------|
| `domain/` | TypeScript stdlib apenas | `@nestjs/*`, `@prisma/*`, `class-validator`, `class-transformer`, `reflect-metadata`, `rxjs` |
| `application/` | `domain/` + TypeScript | `@nestjs/*`, `@prisma/*`, ORM, frameworks |
| `infrastructure/` | `domain/` + `application/` + libs externas | (livre) |
| `http/` (dentro de infrastructure) | `application/` + DTOs | acesso direto a Prisma (deve passar por use case) |

**Validação automatizada:** ESLint rule customizada (`no-domain-imports-from-infra`) bloqueia imports proibidos em `**/domain/**`.

## §5. Validação por Skills e Agents

- **Skill nova**: `.agents/skills/ddd-hexagonal-validation/` — checklist automatizado.
- **Agents atualizados**:
  - `nestjs-specialist` ganha lens "DDD/Hexagonal" — audita limites em PRs.
  - `monorepo-specialist` valida estrutura `domain/application/infrastructure` ao adicionar módulo.

## §6. Onde Mora a Auditoria

**Domain (`shared/audit/domain/`):**

- `AuditOperation` enum (`INSERT | UPDATE | DELETE | RESTORE`)
- `AuditMetadata` VO (`changedBy: UserId`, `changedAt: Date`, `reason?: string`)
- `AuditRecord` VO (`operation`, `version`, `previousVersion`, `snapshot`, `metadata`)
- `AuditServicePort` (interface) — domínio define o que precisa
- `Auditable` interface — qualquer aggregate pode ser auditável

**Application:**

- Use cases chamam `auditServicePort.record(...)` após mutação
- Não conhece Prisma, conhece apenas o port

**Infrastructure:**

- `PrismaAuditService` implementa `AuditServicePort`
- `PrismaUserRepository` chama audit service dentro de transação
- `AuditContextMiddleware` extrai `userId` do JWT → injeta em `AuditContextPort`

## §7. Anti-Padrões (NÃO fazer)

- ❌ `domain/` importar `@nestjs/common` (`Injectable`, etc.).
- ❌ `application/` importar `PrismaService` diretamente.
- ❌ Controller acessar `prisma.user.findMany()` direto — sempre via use case.
- ❌ Repository retornar `PrismaUserModel` — sempre entidade de domínio via mapper.
- ❌ `any` em ports — toda interface deve ser 100% tipada.
- ❌ Domain event carregando dados de infraestrutura (request id de Express).
- ❌ Singleton global para `EventBus`, `AuditContext` — usar injeção via DI ou AsyncLocalStorage tipado.

---

**Próximo:** [`02-modelo-dados.md`](./2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md)
