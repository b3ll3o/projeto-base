---
name: plano-feature-flags
description: Plano da demand feature-flags — chaves de funcionalidade ligaveis e desligaveis pelo administrador do sistema, com tela de toggle em /admin/flags e um consumidor real (convite de empresa).
version: 1.1.0
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
> **v1.1.0** — revisado por dois agents distintos do implementador; 13 correções,
> 3 delas mudam desenho. Ver [§Revisao](#revisão-v110).

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
| `packages/shared-types/src/feature-flag.ts` (novo) | `FeatureFlagDto { chave, descricao, enabled, updatedAt }` + `UpdateFeatureFlagInputDto { enabled: boolean }` |
| `packages/shared-types/src/index.ts` | re-exporta os dois |

### Fase 1 — Persistencia

| Ponto | Mudanca |
|-------|---------|
| `apps/api/prisma/schema.prisma` | model `FeatureFlag { chave String @id · descricao String · enabled Boolean @default(true) · createdAt · updatedAt · version Int @default(1) }`, `@@map("feature_flags")` |
| `migrations/20261020000006_feature_flags/migration.sql` (nova) | `CREATE TABLE` + `COMMENT ON TABLE`. Sem GRANT (D10) e sem RLS (D10). Cabecalho no formato do repo: por que existe, ordem, e o que foi omitido |
| `apps/api/src/modules/flags/domain/ports/feature-flag-repository.port.ts` (novo) | token + `{ listar(): Promise<FeatureFlagRow[]>; upsert(chave, enabled, descricao) }` — **sem** `tenantId` (D1) |
| `.../infrastructure/persistence/prisma-feature-flag.repository.ts` (novo) | 2 queries diretas, **sem** `comEscopo`: sem coluna de escopo nao ha GUC para setar. Medido: `check-tenant-scope-source.ts:78` so acusa quando uma das 3 funcoes de escopo recebe valor derivado da rota — um repositorio que nao chama nenhuma nunca e flagrado |
| `prisma-feature-flag.repository.spec.ts` (novo) | fake `PrismaClient`; `upsert` grava e `listar` devolve; tabela vazia devolve `[]` |

### Fase 2 — Dominio e aplicacao

| Ponto | Mudanca |
|-------|---------|
| `apps/api/src/modules/flags/domain/value-objects/feature-flag-key.vo.ts` (novo) | VO imutavel validando contra o catalogo, no formato de `authorization-key.vo.ts`; `restore()` **nao** valida (`:36-39`); `InvalidFeatureFlagKeyException` propria |
| `.../application/feature-flags.use-cases.ts` (novo) | `listar(ator)` e `definir(ator, chave, enabled)`. `listar` devolve a **uniao** catalogo x linhas (D4) — cabe na use case sem mudar a assinatura da porta, porque `listar()` nao recebe argumento. Ambos exigem `ehAdministradorDeSistema` (D2, D11) |
| `feature-flag-key.vo.spec.ts` (novo) | constroi/valida/rejeita |
| `feature-flags.use-cases.spec.ts` (novo) | fake in-memory que `implements` a porta e **registra** o `enabled` gravado; casos: nao-admin recusa · admin de empresa recusa · admin do sistema lista a uniao · `definir` grava e a listagem seguinte devolve o valor novo · chave fora do catalogo recusa |

### Fase 3 — HTTP

| Ponto | Mudanca |
|-------|---------|
| `apps/api/src/modules/flags/infrastructure/http/admin-feature-flags.controller.ts` (novo) | `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@Controller('admin/feature-flags')`; `GET /` e `PATCH /:chave` com body Zod `{ enabled: boolean }` (`ZodValidationPipe`, como `users.controller.ts:146`); `@RequirePermission('admin.manage-feature-flags')` **em cada handler**. `atorDe(req)` local, no formato de `admin-profiles.controller.ts:70-76` |
| `admin-feature-flags.controller.spec.ts` (novo) | os 2 handlers repassam ator e chave; `atorDe` produz `tenantId: null` de `req.user.tenantId` ausente (`?? null`, nunca `undefined`) |
| `apps/api/src/modules/flags/flags.module.ts` (novo) | registra porta + use cases + controller; **exporta a porta e a use case** (D13: o guard injeta a porta) |
| `flags.module.spec.ts` (novo) | sobe o container e compara identidade dos providers (formato de `profiles.module.spec.ts:98`) |
| `apps/api/src/app.module.ts:52` | `imports: [..., TenancyModule, FlagsModule]`. Sem isso a rota responde 404 e o `flags.module.spec.ts` fica verde sem ver nada |
| `apps/api/src/modules/tenancy/tenancy.module.ts:25` | `imports: [..., FlagsModule]` — sem isso o `FeatureFlagGuard` nao resolve e o container de `TenancyModule` cai, derrubando `convidar` **e** `accept` |

### Fase 4 — Consumidor real

| Ponto | Mudanca |
|-------|---------|
| `.../decorators/require-feature-flag.decorator.ts` (novo) | `FEATURE_FLAG_KEYS_METADATA` + `RequireFeatureFlag(...keys)`, copia de `require-permission.decorator.ts:13-16` |
| `.../guards/feature-flag.guard.ts` (novo) | injeta `FEATURE_FLAG_REPOSITORY_PORT` (D13). Sem metadata => `true` (como `permissions.guard.ts:60-62`). Sem `req.user` => `ForbiddenException`. Para cada chave: sem linha => ATIVADA (D4); com linha e `enabled=false` => `NotFoundException` (404 — o recurso nao existe enquanto a flag esta off). Le `getAllAndOverride([handler, classe])`, como o guard de permissao |
| `feature-flag.guard.spec.ts` (novo) | sem decorator passa · flag on passa · linha ausente passa (D4) · flag off => 404 · sem `req.user` => 403. O fake da porta e in-memory e **nao** um `{enabled: true}` literal |
| `apps/api/src/modules/tenancy/infrastructure/http/tenancy-invitations.controller.ts:66` | `@UseGuards(JwtAuthGuard, FeatureFlagGuard)` + `@RequireFeatureFlag('tenancy.invites')` **no handler `convidar`**. A classe (linha 55) fica intacta — mexer nela atinge `accept` tambem. Precedente: `users.controller.ts:246,262,300,331,361` repetem `@UseGuards` em handler |

### Fase 5 — Web

| Ponto | Mudanca |
|-------|---------|
| `apps/web/lib/flags.ts` (novo) | `listarFeatureFlags()` e `definirFeatureFlag(chave, enabled)`, copiando o factory `getClient()` de `lib/perfil.ts:30-40` **com** `getTenant`, por consistencia. Atencao (medido em `api-client.ts:60,67` + `extractTenantId`): enviar `X-Tenant-Id` **tira** do bucket global, entao um admin de sistema com empresa selecionada no cookie leva 403 nesta rota — exatamente como ja leva em `/admin/profiles`. Nao e novidade desta demanda |
| `apps/web/lib/flags.spec.ts` (novo) | corpo valido · corpo nao-JSON vira `ApiError` (defeito do PR #99) · `403` propaga · token ausente nao vaza segredo |
| `apps/web/app/admin/flags/page.tsx` (novo) | Server Component. Guard `me === null \|\| me.isAdmin !== true` => "Acesso restrito" (mesma duplicacao declarada de F9). Form de checkboxes + "Salvar", Server Action inline, `revalidatePath('/admin/flags')`. Classes copiadas literalmente. **Sem spec unitario:** `apps/web/vitest.config.ts:247` exclui `app/**/*.tsx` da cobertura; a tela e coberta pelo Playwright da F6 |
| `apps/web/components/Sidebar.tsx` (bloco `me?.isAdmin === true`, ~linha 40) | link "Feature flags" -> `/admin/flags` |
| `apps/web/components/Sidebar.spec.tsx` | o link aparece para admin e **nao** para usuario comum (negativo obrigatorio) |

### Fase 6 — E2E e gate de fluxos

| Ponto | Mudanca |
|-------|---------|
| `.agents/specs/conventions/e2e-playwright.md:95` | linha `\| F14 \| /admin/flags \| ... \|` no `## Inventario de Fluxos` (cabecalho em 80, F13 em 94). O gate confere `Rota` contra `page.tsx` do disco nos dois sentidos (`check-e2e-flow-coverage.ts:38-41,154-167`). **Linha e spec no mesmo commit** |
| `apps/web/e2e/f14-admin-flags.spec.ts` (novo) | `// FLUXO: F14`. 3 testes: (1) admin ve as chaves, alterna e a tela reflete sem reload; (2) com a flag off, `convidar` responde 404 e com ela on responde como antes; (3) "quase admin" ve "Acesso restrito" e **nao** ve o conteudo da tabela |
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

---

## 4. Riscos conhecidos

| # | Risco | Como esta tratado |
|---|-------|-------------------|
| R1 | G-002: cobertura do api | medido em `apps/api/coverage/coverage-final.json`: 3412/3933 statements (86,75%) e 309/355 funcs (87,04%). O modulo novo soma ~385 statements e ~25 funcs; com 80% cobertos o agregado fica ~86,1% / ~86,6% — o gate de 80% **aguenta**. Cheapest headroom se precisar: `prisma-tenant-onboarding.repository.ts`, 15/161 statements (9,3%), mergeado ontem no #101 e sem teste |
| R2 | `deny-by-default` do RLS nao se aplica aqui | D10 + R3; medido que `check-tenant-scope-source.ts` nao acusa repositorio que nao chama as funcoes de escopo |
| R3 | Tabela visivel para o papel de runtime `app_runtime` (o unico que existe) | so a API fala com ela; nenhuma query de tenant a toca. Privilegios automaticos pelo `ALTER DEFAULT PRIVILEGES` de `20261020000000:59-62` |
| R4 | `semearQuaseAdmin` so semeia `admin.manage-*` | irrelevante: D2 barra antes de qualquer chave |
| R5 | Guard novo em controller existente muda comportamento quando a flag esta off | default D4 = ligada, entao o comportamento apos o merge e identico ao de `main` |
| R6 | `admin.manage-feature-flags` entra no que todo dono de empresa recebe no signup | aceito e escrito em D8; D2 e o portao real |

---

## Revisao (v1.1.0)

Dois agents de revisao, nenhum deles o implementador. Achados e destino:

| # | Achado | Gravidade | Destino |
|---|--------|-----------|---------|
| A1 | O guard chamaria `listar`/`definir`, que exigem admin do sistema — e o ator de `convidar` e dono de empresa. **A rota recusaria todo mundo, sempre** | GRAVE | **D13** — o guard injeta a porta; `listar` + D4 sao 3 linhas |
| A2 | `ehAdministradorDeSistema` **nao e exportada**; o plano assumia reuso | GRAVE | **D11** — mover para `shared/auth/` + import nos dois lugares |
| A3 | Nenhuma fase tocava `app.module.ts` nem `tenancy.module.ts`: a rota ficaria 404 e o container de tenancy nao resolveria o guard | GRAVE | **F3** — as duas linhas, com o sintoma de cada uma escrito |
| A4 | Sem `PermissionsGuard`, `isAdmin` vem do cache e o unico produtor dele e o proprio guard — a rota nao auto-hidrata e reproduz o defeito corrigido em `permissions.guard.ts:76-84` | GRAVE | **D8 revertido** — chave nova + `PermissionsGuard`, como todo controller admin |
| A5 | A justificativa de `getTenant` estava invertida: o header **tira** do bucket global, nao coloca | MEDIA | **F5** — a copia fica, a razao foi reescrita |
| A6 | `@UseGuards` na linha 55 e de **classe** e atingiria tambem `invitations/accept` | MEDIA | **F4** — `:66`, com a 55 escrita como o que nao se toca |
| A7 | D5 dizia "sem versao" e a F1 criava a coluna `version` | MEDIA | **D5** reescrito: a coluna entra por convencao e nao e lida |
| A8 | `<ts>` na migration ordenaria antes de `20261019*`/`20261020*` | MEDIA | **D12** — `20261020000006_feature_flags` |
| A9 | "qualquer `app_runtime`" sugeria mais de um papel de runtime | BAIXA | **R3** reescrito |
| A10 | D8 estava certa, mas por motivo mais fraco: `listAllPermissions()` vai para todo dono de empresa no signup (`prisma-tenant-onboarding.repository.ts:209`) | BAIXA | D8 **revertido** por A4; o fato do signup virou **R6** |
| — | O `specialist-router` (camada 1) deixou O1 (`tenant_id` na tabela?) e O2 (gate de `docs/STACK.md`) em aberto | — | **D1** fecha O1 (sem coluna); O2 medido: `docs/STACK.md` nao enumera modulos e nenhum gate a cita — sem mudanca |

O que sobreviveu sem correcao: as referencias a `permissions-catalog.ts:26-62`,
`require-permission.decorator.ts:13-16`, `users.controller.ts:146`,
`admin-profiles.controller.ts:70-76`, `authorization-key.vo.ts:36-39` e
`profiles.module.spec.ts:98`; a separacao `admin/feature-flags` (API) x `/admin/flags` (web);
`NotFoundException` nao quebrar o `ApiError` do web; e `check-e2e-flow-coverage` reconciliar
`Rota` contra o disco nos dois sentidos.