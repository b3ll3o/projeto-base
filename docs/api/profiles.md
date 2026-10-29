# API Reference — BC `profiles`

> Documento de referência da API HTTP do **Bounded Context `profiles`** (RBAC:
> perfis, permissões e a atribuição de perfil a um usuário).
> A fonte do contrato são os decorators `@Api*` dos controllers **e** o
> `apps/api/openapi.json`, que é **VERSIONADO** (`git ls-files
> apps/api/openapi.json` → imprime o caminho; `git check-ignore -v
> apps/api/openapi.json` → `exit=1`, ou seja, nenhuma regra do `.gitignore` o
> pega). O gate `check-openapi-contract` compara a spec versionada com a gerada
> pelo código — regenerar: `pnpm --filter @projeto/api openapi:export`.
> ADR-0001 (DDD + Hexagonal, a estrutura `domain/application/infrastructure` que
> este BC segue): [`../adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).
> Medido em 2026-10-29: os 10 endpoints deste BC conferem com
> `apps/api/openapi.json`. Contagem por
> `grep -hoE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/profiles/infrastructure/http/*.controller.ts | wc -l`
> → `10`. O contrato inteiro tem 22 paths e 28 operações
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → `22`;
> `node -e "const d=require('./apps/api/openapi.json');console.log(Object.values(d.paths).flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)"` → `28`),
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
  rotas — a exceção é `GET /admin/permissions`, que devolve o catálogo **global**
  de permissões (`listarPermissoes()` não recebe o ator). Ausente → bucket
  GLOBAL (`tenantId === null`), onde mora o perfil de sistema e o único
  `isAdmin`; malformado → `400 INVALID_TENANT`; presente e a conta não pertence
  à empresa → `403 TENANT_MEMBERSHIP_REQUIRED`.
- **Content-Type**: `application/json; charset=utf-8` (request e response).
- **Erros**: RFC 7807 (Problem Details) — `type`, `title`, `status`, `detail`,
  `instance`, `code`, `traceId` e `errors[]` (`global-exception.filter.ts:59-68`).
- **Guards**: `JwtAuthGuard` na classe dos 4 controllers; `PermissionsGuard`
  nos 3 controllers `admin.*` (e **não** no `me-profile`).

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

⚠️ Os códigos da tabela são os **declarados** no `openapi.json`. Os 4 controllers deste
BC não declaram `@ApiResponse`, então o contrato só traz o default do Nest por
método — e os erros de domínio (403, 404, 409) **não aparecem** na spec. A lista
real está em §3.9.

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
  obrigatório; `description` ausente deixa a descrição como está. Response `200`.
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
INVALID_PERMISSION_KEY`. A permissão é **concedida**, não **trocada**: a lista
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
| `400` | 2, 6, 7 (e todas, pelo header) | `slug` malformado (`VALIDATION_ERROR`), `permissionKey` fora do catálogo (`INVALID_PERMISSION_KEY`), `profileId` que não é UUID, `X-Tenant-Id` malformado (`INVALID_TENANT`) |
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

## §5. Modelo de dados

Modelos Prisma do BC (`apps/api/prisma/schema.prisma`):

| Model | Tabela | Papel |
|-------|--------|-------|
| `Profile` | `profiles` | o perfil. `slug`, `name`, `description`, `tenantId` (nulo = perfil global), `isAdmin` (bypass total), `isSystem` (congelado). Sem soft-delete |
| `Authorization` | `authorizations` | "perfil TEM a permissão X". `@@unique([profileId, permissionKey])` |

⚠️ **O `slug` do perfil NÃO tem `@unique` no Prisma.** A unicidade vem de **dois
índices parciais em SQL puro** (migration
`20261017000000_tenant_membership_invitation`): `profiles_slug_global_uniq`
(`slug` onde `tenant_id IS NULL`) e `profiles_tenant_slug_uniq`
(`tenant_id`+`slug` onde `tenant_id IS NOT NULL`). O motivo: no Postgres
`NULL != NULL`, então um `@@unique([tenantId, slug])` deixaria o seed duplicar o
`admin` global em silêncio.

⚠️ **As duas colunas de vínculo do perfil.** `users.profile_id` é o bucket GLOBAL (o
perfil de sistema do seed); `tenant_memberships.profile_id` é o perfil **daquela
empresa** — é o que a Fase 4 passou a ler. O hard-delete é protegido pela contagem
de usos (§6).

⚠️ **O que a RLS implica.** `profiles` tem `ENABLE ROW LEVEL SECURITY` e as
policies comparam `tenant_id` com o escopo da sessão (`no_escopo_atual(...)`,
migration `20261020000000_rls_isolation_empresa`). A leitura "todos os perfis" só
devolve a base inteira na **credencial de sistema**. E a RLS **não** fecha a
escalada no caminho do bucket global: sob o escopo `'*'` a policy aceita qualquer
`profile_id` — quem fecha é a trava de escalada da aplicação.

## §6. Notas e armadilhas

⚠️ **Um perfil `isSystem: true` é intocável.** `PATCH` e `DELETE` devolvem
`403 PROFILE_SYSTEM_PROTECTED`. O trio `gerente`/`coordenador`/`funcionario` que
toda empresa nasce com é criado **congelado** (`isSystem: true`) — é o CATÁLOGO,
e uma empresa que apaga o seu `coordenador` deixa de ter os três perfis que toda
empresa tem. Quem precisa de um papel sob medida cria um perfil
(`POST /admin/profiles`) e ajusta esse.

⚠️ **Um perfil `isAdmin: true` também é intocável** — `403 PROFILE_ADMIN_PROTECTED`
no `PATCH` e no `DELETE`. E só um ator com `isAdmin` pode **vestir** um perfil
admin. O campo `isAdmin` que a listagem devolve é o bypass total do
`PermissionsGuard`, lido do perfil e não do `Authorization`: um perfil `isAdmin`
sem nenhuma autorização continua passando em tudo.

⚠️ **`DELETE` só passa com ZERO usos.** A trava soma as **duas** contagens —
`users.profile_id` (bucket global) e `tenant_memberships.profile_id` (por empresa) —
e devolve `409 PROFILE_HAS_USERS` se houver algum. Sem a segunda contagem, a
trava passaria e o `ON DELETE RESTRICT` do banco estouraria `P2003` — `500` onde
o certo é `409`.

⚠️ **Dentro da empresa ninguém altera o próprio perfil** (nem para vestir outro,
nem para tirar o que tem) — `403 PRIVILEGE_ESCALATION`. O motivo é a
irreversibilidade: `emitirConvite` grava `role: 'member'` fixo, então não existe
rota que devolva `gerente` a ninguém. Fora da empresa (`X-Tenant-Id` ausente) a
regra não se aplica.

⚠️ **`PUT /admin/users/{id}/profile` escreve em coluna diferente conforme o
header.** Com `X-Tenant-Id`, grava `tenant_memberships.profile_id`; sem header,
grava `users.profile_id`. Sem header, um ator não-admin com
`admin.manage-users` desligava o perfil `isAdmin` do root — hoje o `403` sai
antes. E **o motivo da escalada não vai para o corpo**: a
`ProfilePrivilegeEscalationException` o carrega no campo `motivo`, que é o que
o log lê — o `detail` do RFC 7807 sai com o **nome da classe**, porque dizer
qual regra impediu a escalada é mapear o sistema.

## Ver Também

- [`./tenancy.md`](./tenancy.md) — o BC que detém `tenant_memberships`, de onde vem o perfil efetivo por empresa.
- [`./feature-flags.md`](./feature-flags.md) — o outro guard de rota (permissão: OR; flag: AND).
- [`./users.md`](./users.md) — a conta à qual o perfil é vestido.
- [`../adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md) — a estrutura de pastas deste BC.
