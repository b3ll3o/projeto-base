---
name: revisoes-feature-flags-fases-0-3
description: Historico das revisoes v1.1.0 a v1.5.0 do plano de feature flags (revisao do plano, Fases 2 e 3), com as mutacoes medidas e o que cada revisor nao mediu
version: 1.5.0
updated: 2026-10-18
status: revisto
plan: 2026-10-18-feature-flags.md
---

# Revisoes — feature flags, v1.1.0 a v1.5.0 (revisao do plano e Fases 2-3)

> Arquivo IRMAO de [`2026-10-18-feature-flags-revisoes.md`](./2026-10-18-feature-flags-revisoes.md),
> que é o **indice** e carrega as revisoes v1.6.0 em diante. A quebra segue
> [`tamanho-e-revisao.md`](../../../.agents/specs/conventions/tamanho-e-revisao.md)
> (`.md` <= 300 linhas): o log é append-only e não cabia inteiro num arquivo.
>
> Aqui: a revisão adversarial do **plano** (v1.1.0, v1.2.0) e as Fases **2** e
> **3**. Cada `## Revisao (vX)` registra **uma fase**: o que mudou no plano, a
> tabela de mutações medidas e — a parte que mais importa — **o que o revisor
> NÃO mediu**.

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

---

## Revisao (v1.2.0)

Terceiro revisor, adversarial: **mutou o codigo** em vez de le-lo, e checou se cada
afirmacao do plano sobrevivia. Mediu `tsc --noEmit` (exit 0), a suite do api
(68 arquivos / 931 testes) e `tsc` do web (exit 0).

| # | Achado | Gravidade | Destino |
|---|--------|-----------|---------|
| B1 | `FeatureFlagKey` era um union **escrito a mao** ao lado do array: `'tenancy.exports'` so no union compilava (`tsc` 0), passava os 4 specs, e `isFeatureFlagKey` devolvia `false`. A anotacao `readonly FeatureFlagDefinicao[]` alargava `chave` para `string` e o `as const` nao tinha sobre o que agir | GRAVE | **Corrigido em `d9695c6`+**: `FeatureFlagKey = (typeof FEATURE_FLAGS)[number]['chave']`, anotacao removida. Medido: `tsc` exit 0, 4/4 verdes |
| B2 | O spec de copia rasa comparava `FEATURE_FLAGS.length` **depois** do `.pop()` que ja tinha esvaziado o array — os dois lados eram 0. Medido pelo revisor: trocar `return [...FEATURE_FLAGS]` por `return FEATURE_FLAGS` deixava **4/4 verdes**, com o array interno corrompido (`sao o MESMO objeto? true`) | GRAVE | **Corrigido**: esperado vira constante literal (`const esperado = 1`). **Re-medido com mutacao**: tirar a copia rasa deixa **1 vermelho**, devolver deixa 4 verdes — o dente existe |
| B3 | O plano mandava `lib/flags.ts` mandar `getTenant` "por consistencia", com o status quo como argumento. Medido: `api-client.ts:13-18` (opcional) + `:66-67` (header so se houver tenant) + `extractTenantId` — enviar o header tira do bucket global e D2 exige `tenantId === null` | GRAVE | **D14** reescrito: sem `getTenant`. O raciocinio da v1.1.0 ("ja e assim em /admin/profiles") foi rejeitado — o defeito vai existir la, e nao e razao para recria-lo numa rota nova |
| C4 | `admin.manage-feature-flags` ja e concedida a **todo dono de empresa**: `prisma-tenant-onboarding.repository.ts:209` roda `listAllPermissions()` no signup de cada empresa. Hoje nao ha rota que use a chave (`grep RequirePermission` -> 0 com a chave nova), mas o dado ja esta no banco | MEDIA | **R6** confirmado com o caminho exato. A defesa e D2 no use case, e o plano exige isso desde a F2 |
| C5 | O web nao tem como validar a chave: `FeatureFlagDto.chave` e `string` e `FeatureFlagKey` nao e exportada do pacote compartilhado | BAIXA | Aceito. `isFeatureFlagKey` no servidor e a unica validacao; a tela so reenvia o que a API devolveu |
| C6 | `PermissionsGuard` **nao** esta nos `exports` do `ProfilesModule` (`profiles.module.ts:63-69` exporta 5 tokens). Medido com `Test.createTestingModule`: modulo novo que use o guard sem declara-lo provider morre — `Nest could not find PermissionsGuard element` | MEDIA | **D17** + linha nova em F3. Os controllers de profiles escam por morarem no mesmo modulo; o modulo novo nao |
| C7 | Contrato do pacote: `index.ts:30` re-exporta, o alias existe no `vitest.config.ts` do web, `tsc` do web exit 0. O pacote e tipo-puro (zero runtime), entao `next build` resolve via `paths` sem `transpilePackages` | — | Confirmado. **`next build` real nao foi medido** — declarado aqui, nao escondido |
| — | O revisor mediu que `tenantId === null` tem **3 escritas** no api e checou cada uma | — | As outras 2 (`prisma-tenant-membership.repository.ts:32`, `prisma-profile.repository.ts:105`) sao resolucao de bucket, nao autorizacao de admin. A regra tem 1 escrita |

O revisor tambem mediu que a regra extraida tem dente no consumidor, nao so no spec novo:
mutar `ehAdministradorDeSistema` para `return true` derruba 9 testes do
`profiles.use-cases.spec.ts` ("perfil admin GLOBAL e recusado", "as 5 rotas que exigem
perfil do escopo", "vestir perfil alheio"). A extracao nao afrouxou nada.

**O que o revisor nao mediu:** `next build`, comportamento com Postgres real das fases
futuras, e a migration `20261020000006` (nao era do commit).

---

## Revisao (v1.3.0 — Fase 2)

Quarto revisor, adversarial, com o codigo sob mutacao e um probe contra o modulo
real. **Veredito: o codigo de producao esta certo; o que estava errado era o
orcamento de dentes do spec.** Nenhum achado exigiu mudanca de logica — dois
exigiram teste novo.

| # | Achado | Gravidade | Destino |
|---|--------|-----------|---------|
| A1 | O caminho **religar** nao tinha medicao: as 7 chamadas de `definir` passavam `false`. Medido pelo revisor: mutar `definir` para devolver `ativada: false` fixo deixava **10/10 verdes**, e num probe real o PUT respondia `false` depois de gravar `true` enquanto a listagem dizia `true` — os dois discordando, que e o invariante que o proprio codigo nomeia em prosa | ALTA | **Corrigido**: teste novo que comeca desligada, religa e afirma `dto.ativada === true` **e** `listagem[0].ativada === dto.ativada`. **Re-medido**: a mutacao do revisor agora deixa **1 vermelho** (era 0) |
| A2 | A ordem "autorizar antes de validar a entrada" nao tinha dente: mover `exigeAdministradorDoSistema` para depois da validacao deixava 10/10 verdes. Invertida, um ator nao autorizado descobre quais chaves existem (400 em vez de 403) | MEDIA | **Corrigido**: teste novo afirma 403 para chave errada e para chave valida. **Re-medido**: a mutacao do revisor agora deixa **1 vermelho** (era 0) |
| A3 | O comentario de `descricaoDe` dizia "IMPOSSIVEL pelo tipo". Verdade no `tsc` (TS2345 medido, `as FeatureFlagKey` = 0 hits no repo), **falso em runtime**: o array e mutavel e ha um `await` entre o guard e o lookup. Medido com uma porta hostil | MEDIA-BAIXA | **Corrigido**: o comentario agora diz o que e verdade — inalcancavel para quem ja estreitou com `isFeatureFlagKey`, alcancavel se o catalogo for mutado em runtime. O ramo segue sem spec, e o preco (89,47% stmt / 83,33% branch no arquivo) esta escrito |
| A4 | `descricaoDe` nao existia em nenhuma fase do plano, e F2 citava `feature-flag-catalog.ts:38` para o type union (que estava na 50) | BAIXA | **Corrigido** na tabela da F2, junto com o `:38` → `:50` |
| A5 | `application/` devolvendo `@projeto/shared-types` e **primeiro no repo** — os outros 4 `application/*use-cases.ts` devolvem interface local e o web declara o DTO paralelo. Nao e defeito (pacote tipo-puro, `tsc` 0, sem duplicar shape) | BAIXA | Registrado na F2 com o preco: **sem mapper nao ha onde morar um campo que a API exponha e o web nao deva ver** — que foi o motivo de D16 recusar `updatedAt` |
| A6 | `message:` onde a casa usa `detail:` no payload RFC 7807 | BAIXA | **Corrigido**: `detail` nos dois pontos. Medido pelo revisor que a diferenca no fio era zero; fica por remove um ramo de fallback |
| A7 | Citacao off-by-one: `global-exception.filter.ts:76` em vez de `:77` | BAIXA | **Corrigido** |
| A8 | `listAllFeatureFlags()` faz copia rasa: `lista[0] === FEATURE_FLAGS[0]`, e mutar o objeto aninhado corrompe o catalogo. O `tsc` bloqueia (`readonly`), entao so de JS | INFO | Nao mexido: o docstring precisa defender `.pop()`, que e o caso real. Registrado |

O revisor **mediu** que o `code` novo nao quebra o `ApiError` do web: existe
**uma unica** ramificacao por `code` em todo o web (`app/users/novo/actions.ts:75`,
`EMAIL_IN_USE`) e nenhum registro central; `api-client.ts:108` carrega `problem.code`
como string opaca. E rodou o filtro real: `FORBIDDEN` sai 403 e
`FEATURE_FLAG_CHAVE_INVALIDA` sai 400, ambos RFC 7807.

**O que o revisor nao mediu, e fica declarado:** Postgres real desta fase, o boot
do container Nest (o spec instancia `new FeatureFlagUseCases(porta)`, entao
**nao ve nada de DI** — quem pega o `@Inject` com token errado e o
`feature-flags.module.spec.ts` da F3), o agregado de cobertura do api, `ci:preflight`,
e `ci:local`.
---

## Revisao (v1.4.0 — Fase 3)

A Fase 3MEDIU o grafo de DI, que e a primeira coisa que a F2 declarou nao
medida. O resultado corrige uma decisao do plano (D17) e acrescenta uma aresta
que ninguem tinha escrito.

**D17 estava errada.** O plano afirmava que `PermissionsGuard` e `JwtAuthGuard`
precisavam estar nos `providers` do `FeatureFlagsModule`. Medido: tirando o
`PermissionsGuard` dos `providers`, o modulo compila e o
`feature-flags.module.spec.ts` inteiro segue verde. O Nest resolve o guard de
`@UseGuards` pelos `injectables` de qualquer modulo do container — e o
`ProfilesModule` ja registra o guard. A premissa do revisor da F0 (o guard nao
esta nos `exports` do `ProfilesModule`) continua verdadeira; a conclusao nao.
**Providers dos guards foram removidos**; sobraram as arestas.

**A aresta que faltava:** `PrismaPersistenceModule`. `@UseGuards(JwtAuthGuard)`
faz o Nest **instanciar** o guard no contexto do modulo do controller — nao
reaproveitar o do `AuthModule` — e o `JwtAuthGuard` injeta
`TenantMembershipRepositoryPort`, que o `AuthModule` importa mas **nao**
re-exporta. Sem a linha o boot morre com `Nest can't resolve dependencies of
the JwtAuthGuard (Symbol(TokenIssuerPort), Reflector,
UserProfileCacheService, ?)`. E o mesmo motivo pelo qual o `ProfilesModule`
importa o `PrismaPersistenceModule`. O plano v1.3.0 nao tinha esta linha.

### Mutacoes medidas (Fase 3)

O ORCAMENTO de dentes da fase, nao a prova de que nao ha mais. As mutacoes
abaixo foram aplicadas uma a uma, com backup e restauracao verificada por
`git diff --quiet`. A coluna `antes` e o estado da suite UNITARIA na entrega da
F3; a coluna `depois` e depois do e2e e do spec novo da D13.

| # | mutacao | antes | depois | quem acusa |
|---|---|---|---|---|
| 1 | remover `@RequirePermission` do PUT | 1 | 1 | unit |
| 2 | `isAdmin === true` → `isAdmin` cru | 1 | 1 | unit |
| 3 | `tenantId ?? null` → `tenantId` cru | 1 | 1 | unit |
| 4 | controller ler a chave do BODY | 1 | 1 | unit |
| 5 | tirar `PrismaPersistenceModule` dos imports | 6 | 6 | unit |
| 6 | tirar `ProfilesModule` dos imports | 6 | 6 | unit |
| 7 | tirar `FeatureFlagsModule` do `TenancyModule` | 1 | 1 | unit |
| 8 | `@Inject` com token errado na use case | 6 | 6 | unit |
| 9 | **tirar `PermissionsGuard` dos `providers`** | **0 — spec cego** | — | a linha ja nao existe (D17 corrigida) |
| 10 | `PermissionsGuard` fora do `@UseGuards` | **0** | **3** | e2e |
| 11 | `ZodValidationPipe` fora do `@Body` | **0** | **5** | e2e |
| 12 | `z.boolean()` → `z.coerce.boolean()` | **0** | **5** | e2e |
| 13 | rota `admin/feature-flags` → `admin/flags` | **0** | **10** | e2e |
| 14 | `controllers: []` no modulo | **0** | **10** | e2e |
| 15 | `@UseGuards` inteiro removido | **0** | **5** | e2e |
| 16 | `exports: []` no modulo | **0** | **1** | unit (spec D13 novo) |
| 17 | `FeatureFlagsModule` fora do `AppModule` | **0** | **0 — e NAO E DEFEITO** | ver abaixo |

**A mutacao 9 e a que corrige a D17:** `moduleRef.get(X, { strict: false })`
procura no container INTEIRO, entao nao distingue "provider deste modulo" de
"provider de outro" — a assertos passava com a decisao errada. A **16** era a
mesma cegueira no `exports`: o bloco D13 usava `get(..., { strict: false })`, que
achava o token pelo caminho aberto pelo `TenancyModule` e nao provava o
`exports`. Agora o bloco injeta a porta num provider — a forma que o guard da F4
vai ter.

### O que a revisao adversarial da F3 forcou (v1.5.0)

A revisao mediu as 7 mutacoes com 0 vermelhos (10 a 16) e subiu a aplicacao de
verdade — `bootstrapE2E()`, `AppModule` real, Postgres real via Testcontainers.
As quatro primeiras produziam defeito OBSERVAVEL, e a cobertura do arquivo de
producao era **100%** durante todas elas. Cobertura de 100% que nao distingue
"verifiquei e passei" de "nao havia nada a verificar".

**O que estava errado no plano:** a F3 declarava que *"nenhum request atravessou
a rota de verdade — o `PUT`/`GET` sobre HTTP real so aparece no e2e da F6"*. A
primeira frase era honesta; a **razao** nao. O projeto `e2e` do **api** ja
existia (`apps/api/test/e2e/`, 12 cenarios, `bootstrapE2E()`), e o e2e da F6 e o
do **web** (Playwright). A frase mandava o proximo revisor pular uma medicao de
7 segundos que teria pego quatro defeitos reais.

**A correcao:** `apps/api/test/e2e/scenarios/13-feature-flags.e2e.spec.ts`,
13 testes (8 `it` + um `it.each` de 5 casos), boot de ~7 s. Atravessa `JwtAuthGuard`, `PermissionsGuard`,
`ZodValidationPipe` e `GlobalExceptionFilter`, e fecha as mutacoes 10-16.

**O achado mais caro foi a 10.** Com cache de perfil FRIO — o estado de um
servidor recem-subido — o `JwtAuthGuard` so LE `req.user.isAdmin` e nao escreve
de volta; o UNICO produtor do perfil aquecido e o `PermissionsGuard`
(`permissions.guard.ts:93-102`). Sem ele o admin legitimo leva 403 numa tela
recem-nascida: o defeito A4 que a D8 existe para impedir, reintroduzivel por um
editor de linha sem nenhum teste ficar vermelho.

**A 17 NAO E DEFEITO, e o plano afirmava o contrario.** A linha 95 do plano dizia
que, sem `FeatureFlagsModule` no `AppModule`, *"a rota responde 404"*. MEDIDO:
nao responde. O `TenancyModule` importa o `FeatureFlagsModule` e o `AppModule`
importa o `TenancyModule`; o Nest registra os controllers de um modulo assim que
ele e instanciado em qualquer ponto do grafo. O comentario que justificava a
linha no `app.module.ts` ("o Nest nao herda o controller pelo modulo
intermediario") era **falso** e foi corrigido. A linha ficou, com o motivo
verdadeiro: a rota nao deve depender da aresta D13.

### MEDIDO 2026-10-18

- `npx vitest run` (api inteiro, 3 projetos) → **88 arquivos / 1086 testes verdes**
- `npx tsc --noEmit` → exit 0
- `pnpm --filter @projeto/api test:coverage` → **87,05% stmt / 93,01% branch**, exit 0
- `pnpm ci:preflight` → 0 erro (2 checks `skipped` por ambiente: archive vazio e
  nenhum agent alterado vs `origin/main`)

**O que a F3 ainda nao mediu, e fica declarado:** o `guard` de `convidar` (F4)
nao existe, entao a mutacao 7 so e accused pela spec de container — o consumidor
real da porta ainda nao esta no grafo. O rate limit da rota (100/min) nao foi
exercitado; e `next build` do lado web segue nao rodado porque a F5 ainda nao
existe.

> **Correcao 2026-10-18 (depois da F5):** as duas ultimas clausulas envelheceram.
> O `next build` rodou e saiu 0 — e, medido, **nao prova a tela**: a pagina
> `/admin/flags` e `force-dynamic`, entao o build so a compila, e o defeito da
> Server Action sem `'use server'` so apareceu no primeiro **request**. O rate
> limit da rota segue nao exercitado. Ver
> [v1.7.0 — Fases 5 e 6](./2026-10-18-feature-flags-revisoes.md).

Continua em [v1.6.0 — Fase 4](./2026-10-18-feature-flags-revisoes.md).
