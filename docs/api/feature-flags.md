# API Reference — BC `feature-flags`

> Documento de referência da API HTTP do **Bounded Context `feature-flags`** —
> as funcionalidades que o administrador do **sistema** liga e desliga.
> A fonte do contrato são os decorators `@Api*` do controller **e** o
> `apps/api/openapi.json`, que é **VERSIONADO** (`git ls-files
> apps/api/openapi.json` → imprime o caminho; `git check-ignore -v
> apps/api/openapi.json` → `exit=1`, ou seja, nenhuma regra do `.gitignore` o
> pega). O gate `check-openapi-contract` compara a spec versionada com a gerada
> pelo código — regenerar: `pnpm --filter @projeto/api openapi:export`.
> Contrato HTTP do BC (spec de design):
> [`../superpowers/specs/2026-10-18-feature-flags-contrato-http.md`](../superpowers/specs/2026-10-18-feature-flags-contrato-http.md).
> ADR-0001 (DDD + Hexagonal, a estrutura `domain/application/infrastructure` que
> este BC segue): [`../adr/0001-arquitetura-ddd-hexagonal-auditoria.md`](../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).
> Medido em 2026-10-29: os 2 endpoints deste BC conferem com
> `apps/api/openapi.json`. Contagem por
> `grep -hoE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/feature-flags/infrastructure/http/*.controller.ts | wc -l`
> → `2`. O contrato inteiro tem 22 paths e 28 operações
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → `22`;
> `node -e "const d=require('./apps/api/openapi.json');console.log(Object.values(d.paths).flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)"` → `28`),
> das quais 18 são de `tenancy`, `profiles`, `feature-flags` e `health`.

## §1. Visão geral

- **Base path**: `/api/v1` (prefixo global de `apps/api/src/main.ts:41`,
  `app.setGlobalPrefix('api/v1')`). Este BC não tem prefixo próprio: as rotas
  vivem em `/admin/feature-flags`.
- **Auth**: `Authorization: Bearer <jwt>` nas 2 rotas (`@ApiBearerAuth()` na
  **classe**). Não há rota pública.
- **Header de empresa**: `X-Tenant-Id` é **opcional** e aqui é **decisivo** —
  ver §4. Ausente → bucket GLOBAL; malformado → `400 INVALID_TENANT`;
  presente e a conta não pertence à empresa → `403 TENANT_MEMBERSHIP_REQUIRED`.
- **Content-Type**: `application/json; charset=utf-8` (request e response).
- **Erros**: RFC 7807 (Problem Details) — `type`, `title`, `status`, `detail`,
  `instance`, `code`, `traceId` (`global-exception.filter.ts:59-68`).
- **Guards**: `JwtAuthGuard` + `PermissionsGuard` na **classe**;
  `@RequirePermission` em **cada handler**.

## §2. Endpoints

| # | Método | Path                                  | Auth | Códigos principais |
|---|--------|---------------------------------------|------|--------------------|
| 1 | `GET`  | `/api/v1/admin/feature-flags`          | ✅   | `200`              |
| 2 | `PUT`  | `/api/v1/admin/feature-flags/{chave}`  | ✅   | `200`              |

⚠️ Os códigos da tabela são os **declarados** no `openapi.json` — este
controller não declara `@ApiResponse`, então o contrato traz só o default do
Nest (`200`). Os erros de domínio **não aparecem** na spec; os que as 2 rotas
realmente devolvem são:

| Status | Onde | Motivo |
|--------|------|--------|
| `400` | 1, 2 | `X-Tenant-Id` malformado (`INVALID_TENANT`), corpo do `PUT` que não é boolean (`VALIDATION_ERROR`) ou chave fora do catálogo (`FEATURE_FLAG_CHAVE_INVALIDA`) |
| `401` | 1, 2 | token ausente, inválido, expirado ou de tipo errado |
| `403` | 1, 2 | falta `admin.manage-feature-flags` ou o ator não é o administrador do **sistema** (`FORBIDDEN`); empresa da qual a conta não é membro (`TENANT_MEMBERSHIP_REQUIRED`) |

## §3. Payloads

### 3.1 `GET /admin/feature-flags` — o estado de toda chave do catálogo

Sem body. Response `200` (`FeatureFlagDto[]`):

```json
[
  { "chave": "tenancy.invites", "ativada": true,
    "descricao": "Emissão e aceite de convites por empresa. Desligar tranca as três portas: convidar, aceitar e criar conta por convite." }
]
```

A lista traz **toda chave do catálogo**, não só as linhas gravadas: o use case
junta o catálogo (código) com as linhas (banco). Hoje o catálogo tem **1
chave** — `tenancy.invites`
(`shared/auth/feature-flag-catalog.ts`).

### 3.2 `PUT /admin/feature-flags/{chave}` — ligar/desligar uma chave

`:chave` é a chave do catálogo. Request (Zod no boundary):

```json
{ "ativada": false }
```

Response `200` (`FeatureFlagDto` — o estado gravado, montado do input + catálogo,
sem reler o banco):

```json
{ "chave": "tenancy.invites", "ativada": false,
  "descricao": "Emissão e aceite de convites por empresa. Desligar tranca as três portas: convidar, aceitar e criar conta por convite." }
```

⚠️ **`z.boolean()` e não coerção.** `"false"`, `1` e `0` são recusados com
`400` em vez de virarem estado. Um toggle que aceita `"false"` como verdadeiro
é desligar a funcionalidade sem ninguém ter clicado em nada.

⚠️ **Campos a mais são descartados** (o Zod faz `strip`): um `chave` no corpo
**não** muda o recurso endereçado — a chave é do **path**.

⚠️ **Chave fora do catálogo → `400 FEATURE_FLAG_CHAVE_INVALIDA`.** O corpo é o
Problem Details padrão, e ele **perde o campo `chave`**: o `GlobalExceptionFilter`
só copia `detail` e `errors[]` do objeto da exceção (MEDIDO 2026-10-29, com o
filtro exercido sobre a exceção real):

```json
{ "type": "https://errors.projeto.com/FEATURE_FLAG_CHAVE_INVALIDA",
  "title": "BAD_REQUEST", "status": 400,
  "detail": "a chave precisa constar no catálogo de flags",
  "instance": "PUT /api/v1/admin/feature-flags/xyz",
  "code": "FEATURE_FLAG_CHAVE_INVALIDA", "traceId": "…" }
```

A validação acontece **antes** da gravação: gravar e só depois recusar
deixaria a tela dando erro com o estado já mudado.

## §4. Guards, flags e permissões

| Rota | Guard de classe | Guard de handler | Permissão | Flag |
|------|------------------|------------------|-----------|------|
| `GET /admin/feature-flags` | `JwtAuthGuard` + `PermissionsGuard` | — | `admin.manage-feature-flags` | — |
| `PUT /admin/feature-flags/{chave}` | `JwtAuthGuard` + `PermissionsGuard` | — | `admin.manage-feature-flags` | — |

⚠️ **O `@RequirePermission` NÃO é o portão desta feature.** O cadastro de
empresa concede `listAllPermissions()` ao dono de cada empresa nova — o perfil
`gerente` nasce com `isAdmin: true` e todas as permissões do catálogo
(`apps/api/src/modules/tenancy/domain/perfis-da-empresa.ts:145`) — então todo
dono de empresa **criada a partir desta versão** já tem
`admin.manage-feature-flags` no banco.
O backfill das empresas anteriores foi considerado e **não** foi feito — ele não
mudaria a autorização de ninguém, porque o D2 barra o mesmo ator logo em
seguida.

⚠️ **Quem barra de fato é o D2**, dentro da use case: `exigeAdministradorDeSistema`
exige `tenantId === null` **e** `isAdmin`. O desfecho é o mesmo `403`; muda
**quem** recusou — e por isso o decorator continua sendo defense in depth e
rastreabilidade, não o portão.

⚠️ **O `@RequirePermission` está no HANDLER, não na classe** — o
`PermissionsGuard` devolve `true` quando não há requisito
(`permissions.guard.ts:60`), então um handler novo sem o decorator ficaria
**aberto**. O `@ApiBearerAuth()`, esse sim, está na **classe**.

⚠️ **Mandar `X-Tenant-Id` nesta rota é `403`.** O D2 é `tenantId === null &&
isAdmin`: com o header, o ator sai do bucket global e a use case recusa. As 2
rotas só funcionam **sem** o header.

### 4.1 O `FeatureFlagGuard` — como uma flag fecha uma rota

O guard vive em
`apps/api/src/modules/feature-flags/infrastructure/http/guards/feature-flag.guard.ts`
e é aplicado com `@RequireFeatureFlag('chave')`:

| Situação | Resultado |
|----------|-----------|
| Sem `@RequireFeatureFlag` | passa (e **não** consulta o banco) |
| Sem `req.user` | `403` — fail-closed, o guard não substitui autenticação |
| Chave **sem linha** no banco | **ATIVADA** (decisão D4) |
| Chave com `ativada: false` | **`404`** — a rota "não existe" para o cliente |

⚠️ **O 404 de bloqueio é idêntico ao 404 de rota inexistente.** O corpo é o
Problem Details padrão (`code: NOT_FOUND`, `detail: "Not Found"` — MEDIDO
2026-10-29, com o `GlobalExceptionFilter` exercido sobre a exceção real):
genérico de propósito, porque nomear a flag diria a qualquer scanner externo
que existe um interruptor.

⚠️ **As flags são AND, as permissões são OR.** O guard exige **todas** as
chaves do handler ligadas — a funcionalidade depende delas. O `PermissionsGuard`
aceita **qualquer uma**.

### 4.2 O alcance da chave `tenancy.invites`

A chave tem **três portas**, e as três estão fechadas:

| Porta | Como a checagem é feita |
|-------|--------------------------|
| `POST /api/v1/tenants/{id}/invitations` | `@RequireFeatureFlag` + `FeatureFlagGuard` |
| `POST /api/v1/invitations/accept` | `@RequireFeatureFlag` + `FeatureFlagGuard` |
| `POST /api/v1/users` com `destino.tipo === 'convite'` | checagem **inline** no controller (`users.controller.ts:189`) |

⚠️ A terceira porta **não** usa o guard: `POST /users` é `@Public()` e o
`JwtAuthGuard` devolve `true` **antes** de publicar `req.user` — e o
`FeatureFlagGuard` exige `req.user` (fail-closed). A checagem acontece dentro
de `create()`, onde o `destino.tipo` é conhecido; o recorte é `convite`, e não
"tem `destino`", porque `empresa` não usa token de convite.

## §5. Modelo de dados

| Model | Tabela | Papel |
|-------|--------|-------|
| `FeatureFlag` | `feature_flags` | o estado de **uma** chave. `chave` é a **primary key** (string), `ativada` booleano, `version` |

⚠️ **A tabela não tem `tenant_id`, de propósito.** A flag não é por empresa:
ela responde "esta funcionalidade está disponível no sistema inteiro?", e a
resposta é a mesma para todo ator. Uma coluna de empresa aqui seria uma
mentira estrutural — o isolamento por empresa que a RLS garante em
`profiles`/`users`/`tenants` não tem o que filtrar.

⚠️ **A chave é a primary key e não um `id` uuid.** A chave **é** o
identificador (é o que o `@RequireFeatureFlag('tenancy.invites')` traz), e uma
segunda coluna de identidade só criaria duas maneiras de dizer a mesma coisa.

⚠️ **A linha ausente significa ATIVADA (D4).** A tabela guarda só as
**exceções** — quem está desligada. Por isso o `DEFAULT true` no schema é
documentação, não o mecanismo: quem decide na leitura é o repositório, que
devolve `true` para a chave que não encontrou. Chave nova no catálogo não
apaga funcionalidade nenhuma.

⚠️ **Sem optimistic lock (D5).** O `version` da tabela existe por convenção
das outras tabelas e **não** é lido. Uma tela de admin liga e desliga com o
dedo, no singular; perder uma escrita concorrente aqui não perde nada — o
próximo clique grava o estado que a tela mostra.

## §6. Notas e armadilhas

⚠️ **O catálogo é código, e o tipo dele é derivado do array.** `FeatureFlagKey`
é `(typeof FEATURE_FLAGS)[number]['chave']` — nunca escrito à mão ao lado do
array. Com o union escrito à mão, `'tenancy.exports'` adicionado só ao union
compilava (`tsc` exit 0) e `isFeatureFlagKey('tenancy.exports')` devolvia
`false` em runtime: o compilador aceitando exatamente o que o programa rejeita.

⚠️ **O `403` do D2 tem `code: FORBIDDEN` e um `detail` próprio**, diferente do
`403` do `PermissionsGuard` (que diz "permissão requerida ausente: precisa de
uma de [...]"). Os dois recusam o mesmo ator, e o `detail` é o que separa
"faltou a permissão" de "você não é o administrador do sistema".

⚠️ **O bloqueio por flag é registrado em log** (`Logger('FeatureFlagBloqueio')`),
com campos estruturados — `featureFlag`, `metodo`, `rota`, `ator`, `traceId` —
e **nunca** o token. O `traceId` é o mesmo que volta no corpo do `404`, então
a linha de log e o erro que o usuário viu apontam para o mesmo lugar. O log
nunca derruba a requisição: um `warn` que lança trocaria o `404` honesto por um
`500`.

⚠️ **O `FeatureFlagGuard` não serve para porta `@Public()`** — já explicado em
§4.2. É por isso que a terceira porta existe: `POST /users` é pública.

⚠️ **A flag não é herança nem curinga.** Não existe `tenancy.*` que cubra
`tenancy.invites`; o guard compara a chave exata.

## Ver Também

- [`./tenancy.md`](./tenancy.md) — as 2 das 3 portas que a `tenancy.invites` fecha.
- [`./profiles.md`](./profiles.md) — o outro guard de rota (permissão: OR; flag: AND).
- [`./users.md`](./users.md) — a terceira porta (`POST /users` com `destino: convite`).
- [`../superpowers/specs/2026-10-18-feature-flags-contrato-http.md`](../superpowers/specs/2026-10-18-feature-flags-contrato-http.md) — o contrato HTTP do BC.
