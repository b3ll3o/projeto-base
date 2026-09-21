# 04 — Contrato HTTP (REST API)

> Documento: parte do design [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)

## §1. Convenções

- **Base path**: `/api/v1/<resource>`.
- **Content-Type**: `application/json; charset=utf-8`.
- **Erros**: RFC 7807 (Problem Details for HTTP APIs).
- **Autenticação**: `Authorization: Bearer <jwt>` (JwtAuthGuard global).
- **Optimistic locking via header**: `If-Match: W/"<version>"` ou `If-Match: "<version>"`.
- **ORM**: Prisma 6 (regra D9 do design).
- **CSS Frontend**: Tailwind 4 (regra D10, aplicada em `apps/web` — não na API).

## §2. Endpoints

| Método | Path | Descrição | Auth | Headers |
|--------|------|-----------|------|---------|
| `POST` | `/api/v1/users` | Criar | ✅ | `Authorization` |
| `GET` | `/api/v1/users` | Listar ativos | ✅ | `Authorization` |
| `GET` | `/api/v1/users/:id` | Buscar por ID | ✅ | `Authorization` |
| `PATCH` | `/api/v1/users/:id` | Atualizar | ✅ | `Authorization`, `If-Match` (recomendado) |
| `DELETE` | `/api/v1/users/:id` | Soft delete | ✅ | `Authorization`, `If-Match` (recomendado) |
| `POST` | `/api/v1/users/:id/restore` | Restaurar versão | ✅ | `Authorization` |
| `GET` | `/api/v1/users/:id/history` | Listar versões | ✅ | `Authorization` |
| `GET` | `/api/v1/users/:id/history/:version` | Versão específica | ✅ | `Authorization` |
| `GET` | `/api/v1/users/archive` | Listar deletados | ✅ | `Authorization` |
| `GET` | `/api/v1/users/archive/:id` | Ver deletado | ✅ | `Authorization` |
| `POST` | `/api/v1/users/archive/:id/restore` | Restaurar último deletado | ✅ | `Authorization` |

## §3. Schemas de Request/Response

### §3.1 `CreateUserDto` (request body)
```typescript
{
  email: string;       // RFC 5322, max 255 chars
  name: string;        // 1-120 chars
}
```

### §3.2 `UpdateUserDto` (request body)
```typescript
{
  email?: string;      // opcional
  name?: string;       // opcional
}
```

### §3.3 `RestoreUserDto` (request body)
```typescript
{
  version: number;     // obrigatório, >= 1
  reason?: string;     // opcional, max 500 chars
}
```

### §3.4 `UserOutputDto` (response padrão)
```typescript
{
  id: string;                    // UUID v7
  email: string;
  name: string;
  version: number;
  createdAt: string;             // ISO 8601
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}
```

### §3.5 `UserHistoryEntryDto` (response GET history)
```typescript
{
  version: number;
  previousVersion: number | null;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';
  snapshot: UserOutputDto;
  changedAt: string;
  changedBy: string | null;
  reason: string | null;
}
```

### §3.6 `UserArchiveEntryDto` (response GET archive)
```typescript
{
  id: string;
  snapshot: UserOutputDto;
  version: number;
  deletedAt: string;
  deletedBy: string | null;
  reason: string | null;
}
```

## §4. Headers de Resposta

```http
ETag: W/"<version>"
Location: /api/v1/users/<id>          (apenas POST created)
X-Request-Id: <uuid>
```

## §5. Paginação (Cursor-Based)

```
GET /api/v1/users?limit=20&cursor=<opaque>&order=desc
```

Response:
```typescript
{
  data: [...],
  pagination: {
    nextCursor: string | null,
    hasMore: boolean
  }
}
```

Limite: `1 <= limit <= 100`, default `20`.

## §6. Formato de Erro (RFC 7807)

```typescript
{
  type: string;             // URI da classe do erro
  title: string;            // resumo curto
  status: number;
  detail: string;
  instance: string;
  code: string;             // machine-readable
  errors?: Array<{          // apenas em 400/422
    field: string,
    message: string,
    code: string
  }>;
  traceId: string;
}
```

Exemplo — `409 ConcurrencyException`:

```json
{
  "type": "/errors/concurrency",
  "title": "Version conflict",
  "status": 409,
  "detail": "User version 5 was expected but current is 7. Reload and retry.",
  "instance": "/api/v1/users/01j9z",
  "code": "USER_VERSION_CONFLICT",
  "currentVersion": 7,
  "expectedVersion": 5,
  "traceId": "01j9z-trace-abc"
}
```

## §7. Autenticação e Contexto de Auditoria

```text
1. Cliente envia Authorization: Bearer <jwt>
2. JwtAuthGuard valida e popula request.user = { id, email, roles }
3. AuditContextMiddleware cria AsyncLocalStorage context:
     { userId: request.user.id, now: new Date(), requestId }
4. AuditContextPort.current() retorna o contexto em qualquer camada
5. Use case lê ctx.userId e passa para auditServicePort.record(...)
```

## §8. Versionamento da API

- **Versão atual**: `v1` (path prefix).
- **Mudanças breaking**: nova versão `v2` em paralelo.
- **OpenAPI**: gerado em `apps/api/openapi.json` via `@nestjs/swagger`.
- **Documentação interativa**: `/api/v1/docs` (Swagger UI).

## §9. Exemplo Completo

### Criar usuário

```http
POST /api/v1/users
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{ "email": "leo@example.com", "name": "Leo" }
```

```http
HTTP/1.1 201 Created
Location: /api/v1/users/01j9z...
ETag: W/"1"
X-Request-Id: 01j9z-trace-abc
Content-Type: application/json

{
  "id": "01j9z...",
  "email": "leo@example.com",
  "name": "Leo",
  "version": 1,
  "createdAt": "2026-09-21T18:30:00.000Z",
  "updatedAt": "2026-09-21T18:30:00.000Z",
  "createdBy": "01j9z-admin",
  "updatedBy": "01j9z-admin"
}
```

### Listar histórico

```http
GET /api/v1/users/01j9z/history?limit=20
Authorization: Bearer eyJhbGc...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": [
    {
      "version": 2,
      "previousVersion": 1,
      "operation": "UPDATE",
      "snapshot": { "id": "01j9z...", "name": "Leo S.", "version": 2 },
      "changedAt": "2026-09-21T18:31:00.000Z",
      "changedBy": "01j9z-admin",
      "reason": null
    },
    {
      "version": 1,
      "previousVersion": null,
      "operation": "INSERT",
      "snapshot": { "id": "01j9z...", "name": "Leo", "version": 1 },
      "changedAt": "2026-09-21T18:30:00.000Z",
      "changedBy": "01j9z-admin",
      "reason": null
    }
  ],
  "pagination": { "nextCursor": null, "hasMore": false }
}
```

---

**Próximo:** [`05-estrategia-testes.md`](./2026-09-21-cadastro-usuario-com-auditoria-05-estrategia-testes.md)
