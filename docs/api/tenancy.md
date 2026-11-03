# API Reference — BC `tenancy`

> Documento de referência da API HTTP do **Bounded Context `tenancy`**.
> A fonte do contrato são os decorators `@Api*` dos controllers **e** o
> `apps/api/openapi.json`, que é **VERSIONADO** (`git ls-files
> apps/api/openapi.json` → imprime o caminho; `git check-ignore -v
> apps/api/openapi.json` → `exit=1`, ou seja, nenhuma regra do `.gitignore` o
> pega). O gate `check-openapi-contract` compara a spec versionada com a gerada
> pelo código — regenerar: `pnpm --filter @projeto/api openapi:export`.
> ADR-0001 (DDD + Hexagonal, a estrutura `domain/application/infrastructure` que
> este BC segue): [`../adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).
> Medido em 2026-10-29: os 5 endpoints deste BC conferem com
> `apps/api/openapi.json`. Contagem por
> `grep -hoE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/tenancy/infrastructure/http/*.controller.ts | wc -l`
> → `5`. O contrato inteiro tem 22 paths e 28 operações
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → `22`;
> `node -e "const d=require('./apps/api/openapi.json');console.log(Object.values(d.paths).flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)"` → `28`),
> das quais 18 são de `tenancy`, `profiles`, `feature-flags` e `health` — os
> outros 10 são `auth` (3) e `users` (7).

## §1. Visão geral

- **Base path**: `/api/v1` (prefixo global de `apps/api/src/main.ts:41`,
  `app.setGlobalPrefix('api/v1')`). Este BC não tem prefixo próprio: as rotas
  vivem em `/tenants`, `/invitations`, `/me/tenants` e `/admin/tenancy`.
- **Auth**: `Authorization: Bearer <jwt>` em **todas** as 5 rotas
  (`@ApiBearerAuth()` em cada handler). Não há rota `@Public()` neste BC.
- **Header de empresa**: `X-Tenant-Id` é **opcional** e vale para as 5 rotas,
  porque é o `JwtAuthGuard` que o lê (`jwt-auth.guard.ts:201`). Ausente → bucket
  GLOBAL (`tenantId === null`); malformado → `400 INVALID_TENANT`; presente e
  a conta não pertence à empresa → `403 TENANT_MEMBERSHIP_REQUIRED`.
- **Content-Type**: `application/json; charset=utf-8` (request e response).
- **Erros**: RFC 7807 (Problem Details) — `type`, `title`, `status`, `detail`,
  `instance`, `code`, `traceId` e, quando é erro de campo, `errors[]`
  (`global-exception.filter.ts:59-68`).
- **Guards**: `JwtAuthGuard` na **classe** dos 3 controllers;
  `PermissionsGuard` só no `AdminTenancyController`; `FeatureFlagGuard` só nos
  2 handlers de convite.

## §2. Endpoints

| # | Método | Path                                | Auth | Códigos principais                             |
|---|--------|-------------------------------------|------|------------------------------------------------|
| 1 | `POST` | `/api/v1/tenants`                   | ✅   | `201`, `400`, `401`, `404`, `409`               |
| 2 | `GET`  | `/api/v1/me/tenants`                | ✅   | `200`, `401`                                   |
| 3 | `POST` | `/api/v1/tenants/{id}/invitations`  | ✅   | `201`, `400`, `401`, `403`, `404`, `409`        |
| 4 | `POST` | `/api/v1/invitations/accept`        | ✅   | `201`, `400`, `401`, `403`, `404`, `409`, `410` |
| 5 | `GET`  | `/api/v1/admin/tenancy`             | ✅   | `200`, `401`, `403`                            |

## §3. Payloads

### 3.1 `POST /tenants` — criar a própria empresa

Request (Zod no boundary; `nome` e `slug` seguem os mesmos limites do ramo
`empresa` de `POST /users`):

```json
{ "nome": "Acme Ltda", "slug": "acme-ltda" }
```

- `nome`: `trim()`, 2..100 chars (`MIN_LENGTH`/`MAX_LENGTH` de `UserName`).
- `slug`: `trim()`, 3..50 chars, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

Response `201` (`EmpresaAberta`):

```json
{ "id": "0190a8b6-1c2d-7e3f-9a4b-5c6d7e8f9a0b", "nome": "Acme Ltda", "slug": "acme-ltda" }
```

⚠️ O `trim()` vem **antes** do `min`: sem ele `"   "` passaria o `min(2)` e a
empresa nasceria com o nome em branco. O `slug` tem o mesmo cuidado — sem
`trim`, `" acme "` era recusado com a mensagem de formato (o problema real era o
espaço em volta).

### 3.2 `GET /me/tenants` — as empresas do ator

Sem body. Response `200` (`EmpresaDoUsuario[]`, o tipo de retorno do controller;
o mesmo wire format em `packages/shared-types` é `EmpresaDoUsuarioDto[]`):

```json
[
  { "id": "0190a8b6-…", "nome": "Acme Ltda", "slug": "acme-ltda", "role": "gerente" }
]
```

Lista **vazia** é `200` com `[]` — a conta em onboarding (ou o admin de
sistema) não pertence a empresa nenhuma, e isso é uma resposta, não ausência
de recurso. ⚠️ A **ordem** é parte do contrato: primeiro as empresas onde há
perfil efetivo (a mais recente primeiro), por último as que não têm.

`role` é o rótulo de vínculo (`gerente` | `member`) e **não** é o RBAC — quem
diz o que a pessoa pode fazer é o perfil que ela veste na empresa.

### 3.3 `POST /tenants/{id}/invitations` — convidar

Path `:id` é validado como **uuid** (Zod no boundary; um path malformado daria
`400`, não `500` do driver). Request:

```json
{ "email": "pessoa@example.com" }
```

Response `201`:

```json
{ "token": "6f1a…(64 hex)", "expiresAt": "2026-11-05T12:00:00.000Z" }
```

⚠️ O **token volta na resposta** porque o repo não tem maileiro: é a única
forma de a tela de admin mostrar o link. Validade: 7 dias
(`VALIDADE_CONVITE_MS`, `tenancy.use-cases.ts:54`).

### 3.4 `POST /invitations/accept` — aceitar e entrar na empresa

Request:

```json
{ "token": "6f1a…(64 hex)" }
```

Response `201`:

```json
{ "aceito": true, "tenantId": "0190a8b6-…" }
```

⚠️ O `tenantId` volta porque é o que o web precisa para apontar a sessão
(cookie de empresa). Sem ele a conta entra na empresa e fica com **zero**
permissões na tela — membership sem escopo.

### 3.5 `GET /admin/tenancy` — o inventário do sistema

Sem body. Response `200` (`InventarioAdminTenancyDto`) — as duas listas juntas,
lidas no **mesmo instante**:

```json
{
  "empresas": [
    {
      "id": "0190a8b6-…", "nome": "Acme Ltda", "slug": "acme-ltda",
      "membros": [
        { "id": "0190c7d8-…", "nome": "Ana", "email": "ana@example.com",
          "role": "gerente", "perfil": "gerente" }
      ]
    }
  ],
  "usuarios": [
    { "id": "0190c7d8-…", "nome": "Ana", "email": "ana@example.com",
      "empresas": [
        { "id": "0190a8b6-…", "nome": "Acme Ltda", "slug": "acme-ltda",
          "role": "gerente", "perfil": "gerente" }
      ]
    }
  ]
}
```

`perfil` é o **slug** do perfil efetivo naquela empresa, e `null` quando a
membership não tem perfil (ou tem um de outra empresa). `empresas: []` é
legítimo — o admin de sistema vive no bucket global e não pertence a empresa
nenhuma.

### 3.6 O que cada status significa aqui

| Status | Onde | Motivo |
|--------|------|--------|
| `400` | 1, 3, 4 | Zod: body ou path param inválido (uuid malformado, `slug` com formato errado, token que não é 64 hex) |
| `401` | todas | token ausente, inválido, expirado ou de tipo errado |
| `403` | 3, 4, 5 | 3: quem convida não é `gerente` da empresa (`NaoAdministraEmpresaException`); 4: o convite é de outro e-mail (`outro-email`); 5: o ator não é o administrador do **sistema** |
| `404` | 1, 3, 4 | 1: a conta foi **apagada** entre o token ser emitido e o pedido (`USER_NOT_FOUND`); 3 e 4: **funcionalidade desligada** (flag) |
| `409` | 1, 3, 4 | 1: já existe empresa com este `slug` (`EMPRESA_JA_EXISTE`); 3: já existe convite pendente para este e-mail (`CONVITE_JA_EMITIDO`); 4: o convite já foi usado (`CONVITE_INVALIDO`) ou a conta já é membro (`CONVITE_JA_MEMBRO`) |
| `410` | 4 | o convite **expirou** — existiu e foi válido |
| `400`/`403` | todas | do header `X-Tenant-Id`: malformado → `400 INVALID_TENANT`; empresa da qual a conta não é membro → `403 TENANT_MEMBERSHIP_REQUIRED` (só quando o header é enviado) |

⚠️ **`404` tem três significados** nesta API e o corpo é o que desambigua: o
`code` é `USER_NOT_FOUND`, `CONVITE_INVALIDO` ou `NOT_FOUND` (a flag
desligada). Para a flag desligada o corpo é o Problem Details padrão e **não**
diz qual chave foi desligada — ver §6.

## §4. Guards, flags e permissões

| Rota | Guard de classe | Guard de handler | Permissão | Flag |
|------|------------------|------------------|-----------|------|
| `POST /tenants` | `JwtAuthGuard` | — | — | — |
| `GET /me/tenants` | `JwtAuthGuard` | — | — | — |
| `POST /tenants/{id}/invitations` | `JwtAuthGuard` | `FeatureFlagGuard` | — | `tenancy.invites` |
| `POST /invitations/accept` | `JwtAuthGuard` | `FeatureFlagGuard` | — | `tenancy.invites` |
| `GET /admin/tenancy` | `JwtAuthGuard` + `PermissionsGuard` | — | `admin.manage-users` | — |

⚠️ **`GET /admin/tenancy` não tem `@RequirePermission` na classe, e sim no
handler** — o `PermissionsGuard` devolve `true` quando não há requisito, então
um handler novo sem o decorator ficaria **aberto**. O `@RequirePermission` é
**defense in depth**, não o portão: quem barra de fato é o D2, dentro da use
case (`exigeAdministradorDeSistema`: bucket GLOBAL — `tenantId === null` — com
`isAdmin`). É o D2 que barra o **gerente de empresa**, que tem `isAdmin: true`
no perfil efetivo da empresa dele e leria a base inteira se o portão fosse a
permissão.

⚠️ **`POST /tenants` e `GET /me/tenants` não têm `PermissionsGuard`** — o
guard resolve as permissões pelo tenant do **header**, e aqui o ator pode ainda
não pertencer a empresa nenhuma (é quem vai criar a primeira). A autorização
dessas duas é "é a SUA conta", o `sub` do token — pergunta de um eixo só.

⚠️ **As 2 rotas de convite não têm `PermissionsGuard`** pelo mesmo motivo, e
por mais um: o header pode apontar para a Acme e o `:id` para a Globex — eixos
trocados. A autorização certa é "o `sub` é gerente **deste** tenant", que mora
na use case (`findRole`).

## §5. Modelo de dados

Modelos Prisma do BC (`apps/api/prisma/schema.prisma`):

| Model | Tabela | Papel |
|-------|--------|-------|
| `Tenant` | `tenants` | a empresa. `slug` é **único global** (`@unique`); sem soft-delete |
| `TenantMembership` | `tenant_memberships` | o vínculo usuário↔empresa. `role` (`gerente`\|`member`), `profileId` (perfil efetivo **naquela empresa**) |
| `Invitation` | `invitations` | o convite por empresa + e-mail. `token` único; `acceptedAt`/`expiresAt` nulos = pendente |

Relações: `Tenant` 1..N `TenantMembership` e 1..N `Invitation` (ambos
`onDelete: Cascade`). `TenantMembership` N..1 `User` (`Cascade`) e N..1 `Profile`
(`Restrict` — o admin reatribui antes de apagar). `TenantMembership` tem
`@@unique([userId, tenantId])` — a conta entra **uma vez** por empresa.

⚠️ **O que a RLS implica.** As tabelas de tenancy têm `ENABLE ROW LEVEL
SECURITY` e as policies comparam a coluna com o escopo da sessão
(`no_escopo_atual(...)`, migration `20261020000000_rls_isolation_empresa`).
Consequências para estas rotas:

- As leituras do escopo do ator (`GET /me/tenants`) são filtradas por RLS **e**
  por `userId` no `where` — o filtro é o que restringe, a RLS é a rede.
- `GET /admin/tenancy` é a **únICA** leitura que atravessa empresas: ela abre
  a transação na **credencial de sistema** (`comEscopoDeSistema`). Na sessão de
  RUNTIME o bucket GLOBAL devolveria **zero linhas, sem erro** — a lista viria
  vazia.
- `Tenant` **não** tem soft-delete: apagar cascateia perfis, memberships e
  convites, e o efeito é destrutivo demais para um `deletedAt` silencioso.

## §6. Notas e armadilhas

⚠️ **A rota de convite devolve `404`, não `403`, quando a flag está desligada.**
O `FeatureFlagGuard` lança `NotFoundException` — para o cliente a
funcionalidade simplesmente não existe. O corpo é o Problem Details padrão
(`code: NOT_FOUND`, `detail: "Not Found"` — MEDIDO 2026-10-29, com o
`GlobalExceptionFilter` exercido sobre a exceção real): ele **não** nomeia a
flag, porque dizer qual chave foi desligada diria a qualquer scanner externo
que existe um interruptor. A string `"Recurso indisponível (funcionalidade
desligada)"` que aparece no `openapi.json` é a **descrição** da resposta na
spec, não o corpo que o servidor devolve.

⚠️ **`tenancy.invites` tem TRÊS portas, e as três estão fechadas.** Além das 2
rotas deste BC, `POST /users` com `destino.tipo === 'convite'` também devolve
`404` quando a flag está desligada — a checagem mora **inline** no **controller**
(`users.controller.ts:189`, dentro de `create()`), não numa use case, porque
`@Public()` nunca publica `req.user` e o `FeatureFlagGuard` exige `req.user`
(fail-closed).

⚠️ **`GET /admin/tenancy` só funciona SEM o header `X-Tenant-Id`.** O D2 é
`tenantId === null && isAdmin`: mandar o header tira o ator do bucket global e
a resposta é `403`. O `403` também vem quando o ator tem a permissão mas não é
admin de sistema — o `detail` distingue os dois casos.

⚠️ **A leitura do inventário é registrada em log** (`Logger('AdminTenancyInventory')`),
com a contagem de empresas e usuários e o ator que leu: é a leitura mais densa
em dado pessoal do sistema (entrega o e-mail de **todas** as contas).

⚠️ **`GET /me/tenants` não filtra por empresa.** A lista é a do ator, e o ator
é o filtro (`userId` vindo do token). Não mande `X-Tenant-Id` esperando que a
lista mude.

⚠️ **A ordem de `GET /me/tenants` é contrato**, não detalhe do adaptador: o
funil do login leva a pessoa para a **primeira** empresa da lista. Por isso a
ordem é "primeiro as empresas com perfil efetivo (a mais recente primeiro),
por último as que não têm" — ordenar só por data levava a pessoa para a empresa
onde ela não podia fazer nada.

## Ver Também

- [`./profiles.md`](./profiles.md) — o BC que decide o que a pessoa pode fazer
  (o `role` do convite é rótulo de vínculo, não é RBAC).
- [`./feature-flags.md`](./feature-flags.md) — a flag `tenancy.invites` que
  fecha estas 2 rotas.
- [`./users.md`](./users.md) — a porta de criação de conta por convite.
- [`./auth.md`](./auth.md) — o `JwtAuthGuard` e o `X-Tenant-Id`.
- [`../adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md) — a estrutura de pastas que este BC segue.
