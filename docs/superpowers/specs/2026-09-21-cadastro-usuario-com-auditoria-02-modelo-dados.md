# 02 — Modelo de Dados + Estrutura do Módulo `users`

> Documento: parte do design [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)

## §1. Convenção de Nomes

- Tabelas em **snake_case** no DB, **PascalCase** singular nos models Prisma.
- Colunas em **snake_case**, expostas como **camelCase** nos models.
- Campos de auditoria são **obrigatórios** em todas as entidades de domínio e ficam **sempre no final** do model (convenção visual).

## §2. Schema Prisma — `User` como Exemplo Canônico

```prisma
// apps/api/prisma/schema.prisma

// ════════════════════════════════════════════════════════════
// Tabela principal — apenas entidades ATIVAS
// ════════════════════════════════════════════════════════════
model User {
  id        String   @id @default(uuid()) @db.Uuid

  // Campos de domínio
  email     String   @unique
  name      String

  // ── Audit fields (obrigatórios, ordem fixa) ──────────────
  createdAt   DateTime @default(now()) @map("created_at")
  createdBy   String?  @map("created_by") @db.Uuid
  updatedAt   DateTime @updatedAt     @map("updated_at")
  updatedBy   String?  @map("updated_by") @db.Uuid
  version     Int      @default(1)
  // ──────────────────────────────────────────────────────────

  @@map("users")
}

// ════════════════════════════════════════════════════════════
// Histórico — snapshot COMPLETO de CADA versão
// ════════════════════════════════════════════════════════════
model UserHistory {
  id              String        @id @default(uuid()) @db.Uuid
  entityId        String        @map("entity_id") @db.Uuid
  snapshot        Json          @map("snapshot")
  version         Int           @map("version")
  previousVersion Int?          @map("previous_version")
  operation       AuditOperation @map("operation")
  changedAt       DateTime      @default(now()) @map("changed_at")
  changedBy       String?       @map("changed_by") @db.Uuid
  reason          String?       @map("reason")

  @@unique([entityId, version])
  @@index([entityId, changedAt(sort: Desc)])
  @@index([changedBy])
  @@map("users_history")
}

// ════════════════════════════════════════════════════════════
// Archive — última versão deletada
// ════════════════════════════════════════════════════════════
model UserArchive {
  id          String   @id @default(uuid()) @db.Uuid
  entityId    String   @unique @map("entity_id") @db.Uuid
  snapshot    Json     @map("snapshot")
  version     Int      @map("version")
  deletedAt   DateTime @default(now()) @map("deleted_at")
  deletedBy   String?  @map("deleted_by") @db.Uuid
  reason      String?  @map("reason")

  @@index([deletedAt(sort: Desc)])
  @@map("users_archive")
}

enum AuditOperation {
  INSERT
  UPDATE
  DELETE
  RESTORE

  @@map("audit_operation")
}
```

## §3. Regras Invariantes

| Regra | Onde | Como |
|-------|------|------|
| `version` sempre >= 1 | Domain (`Version` VO) | Construtor rejeita `< 1` |
| `version` incrementa em UPDATE/DELETE/RESTORE | Domain | `aggregate.incrementVersion()` |
| `createdAt` imutável | Domain + Repository | Repository nunca toca em `createdAt` no UPDATE |
| Snapshot em history é completo | Repository | `JSON.stringify(aggregate.toObject())` no momento da operação |
| Append-only em `*_history` | DB + Code | Repository nunca faz UPDATE/DELETE em history |
| `previousVersion` null apenas em INSERT | Repository | Sempre preenchido exceto na 1ª versão |
| Optimistic locking | Repository | `UPDATE ... WHERE id = X AND version = N`. Zero rows → `ConcurrencyException` |

## §4. Convenção para Novas Entidades

Para qualquer nova entidade `Y`, a estrutura segue o **mesmo padrão**:

```text
Y           → tabela principal (somente ativos)
YHistory    → snapshot completo por versão
YArchive    → última versão deletada (lixeira)
```

Nenhuma nova decisão arquitetural é necessária. O template está pronto.

## §5. Estrutura do Módulo `users`

```text
apps/api/src/modules/users/
├── domain/
│   ├── entities/
│   │   └── user.aggregate.ts
│   ├── value-objects/
│   │   ├── user-id.vo.ts
│   │   ├── email.vo.ts
│   │   ├── name.vo.ts
│   │   └── version.vo.ts
│   ├── events/
│   │   ├── user-created.event.ts
│   │   ├── user-updated.event.ts
│   │   ├── user-deleted.event.ts
│   │   └── user-restored.event.ts
│   └── repositories/
│       └── user.repository.port.ts
├── application/
│   ├── use-cases/
│   │   ├── create-user.use-case.ts
│   │   ├── update-user.use-case.ts
│   │   ├── soft-delete-user.use-case.ts
│   │   ├── restore-user.use-case.ts
│   │   ├── get-user.use-case.ts
│   │   └── list-users.use-case.ts
│   ├── dto/
│   │   ├── create-user.input.ts
│   │   ├── update-user.input.ts
│   │   ├── restore-user.input.ts
│   │   └── user.output.ts
│   └── ports/
│       └── audit-service.port.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── prisma/
│   │   │   ├── user.prisma.repository.ts
│   │   │   └── user-history.prisma.repository.ts
│   │   └── mappers/
│   │       └── user.mapper.ts
│   ├── http/
│   │   ├── users.controller.ts
│   │   └── dto/                              # request/response DTOs (validação)
│   └── audit/
│       └── prisma-audit.service.ts
├── events/
│   └── handlers/
│       └── on-user-created.handler.ts
└── users.module.ts
```

## §6. Diagrama Entidade-Relacionamento

```text
┌────────────────────────┐         ┌────────────────────────┐
│         users          │         │     users_history      │
├────────────────────────┤         ├────────────────────────┤
│ id (PK, UUID)          │◄────────│ entity_id (FK lógica)  │
│ email (UNIQUE)         │  sem   │ snapshot (JSONB)       │
│ name                   │   FK    │ version (INT)          │
│ created_at             │         │ previous_version       │
│ updated_at             │         │ operation (ENUM)       │
│ created_by             │         │ changed_at             │
│ updated_by             │         │ changed_by             │
│ version                │         │ reason                 │
└────────────────────────┘         │ UNIQUE(entity_id, ver) │
            │                     └────────────────────────┘
            │ (em soft delete: row sai daqui)
            ▼
┌────────────────────────┐
│     users_archive      │
├────────────────────────┤
│ id (PK)                │
│ entity_id (UNIQUE)     │
│ snapshot (JSONB)       │
│ version                │
│ deleted_at             │
│ deleted_by             │
│ reason                 │
└────────────────────────┘
```

---

**Próximo:** [`03-fluxos-operacoes.md`](./2026-09-21-cadastro-usuario-com-auditoria-03-fluxos-operacoes.md)
