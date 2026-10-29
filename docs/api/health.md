# API Reference — BC `health`

> Documento de referência da API HTTP do **Bounded Context `health`** — o
> healthcheck da aplicação e do banco.
> A fonte do contrato são os decorators `@Api*` do controller **e** o
> `apps/api/openapi.json`, que é **VERSIONADO** (`git ls-files
> apps/api/openapi.json` → imprime o caminho; `git check-ignore -v
> apps/api/openapi.json` → `exit=1`, ou seja, nenhuma regra do `.gitignore` o
> pega). O gate `check-openapi-contract` compara a spec versionada com a gerada
> pelo código — regenerar: `pnpm --filter @projeto/api openapi:export`.
> Medido em 2026-10-29: o único endpoint deste BC confere com
> `apps/api/openapi.json`. Contagem por
> `grep -cE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/health/health.controller.ts`
> → `1`. O contrato inteiro tem 22 paths e 28 operações
> (`node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → `22`;
> `node -e "const d=require('./apps/api/openapi.json');console.log(Object.values(d.paths).flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)"` → `28`),
> das quais 18 são de `tenancy`, `profiles`, `feature-flags` e `health`.

## §1. Visão geral

- **Base path**: `/api/v1/health`. O caminho final vem de **duas** peças: o
  `@Controller({ path: 'health', version: '1' })` do controller e o
  `app.setGlobalPrefix('api/v1')` de `apps/api/src/main.ts:41`. O
  `version: '1'` é exigência do `FastifyAdapter` para o VERSIONING.
- **Auth**: **nenhuma**. O controller não tem `JwtAuthGuard`, não tem
  `@ApiBearerAuth()`, e o `openapi.json` sai com a rota **sem** `security`.
  Ela é uma das **4** operações do contrato nessa condição (MEDIDO 2026-10-29,
  percorrendo `paths.*.*.security` do `openapi.json`): `GET /api/v1/health`,
  `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` e
  `POST /api/v1/users` — as outras 3 são `@Public()`.
- **Header de empresa**: `X-Tenant-Id` é **ignorado** — o `JwtAuthGuard` nem
  roda nesta rota, então o header não é lido nem validado.
- **Content-Type**: `application/json; charset=utf-8` (response). Sem request.
- **Erros**: RFC 7807 (Problem Details) — `type`, `title`, `status`, `detail`,
  `instance`, `code`, `traceId` (`global-exception.filter.ts:59-68`).
- **Guards**: nenhum de rota. O `ThrottlerGuard` global (registrado via
  `APP_GUARD` em `app.module.ts:83`) **aplica-se** — ver §6.

## §2. Endpoints

| # | Método | Path                | Auth | Códigos principais       |
|---|--------|---------------------|------|--------------------------|
| 1 | `GET`  | `/api/v1/health`    | ❌   | `200` (e `503` em runtime) |

⚠️ **O `503` não está no `openapi.json`.** O controller não declara
`@ApiResponse`, então o contrato traz só o `200` default do Nest — e o `503`
que o endpoint **realmente** devolve quando o banco está fora do ar não
aparece na spec. Um cliente gerado do documento não tem ramo para ele.

## §3. Payloads

### 3.1 `GET /health` — com o banco no ar

Sem body, sem query. Response `200`:

```json
{
  "status": "ok",
  "checks": { "database": "ok" },
  "timestamp": "2026-10-29T12:00:00.000Z"
}
```

O `timestamp` é o instante da **resposta** (`new Date().toISOString()`), e ele
só existe no caminho `200`.

### 3.2 `GET /health` — com o banco fora do ar

O controller lança `ServiceUnavailableException({ status: 'degraded', checks: {
database: 'down' } })`, e o `GlobalExceptionFilter` o converte em `503`. O corpo
que o cliente recebe é o **RFC 7807** (MEDIDO 2026-10-29, com o
`GlobalExceptionFilter` exercido sobre a exceção real):

```json
{
  "type": "https://errors.projeto.com/SERVICE_UNAVAILABLE",
  "title": "SERVICE_UNAVAILABLE",
  "status": 503,
  "detail": "Service Unavailable Exception",
  "instance": "GET /api/v1/health",
  "code": "SERVICE_UNAVAILABLE",
  "traceId": "0af7651916cd43dd8448eb211c80319c"
}
```

⚠️ **O `status: 'degraded'` e o `checks.database: 'down'` se PERDEM.** O
`detail` do Problem Details sai do `exception.message` — e a
`ServiceUnavailableException` construída com um objeto que **não** tem chave
`message` cai no ramo `initMessage()` do Nest, que deriva o texto do nome da
classe: `"Service Unavailable Exception"`. O objeto `degraded` fica preso no
`getResponse()` da exceção, e o filtro **não** o copia para o corpo. Um
cliente que leia o `503` não descobre que foi o banco que caiu — só que a
aplicação está indisponível. O `title` sai como `SERVICE_UNAVAILABLE` (o
valor do enum `HttpStatus`), não como "Service Unavailable".

### 3.3 O que a checagem do banco faz

Uma única query: `SELECT 1`, via `prisma.$queryRawUnsafe`. O argumento é um
literal fixo no código — não há entrada de usuário nessa string.

## §4. Guards, flags e permissões

- **Guardes de rota**: nenhum. Nem `JwtAuthGuard`, nem `PermissionsGuard`, nem
  `FeatureFlagGuard`.
- **Permissões** (`@RequirePermission`): nenhuma.
- **Feature flags** (`@RequireFeatureFlag`): nenhuma.
- **Rate limit**: o `ThrottlerGuard` global se aplica — a rota **não** tem
  `@SkipThrottle()`. Ver §6.

## §5. Modelo de dados

**Nenhum.** O BC `health` não tem model Prisma, nem porta de domínio, nem
use case: ele injeta o `PrismaService` (infraestrutura compartilhada) e faz
uma leitura de sanidade.

| Origem | O que é |
|--------|---------|
| `apps/api/src/shared/infrastructure/prisma/prisma.service.ts` | o `PrismaService` (módulo `@Global()`), injetado via `@Inject` explícito |

## §6. Notas e armadilhas

⚠️ **A rota **é** contada pelo limitador global.** Os comentários de
`apps/api/src/main.ts:75` e de `apps/api/src/app.module.ts:23` citam `/health`
como exemplo de rota com `@SkipThrottle()` — mas **não existe nenhum
`@SkipThrottle()` no código**: `grep -rn "SkipThrottle" apps/api/src/` devolve
**2 hits, e os dois são comentários** (o próprio `main.ts` e o `app.module.ts`).
O `ThrottlerGuard` global (registrado via `APP_GUARD`) conta esta rota como
qualquer outra.

⚠️ **O `@Inject(PrismaService)` é obrigatório, não redundância.** O `dev` roda
com `tsx` (esbuild), que **não** emite `design:paramtypes` mesmo com
`emitDecoratorMetadata: true` — sem `@Inject`, o Nest resolve `prisma` como
`undefined` e o healthcheck cai no `catch` → `503` **com o banco no ar**. O
build (`tsc`) emite a metadata, então o defeito só aparece em dev.

⚠️ **O `503` é a única resposta de falha deste endpoint, e ela é honesta:**
`ServiceUnavailableException` é lançada só quando a query falha — nunca
"degradado" por um motivo adivinhado.

⚠️ **Esta rota é o que o `HEALTHCHECK` do Docker consome.** Um `503` aqui
mata o container; um `200` o mantém vivo. É por isso que o corpo tem de
distinguir "banco fora do ar" de "banco no ar" e não pode mentir.

⚠️ **O `catch` engole a causa.** O `catch {}` sem variável descarta a exceção
original do Prisma: o corpo do `503` não diz *por quê* o banco não respondeu
(connection refused, timeout, DNS). O motivo fica só no log do
`GlobalExceptionFilter` — e este `503` **é** logado, porque o filtro registra
a partir de `500` (`status >= HttpStatus.INTERNAL_SERVER_ERROR`) e `503 >= 500`.
A linha sai como `ERROR`, com a stack da exceção do Nest — não a do Prisma.

⚠️ **O Swagger UI é montado em `/api/docs`**, e só quando
`swaggerHabilitado(process.env)` permite — em produção a montagem é
condicionada. A rota `/api/v1/health` **não** é condicionada: ela existe
sempre, e é isso que o healthcheck precisa.

## Ver Também

- [`./tenancy.md`](./tenancy.md) · [`./profiles.md`](./profiles.md) · [`./feature-flags.md`](./feature-flags.md) — os outros BCs com doc de referência.
- [`../../apps/api/src/modules/health/health.controller.ts`](../../apps/api/src/modules/health/health.controller.ts) — o controller fonte.
- [`../../apps/api/src/main.ts`](../../apps/api/src/main.ts) — onde o prefixo global `/api/v1` é montado.
