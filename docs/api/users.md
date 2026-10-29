# API Reference — BC `users`

> Documento de referência da API HTTP do **Bounded Context `users`**.
> Contrato exportado para `apps/api/openapi.json` — artefato **derivado e
> versionado** (desde o #125); o gate `check-openapi-contract` compara a spec
> versionada com a gerada. A fonte do contrato são os decorators `@Api*` do
> código; este documento é a referência legível e precisa ser atualizado junto.
> Para regenerar: `pnpm --filter @projeto/api openapi:export`.
> Medido em 2026-10-29: os 7 endpoints deste BC conferem com
> `apps/api/openapi.json`. Contagem por
> `grep -hoE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/users/infrastructure/http/users.controller.ts | wc -l`
> → `7`. O contrato inteiro tem 22 paths e 28 operações
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → `22`;
> `node -e "const d=require('./apps/api/openapi.json');console.log(Object.values(d.paths).flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)"` → `28`),
> das quais 7 são de `users` — as outras 21 são `auth` (3), `tenancy` (5),
> `profiles` (10), `feature-flags` (2) e `health` (1). A conferência é manual:
> nada impede que a tabela derive do contrato.
> Spec de design: [`docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md).
> ADR-0001 (DDD + Hexagonal): [`docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).

## §1. Visão Geral

- **Base path**: `/api/v1/users`
- **Auth**: `Authorization: Bearer <jwt>` em **6 das 7** rotas — `POST /users` é
  `@Public()`. O `@ApiBearerAuth()` é **por handler**, não no controller.
- **Guards**: `JwtAuthGuard` na **classe** do controller. As 5 rotas por `:id`
  (`GET`, `PATCH`, `DELETE`, `POST /:id/restore`, `GET /:id/history`) somam
  `@UseGuards(UserOwnershipGuard)` — a sessão precisa ser a **dona** do recurso.
- **Content-Type**: `application/json; charset=utf-8` (request e response)
- **Erros**: RFC 7807 (Problem Details)
- **Versionamento**: `v1` no path; breaking changes abrem `v2`

## §2. Endpoints

| # | Método | Path                              | Auth | Códigos declarados no contrato            |
|---|--------|-----------------------------------|------|--------------------------------------------|
| 1 | `POST` | `/api/v1/users`                   | ❌   | `201`, `400`, `404`, `409`                  |
| 2 | `GET`  | `/api/v1/users`                   | ✅   | `200`                                       |
| 3 | `GET`  | `/api/v1/users/:id`               | ✅   | `200`, `403`, `404`                         |
| 4 | `PATCH`| `/api/v1/users/:id`               | ✅   | `200`, `400`, `403`, `404`, `412`           |
| 5 | `DELETE`| `/api/v1/users/:id`              | ✅   | `204`, `400`, `403`, `404`, `412`           |
| 6 | `POST` | `/api/v1/users/:id/restore`       | ✅   | `201`, `400`, `403`, `404`, `412`           |
| 7 | `GET`  | `/api/v1/users/:id/history`       | ✅   | `200`, `403`                                |

Os códigos da tabela são os **declarados** no `openapi.json` — por `@ApiResponse`
explícito ou pelo default do método. Códigos que o runtime pode produzir sem
estarem declarados (o `400 VALIDATION_ERROR` de §3.7, por exemplo) aparecem no
texto da rota correspondente.

**Códigos que valem para as 6 rotas autenticadas** (PR #101, 2026-10-17) — as 6
passam pelo mesmo `JwtAuthGuard`:

| `code` | Status | Quando |
|---|---|---|
| `INVALID_TENANT` | `400` | `X-Tenant-Id` não é um UUID válido |
| `TENANT_MEMBERSHIP_REQUIRED` | `403` | a sessão autenticada não pertence à empresa afirmada no header |
| `USER_OWNERSHIP_VIOLATION` | `403` | a sessão não é a dona do recurso — sai do `UserOwnershipGuard`, não do `JwtAuthGuard` |

⚠️ **`POST /users` (rota 1) é `@Public()`** — `users.controller.ts:158`. O guard
devolve `true` antes de ler o `X-Tenant-Id`, então **nenhum** dos três códigos é
possível no cadastro: um header malformado é ignorado e a resposta é `201`, não
`400`.

As duas de **header** só ocorrem quando o cliente **manda** `X-Tenant-Id` — sem
o header a rota age no bucket global e nenhuma das duas é possível. O header é
opcional e não faz parte do JWT. Semântica e o limite da garantia:
[contrato HTTP §7.2](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md).

## §3. Payloads (request/response)

### 3.1 `POST /users` — Criar

**Request body** (`CreateUserDto`, validado por Zod no boundary HTTP):

```typescript
{
  nome: string;   // 2..100 chars
  email: string;  // RFC 5322, max 254 chars
  senha: string;  // 8..72 chars — a senha EM CLARO (o argon2id tem ~96)
  destino?:                       // ausente = a conta solta de hoje
    | { tipo: 'empresa'; nome: string; slug: string }
    | { tipo: 'convite'; token: string };  // 64 hex, o que randomBytes(32) produz
}
```

**Response `201`**: `UserOutputDto` — o usuário como a API o serializa, **sem**
`senhaHash` — + header `ETag: W/"v<N>"`.

Códigos de erro: `400` (payload inválido — Zod), `404` (só com `destino.tipo === 'convite'` e a flag `tenancy.invites` **desligada** — mesma resposta de porta fechada que as outras duas, ver [contrato das feature flags](../superpowers/specs/2026-10-18-feature-flags-contrato-http.md)), `409` (email já em uso).

`destino: { tipo: 'empresa' }` **continua `201` com a flag desligada** — não usa token de convite.

### 3.2 `GET /users` — Listar (paginado por cursor)

**Query params**:

| Param            | Tipo   | Obrigatório | Default | Notas |
|------------------|--------|-------------|---------|-------|
| `cursor`         | string | não         | `null`  | Cursor opaco da paginação anterior |
| `limit`          | number | não         | `20`    | `1 <= limit <= 100` |
| `includeDeleted` | string | não         | `false` | Aceita `"true"` ou `"1"` (case-insensitive). Qualquer outro valor = `false` |

**Response `200`**: `{ users: UserOutputDto[], nextCursor: string | null }`
(`UsersPageDto`, de `packages/shared-types`). `nextCursor` é `null` na última
página — o envelope **não** tem `hasMore`.

**Códigos de erro**: `400` (`VALIDATION_ERROR` — query inválida: `limit` fora de 1..100, não numérico
ou fracionário; `cursor` que não é um id). Antes da #124, `limit=abc` virava `NaN` e chegava ao
`take:` do Prisma — **500**, onde o certo é **400**.

### 3.3 `GET /users/:id` — Buscar por ID

Resposta `200` com `UserOutputDto`; `404` se não encontrado (soft-deletado **não** retorna — usar `includeDeleted=true` em `GET /users` ou restaurar antes); `403` (`USER_OWNERSHIP_VIOLATION`) se a sessão não for a dona da conta.

### 3.4 `PATCH /users/:id` — Renomear

**Headers obrigatórios**: `If-Match: W/"v<N>"` (optimistic locking, RFC 7232). Ausência/invalidade → `400`.

**Request body** (`UpdateUserDto`): `{ novoNome: string }` (2..100 chars).

Resposta `200` com `UserOutputDto` + novo `ETag`. Conflito de versão → `412 Precondition Failed`.

### 3.5 `DELETE /users/:id` — Soft delete

`If-Match: W/"v<N>"` obrigatório. `204 No Content` em sucesso. Conflito → `412`.

### 3.6 `POST /users/:id/restore` — Restaurar soft-deletado

`If-Match: W/"v<N>"` obrigatório. `201 Created` com `UserOutputDto` + novo `ETag`.

### 3.7 `GET /users/:id/history` — Histórico de auditoria

**Query params**: `cursor`, `limit` (mesma convenção de §3.2). `includeDeleted` **não** se aplica.

**Response `200`**: `{ entries: UserHistoryEntryDto[], nextCursor: string | null }`
(`UserHistoryPageDto`, de `packages/shared-types`).

**Códigos de erro**: `400` (`VALIDATION_ERROR` — query inválida, pela MESMA validação de §3.2) e `403` (`USER_OWNERSHIP_VIOLATION`). A
#124 fechou só uma das DUAS surfaces de query da API; a outra (`GET /users/:id/history`) ainda
passava `Number(limit)` cru, e `limit=abc` virava `NaN` no `take:` do Prisma — **500**.

## §4. `includeDeleted` — case-insensitive

Aceita `"true"`, `"True"`, `"TRUE"`, `"1"`. Demais valores → `false`. Tipo Swagger: `String` (não `Boolean`) — permite a aceitação flexível sem quebra de contrato OpenAPI 3.0 (booleans são estritos em query strings).

## §5. Optimistic Locking (RFC 7232)

- Toda resposta mutante **que devolve o usuário** (`POST /users`, `PATCH`,
  `POST /:id/restore`) inclui `ETag: W/"v<N>"` (header). `DELETE` responde `204`
  sem corpo e sem ETag.
- Mutating endpoints (`PATCH`, `DELETE`, `POST /:id/restore`) exigem `If-Match: W/"v<N>"`.
- Divergência de versão → `412 Precondition Failed` (RFC 7807 com `code: CONCURRENCY_CONFLICT`).
- Parser tolerante a whitespace externo e case-insensitive em `W/` (ver `parseIfMatch` em `apps/api/src/modules/users/infrastructure/http/users.controller.ts`).

## §6. Auditoria

Mutating endpoints rodam dentro de `AuditContextStore.run(...)`. O `AuditContext` carrega:

- `actorId` — extraído do JWT (`users.controller.ts:624`)
- `correlationId` — o **traceId W3C** do span OTel ativo (`users.controller.ts:621-622`),
  com `randomUUID()` como fallback (`users.controller.ts:625`) — não é mais gerado localmente
- `source: 'http'`
- `timestamp`
- `tenantId` — a empresa do ator, do mesmo `X-Tenant-Id` que escopa as mutações;
  `null` é o bucket global (`users.controller.ts:631`)

Use cases persistem histórico via `AuditServicePort.record(...)` — a porta é
`apps/api/src/shared/audit/application/audit-service.port.ts` e o adaptador
Prisma fica em `apps/api/src/shared/audit/infrastructure/`.

## §7. Referências Cruzadas

- OpenAPI JSON: `apps/api/openapi.json` — **gerado e versionado** (desde o #125; `git ls-files apps/api/openapi.json` devolve a linha, `git check-ignore -v` devolve `exit=1`); regenerar via `pnpm --filter @projeto/api openapi:export`
- Spec de design do contrato: [`04-contrato-http.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md)
- ADR-0001 (DDD + Hexagonal + Auditoria): [`docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md)
- Controller fonte: [`apps/api/src/modules/users/infrastructure/http/users.controller.ts`](../../apps/api/src/modules/users/infrastructure/http/users.controller.ts)
- Schemas Zod: [`apps/api/src/modules/users/infrastructure/http/users.schemas.ts`](../../apps/api/src/modules/users/infrastructure/http/users.schemas.ts)
