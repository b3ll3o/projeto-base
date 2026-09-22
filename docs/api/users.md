# API Reference — BC `users`

> Documento de referência da API HTTP do **Bounded Context `users`**.
> Contrato canônico exportado em [`apps/api/openapi.json`](../../apps/api/openapi.json).
> Spec de design: [`docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md).
> ADR-0001 (DDD + Hexagonal): [`docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).

## §1. Visão Geral

- **Base path**: `/api/v1/users`
- **Auth**: `Authorization: Bearer <jwt>` em **todos** os endpoints (`@ApiBearerAuth()` no controller)
- **Content-Type**: `application/json; charset=utf-8` (request e response)
- **Erros**: RFC 7807 (Problem Details)
- **Versionamento**: `v1` no path; breaking changes abrem `v2`

## §2. Endpoints

| # | Método | Path                              | Auth | Códigos principais                          |
|---|--------|-----------------------------------|------|---------------------------------------------|
| 1 | `POST` | `/api/v1/users`                   | ✅   | `201`, `400`, `409`                         |
| 2 | `GET`  | `/api/v1/users`                   | ✅   | `200`                                       |
| 3 | `GET`  | `/api/v1/users/:id`               | ✅   | `200`, `404`                                |
| 4 | `PATCH`| `/api/v1/users/:id`               | ✅   | `200`, `400`, `404`, `412`                  |
| 5 | `DELETE`| `/api/v1/users/:id`              | ✅   | `204`, `400`, `404`, `412`                  |
| 6 | `POST` | `/api/v1/users/:id/restore`       | ✅   | `201`, `400`, `404`, `412`                  |
| 7 | `GET`  | `/api/v1/users/:id/history`       | ✅   | `200`                                       |

## §3. Payloads (request/response)

### 3.1 `POST /users` — Criar

**Request body** (`CreateUserDto`, validado por Zod no boundary HTTP):

```typescript
{
  nome: string;   // 1..120 chars
  email: string;  // RFC 5322, max 255 chars
}
```

**Response `201`**: entidade `User` + header `ETag: W/"v<N>"`.

Códigos de erro: `400` (payload inválido — Zod), `409` (email já em uso).

### 3.2 `GET /users` — Listar (paginado por cursor)

**Query params**:

| Param            | Tipo   | Obrigatório | Default | Notas |
|------------------|--------|-------------|---------|-------|
| `cursor`         | string | não         | `null`  | Cursor opaco da paginação anterior |
| `limit`          | number | não         | `20`    | `1 <= limit <= 100` |
| `includeDeleted` | string | não         | `false` | Aceita `"true"` ou `"1"` (case-insensitive). Qualquer outro valor = `false` |

**Response `200`**: `{ data: User[], pagination: { nextCursor, hasMore } }`.

### 3.3 `GET /users/:id` — Buscar por ID

Resposta `200` com `User`; `404` se não encontrado (soft-deletado **não** retorna — usar `includeDeleted=true` em `GET /users` ou restaurar antes).

### 3.4 `PATCH /users/:id` — Renomear

**Headers obrigatórios**: `If-Match: W/"v<N>"` (optimistic locking, RFC 7232). Ausência/invalidade → `400`.

**Request body** (`UpdateUserDto`): `{ novoNome: string }` (1..120 chars).

Resposta `200` com `User` + novo `ETag`. Conflito de versão → `412 Precondition Failed`.

### 3.5 `DELETE /users/:id` — Soft delete

`If-Match: W/"v<N>"` obrigatório. `204 No Content` em sucesso. Conflito → `412`.

### 3.6 `POST /users/:id/restore` — Restaurar soft-deletado

`If-Match: W/"v<N>"` obrigatório. `201 Created` com `User` + novo `ETag`.

### 3.7 `GET /users/:id/history` — Histórico de auditoria

**Query params**: `cursor`, `limit` (mesma convenção de §3.2). `includeDeleted` **não** se aplica.

**Response `200`**: lista paginada de snapshots de auditoria (`UserHistoryEntryDto`).

## §4. `includeDeleted` — case-insensitive

Aceita `"true"`, `"True"`, `"TRUE"`, `"1"`. Demais valores → `false`. Tipo Swagger: `String` (não `Boolean`) — permite a aceitação flexível sem quebra de contrato OpenAPI 3.0 (booleans são estritos em query strings).

## §5. Optimistic Locking (RFC 7232)

- Toda resposta mutante inclui `ETag: W/"v<N>"` (header).
- Mutating endpoints (`PATCH`, `DELETE`, `POST /:id/restore`) exigem `If-Match: W/"v<N>"`.
- Divergência de versão → `412 Precondition Failed` (RFC 7807 com `code: CONCURRENCY_CONFLICT`).
- Parser tolerante a whitespace externo e case-insensitive em `W/` (ver `parseIfMatch` em `apps/api/src/modules/users/infrastructure/http/users.controller.ts`).

## §6. Auditoria

Mutating endpoints rodam dentro de `AuditContextStore.run(...)`. O `AuditContext` carrega:

- `actorId` — extraído do JWT (Fase 8)
- `correlationId` — gerado localmente por enquanto; Fase 8 substituirá por `X-Request-Id` / trace OpenTelemetry
- `source: 'http'`
- `timestamp`

Use cases persistem histórico via `AuditServicePort.record(...)` (camada `infrastructure/persistence/`).

## §7. Referências Cruzadas

- OpenAPI JSON: [`apps/api/openapi.json`](../../apps/api/openapi.json) (regenerado via `pnpm --filter @projeto/api openapi:export`)
- Spec de design do contrato: [`04-contrato-http.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md)
- ADR-0001 (DDD + Hexagonal + Auditoria): [`docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md)
- Controller fonte: [`apps/api/src/modules/users/infrastructure/http/users.controller.ts`](../../apps/api/src/modules/users/infrastructure/http/users.controller.ts)
- Schemas Zod: [`apps/api/src/modules/users/infrastructure/http/users.schemas.ts`](../../apps/api/src/modules/users/infrastructure/http/users.schemas.ts)
