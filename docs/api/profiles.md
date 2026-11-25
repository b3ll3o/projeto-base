# API Reference — BC `profiles`

> Documento de referência da API HTTP do **Bounded Context `profiles`** (RBAC:
> perfis, permissões e a atribuição de perfil a um usuário).
> A fonte do contrato são os decorators `@Api*` dos controllers **e** o
> `apps/api/openapi.json`, que é **VERSIONADO** (`git check-ignore -v` nele →
> `exit=1`: nenhuma regra do `.gitignore` o pega). O gate
> `check-openapi-contract` compara a spec versionada com a gerada — regenerar:
> `pnpm --filter @projeto/api openapi:export`.
> ADR-0001 (DDD + Hexagonal): [`../adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).
> Medido em 2026-10-29: este BC tem **10** endpoints
> (`grep -hoE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/profiles/infrastructure/http/*.controller.ts | wc -l`
> → `10`) e o contrato inteiro tem **24 paths**
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → `24`)
> e **30 operações**
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.values(d.paths).flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)"` → `30`),
> das quais 18 são de `tenancy`, `profiles`, `feature-flags` e `health`.

## §1. Visão geral

- **Base path**: `/api/v1` (prefixo global de `apps/api/src/main.ts:41`,
  `app.setGlobalPrefix('api/v1')`). Este BC não tem prefixo próprio: as rotas
  vivem em `/admin/profiles`, `/admin/permissions`, `/admin/users/{id}/profile`
  e `/me/profile`.
- **Auth**: `Authorization: Bearer <jwt>` em **todas** as 10 rotas
  (`@ApiBearerAuth()` na **classe** dos 4 controllers — nenhuma delas tem rota
  pública).
- **Header de empresa**: `X-Tenant-Id` é **opcional** e muda o escopo de 9 das 10
  rotas — a exceção é `GET /admin/permissions` (catálogo **global**). Ausente →
  bucket GLOBAL (`tenantId === null`), onde mora o perfil de sistema e o único
  `isAdmin`; malformado → `400 INVALID_TENANT`; presente e a conta não pertence
  à empresa → `403 TENANT_MEMBERSHIP_REQUIRED`.
- **Content-Type**: `application/json; charset=utf-8` (request e response).
- **Erros**: RFC 7807 — `type`, `title`, `status`, `detail`, `instance`, `code`,
  `traceId` e `errors[]` (`global-exception.filter.ts:59-68`).
- **Guards**: `JwtAuthGuard` na classe dos 4 controllers; `PermissionsGuard` nos
  3 controllers `admin.*` (e **não** no `me-profile`).

## §2. Endpoints

| #  | Método  | Path                                        | Auth | Códigos principais      |
|----|---------|---------------------------------------------|------|-------------------------|
| 1  | `GET`    | `/api/v1/admin/profiles`                    | ✅   | `200`                   |
| 2  | `POST`   | `/api/v1/admin/profiles`                    | ✅   | `201`                   |
| 3  | `GET`    | `/api/v1/admin/profiles/{id}`               | ✅   | `200`                   |
| 4  | `PATCH`  | `/api/v1/admin/profiles/{id}`               | ✅   | `200`                   |
| 5  | `DELETE` | `/api/v1/admin/profiles/{id}`               | ✅   | `200`                   |
| 6  | `POST`   | `/api/v1/admin/profiles/{id}/authorizations` | ✅   | `201`                   |
| 7  | `DELETE` | `/api/v1/admin/profiles/{id}/authorizations/{key}` | ✅ | `200`             |
| 8  | `GET`    | `/api/v1/admin/permissions`                 | ✅   | `200`                   |
| 9  | `PUT`    | `/api/v1/admin/users/{id}/profile`          | ✅   | `200`                   |
| 10 | `GET`    | `/api/v1/me/profile`                        | ✅   | `200`                   |

⚠️ Os códigos da tabela são os **declarados** no `openapi.json`. Os 4 controllers
deste BC não declaram `@ApiResponse` — os erros de domínio (403, 404, 409)
**não aparecem** na spec. A lista real está em §3.9.

## §3. Payloads

### 3.1 `GET /admin/profiles` — listar

Sem body. Response `200` (`ProfileSummary[]`):

```json
[ { "id": "0190a8b6-…", "slug": "gerente", "name": "Gerente",
    "isAdmin": true, "isSystem": true, "description": null,
    "permissionCount": 7 } ]
```

⚠️ **A lista é filtrada pela empresa do ator.** O repositório devolve a lista inteira
quando `tenantId === null`; fora do bucket de sistema a use case filtra por
`profile.tenantId() === ator.tenantId`. Sem esse filtro, um perfil global
**não-admin** com `admin.manage-*` entregava os UUIDs dos perfis das empresas
vizinhas — e o UUID é o passo 1 de qualquer escalada.

### 3.2 `POST /admin/profiles` — criar

Request:

```json
{ "slug": "gestor", "name": "Gestor", "description": "opcional",
  "initialPermissions": ["users.read", "users.write"] }
```

Response `201` (`ProfileDetail` — o summary **mais** `permissions`, `createdAt`,
`updatedAt`, `version`):

```json
{ "id": "0190a8b6-…", "slug": "gestor", "name": "Gestor",
  "isAdmin": false, "isSystem": false, "description": "opcional",
  "permissionCount": 2, "permissions": ["users.read", "users.write"],
  "createdAt": "2026-10-29T12:00:00.000Z", "updatedAt": "…", "version": 1 }
```

⚠️ **O corpo é validado por Zod na fronteira** (`profiles.schemas.ts`) — o que
impede o `500` que a rota devolvia antes (issue #185): um `initialPermissions`
que não é lista de textos era iterado pelo agregado como valor cru (TypeError),
e uma string como lista de CARACTERES. Agora: `initialPermissions` fora de
lista, ou `slug`/`name` fora do VO (com a **mensagem do VO**) → `400`; e mais
chaves **distintas** que o catálogo → `400` (o catálogo é o dono do número).

⚠️ **`isAdmin` e `isSystem` NÃO são aceitos no body.** O controller não os
repassa e o tipo de entrada `CreateProfileInput` não os tem — a garantia é do
**tipo**, não do controller (um segundo controller ou um endpoint novo
reabria a porta). Só o seed/migration, que escreve direto no Prisma, cria
perfil admin. Se o cliente mandar `isAdmin: true`, o campo é simplesmente
ignorado (não há validação que o recuse).

⚠️ **`initialPermissions` é uma CONCESSÃO.** `POST /admin/profiles` só exige
`admin.manage-profiles` — a chave de gerir perfis, **não** a de conceder
permissões. Um ator sem `isAdmin` só cria um perfil cujas permissões sejam
**subconjunto** das que ele mesmo tem (medidas no perfil que ele veste na empresa
em que está agindo).

### 3.3 `GET|PATCH|DELETE /admin/profiles/{id}` — ler, atualizar, excluir

:id` é **UUID**, nunca slug (as páginas web recebem slug na URL e resolvem via
`lib/perfil.ts`).

- `GET` → `200` com `ProfileDetail`.
- `PATCH` — body: `{ "name": "Novo nome", "description": "opcional" }`. `name` é
  obrigatório. Response `200`.
  ⚠️ **`description` AUSENTE e `description: null` são diferentes** (issue #185):
  ausente = o cliente não tocou no campo (preservado); `null` = o cliente pediu
  a limpeza. Antes, a ausência virava limpeza — e todo PATCH parcial apagava a
  descrição que o cliente não tocou.
- `DELETE` → `200` com corpo **vazio** (não é `204`: o `openapi.json` declara
  `200`, e o Nest devolve `200` para um handler que resolve `void`).

### 3.4 `POST /admin/profiles/{id}/authorizations` — conceder

Request:

```json
{ "permissionKey": "users.read" }
```

Response `201` com o `ProfileDetail` **já atualizado** (as permissões depois
da concessão). A chave precisa constar no catálogo
(`shared/auth/permissions-catalog.ts`); chave fora do catálogo → `400
INVALID_PERMISSION_KEY`. ⚠️ A comparação é **EXATA** (a chave não é aparada) e a
chave vazia → `400 VALIDATION_ERROR` (a forma é do boundary; a existência da
chave, do domínio). A permissão é **concedida**, não **trocada**: a lista
do perfil é acrescida, não substituída.

### 3.5 `DELETE /admin/profiles/{id}/authorizations/{key}` — revogar

`:key` é a **permission key** (string com pontos, ex. `admin.manage-users`).
Response `200` com o `ProfileDetail` atualizado.

⚠️ `revogar` **não** passa pela trava de auto-concessão: remover permissão nunca
é escalada, e aplicá-la ali trancava o ator dentro de um perfil com concessão
indevida que só outro admin desfaria.

### 3.6 `GET /admin/permissions` — o catálogo

Sem body. Response `200` (`string[]`) — as chaves do catálogo, hoje:

```json
["users.read", "users.write", "users.delete", "admin.manage-profiles",
 "admin.manage-authorizations", "admin.manage-users",
 "admin.manage-feature-flags", "audits.read"]
```

⚠️ `admin.*` é **namespace visual, não curinga**: ter `admin.manage-profiles`
não dá `admin.audit`. O guard compara string exata — sem match, nega.

### 3.7 `PUT /admin/users/{id}/profile` — vestir um perfil

Request — `{ "profileId": "0190a8b6-…" }`. `profileId: null` **limpa** o perfil
do usuário (é o mesmo PUT; não existe DELETE para isso). Response `200`:
`{ "ok": true }`.

⚠️ O corpo é validado por Zod (issue #185): `profileId` ausente é o mesmo que
`null` (o usuário fica sem perfil), e um `profileId` que não é uuid → `400`.

⚠️ **O `:id` do usuário é UUID** e o do perfil também. A comparação de
propriedade (ninguém altera o próprio perfil dentro da empresa) normaliza
**caixa** — o `UUID_RE` do VO tem flag `/i`, então um id em caixa alta passaria
na validação e só o `===` negaria.

### 3.8 `GET /me/profile` — o perfil efetivo do ator

Sem body. Response `200`:

```json
{ "profileId": "0190a8b6-…", "profileSlug": "gerente", "profileName": "Gerente",
  "isAdmin": true, "permissions": ["users.read", "users.write"] }
```

Sem perfil, o mesmo `200` com tudo nulo/vazio: `{ "profileId": null,
"profileSlug": null, "profileName": null, "isAdmin": false, "permissions": [] }`

⚠️ **O perfil efetivo depende do `X-Tenant-Id`.** Com header, o perfil vem de
`tenant_memberships.profile_id` (o perfil **daquela** empresa); sem header, vem do
global (`users.profile_id`). A mesma conta em duas empresas lê **dois** perfis
diferentes. A rota é a **fonte** do cache que o `JwtAuthGuard` e o
`PermissionsGuard` leem — chamá-la esquenta o cache e evita o `403` de cache frio.
E **não existe `userId` nem objeto `profile` aninhado**: os campos são
`profileId`/`profileSlug`/`profileName` no topo.

### 3.9 O que cada status significa aqui

| Status | Onde | Motivo |
|--------|------|--------|
| `400` | 2, 3, 4, 6, 7 (e todas, pelo header) | `slug`/`name` fora das regras do VO (`VALIDATION_ERROR`), corpo malformado — `initialPermissions` que não é lista de textos, `permissionKey` vazia, `profileId` que não é UUID (`VALIDATION_ERROR`), `permissionKey` fora do catálogo (`INVALID_PERMISSION_KEY`), `X-Tenant-Id` malformado (`INVALID_TENANT`) |
| `401` | todas | token ausente, inválido, expirado ou de tipo errado |
| `403` | todas | falta a permissão (`admin.manage-*`), escalada bloqueada (`PRIVILEGE_ESCALATION`), perfil protegido (`PROFILE_SYSTEM_PROTECTED` / `PROFILE_ADMIN_PROTECTED`) ou empresa da qual a conta não é membro (`TENANT_MEMBERSHIP_REQUIRED`) |
| `404` | 3, 4, 5, 6, 7, 9 | perfil ou usuário inexistente (`PROFILE_NOT_FOUND` / `USER_NOT_FOUND`) |
| `409` | 2, 5, 6 | `slug` já usado (`PROFILE_SLUG_IN_USE`), perfil ainda em uso (`PROFILE_HAS_USERS`), autorização já atribuída |

## §4. Guards, flags e permissões

| Rota | Guard de classe | Permissão (`@RequirePermission`) |
|------|------------------|-------------------------------------|
| `GET`/`POST /admin/profiles`, `GET`/`PATCH`/`DELETE /admin/profiles/{id}` | `JwtAuthGuard` + `PermissionsGuard` | `admin.manage-profiles` |
| `POST /admin/profiles/{id}/authorizations`, `DELETE /admin/profiles/{id}/authorizations/{key}`, `GET /admin/permissions` | `JwtAuthGuard` + `PermissionsGuard` | `admin.manage-authorizations` |
| `PUT /admin/users/{id}/profile` | `JwtAuthGuard` + `PermissionsGuard` | `admin.manage-users` |
| `GET /me/profile` | `JwtAuthGuard` | — (qualquer conta autenticada) |

⚠️ **Nenhuma rota deste BC usa `@RequireFeatureFlag`** — as flags são do BC
[`feature-flags`](./feature-flags.md).

⚠️ **O `@RequirePermission` está no HANDLER, não na classe** — o
`PermissionsGuard` devolve `true` quando não há requisito
(`permissions.guard.ts:60`), então um handler novo sem o decorator ficaria
**aberto**. O `@ApiBearerAuth()`, esse sim, está na **classe**: no documento
OpenAPI a rota protegida é a que declara `security`, e a pública é a **única**
que não declara.

⚠️ **A permissão é OR, a feature flag é AND.** O `PermissionsGuard` aceita qualquer
uma das chaves requeridas; o `FeatureFlagGuard` exige **todas** as flags do
handler ligadas — permissão é "basta uma destas", flag é "a funcionalidade
depende destas".

⚠️ **O `PermissionsGuard` hidrata o perfil a cada request** (read-through no
cache) e escreve `isAdmin`/`permissions` de volta em `req.user`. Sem isso,
cache frio daria `403` a quem **tem** a permissão.

## §5. Modelo de dados e notas de armadilha

⚠️ As duas seções que descrevem o **modelo** (`profiles`, `permissions`,
`authorizations`) e as **armadilhas** do domínio (perfil de sistema intocável,
`isAdmin` como bypass, a trava de `DELETE`, a escalada dentro da empresa) foram
para o arquivo irmão [`profiles-notas.md`](./profiles-notas.md) — este
documento é a referência do **CONTRATO HTTP**, e ele já passou do teto de 300
linhas que a convenção de documentação viva impõe.

## Ver Também

- [`./tenancy.md`](./tenancy.md) — o BC que detém `tenant_memberships`, de onde vem o perfil efetivo por empresa.
- [`./feature-flags.md`](./feature-flags.md) — o outro guard de rota (permissão: OR; flag: AND).
- [`./users.md`](./users.md) — a conta à qual o perfil é vestido.
- [`../adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md) — a estrutura de pastas deste BC.
