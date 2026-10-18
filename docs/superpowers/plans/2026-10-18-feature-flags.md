---
name: plano-feature-flags
description: Plano da demand feature-flags — chaves de funcionalidade ligaveis e desligaveis pelo administrador do sistema, com tela de toggle em /admin/flags e um consumidor real (convite de empresa).
version: 1.4.0
updated: 2026-10-18
status: revisto
state_snapshot: .agents/runs/state-snapshot-20261018T053846Z.md
---

# Plano — feature flags por funcionalidade

> Demand: *"feature flags por funcionalidade que podem ser ativadas e desativadas
> pelo administrador do sistema, deve ter uma tela de ativação e desativação para
> o administrador do sistema usar"*.
> Snapshot de estado: [`.agents/runs/state-snapshot-20261018T053846Z.md`](../../../.agents/runs/state-snapshot-20261018T053846Z.md)
> (`proceed: true`, `gap_blocker: false`, 4 gaps — 1 blocker resolvido antes do plano).
> Branch: `feat/feature-flags`, base `main` @ `176c5f2` (PR #101, tenancy).
> **v1.1.0** — revisado por dois agents distintos do implementador; 10 correções,
> 4 delas mudam desenho. Ver [§Revisao](#revisão-v110).
> **v1.2.0** — terceiro revisor (adversarial, mediu mutando o código) + reconciliação
> com a árvore depois da Fase 1. Ver [§Revisao](#revisão-v120).
> **v1.3.0** — quarto revisor, sobre a Fase 2: o código estava certo, o spec não.
> Ver [§Revisao](#revisão-v130--fase-2).

---

## 1. Decisoes fechadas

| # | Decisao | Escolha | Por que |
|---|---------|---------|---------|
| D1 | Escopo da flag | **global do sistema** (sem `tenant_id`) | a demand diz "administrador do **sistema**". Flag por empresa e decisao de produto que ninguem pediu. O `specialist-router` deixou a pergunta aberta (O1) e a resposta e a mesma: sem coluna |
| D2 | Quem alterna | `ehAdministradorDeSistema(ator)` = `tenantId === null && isAdmin` | a formula esta em `profiles.use-cases.ts:84-86`. Admin de empresa (`tenantId != null`) e barrado — flag global nao e dele |
| D3 | Origem da chave | **catalogo em codigo** (`feature-flag-catalog.ts`), espelhando `permissions-catalog.ts:26-62` | a lista de flags e codigo revisavel, nao dado de admin |
| D4 | Linha ausente | **linha ausente = ATIVADA** | o default e o estado que o sistema ja tem. Chave nova no catalogo sem migracao nao apaga funcionalidade nenhuma |
| D5 | Persistencia | tabela `feature_flags`, 1 linha por chave, `upsert` no toggle | chave e o PK e a operacao e idempotente, entao **nao** ha lock otimista nem evento de dominio. A coluna `version` entra por convencao das outras 6 models do schema e **nao e lida por nada nesta demanda** |
| D6 | Leitura | **sem cache**; cada request guardado le o banco | um unico endpoint guardado. Cache traria `invalidateAll()` e a classe de bug de estado obsoleto de graca |
| D7 | Consumidor real | `POST /tenants/:id/invitations` guardado por `tenancy.invites` | sem um consumidor a flag e uma linha de configuracao sem efeito |
| D8 | Autorizacao da rota | **`PermissionsGuard` + `@RequirePermission('admin.manage-feature-flags')`** (chave nova no catalogo). D2 continua sendo o portao real | `PermissionsGuard:60-62` devolve `true` **antes** de hidratar quando nao ha requisito — sem a chave, `req.user.isAdmin` fica com o que o `JwtAuthGuard` leu do cache, e o unico produtor do cache e o proprio `PermissionsGuard` (`:93-102`) ou `obterMeuPerfil`. A rota ficaria sem auto-hidratar: **reintroduz o defeito que o comentario de `permissions.guard.ts:76-84` diz ter sido corrigido**. A chave e concedida a todo dono de empresa no signup (`prisma-tenant-onboarding.repository.ts:209`) e isso e irrelevante — D2 barra antes |
| D9 | Tela | Server Component + Server Action inline + form de checkboxes, copiado de `admin/profiles/[slug]` | e o unico padrao de toggle do repo |
| D10 | RLS e grants | **nao** ha RLS nem GRANT explicito na tabela nova | RLS isola por empresa e a tabela nao tem dimensao de empresa. Os privilegios vem do `ALTER DEFAULT PRIVILEGES` de `20261020000000_rls_isolation_empresa:59-62`, que cobre tabela futura. So um papel de runtime existe: `app_runtime` |
| D11 | Regra de admin do sistema | `ehAdministradorDeSistema` **sai** de `profiles.use-cases.ts` para `src/shared/auth/eh-administrador-de-sistema.ts`; os dois `import`s viram reuso | medido: a funcao **nao e exportada** (`grep 'export.*ehAdministradorDeSistema'` -> 0). O comentario em `profiles.use-cases.ts:103-105` diz que a privacao e deliberada porque as duas classes do arquivo a usam — e a regra nova e a mesma |
| D12 | Timestamp da migration | `20261020000006_feature_flags` (fixado, nao `<ts>`) | as 12 migrations vao ate `20261020000005`, com datas 2 dias a frente de hoje e escritas a mao. Um `migrate dev` de hoje geraria `20261018HHMMSS`, que ordena **antes** de todo o bloco `20261019*`/`20261020*`. Nenhum gate olha migration |
| D13 | O que o guard de flag injeta | **a porta do repositorio**, nao a use case | `listar`/`definir` exigem admin do sistema (D2), e o ator de `convidar` e o dono de uma empresa (`tenantId != null`). O guard so precisa de `listar` + a regra D4, que sao 3 linhas |
| D14 | O client web da tela manda `X-Tenant-Id`? | **nao** — `lib/flags.ts` monta o `ApiClient` SEM `getTenant` | medido (`api-client.ts:60,67` + `extractTenantId`): enviar o header **tira** o ator do bucket global, e D2 e `tenantId === null && isAdmin`. O admin do sistema que tem empresa selecionada no cookie levaria 403 numa tela que acabou de nascer. A5 da v1.1.0 razou o contrario (mantendo o header); o terceiro revisor mediu o efeito e o status quo **nao e argumento para repetir o defeito numa rota nova** — ele ja vai existir em `/admin/profiles`, que nao e desta demanda. Omitir um campo opcional custa uma linha |
| D15 | Value object `FeatureFlagKey` em `domain/` | **nao existe** — o type union do catalogo e o guard `isFeatureFlagKey` fazem esse papel | o VO seria uma segunda escrita da mesma lista de chaves dentro do BC, e o catalogo ja e type-safe. Um VO que valida contra um type union nao valida nada: quem ja nao pode escrever `'tenancy.invit'` e o compilador. Menos um arquivo, menos um lugar para divergir |
| D16 | `updatedAt` no `FeatureFlagDto` | **nao entra** — o DTO e `{ chave, descricao, ativada }` | o revisor da F0 pediu a escolha: "ou o campo volta, ou o §3 precisa dizer que a tela não mostra 'quando'". Nenhum dos dois — o campo nao volta. A tela nao mostra timestamp, o `updated_at` existe na tabela por convencao das outras 6 models (e §3 ja diz que historico de toggles esta fora do escopo), e expor no contrato um campo que nada renderiza e a forma de o web começar a consumir. O revisor mandava voltar; **motivo de volta**: nenhum requisito da demand pede "quando", e a coluna na tabela ja responde a pergunta se ela um dia aparecer |
| D17 | `FeatureFlagsModule` declara `PermissionsGuard` nos **proprios** providers | **nao — CORRIGIDA na F3** | o revisor da F0 mediu que `PermissionsGuard` nao esta nos `exports` do `ProfilesModule` e concluiu que o modulo novo precisa declara-lo provider. **MEDIDO 2026-10-18 na F3: a conclusao estava errada.** Tirando o `PermissionsGuard` dos `providers`, o modulo continua compilando e as 6 assertos do `feature-flags.module.spec.ts` seguem verdes — o Nest resolve o guard de `@UseGuards` pelos `injectables` de qualquer modulo do container, e o `ProfilesModule` ja o registra. A **premissa** do revisor (o guard nao esta exportado) continua verdadeira; a **conclusao** (morre no boot) nao. O que o modulo novo de fato precisa sao as **arestas**: `AuthModule` (guard + cache), `ProfilesModule` (`UserProfileUseCases`, de que o `PermissionsGuard` depende), `PrismaPersistenceModule` e `PrismaModule`. Como `moduleRef.get(X, { strict: false })` varre o container INTEIRO, a spec nao distingue "provider deste modulo" de "provider de outro" — e foi essa cegueira que deixou a decisao passar sem dente |

---

## 2. Ordem de execucao

Cada fase fecha com: suite do projeto + `pnpm ci:preflight` verde + revisao por agent
distinto do implementer.

### Fase 0 — Catalogo, chave de permissao e contrato compartilhado

| Ponto | Mudanca |
|-------|---------|
| `apps/api/src/shared/auth/feature-flag-catalog.ts` (novo) | `FEATURE_FLAGS` como `const` [{chave, descricao}], tipo `FeatureFlagKey`, `isFeatureFlagKey()`, `listAllFeatureFlags()` — formato de `permissions-catalog.ts:26-62`. 1 chave na v1: `tenancy.invites` |
| `feature-flag-catalog.spec.ts` (novo) | aceita a chave do catalogo; rejeita `''`, `'tenancy.invit'`, `'admin.manage-flags'`; `listAllFeatureFlags()` devolve o catalogo inteiro |
| `apps/api/src/shared/auth/permissions-catalog.ts:26-39` | + `admin.manage-feature-flags`. **Consequencia medida:** `listAllPermissions()` cresce, e `prisma-tenant-onboarding.repository.ts:209` concede tudo ao dono de cada empresa no signup. Aceito (D8). Se algum spec asserar contagem de chaves, e ele que quebra — e a assercao que esta errada |
| `apps/api/src/shared/auth/eh-administrador-de-sistema.ts` (novo) | move de `profiles.use-cases.ts:84-86`; `profiles.use-cases.ts` passa a importar |
| `apps/api/src/shared/auth/eh-administrador-de-sistema.spec.ts` (novo) | tabela dos 4 casos: `(null,true)=true` · `(null,false)=false` · `(uuid,true)=false` · `(uuid,false)=false` |
| `packages/shared-types/src/feature-flag.ts` (novo) | `FeatureFlagDto { chave, descricao, ativada }` (**sem** `updatedAt`, D16) + `UpdateFeatureFlagInputDto { ativada: boolean }` |
| `packages/shared-types/src/index.ts` | re-exporta os dois |

### Fase 1 — Persistencia

| Ponto | Mudanca |
|-------|---------|
| `apps/api/prisma/schema.prisma` | model `FeatureFlag { chave String @id · ativada Boolean @default(true) · createdAt · updatedAt · version Int @default(1) }`, `@@map("feature_flags")`. **Sem `descricao`**: a descricao vive no catalogo de codigo; duplicar no banco seria uma segunda escrita da mesma frase |
| `migrations/20261020000006_feature_flags/migration.sql` (nova) | `CREATE TABLE` + `COMMENT ON TABLE`. Sem GRANT (D10) e sem RLS (D10). Cabecalho no formato do repo: por que existe, ordem, e o que foi omitido |
| `apps/api/src/modules/feature-flags/domain/ports/feature-flag-repository.port.ts` (novo) | token + `{ listar(): Promise<FeatureFlagEstado[]>; definir(chave, ativada) }` — **sem** `tenantId` (D1) |
| `.../infrastructure/persistence/prisma-feature-flag.repository.ts` (novo) | 2 queries diretas, **sem** `comEscopo`: sem coluna de escopo nao ha GUC para setar. Medido: `check-tenant-scope-source.ts:78` so acusa quando uma das 3 funcoes de escopo recebe valor derivado da rota — um repositorio que nao chama nenhuma nunca e flagrado |
| `prisma-feature-flag.repository.spec.ts` (novo) | fake `PrismaClient`; `upsert` grava e `listar` devolve; tabela vazia devolve `[]` |

### Fase 2 — Dominio e aplicacao

| Ponto | Mudanca |
|-------|---------|
| ~~`domain/value-objects/feature-flag-key.vo.ts`~~ | **nao existe** — D15. O catalogo (`shared/auth/feature-flag-catalog.ts:50`) ja e o type union e `isFeatureFlagKey` ja e o guard |
| `apps/api/src/shared/auth/feature-flag-catalog.ts` | **+ `descricaoDe(chave)`** — acrescentado na F2, nao previsto aqui (achado A4 da revisao). Existe porque `noUncheckedIndexedAccess` esta ligado: um `find()` devolve `| undefined` e o caller teria de usar `!`. O `throw` interno e inalcancavel pelo tipo e **nao** em runtime (o array e mutavel e ha um `await` entre o guard e a linha) — ver o comentario da propria funcao |
| `apps/api/src/modules/feature-flags/application/feature-flag.use-cases.ts` (novo) | `listar(ator)` e `definir(ator, chave, ativada)`. `listar` devolve a **uniao** catalogo x linhas (D4) — cabe na use case sem mudar a assinatura da porta, porque `listar()` nao recebe argumento. Ambos exigem `ehAdministradorDeSistema` (D2, D11), e a **autorizacao vem antes** da validacao da chave: 403 vence 400, senao um ator nao autorizado descobre quais chaves existem. `definir` valida a chave com `isFeatureFlagKey` antes de gravar e **nao relê** o banco: devolve o DTO montado do input + descricao do catalogo. Devolve `FeatureFlagDto` de `@projeto/shared-types` — **primeiro** `application/` do api a importar o pacote (achado A5): os outros 4 devolvem interface local e o web declara o DTO paralelo. Tipo-puro, `tsc` 0, e evita duplicar o shape; o preco e que nao ha mapper, entao **nao existe onde morar um campo que a API exponha e o web nao deva ver** — e foi exatamente o motivo de D16 recusar `updatedAt` |
| `feature-flag.use-cases.spec.ts` (novo) | fake in-memory que `implements` a porta e **registra** o `ativada` gravado; casos: nao-admin recusa · admin de empresa recusa · admin do sistema lista a uniao · `definir` grava e a listagem seguinte devolve o valor novo · **religar devolve `true` e a listagem concorda com o PUT** · **403 vence 400** · chave fora do catalogo recusa |

### Fase 3 — HTTP

| Ponto | Mudanca |
|-------|---------|
| `apps/api/src/modules/feature-flags/infrastructure/http/admin-feature-flags.controller.ts` (novo) | `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@Controller('admin/feature-flags')`; `GET /` e `PUT /:chave` com body Zod `{ ativada: boolean }` (`ZodValidationPipe`, como `users.controller.ts:146`); `@RequirePermission('admin.manage-feature-flags')` **em cada handler**. `atorDe(req)` local, no formato de `admin-profiles.controller.ts:70-76`. **`PUT`, nao `PATCH`:** o corpo e o estado INTEIRO do recurso, nao um patch dele — e o nome do metodo HTTP e a unica parte do contrato que o `openapi-contract-specialist` leria sem abrir o arquivo |
| `admin-feature-flags.controller.spec.ts` (novo) | os 2 handlers repassam ator e chave; `atorDe` produz `tenantId: null` de `req.user.tenantId` ausente (`?? null`, nunca `undefined`) |
| `apps/api/src/modules/feature-flags/feature-flags.module.ts` (novo) | registra porta + use cases + controller; **importa `AuthModule`, `ProfilesModule`, `PrismaPersistenceModule` e `PrismaModule`** (D17 corrigida — o que o modulo precisa sao as ARESTAS, nao os providers dos guards); **exporta a porta** (D13: o guard injeta a porta) |
| `feature-flags.module.spec.ts` (novo) | sobe o container e compara identidade dos providers (formato de `profiles.module.spec.ts:98`). E o spec que pega as arestas: sem `PrismaPersistenceModule` o boot morre por `JwtAuthGuard`; sem `ProfilesModule`, idem; sem `FeatureFlagsModule` no `TenancyModule`, a porta nao atravessa (D13) |
| `apps/api/src/app.module.ts:52` | `imports: [..., TenancyModule, FeatureFlagsModule]`. **MEDIDO 2026-10-18: esta linha e REDUNDANTE** — tirando `FeatureFlagsModule` daqui o e2e `13-feature-flags` continua 10/10 verde, porque o `TenancyModule` importa o modulo e o Nest registra os controllers de um modulo assim que ele e instanciado em qualquer ponto do grafo. Fica porque a rota nao deve depender da aresta D13. A linha 95 original ("sem isso a rota responde 404") era **FALSA** |
| `apps/api/src/modules/tenancy/tenancy.module.ts:25` | `imports: [..., FeatureFlagsModule]` — sem isso o `FeatureFlagGuard` nao resolve e o container de `TenancyModule` cai, derrubando `convidar` **e** `accept` |

### Fase 4 — Consumidor real

| Ponto | Mudanca |
|-------|---------|
| `.../decorators/require-feature-flag.decorator.ts` (novo) | `FEATURE_FLAG_KEYS_METADATA` + `RequireFeatureFlag(...keys)`, copia de `require-permission.decorator.ts:13-16` |
| `.../guards/feature-flag.guard.ts` (novo) | injeta `FEATURE_FLAG_REPOSITORY_PORT` (D13). Sem metadata => `true` (como `permissions.guard.ts:60-62`). Sem `req.user` => `ForbiddenException`. Para cada chave: sem linha => ATIVADA (D4); com linha e `ativada=false` => `NotFoundException` (404 — o recurso nao existe enquanto a flag esta off). Le `getAllAndOverride([handler, classe])`, como o guard de permissao |
| `feature-flag.guard.spec.ts` (novo) | sem decorator passa · flag on passa · linha ausente passa (D4) · flag off => 404 · sem `req.user` => 403. O fake da porta e in-memory e **nao** um `{ ativada: true }` literal |
| `apps/api/src/modules/tenancy/infrastructure/http/tenancy-invitations.controller.ts:66` | `@UseGuards(JwtAuthGuard, FeatureFlagGuard)` + `@RequireFeatureFlag('tenancy.invites')` **no handler `convidar`**. A classe (linha 55) fica intacta — mexer nela atinge `accept` tambem. Precedente: `users.controller.ts:246,262,300,331,361` repetem `@UseGuards` em handler |

### Fase 5 — Web

| Ponto | Mudanca |
|-------|---------|
| `apps/web/lib/flags.ts` (novo) | `listarFeatureFlags()` e `definirFeatureFlag(chave, ativada)`, copiando o factory `getClient()` de `lib/perfil.ts:30-40` **sem** `getTenant` (**D14**). `getTenant` e opcional (`api-client.ts:13-18`) e `api-client.ts:66-67` so manda o header quando ele existe — omitir custa **uma linha**. A razao de D14 em uma frase: enviar `X-Tenant-Id` tira o ator do bucket global (`tenantId !== null`), D2 exige `tenantId === null`, e o admin do sistema que tem empresa selecionada no cookie levaria 403 numa tela recem-nascida |
| `apps/web/lib/flags.spec.ts` (novo) | corpo valido · corpo nao-JSON vira `ApiError` (defeito do PR #99) · `403` propaga · token ausente nao vaza segredo |
| `apps/web/app/admin/flags/page.tsx` (novo) | Server Component. Guard `me === null \|\| me.isAdmin !== true` => "Acesso restrito" (mesma duplicacao declarada de F9). Form de checkboxes + "Salvar", Server Action inline, `revalidatePath('/admin/flags')`. Classes copiadas literalmente. **Sem spec unitario:** `apps/web/vitest.config.ts:247` exclui `app/**/*.tsx` da cobertura; a tela e coberta pelo Playwright da F6 |
| `apps/web/components/Sidebar.tsx` (bloco `me?.isAdmin === true`, ~linha 40) | link "Feature flags" -> `/admin/flags` |
| `apps/web/components/Sidebar.spec.tsx` | o link aparece para admin e **nao** para usuario comum (negativo obrigatorio) |

### Fase 6 — E2E e gate de fluxos

| Ponto | Mudanca |
|-------|---------|
| `.agents/specs/conventions/e2e-playwright.md:95` | linha `\| F14 \| /admin/flags \| Feature flags (admin) \| f14-admin-flags.spec.ts \| admin alterna e a tela reflete · flag off barra \`convidar\` com 404 · quase-admin recusa \|` no `## Inventario de Fluxos` (cabecalho em 80, F13 em 94). A coluna `Spec` **nao pode ficar vazia** — e o que o gate reconcilia com o `// FLUXO:` do arquivo. O gate confere `Rota` contra `page.tsx` do disco nos dois sentidos (`check-e2e-flow-coverage.ts:38-41,154-167`). **Linha e spec no mesmo commit** — e o que o texto em `:78-79` avisa |
| `apps/web/e2e/f14-admin-flags.spec.ts` (novo) | `// FLUXO: F14`. 3 testes: (1) admin ve as chaves, alterna e a tela reflete sem reload; (2) com a flag off, `convidar` responde 404 e com ela on responde como antes; (3) "quase admin" ve "Acesso restrito" e **nao** ve o conteudo da tabela. O (3) e o dente de D14 no mundo real: se `lib/flags.ts` mandar `getTenant`, o admin **de sistema** com empresa selecionada e o proprio (2) caem |
| `apps/web/e2e/support/rbac.ts` | nenhum helper novo: `semearQuaseAdmin` (`:126-130`, `isAdmin` falso) ja e barrado por D2 |

### Fase 7 — Fechamento

| Ponto | Mudanca |
|-------|---------|
| medicao | `pnpm ci:preflight` 0 · `pnpm --filter @projeto/api test:coverage` (o threshold so vale no config raiz) · `pnpm ci:local` antes do push |
| PR | fecha F0-F7 |

---

## 3. Fora do escopo (declarado, nao esquecido)

- Flags **por empresa** (so global) — D1.
- **Rollout gradual** por porcentagem, por usuario, por horario — so liga/desliga.
- **Servico externo** (Unleash/LaunchDarkly) — o lembrete existe nas memorias de `nestjs-specialist` e `nextjs-specialist`, mas e infraestrutura.
- **Historico de toggles** — `updated_at` responde "quando"; quem ligou/desligou nao e gravado.
- **Consumidor #2** — `convidar` prova o mecanismo; outros filtros sao trabalho futuro.
- **Swagger** na rota nova — nenhum dos 4 controllers `/admin/*` tem decorator (medido).
- **`docs/STACK.md`** — nao enumera modulos (medido: `grep 'modules/'` -> 0) e nenhum gate a referencia. O `specialist-router` sinalizou O2 aqui; fechado, sem mudanca.
- **`atorDe` duplicado (3a copia)** — medido 2026-10-18: `admin-profiles.controller.ts:70`, `admin-authorizations.controller.ts:56` e `admin-feature-flags.controller.ts:71` tem o corpo **identico** (`userId`/`tenantId ?? null`/`isAdmin === true`). A 3a foi escolhida para casar com o formato de `admin-profiles`, que e o que os 2 controllers `/admin/*` ja seguiam; um helper compartilhado seria um 3o arquivo novo e uma mudanca em 2 controllers que **nao** precisam dela. Débito registrado, nao pago.
- **`PrismaModule` nos imports do `FeatureFlagsModule`** — medido redundante: o modulo e `@Global()` e ja esta no `AppModule`. **Mantido** por consistencia com os 5 modulos irmaos, que tambem o listam. Nenhum gate acusa nem deixa de acusar; e um gate que so mede `AppModule` acusaria os 6 modulos de uma vez, nao este.

---

## 4. Riscos conhecidos

| # | Risco | Como esta tratado |
|---|-------|-------------------|
| R1 | G-002: cobertura do api | **re-medido 2026-10-18, depois da F1** (`apps/api/coverage/coverage-final.json`, 86 arquivos): **3425/3946 statements (86,80%)** e **311/357 funcs (87,11%)**. O agregado ja inclui os 2 specs novos da F1. As fases restantes somam ~200 statements e ~20 funcs; com 80% cobertos o agregado fica ~86,1% / ~86,6% — o gate de 80% **aguenta**. Cheapest headroom se precisar: `prisma-tenant-onboarding.repository.ts`, 15/161 statements (9,3%), mergeado ontem no #101 e sem teste |
| R2 | `deny-by-default` do RLS nao se aplica aqui | D10 + R3; medido que `check-tenant-scope-source.ts` nao acusa repositorio que nao chama as funcoes de escopo |
| R3 | Tabela visivel para o papel de runtime `app_runtime` (o unico que existe) | so a API fala com ela; nenhuma query de tenant a toca. Privilegios automaticos pelo `ALTER DEFAULT PRIVILEGES` de `20261020000000:59-62` |
| R4 | `semearQuaseAdmin` so semeia `admin.manage-*` | irrelevante: D2 barra antes de qualquer chave |
| R5 | Guard novo em controller existente muda comportamento quando a flag esta off | default D4 = ligada, entao o comportamento apos o merge e identico ao de `main` |
| R6 | `admin.manage-feature-flags` entra no que todo dono de empresa recebe no signup | aceito e escrito em D8; D2 e o portao real |

---

> **Revisoes incrementais em arquivo proprio:** [`2026-10-18-feature-flags-revisoes.md`](./2026-10-18-feature-flags-revisoes.md).
> Este plano carrega decisao e ordem de execucao; as revisoes de fase (com as
> mutacoes medidas e o que cada revisor NAO mediu) foram extraidas para o
> limite de 300 linhas da convencao
> [`tamanho-e-revisao.md`](../../../.agents/specs/conventions/tamanho-e-revisao.md).
