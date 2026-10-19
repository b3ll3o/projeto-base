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

> **Estado em 2026-09-22 (Fase 9 entregue):** os 7 endpoints abaixo estão **implementados e cobertos por testes E2E**. Endpoints marcados como *planejado* estão descritos no design original mas ainda não foram scaffolados — registrados aqui apenas para rastreabilidade de roadmap.

| Método | Path | Descrição | Auth | Headers | Status |
|--------|------|-----------|------|---------|--------|
| `POST` | `/api/v1/users` | Criar | ✅ | `Authorization` | implementado |
| `GET` | `/api/v1/users` | Listar (cursor + `includeDeleted` case-insensitive) | ✅ | `Authorization` | implementado |
| `GET` | `/api/v1/users/:id` | Buscar por ID | ✅ | `Authorization` | implementado |
| `PATCH` | `/api/v1/users/:id` | Atualizar | ✅ | `Authorization`, `If-Match` (obrigatório) | implementado |
| `DELETE` | `/api/v1/users/:id` | Soft delete | ✅ | `Authorization`, `If-Match` (obrigatório) | implementado |
| `POST` | `/api/v1/users/:id/restore` | Restaurar versão | ✅ | `Authorization`, `If-Match` (obrigatório) | implementado |
| `GET` | `/api/v1/users/:id/history` | Listar versões | ✅ | `Authorization` | implementado |
| `GET` | `/api/v1/users/:id/history/:version` | Versão específica | ✅ | `Authorization` | planejado |
| `GET` | `/api/v1/users/archive` | Listar deletados | ✅ | `Authorization` | planejado |
| `GET` | `/api/v1/users/archive/:id` | Ver deletado | ✅ | `Authorization` | planejado |
| `POST` | `/api/v1/users/archive/:id/restore` | Restaurar último deletado | ✅ | `Authorization` | planejado |

**Notas de implementação (Fase 9):**

- `includeDeleted` em `GET /users` aceita `"true"` ou `"1"` (case-insensitive — `True`, `TRUE`, etc. também). Swagger tipa como `String` (não `Boolean`) para preservar a aceitação flexível em OpenAPI 3.0.
- `If-Match` é **obrigatório** (não recomendado) em `PATCH`, `DELETE` e `POST /:id/restore`. Ausência → `400 IF_MATCH_REQUIRED`; formato inválido → `400 IF_MATCH_INVALID`; divergência de versão → `412 CONCURRENCY_CONFLICT`.

## §3. Schemas de Request/Response

### §3.1 `CreateUserDto` (request body)

> ⚠️ **Superado pelo código (MEDIDO 2026-10-19).** O corpo abaixo é o do design
> original e não corresponde mais ao boundary: o campo é `nome`, não `name`, e
> faltam `senha` (obrigatória) e `destino` (opcional). A fonte de verdade é
> [`users.schemas.ts`](../../../apps/api/src/modules/users/infrastructure/http/users.schemas.ts)
> — o `CreateUserSchema` —, e o resumo vivo está em
> [`docs/api/users.md` §3.1](../../../docs/api/users.md).
>
> `POST /users` com `destino.tipo === 'convite'` também devolve `404` quando a
> flag `tenancy.invites` está desligada. Ver o
> [contrato das feature flags](./2026-10-18-feature-flags-contrato-http.md).

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
2. JwtAuthGuard valida e popula request.user
3. O controller resolve o ator: resolveActorId(request) lê request.user.sub
   e devolve null quando não há ator válido (rota @Public, ou sub malformado)
4. O controller monta o AuditContext e ABRE o scope:
     AuditContextStore.run(this.buildContext(request), () => useCase.executar(...))
5. O use case, dentro do scope, lê AuditContextStore.get() e grava a auditoria
```

> ⚠️ **Corrigido no PR #101 (2026-10-17).** Este bloco descrevia um
> `AuditContextMiddleware` que cria o contexto, um `AuditContextPort.current()` e
> um VO `{ userId, now, requestId }`. **Nenhum dos três existe** — medido:
> `grep -rn "AuditContextMiddleware\|AuditContextPort" apps/api/src` → vazio. O
> que existe é `AuditContextStore` (wrapper sobre `AsyncLocalStorage`) com
> `run(ctx, fn)` / `get()` / `tryGet()`, e o VO é
> `AuditContext { actorId, correlationId, source, timestamp, tenantId }`
> (`audit-context.vo.ts`). Não há middleware: é o **controller** que abre o scope
> (`users.controller.ts:152,291,324,351`), e quem monta o VO é `buildContext()`
> (`users.controller.ts:444`). O `tenantId` entra junto do `actorId` de propósito —
> passá-los por caminhos separados admite `actorId` da empresa A com `tenantId`
> da B, que é escalada silenciosa.

### §7.1 `request.user` publicado pelo guard

```typescript
{
  sub: string;            // do JWT — é o que a auditoria grava como `actorId`
  email: string;          // do JWT
  typ: 'access';          // reconfirmado pelo guard (2ª barreira)
  tenantId: string | null; // X-Tenant-Id canonicalizado; null = bucket global
  isAdmin: boolean;       // cache de perfil; false quando o cache não tem a chave
  permissions: readonly string[];
}
```

> ⚠️ **Corrigido no PR #101 (2026-10-17).** Este bloco escrevia
> `request.user = { id, email, roles }`, e os três campos estavam errados: o
> identificador é `sub` (`token-issuer.port.ts:42`), e `roles` não existe — quem
> carrega privilégio é `isAdmin` + `permissions`, lidos do
> `UserProfileCacheService`. O passo 3 acima lia `request.user.id`, que é
> `undefined`.

### §7.2 `X-Tenant-Id` — a empresa que a sessão está agindo

Header **opcional**, fora do JWT: `tenantId` troca dentro da mesma sessão sem
trocar de token.

Ausente, a sessão age no bucket **GLOBAL** (`users.profile_id IS NULL`), onde
mora o `isAdmin` do seed. "Sem header" significa **sem escopo de empresa**, e
não "sem privilégio" — quem inferir o contrário vai trancar o admin fora do
próprio bucket.

| Situação | Resposta |
|---|---|
| Ausente | segue; **sem** consulta de membership (bucket global não é empresa) |
| Presente, UUID válido | `findRole(sub, tenantId)`; devolve `null` → 403 |
| Presente, não é UUID | 400 |
| Presente, caixa alta | aceito e canonicalizado para minúsculo (a policy compara por texto) |

⚠️ **Rota `@Public()` não entra nesta tabela.** O guard devolve `true` no passo 1
(`jwt-auth.guard.ts:165-172`), antes de `extractTenantId`: em `POST /users` um
`X-Tenant-Id` malformado é **ignorado**, e a resposta é `201`, não `400`. A tabela
vale para as rotas autenticadas.

| `code` | Status | Quando |
|---|---|---|
| `INVALID_TENANT` | 400 | `X-Tenant-Id` não é um UUID válido |
| `TENANT_MEMBERSHIP_REQUIRED` | 403 | a sessão autenticada não pertence à empresa afirmada |

403 e não 401 porque o requerente **está** autenticado — 401 mandaria o cliente
para um laço de re-login sem remédio possível, e o corpo não pode ser o mesmo
do 401 de sessão ausente ("sem sessão" e "sessão válida, empresa errada" são
fatos em que o cliente age diferente).

**Limite da garantia:** a conferência vale a partir do **início** do request.
Um request em voo quando a membership é removida termina como começou, e a
remoção hoje é um privilégio **revogado** (`REVOKE DELETE ON tenant_memberships`
em `20261020000005`), não um endpoint. Detalhes em `jwt-auth.guard.ts`.

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
