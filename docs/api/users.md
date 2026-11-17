# API Reference — BC `users`

> Documento de referência da API HTTP do **Bounded Context `users`**.
> Contrato exportado para `apps/api/openapi.json` — artefato **derivado e
> versionado** (desde o #125); o gate `check-openapi-contract` compara a spec
> versionada com a gerada. A fonte do contrato são os decorators `@Api*` do
> código; este documento é a referência legível e precisa ser atualizado junto.
> Para regenerar: `pnpm --filter @projeto/api openapi:export`.
> Medido em 2026-11-17: os 8 endpoints deste BC conferem com
> `apps/api/openapi.json`. Contagem por
> `grep -hoE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/users/infrastructure/http/*.controller.ts | wc -l`
> → `8`. O contrato inteiro tem 24 paths e 30 operações
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → `24`;
> `node -e "const d=require('./apps/api/openapi.json');console.log(Object.values(d.paths).flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)"` → `30`),
> das quais 8 são de `users` — as outras 22 são `auth` (4), `tenancy` (5),
> `profiles` (10), `feature-flags` (2) e `health` (1). A conferência é manual:
> nada impede que a tabela derive do contrato.
> Spec de design: [`docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md).
> ADR-0001 (DDD + Hexagonal): [`docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).

## §1. Visão Geral

- **Base path**: `/api/v1/users` — e `/api/v1/admin/users` (rota 8, a do admin do SISTEMA)
- **Auth**: `Authorization: Bearer <jwt>` em **7 das 8** rotas — `POST /users` é
  `@Public()`. O `@ApiBearerAuth()` é **por handler** no `UsersController` e
  **na classe** no `AdminUserHistoryController`.
- **Guards**: `JwtAuthGuard` na **classe** do controller. As 5 rotas por `{id}`
  (`GET`, `PATCH`, `DELETE` em `/api/v1/users/{id}`, mais
  `POST /api/v1/users/{id}/restore` e `GET /api/v1/users/{id}/history`) somam
  `@UseGuards(UserOwnershipGuard)` — a sessão precisa ser a **dona** do recurso.
  A rota 8 soma `PermissionsGuard` + `@RequirePermission('admin.manage-users')`.
- **Content-Type**: `application/json; charset=utf-8` (request e response)
- **Erros**: RFC 7807 (Problem Details)
- **Versionamento**: `v1` no path; breaking changes abrem `v2`

## §2. Endpoints

| # | Método | Path                                | Auth | Códigos declarados no contrato            |
|---|--------|-------------------------------------|------|--------------------------------------------|
| 1 | `POST` | `/api/v1/users`                     | ❌   | `201`, `400`, `404`, `409`                  |
| 2 | `GET`  | `/api/v1/users`                     | ✅   | `200`                                       |
| 3 | `GET`  | `/api/v1/users/{id}`                 | ✅   | `200`, `403`, `404`                         |
| 4 | `PATCH`| `/api/v1/users/{id}`                 | ✅   | `200`, `400`, `403`, `404`, `412`           |
| 5 | `DELETE`| `/api/v1/users/{id}`                | ✅   | `204`, `400`, `403`, `404`, `412`           |
| 6 | `POST` | `/api/v1/users/{id}/restore`         | ✅   | `201`, `400`, `403`, `404`, `412`           |
| 7 | `GET`  | `/api/v1/users/{id}/history`         | ✅   | `200`, `403`                                |
| 8 | `GET`  | `/api/v1/admin/users/{id}/history`  | ✅   | `200`, `400`, `403`, `404`                   |

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

**Retry seguro (opcional):** a rota aceita o header `Idempotency-Key` — o
mesmo pedido com a mesma chave devolve a **mesma** resposta (e o header
`Idempotency-Replayed: true`), e a mesma chave com **outro** corpo leva
`409`. A semântica é do sistema, não deste BC: o dono é o
[system design §6](../system-design/dados.md) e a decisão é o
[ADR-0011](../adr/0011-idempotencia-de-escrita.md).

⚠️ **A chave tem de ser de alta entropia** — um **UUID v4** (36 caracteres).
A rota é `@Public()`, e o ator da reserva é a constante `anônimo`,
compartilhada por todos os clientes: uma chave adivinhável deixa quem
adivinha **bloquear a escrita de outra pessoa** (409 por até 24 h). O
servidor recusa chave com menos de **16** (`IDEMPOTENCY_KEY_TOO_SHORT`) ou
com mais de **255** caracteres (`IDEMPOTENCY_KEY_TOO_LONG`).

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

### 3.3 `GET /users/{id}` — Buscar por ID

Resposta `200` com `UserOutputDto`; `404` se não encontrado (soft-deletado **não** retorna — usar `includeDeleted=true` em `GET /users` ou restaurar antes); `403` (`USER_OWNERSHIP_VIOLATION`) se a sessão não for a dona da conta.

### 3.4 `PATCH /users/{id}` — Renomear

**Headers obrigatórios**: `If-Match: W/"v<N>"` (optimistic locking, RFC 7232). Ausência/invalidade → `400`.

**Request body** (`UpdateUserDto`): `{ novoNome: string }` (2..100 chars).

Resposta `200` com `UserOutputDto` + novo `ETag`. Conflito de versão → `412 Precondition Failed`.

### 3.5 `DELETE /users/{id}` — Soft delete

`If-Match: W/"v<N>"` obrigatório. `204 No Content` em sucesso. Conflito → `412`.

### 3.6 `POST /users/{id}/restore` — Restaurar soft-deletado

`If-Match: W/"v<N>"` obrigatório. `201 Created` com `UserOutputDto` + novo `ETag`.

### 3.7 `GET /users/{id}/history` — Histórico de auditoria

**Query params**: `cursor`, `limit` (mesma convenção de §3.2). `includeDeleted` **não** se aplica.

**Response `200`**: `{ entries: UserHistoryEntryDto[], nextCursor: string | null }`
(`UserHistoryPageDto`, de `packages/shared-types`).

**Códigos de erro**: `400` (`VALIDATION_ERROR` — query inválida, pela MESMA validação de §3.2) e `403` (`USER_OWNERSHIP_VIOLATION`). A
#124 fechou só uma das DUAS surfaces de query da API; a outra (`GET /users/{id}/history`) ainda
passava `Number(limit)` cru, e `limit=abc` virava `NaN` no `take:` do Prisma — **500**.

### 3.8 `GET /admin/users/{id}/history` — Histórico do ADMIN DO SISTEMA

A rota 7 é do **dono** (o `UserOwnershipGuard` exige que o `:id` seja o `sub` do
token); esta é do **administrador do SISTEMA**, e o `:id` é o de **qualquer**
pessoa. O portão é D2 (`tenantId === null && isAdmin`), dentro da use case — e
é ele que recusa o dono de uma empresa (que tem `isAdmin` no perfil efetivo DA
EMPRESA DELE). O `@RequirePermission('admin.manage-users')` é defense in depth.

**Query**: `cursor`, `limit` (§3.2). **Response `200`**: `UserHistoryPageDto` — o mesmo envelope da rota 7.

**A ORDEM É DESCENDENTE** — a versão mais **recente** primeiro. ⚠️ A ordem é do
**input do port** (`ListHistoryInput.ordem`, padrão `'asc'`), e não do wire: a
rota do DONO (a 7) continua **ascendente**, e a rota do ADMIN pede `'desc'`. A
ordem anda com o **cursor**: o `nextCursor` aponta para as versões mais
**antigas**. ⚠️ Inverter só a exibição não resolveria — o cursor da API andava
para o mais antigo, e a primeira página (as 100 mais antigas) não contém a
mais recente.

**O CURSOR** é o `id` da **linha** (`users_history.id`, um uuid v4) — e ele é
resolvido **dentro da entidade**: um cursor de outra trilha é **inválido** (400),
e a resposta é a **mesma** de "o cursor não existe" (o erro não diz se aquele id
existe).

**A PESSOA APAGADA** é alcançável: o soft-delete **não apaga a trilha** — a
linha em `users`, a entrada `DELETE` em `users_history` e o `users_archive`
continuam lá, visíveis na credencial de sistema. A conferência de existência
usa `includeDeleted`, e por isso o histórico de quem **saiu** da empresa não é
um 404.

**Códigos de erro**: `400` (`VALIDATION_ERROR` — query inválida, cursor de outra
trilha **ou** `:id` que não é um UUID v7), `403` (`FORBIDDEN` — não é o
administrador do sistema) e `404` (`USER_NOT_FOUND` — pessoa inexistente). A
leitura é no **bucket de SISTEMA** — é ele que atravessa empresas.

⚠️ **A RECUSA DEIXA RASTRO**: o portão D2 é registrado com o ator e o alvo
(`Logger('AdminUserHistory')`) — uma escalada é 403, e 403 não loga no
`GlobalExceptionFilter`.

## §4. `includeDeleted` — case-insensitive

Aceita `"true"`, `"True"`, `"TRUE"`, `"1"`. Demais valores → `false`. Tipo Swagger: `String` (não `Boolean`) — permite a aceitação flexível sem quebra de contrato OpenAPI 3.0 (booleans são estritos em query strings).

## §5. Optimistic Locking (RFC 7232)

- Toda resposta mutante **que devolve o usuário** (`POST /users`, `PATCH`,
  `POST /api/v1/users/{id}/restore`) inclui `ETag: W/"v<N>"` (header). `DELETE` responde `204`
  sem corpo e sem ETag.
- Mutating endpoints (`PATCH`, `DELETE`, `POST /api/v1/users/{id}/restore`) exigem `If-Match: W/"v<N>"`.
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

## §7. Invariantes da linha (e quem as guarda)

Duas colunas de `users` têm regra de formato, e cada regra tem **um dono
autoritativo** — a função SQL, que é onde o dado morre:

| Coluna | Regra | Dono autoritativo (na escrita) | Reafirmação na aplicação (na leitura) |
|---|---|---|---|
| `id` | UUID **v7** (ordenado no tempo) | CHECK constraint `users_id_uuid_v7` (função `user_id_is_uuid_v7`) | VO `UserId` |
| `password_hash` | envelope **argon2id** (PHC) | CHECK constraint `users_password_hash_argon2id` (função `password_hash_is_valid_argon2id`) | VO `PasswordHash` |

Antes de 2026-11-16 a regra vivia SÓ no value object, e ele validava na
**leitura** — a coluna era `TEXT`/`uuid` sem nenhuma restrição. MEDIDO no banco
local: nove linhas violavam as DUAS (gravadas por fora da aplicação), e uma
delas bastava para a listagem inteira devolver 500 (hash) e depois 400 (id).

A função SQL e o VO **não são duas fontes de verdade**: a função é a regra, e o
VO é a **reafirmação** dela na fronteira da aplicação (onde o valor entra no
agregado). Para o `id`, as duas regras são **iguais** — mesmo conjunto de
valores, mesma forma canônica. Para o `password_hash`, o banco é **mais
estrito** em **dois** pontos — os parâmetros (a
`users_password_hash_argon2id` exige exatamente `m`, `t` e `p`; o VO aceita
parâmetros extras com valor numérico) e o teto (o banco conta 512 **bytes**, o
VO conta 512 unidades UTF-16) — e a direção é a segura: o banco recusa
**antes** da aplicação ler. O instrumento que ata as duas é
[`invariantes-da-conta-no-banco.integration.spec.ts`](../../apps/api/src/modules/users/infrastructure/persistence/invariantes-da-conta-no-banco.integration.spec.ts),
que passa o mesmo corpus pelos dois lados e afirma a implicação "o banco
aceitou ⟹ o VO aceita" — a cópia do VO só pode divergir no sentido seguro.

### §7.1 As migrations que deram dono às regras

As seis migrations que deram o **dono** ao banco — a ordem (o reparo antes da
restrição), o que elas não deixam na trilha, e como restaurar um dump anterior
— estão em [`users-migracoes.md`](./users-migracoes.md).

## §8. Referências Cruzadas

- OpenAPI JSON: `apps/api/openapi.json` — **gerado e versionado** (desde o #125; `git ls-files apps/api/openapi.json` devolve a linha, `git check-ignore -v` devolve `exit=1`); regenerar via `pnpm --filter @projeto/api openapi:export`
- Spec de design do contrato: [`04-contrato-http.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md)
- ADR-0001 (DDD + Hexagonal + Auditoria): [`docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md)
- ADR-0002 (argon2id e a senha fora do agregado): [`docs/adr/0002-autenticacao-jwt-argon2.md`](../adr/0002-autenticacao-jwt-argon2.md)
- Controller fonte: [`apps/api/src/modules/users/infrastructure/http/users.controller.ts`](../../apps/api/src/modules/users/infrastructure/http/users.controller.ts)
- Schemas Zod: [`apps/api/src/modules/users/infrastructure/http/users.schemas.ts`](../../apps/api/src/modules/users/infrastructure/http/users.schemas.ts)
