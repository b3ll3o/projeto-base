---
name: plano-historico-usuario-admin-correcoes
description: "A branch `feat/historico-usuario-admin` entrega a rota nova `GET /admin/users/:id/history` e a seção 'Histórico' da tela `/users/[id]`. O diff está verde nas quatro camadas e, mesmo assim, tem um defeito P0 (três documentos prometem uma coluna 'Motivo' que a tela deliberadamente não tem) e vinte e dois outros, medidos: a recusa do portão não deixa rastro com o ator, a trilha de quem foi soft-deleted é inalcançável, o web replica um limite que é da API, o duplo de auditoria pagina por um cursor que a API recusa, a rota nova é a única do contrato fora da tag da sua família, o ramo do id cru é inalcançável porque nenhuma mutação de `User` tem ator ≠ o dono, e a tabela da seção fica com 2.097px porque o `break-words` não reduz a contribuição min-content de uma célula. Este plano corrige os vinte e três e decide a ordem do histórico — que hoje mostra as mil versões mais ANTIGAS e esconde as mais recentes. A ordem decrescente é uma decisão da API (não da tela): com o cursor andando para o mais antigo, inverter só a exibição não alcança a versão mais recente."
version: 3.1.0
updated: 2026-11-17
status: executado
state_snapshot: .agents/runs/state-snapshot-20261117T173026Z.md
---

# Plano — o histórico de uma pessoa, corrigido

> **Demand:** *"analise o que foi feito na branch atual, faça um plano para corrigir
> todos os erros encontrados e implementar as melhorias encontradas"*.
>
> **Snapshot de estado:**
> [`.agents/runs/state-snapshot-20261117T173026Z.md`](../../../.agents/runs/state-snapshot-20261117T173026Z.md)
> (`proceed: true`, `gap_blocker: false`).
>
> **Composição do despacho:** camada 0 = `state-aware-planning` (thread principal) ·
> camada 1 = três specialists em **paralelo** (`security-auditor`,
> `stack-code-reviewer`, `ux-design-specialist`) + a medição do próprio thread
> (state, gates, API ao vivo, Postgres, browser). Handoff no formato canônico
> da skill `agents:coordinate` §2.3. O `ux-design-specialist` **morreu por cota
> (429)** no meio da medição — a revisão de UI/a11y foi **refeita** pelo thread
> principal, com o browser e a tela populada, e está em §2.1.

---

## §1. O estado medido (AS-IS)

A branch `feat/historico-usuario-admin` carrega **três** commits sobre
`origin/main` (`7dae1eee`):

| Commit | O que é |
|---|---|
| `68362361` | a feature: rota `GET /api/v1/admin/users/:id/history`, a seção "Histórico" da tela `/users/[id]`, o cliente web, e os specs (unit da api, e2e da api, unit do web, e2e do web) |
| `99e8acf1` | `turbo.json`: `test:e2e` e `test:integration` passam a depender de `db:generate` |
| `251bb31c` | o registro de exceções de dependência ganha a advisory do `picomatch` |

**O diff está verde nas quatro camadas.** Todas as medidas abaixo foram tiradas
neste branch, nesta máquina, com o comando do lado.

| Medida | Valor | Comando |
|---|---|---|
| Preflight estrutural | **exit 0**, 0 erro, 2 checks pulados | `pnpm ci:preflight` |
| Typecheck (api + web + tooling) | **exit 0** | `pnpm -r typecheck` |
| Lint (api + web) | **exit 0** | `pnpm lint` |
| Build do web (Next) | **exit 0** | `pnpm --filter @projeto/web build` |
| Testes unitários | **1161** (api) · **500** (web) · **426** (tooling), todos verdes | `pnpm -r test` |
| Testes e2e da API | **134** em 19 arquivos, verdes — o cenário **18** (novo) com 6 testes | `pnpm --filter @projeto/api test:e2e` |
| Cobertura agregada | api **88,26%** de linhas / 91,71% de branches · web **98,64%** / 94,4% | `pnpm test:coverage` |
| Schema Prisma | **sem drift** (25 migrações aplicadas) | `cd apps/api && pnpm exec prisma migrate status` |
| Drift do `openapi.json` | **nenhum** (comparação semântica) | gate `check-openapi-contract` (rodou no preflight) |
| API de pé | `:3000/api/v1/health` → `{"status":"ok"}` | `curl -fsS http://localhost:3000/api/v1/health` |
| Web de pé | `:3001/api/health` → `{"status":"ok"}` | `curl -fsS http://localhost:3001/api/health` |
| Contagens do doc de e2e | 21 specs · 21 linhas `F*` · 21 cabeçalhos `// FLUXO:` · 15 rotas | `ls apps/web/e2e/*.spec.ts \| wc -l` · `grep -c '^| F[0-9]' .agents/specs/conventions/e2e-playwright.md` |

### §1.1 A rota nova, medida ao vivo

A API estava de pé (seed local: `admin@admin.com` / `Admin@123`). Todas as
respostas abaixo são reais, não inferidas.

| Requisição | Resultado medido |
|---|---|
| `GET /admin/users/{id}/history` (admin do sistema, sem header) | **200**, com a entrada `INSERT` e o `snapshot` da pessoa |
| `?limit=abc` | **400** `VALIDATION_ERROR`, campo `limit` |
| `?cursor=nao-e-uuid` | **400** `VALIDATION_ERROR`, campo `cursor` |
| `:id` de UUID v7 inexistente | **404** `USER_NOT_FOUND` |
| `:id` que não é UUID | **400** `VALIDATION_ERROR`, detail "id inválido: o identificador precisa ser um UUID v7 válido." |
| ator COMUM (sem `admin.manage-users`) | **403** `FORBIDDEN`, detail "permissão requerida ausente: precisa de uma de [admin.manage-users]" |
| admin COM `X-Tenant-Id` | **403** `TENANT_MEMBERSHIP_REQUIRED` |
| sem token | **401** `UNAUTHORIZED` |
| rota do DONO (`GET /users/{id}/history`) com id alheio | **403** `USER_OWNERSHIP_VIOLATION` (intacta) |
| **cursor da página 1 → página 2** (pessoa com 4 versões, `limit=2`) | **200** → `[1,2]` com cursor `01b5a7a2-…`, e **200** → `[3,4]` com `nextCursor: null` |

⚠️ A última linha é a prova de que o **mecanismo** do cursor funciona em
produção. O que falta é **cobertura** do caminho (C5) e a **eficiência** (C9).

### §1.2 O que já está certo (e não entra no plano)

- **A RLS sustenta a travessia de empresas.** `usuario_no_escopo` exige
  `current_user = 'app_system'` (migration `20261027000001`). Medido no Postgres
  local: sessão `app_runtime` com `app.tenant_id='*'` vê **0** linhas de
  `users_history`; sessão `app_system` vê todas. O disjunt
  `escopo_atual()='*'` **não existe mais** na função instalada.
- **O portão D2 está no lugar certo** — dentro da use case, antes de qualquer
  leitura, e o teste negativo afirma que o `auditService` **não** foi chamado.
- **A coluna "Motivo" foi removida com a premissa certa**: `users_history.reason`
  é **sempre `null**. `DELETE /users/:id` monta `reason: null`; o
  `POST /users/:id/restore` monta `{ id, expectedVersion }` — sem reason; e
  `extractReason` (`user-use-cases.ts:492`) só devolve reason no evento
  `.deleted.v1`.
- **O cursor pagina certo**: 4 páginas medidas contra Postgres real com Prisma
  6.19.3 → `[1,2,3] [4,5,6] [7,8,9] [10]`, sem repetição, sem salto, em ordem.
  O `version` é único por entidade (`@@unique([entityId, version])`), e a
  tradução do cursor (`version >= (SELECT version …)`) é exata.
- **Não há colisão de rota** entre `PUT admin/users/:id/profile` (profiles) e
  `GET admin/users/:id/history` (users); `ProfilesModule` não importa
  `UsersModule` — sem ciclo de módulo.
- **A regra de dependência DDD está respeitada** no código novo: zero import de
  infraestrutura na aplicação; o `Logger` no application tem precedente
  **idêntico** (`loggerEscalacao`, `loggerInventario`).
- **Os dois formatos do histórico coincidem no wire** — o `HistoryEntry` (port)
  e o `UserHistoryEntryDto` têm os mesmos 8 campos, e o `snapshot` gravado tem
  exatamente as chaves de `toUserOutput` (medido nas linhas reais de
  `users_history`).
- **`Promise.all` com `ler()` NÃO serializa** — `ler()` nunca rejeita, as duas
  leituras partem juntas, e o `NEXT_REDIRECT` é lançado fora de qualquer
  `try/catch`.
- **A tela segue o padrão da casa**: `<a href="">` para "Tentar de novo" é o
  mesmo do `guard-admin.tsx`; `Tabela` já exige legenda, já embrulha em
  `overflow-x-auto`, já traz `scope="col"` e `break-words` nas células;
  `CabecalhoSecao` é um `h2`; `Alerta` decide o `role` pela variante.

---

## §2. Os defeitos encontrados

### C1 — P0 — Três documentos prometem uma coluna "Motivo" que a tela não tem

A tela **não** tem coluna de motivo, e isso é uma decisão medida (§1.2). O spec
UNIT **afirma a ausência** da coluna:

```ts
// apps/web/app/users/[id]/page.spec.tsx
expect(screen.queryByRole('columnheader', { name: 'Motivo' })).not.toBeInTheDocument();
```

Mas três textos da própria branch prometem o motivo:

| Onde | O que diz |
|---|---|
| `.agents/specs/conventions/e2e-playwright.md:102` (linha do inventário F21) | "… o quando, quem mudou **e o motivo**" |
| `.agents/specs/conventions/e2e-playwright.md:290` (revisão 1.10) | "… quando, quem mudou **e por quê**" |
| `apps/web/e2e/f21-historico-usuario.spec.ts:6` (cabeçalho do spec) | "… quando aconteceu, quem mudou **e por quê**" |

⚠️ A convenção [`documentacao.md`](../../../.agents/specs/conventions/documentacao.md)
§1.2 classifica **doc que mente como defeito P0** — e aqui o doc mente sobre a
própria feature que o mesmo commit entrega.

### C2 — MÉDIO — A recusa do portão D2 (403) não deixa nenhum registro com o ator

O `Logger('AdminUserHistory')` só é chamado no caminho do **sucesso**; o
`GlobalExceptionFilter` só loga a partir de 500; e o access log do pino não
carrega `sub` (não há `customProps` em `app.module.ts:64`).

**Efeito:** a tentativa de ler a trilha alheia por um ator não-administrador
fica numa linha com method/url/status — e não é atribuível a ninguém. O
precedente do repo para isso já existe: `registrarBloqueio`
(`feature-flag.guard.ts:113`) e `recusaEscalada` (`profiles.use-cases.ts:60`),
cujo comentário já diz: *"uma escalada é 403, então passava sem rastro"*.

### C3 — MÉDIO — A trilha de quem foi soft-deleted é inalcançável

A conferência de existência usa `findById` **sem `includeDeleted`**
(`prisma-user.repository.ts:244` → `if (!options?.includeDeleted && row.deletedAt !== null) return null`).
Então uma pessoa apagada devolve **404 `USER_NOT_FOUND`** — mas a linha em
`users`, a entrada `DELETE` em `users_history` e o `users_archive` **existem** e
são visíveis na credencial de sistema.

**Efeito:** a trilha de auditoria de quem **saiu** da empresa é inalcançável
pela única rota que a lê — que é exatamente o caso que a feature existe para
servir.

**MEDIDO ao vivo** (pessoa criada, apagada, e lida como admin do sistema):

```
DELETE /users/{id}                          → 204
GET  /admin/users/{id}/history              → 404 USER_NOT_FOUND
-- e no banco, as DUAS linhas existem, com o nome e o e-mail no snapshot:
INSERT|Pessoa Que Saiu|t3-probe-…@exemplo.dev|false
DELETE|Pessoa Que Saiu|t3-probe-…@exemplo.dev|true
```

⚠️ A correção **não é só da API**: o inventário filtra `deletedAt: null`
(`prisma-admin-tenancy.repository.ts:146`) e a página cai no `notFound()`
(`page.tsx:173`). Os dois lados precisam mudar juntos — ver T3. E o `snapshot`
das versões **tem** o nome e o e-mail da pessoa apagada (MEDIDO acima), o que
dá à tela a fonte que ela precisa sem um endpoint novo.

### C4 — MÉDIO — O web replica o `LIMITE_MAXIMO` da API (100) como constante própria

`apps/web/lib/tenancy.ts:83` tem `TAMANHO_DA_PAGINA_HISTORICO = 100`. O dono do
número é a API: `apps/api/src/modules/users/domain/ports/user-repository.port.ts:25`.

**Efeito:** se a API baixar `LIMITE_MAXIMO` para 50, `?limit=100` vira **400
`VALIDATION_ERROR`** e a seção "Histórico" vira `Alerta` para **toda** pessoa —
sem nenhum teste acusar (o web mocka o cliente; a API não conhece o número do
web). O repo já tem o instrumento para isso: `apps/web/lib/cadastro-usuario-schema.parity.spec.ts`
faz a paridade dos VOs entre web e API.

### C5 — MÉDIO — O duplo de auditoria pagina por um cursor que a API recusa

`InMemoryAuditService.listHistory` (`in-memory-audit-service.ts:54`) faz
`Number(input.cursor)` — um **offset numérico**, e devolve `nextCursor` como
`String(nextOffset)`. O contrato de produção é o `users_history.id`, um **uuid
v4 opaco** — e `PaginacaoQuerySchema` recusa qualquer cursor que não seja uuid,
com **400** `"cursor precisa ser um id (uuid)"`.

**Efeito:** o spec novo da rota (`user-use-cases.spec.ts:640`) só passa
`cursor: null`, e o e2e novo só afirma `nextCursor === null` (1 entrada). Um
`cursor` trocado por `version` — ou por qualquer coisa que não seja uuid —
**continua verde no unit** (o duplo ignora o formato) e devolve **400** na
segunda página em produção. Nenhum teste do repo exercita o round-trip
cursor→HTTP→cursor: nem o e2e, nem a spec do controller.

### C6 — MÉDIO — A rota nova é a única do contrato fora da tag da sua família

`admin-user-history.controller.ts:51` usa `@ApiTags('admin')`. Mas o **irmão**
de recurso, `PUT /admin/users/{id}/profile`, usa `@ApiTags('admin-users')`
(`profiles/.../admin-users.controller.ts:25`). E as outras: `admin/tenancy` →
`admin`, `admin/feature-flags` → `feature-flags`.

MEDIDO no contrato gerado — as DUAS rotas de `/admin/users` caem em tags
diferentes:

```
users: 7 · admin: 2 (a de tenancy + a NOVA) · admin-users: 1 (a do PUT profile)
```

### C7 — BAIXO — A data do histórico sai no fuso do SERVIDOR, sem fuso declarado

`page.tsx` faz `new Date(entrada.changedAt).toLocaleString('pt-BR')` sem
`timeZone`. O container não tem `TZ` → **UTC**. Um leitor de Brasília lê
`2026-11-02T12:30:00Z` como "12:30:00" quando são 09:30.

**Efeito:** o spec e o e2e calculam a expectativa com o **mesmo** formatador do
servidor — os dois passam, e nenhum dos dois acusa.

### C8 — BAIXO — `turbo.json` protege só o e2e do api

`dependsOn: ["db:generate"]` aponta, para `@projeto/web`, para uma task que
**não existe**: MEDIDO, `pnpm turbo run test:e2e --dry=json --filter=@projeto/web`
→ `@projeto/web#db:generate | <NONEXISTENT>`, **exit 0**.

**Efeito:** a invariante que o commit declara ("o `db:generate` não pode correr
em paralelo com o e2e") **não vale** para o e2e do **web** — que é o que sobe a
API (`global-setup.ts` → `subirApi` → importa `@prisma/client`). Hoje a corrida
não se materializa (o setup do web leva ~40 s antes de spawnar a API; o
`prisma generate` leva 2-4 s), mas o **grafo** não garante nada.

### C9 — BAIXO — Com cursor, o Prisma 6.19.3 não emite LIMIT; e o cursor não é escopado à entidade

MEDIDO no SQL emitido por `prisma-audit.service.ts:96`:

```sql
-- com cursor:
WHERE entity_id=$1 AND version >= (SELECT version FROM users_history WHERE id=$2)
ORDER BY version ASC OFFSET 0          -- ← sem LIMIT
-- sem cursor:
WHERE entity_id=$1 ORDER BY version ASC LIMIT $2
```

**Efeito 1 (eficiência):** uma pessoa com 1000 versões — a 2ª página traz ~900
linhas do banco para exibir 100. E a tela pede `limit=100` justamente.
**Efeito 2 (correção):** o subselect **não filtra por `entity_id`** — um cursor
de **outra** entidade devolve uma página errada (vazia, se a versão alheia for
maior; deslocada, se for menor). Não é vazamento (a entidade alvo continua
sendo a pedida), mas é uma página que não é a que o cursor promete.

⚠️ Este código é **anterior** à branch (a rota do dono já o usava); a branch o
torna mais visível ao pedir `limit=100` e seguir o cursor 10 vezes.

### C10 — BAIXO — O `Alerta` trata recusa e 404 como falha transitória

O `Alerta` do bloco de erro do histórico é o mesmo para qualquer falha não-401:
"Não foi possível carregar o histórico desta pessoa. **Tente de novo em
instantes.**"

**Efeito:** um 403 é **permanente** ("permissão requerida ausente"), e um 404
também. O guard do web (`exigirAdminDoSistema`) barra o 403 **antes** da
chamada — então o caminho comum não chega aqui — mas o 403 **é** alcançável
na janela de 5 s do cache de perfil (o web lê o perfil global ao vivo; a API
lê o `isAdmin` do token, que vem do cache), e uma pessoa apagada entre as
duas leituras paralelas produz o 404. Nessas duas, "tente de novo" é mentira.

### C11 — BAIXO — O `@ApiResponse` do 400 não cita o `:id`, e o doc canônico cita

O controller declara o 400 como "Query inválida (limit fora da faixa, cursor
malformado)". Mas `docs/api/users.md` §3.8 diz: "400 (`VALIDATION_ERROR` —
query inválida **ou** `:id` que não é um UUID v7)", e ao vivo o `:id` inválido
devolve **400** com detail "id inválido: o identificador precisa ser um UUID v7
válido."

### C12 — BAIXO — `rotuloDaOperacao` não é tipada pelo enum que ela traduz

`apps/web/lib/tenancy.ts`: `const OPERACAO: Record<string, string>`. O enum
dono é `AuditOperationType` (`packages/shared-types/src/user.ts`).

**Efeito:** um valor novo no enum sai na tela em inglês, sem o compilador
reclamar — e o fallback "passa como veio" (que o spec mede com `TRUNCATE`) fica
indistinguível de uma tradução que simplesmente não existe.

### C13 — INFO — `openapi:export` escreve um arquivo que o `format:check` reprova

MEDIDO: regenerei o `openapi.json` → `pnpm exec prettier --check
apps/api/openapi.json` → `[warn]`; o arquivo **commitado** → passa. O gate
`check-openapi-contract` compara **semanticamente** (por isso o commitado
passa) e restaura o arquivo; e o `lint-staged` formata no commit — o que torna
a armadilha auto-curável.

### C14 — INFO — A rota do DONO devolve o port cru; a nova devolve o DTO mapeado

`users.controller.ts:553` declara `Promise<unknown>` e devolve o port; a rota
nova mapeia para `UserHistoryPageDto`. O wire coincide hoje, mas só a nova
passa pelo mapeamento — quando o mapeamento ganhar um campo, as duas surfaces
do mesmo dado divergem.

### C15 — INFO — Duas dívidas que a branch aceita

1. A tela pede o histórico de uma pessoa que **não existe** (404 da API)
   **antes** de saber que ela não existe — o `notFound()` vem depois das duas
   leituras paralelas. O desfecho está certo; o custo é uma requisição inútil
   por visita a um id inválido.
2. **Nenhum path param no contrato inteiro** — MEDIDO: 24 paths, **0**
   parâmetros `in: path`. A rota do DONO também não declara. É repo-wide e
   anterior à branch, mas a rota nova podia ter sido a que declara
   (`@ApiParam`).

### C16 — INFO — O ramo do id CRU é inalcançável hoje, e o spec que o cobre fabrica o estado

O `quemMudou` tem um ramo para o ator **fora do inventário** (a conta apagada),
e o spec unit de `page.spec.tsx` o exercita com um `changedBy` que não é o da
pessoa.

**MEDIDO no banco** (11 linhas de `users_history`):

```sql
select count(*) filter (where changed_by is not null and changed_by <> entity_id) from users_history;
→ 0
```

**Nenhuma mutação de `User` tem ator ≠ o dono**: `POST /users` (pública) grava
`changedBy` nulo; `PATCH`, `DELETE` e `POST /users/:id/restore` são
owner-only (`UserOwnershipGuard`); e `PUT /admin/users/:id/profile` mexe em
perfil, não em `users`. Logo, o ator de uma pessoa é **a própria pessoa** — e
ela está no inventário quando não está apagada; quando está, a página cai no
`notFound()`.

**Efeito:** o ramo do id cru é **defensivo e futuro** (uma rota de admin que
mexe na pessoa o tornaria alcançável), e o spec que o prova mede um estado que
o app **não produz** — a mesma classe do "spec que fabrica a entrada de um
sistema externo".

### C17 — ALTO — A coluna do nome e do e-mail não tem política de largura: a tabela fica com 2.097px

Com o nome de 100 caracteres e o e-mail de **249** (o VO permite 254), a coluna
"Nome e e-mail naquele registro" fica com **1.816px**, a tabela com **2.097px**
dentro de um wrapper de **288px**, e as duas últimas colunas ficam a **7 telas**
de rolagem:

```
MEDIDO a 320px (Chromium 1.65, viewport 320×640):
  tabela scroll/client: 2097 / 288
  th "Versão"     left =   16
  th "O que houve" left =  77
  th "Nome e e-mail" left = 140   (largura 1.816px)
  th "Quando"     left = 1956      ← 7 telas de rolagem
  th "Quem mudou" left = 2050
  página: scrollWidth 320 = innerWidth 320 (a PÁGINA não rola — o wrapper contém)
```

⚠️ **O `break-words` é INERTE aqui.** A classe é `overflow-wrap: break-word`, e
a especificação diz que `break-word` **não** reduz a contribuição min-content
(quem reduz é `anywhere`). MEDIDO — as duas medidas saem **idênticas**:

```
COM break-word  → tabela 2097, "Quando" em x=1956, td overflowWrap=break-word
COM normal      → tabela 2097, "Quando" em x=1956, td overflowWrap=normal
```

E o conserto **medido** (não chute):

```
A) como está (break-word)      → tabela 2097   "Quando" em x=1956
B) overflow-wrap:anywhere      → tabela 2066   "Quando" em x=1950   (não resolve)
C) anywhere + width: 24ch      → tabela  442   "Quando" em x= 326   (resolve)
```

**Efeito:** a 320px, o administrador precisa rolar ~7 telas para chegar em
"Quando" e "Quem mudou" — as duas colunas que dizem **quando** a pessoa mudou
e **por quem**. E o e-mail do VO tem 254 chars: o pior caso real é maior que o
que medi.

### C18 — INFO — "Quem mudou" mostra o NOME ATUAL, e o mesmo ator aparece com dois nomes na linha

MEDIDO: a versão 2 tem `nome = "Versao Dois Com Nome Um Pouco Menor"` (o nome
daquele registro) e `quem = "Versao Quatro"` (o nome **de hoje** da mesma
pessoa, tirado do inventário). A linha diz "Versao Dois" e "Versao Quatro" —
e o leitor não tem como saber que é a mesma pessoa.

**Efeito:** não é erro (o ator é o dono), mas o cabeçalho não diz que a coluna
traz o nome **atual** do ator.

### C19 — MÉDIO — O comentário do `break-words` em `tabela.tsx` atribui a um classe um transbordo que ela não evita

`apps/web/components/ui/tabela.tsx:73` diz:

> "⚠️ `break-words` (MEDIDO 2026-11-16): um e-mail tem 254 chars e não tem
> onde quebrar — sem isto, a tabela estourava a tela em 2421px a 320px."

**MEDIDO: a classe não evita nada** (C17) — `break-word` e `normal` dão a
mesma tabela de 2.097px. O que contém o transbordo é o `overflow-x-auto` do
wrapper, que impede a **página** de rolar; a **tabela** transborda do mesmo
jeito com ou sem a classe.

⚠️ É a mesma classe do C1: **doc que mente**. E é **pré-existente** (o
arquivo não é do diff desta branch) — mas a tabela nova é a que coloca o
e-mail de 254 chars dentro de uma célula, e o comentário é o que impede o
próximo de "conferir e mexer" nele.

### C20 — MÉDIO — A região rolável da tabela não é alcançável por teclado fora do Chromium

O wrapper `overflow-x-auto` de `tabela.tsx:41` não declara `tabindex`, `role`
nem nome acessível. MEDIDO no Chromium: `tabIndex = -1`, `role = null` — e o
Chromium torna região rolável focável por padrão (Tab #9). **Firefox e Safari
não têm essa feature**: as colunas fora da tela ficam inalcançáveis por
teclado a 320px — e é justamente a 320px que elas ficam fora da tela (C17).

### C21 — MÉDIO — Campo ausente no `snapshot` vira célula VAZIA

`entrada.snapshot.nome` ausente → o React não renderiza nada, e a linha fica
com um buraco — indistinguível de "a pessoa não tinha nome". O `snapshot` chega
do banco como JSONB fundido **sem validação** (`prisma-audit.service.ts:118`),
e o `quemMudou` **já** trata o dado ausente ("—") — a coluna do nome é que
não.

### C22 — BAIXO — `changedAt` inválida renderiza o literal "Invalid Date"

`new Date(entrada.changedAt).toLocaleString('pt-BR')` com data inválida →
`"Invalid Date"` na tela. A API entrega `DateTime` do Postgres (sempre
válido), então só uma escrita manual no banco chega aqui.

### C23 — BAIXO — `snapshot` nulo derruba a TELA INTEIRA, e não só a seção

`entrada.snapshot.nome` com `snapshot: null` → **TypeError** no render do RSC,
e a página vira a tela de erro do Next — **perdendo o nome e as empresas da
pessoa**, que é exatamente o que a seção existe para proteger. O `snapshot` é
gravado pelo `toUserOutput` (nunca nulo), e o `users_history.snapshot` é
`Json?` — o banco aceita `null`.

⚠️ O raio de explosão é a tela inteira, não a seção: um `UPDATE` malfeito
apaga a página.

### §2.1 A revisão de UI/a11y — a lacuna que o specialist de cota deixou

O `ux-design-specialist` **morreu por cota (429)** no meio da medição. A
revisão foi refeita pelo thread principal, com o browser, contra a tela **com o
histórico populado** (4 versões, nome de 99 chars, e-mail de 79).

| Caso | MEDIDO | Veredito |
|---|---|---|
| 320px de largura | `scrollWidth` 320 = `innerWidth` 320 → a **página não rola**; a tabela rola **dentro** do wrapper `overflow-x-auto` — **MAS** com e-mail de 249 chars a tabela mede **2.097px** e "Quando"/"Quem mudou" ficam a 7 telas (C17) | ⚠️ |
| 375px | idem (tabela 463 / wrapper 343) | ✅ |
| zoom 200% (viewport 640) | `scrollWidth` 640 = `innerWidth` 640; a tabela cabe (576/576) | ✅ |
| 768px | a página não rola; a tabela precisa de 15px de rolagem interna (463/448) | ✅ (mínimo) |
| 1280px | a tabela cabe (704/704) | ✅ |
| **dark mode** | `prefers-color-scheme: dark` = **true** no browser, e o app **ignora**: `body` continua `rgb(248,250,252)`; `globals.css` não tem `prefers-color-scheme`, nem `.dark`, nem `dark:` | **N/A** — o app **não tem** dark mode (já é assim em `origin/main`) |
| contraste | `pnpm estilo:contraste` → 17 pares; o menor de **texto** é 5,17 (`primary-foreground/primary`) e o do `Alerta` de erro é 5,37 | ✅ |
| 4 linhas com dado | `scope="col"` em **todos** os `<th>`; legenda "Histórico de Versao Quatro, da mais antiga para a mais recente" | ✅ |
| dado corrompido | `snapshot.nome` ausente → célula vazia (C21); `changedAt` inválida → "Invalid Date" (C22); `snapshot` nulo → **TypeError que derruba a página** (C23) | ⚠️ |
| **teclado** | o wrapper rolável não declara `tabindex`/`role`/nome; o Chromium o torna focável por padrão (Tab #9), **Firefox e Safari não** → as colunas fora da tela ficam inalcançáveis (C20) | ⚠️ |

⚠️ A caixa vazia no rodapé das capturas é o **portal do Next.js dev**
(`nextjs-portal: true` no DOM) — artefato do `pnpm dev`, não da tela.

### §2.2 O que NÃO é defeito (medido, e por que não entra)

- **`escopo.ts` com 41,66% de cobertura** — o comportamento está medido em
  `prisma-audit.service.integration.spec.ts` (o runtime não atravessa empresa;
  a sessão de sistema enxerga as duas) e agora também no Postgres local.
  Cobertura baixa ≠ lacuna.
- **A coluna "Motivo" não existir** — a decisão está certa (§1.2). O defeito é
  o **doc** que promete a coluna (C1), não a coluna que falta.
- **A tela ser RSC e ficar fora do denominador de cobertura** — decisão
  declarada e antiga; o spec unit da página cobre a ESCOLHA do guard.
- **O `Alerta` do 403 ser inalcançável no caminho comum** — é verdade, e é
  por isso que C10 é BAIXO e não MÉDIO.

---

## §3. As melhorias

### M1 — MÉDIO — A tela mostra as mil versões mais ANTIGAS e esconde as mais RECENTES

A API ordena `version` ASC (`prisma-audit.service.ts:106`) e o cursor anda
para frente; o teto da tela é 10 páginas de 100. Numa pessoa com mais de mil
versões, **o que fica na tela são as mais antigas** — e o que o administrador
mais precisa (a última alteração, o estado atual da conta) é exatamente o que
some. Não há caminho para chegar lá.

A tela é **honesta** ("Mostrando as N versões mais antigas — há mais histórico
do que esta tela mostra"), o que evita o pior (histórico parcial parecendo
completo), mas não resolve: ela avisa e não entrega.

⚠️ **A decisão foi tomada na revisão do plano** (§4): **(a) — a API ganha ordem
descendente**, porque (b) e (c) **não compõem** (o erro que a primeira versão
do plano tinha).

### M2 — MÉDIO — A tela carrega o histórico inteiro a cada render

Até 10 requisições sequenciais por visita (`force-dynamic`, sem cache), e a
leitura do inventário inteiro junto.

**MEDIDO** (10 linhas): **5.087 bytes/linha** (raw) e 254 bytes/linha (gzip);
10 linhas = 126.762 bytes. **Extrapolado para o teto de 1.000 linhas:** ≈ 5 MB
de HTML, ≈ 263 KB gzip, ~7.000 nós de DOM, 5.000 células para o leitor de tela
percorrer e ~65.000px de rolagem vertical.

**A entrada é a mesma de M1**: com a ordem descendente e **uma página por
visita** (o cursor na URL), o teto de 10 páginas e a leitura de 5 MB saem
juntos.

### M3 — BAIXO — O `Logger` da leitura não carrega o `traceId`

`loggerHistorico.log(...)` registra a pessoa, o ator e o número de entradas —
mas não o `traceId`, que a camada HTTP já tem (`traceIdDe(request)`). O
precedente (`AdminTenancyInventory`) é igual, então **não é inconsistência** —
é uma melhoria opcional, e ela vale para os dois loggers.

---

## §4. A decisão — **(a): a API ganha ordem descendente**

> ⚠️ **Correção da revisão de 2026-11-17.** A primeira versão deste plano
> recomendava **(b) + (c)**. Isso **não compõe**, e a razão é a direção do
> cursor: a API pagina do **mais antigo para o mais novo**, e o `nextCursor`
> aponta para a página seguinte nessa direção.

| Opção | O que muda | Custo | Efeito na tela |
|---|---|---|---|
| **(a) A API ganha ordem descendente** | `AuditServicePort.listHistory` ganha uma direção; o cursor continua sendo o `users_history.id`, mas a comparação com ele inverte | **médio** — toca o port, o repositório Prisma, o in-memory, a rota nova e o web | O admin vê as **mais recentes** primeiro, e "carregar mais" traz as **mais antigas** — a ordem que uma trilha de auditoria pede |
| **(b) A tela inverte a exibição** | Só o web | quase zero | ⚠️ **Só funciona abaixo de 100 versões.** A API devolve as 100 **mais antigas**; com 500 versões, a primeira página **não contém** a mais recente — ela não foi buscada |
| **(c) A tela pagina** | Só o web | baixo | ⚠️ **Sozinha, (c) não alcança o fim:** o cursor anda para o mais antigo, e a última página (as mais recentes) só chega depois de percorrer todas |

⚠️ **(b) + (c) juntos também não resolvem**: a tela mostraria a página mais
antiga **invertida**, e o "carregar mais" buscaria páginas **ainda mais
antigas** — o administrador continuaria longe da última alteração. **Só (a)
coloca a versão mais recente na primeira tela.**

**Decisão: (a).** E ela **funde com o C9** (a falta de `LIMIT` e o cursor fora
da entidade): a query que serve a ordem descendente é a mesma que serve o
range de `version` — uma query só, com `LIMIT`, com o cursor resolvido dentro
da entidade.

---

## §5. O plano (TO-BE)

> Cada task é TDD onde há lógica (§ `tdd.md`): **RED → GREEN → Refactor**, e a
> revisão do diff acontece **no mesmo PR** (§1.2 da `documentacao.md`).

### T1 — C1: os três textos do motivo (P0)

- Reescrever `.agents/specs/conventions/e2e-playwright.md:102` e `:290`, e o
  cabeçalho de `apps/web/e2e/f21-historico-usuario.spec.ts:6`.
- O texto novo diz: o motivo **não** aparece, porque `users_history.reason` é
  sempre `null` (o `DELETE` manda `reason: null`; o `restore` não manda reason;
  o `extractReason` só devolve reason no evento `.deleted.v1`).
- **Por que o texto é a correção**: o código está certo; quem mente é o doc.
- Efeito colateral a checar: `check-e2e-flow-coverage` reconcilia o inventário
  com os cabeçalhos `// FLUXO:` — os dois lados mudam juntos, e o gate passa.

### T2 — C2: a recusa do D2 deixa rastro

- **RED** — spec da use case: um ator recusado pelo D2 produz **um** registro
  com o ator, o id alvo e a rota (o formato que o repo já usa em
  `registrarBloqueio` e `recusaEscalada`).
- **GREEN** — `user-use-cases.ts` registra a recusa **no ponto do portão**,
  antes de lançar.
- **Refactor** — o registro é o MESMO `Logger('AdminUserHistory')` que já
  existe, com um verbo distinto do sucesso ("leitura recusada"). Sem PII: só o
  id da pessoa, o id do ator e a rota.

### T3 — C3: a trilha de quem foi apagado (API + web, juntos)

⚠️ Esta é a task que **não cabe numa rota só**.

- **API** — a conferência de existência da rota de admin passa a incluir
  soft-deleted (`findById(id, null, { includeDeleted: true })`), **sem** mexer
  em `obterPorId` (que é usada por outras rotas).
- **WEB** — a pessoa apagada não está no inventário (`deletedAt: null`), então a
  página cai no `notFound()` antes de desenhar a seção. A página precisa do
  nome/e-mail da pessoa **apagada** — e a fonte natural é o `snapshot` da
  **primeira** versão do histórico (que é a pessoa como ela nasceu).
- **Alternativa mais simples** — a rota devolve também o `perfil` da pessoa
  lida, e a página usa esse dado quando o inventário não a trouxer.
- **Spec** — e2e: pessoa apagada → a rota responde **200** com a entrada
  `DELETE`, e a tela mostra a trilha dela.
- ⚠️ **Esta task precisa de uma escolha**: (i) a tela passa a mostrar pessoas
  apagadas em `/users/[id]`, ou (ii) a rota ganha um parâmetro
  (`?includeDeleted=1`) e a tela só mostra quando pedido.

### T4 — C4: o `LIMITE_MAXIMO` tem um dono

- O número sai do web: `TAMANHO_DA_PAGINA_HISTORICO` passa a vir de
  `packages/shared-types` (que os dois lados já importam), **ou** — mais no
  espírito do repo — um `parity.spec.ts` novo, no molde do
  `cadastro-usuario-schema.parity.spec.ts`, que compara o número do web com o
  da API e falha alto se o VO/API mudar de forma.
- **Spec** — o de paridade: o número do web e o da API são o mesmo número.

### T5 — C5: o port expõe o cursor, e o duplo pagina com ele

⚠️ **O port não expõe o cursor hoje** — MEDIDO: `HistoryEntry`
(`audit-service.port.ts:25`) tem 8 campos e **nenhum deles é o `id`** da linha,
que é o que a produção devolve como `nextCursor` (`prisma-audit.service.ts:123`
→ `last.id`). O duplo não tem, portanto, **de onde tirar** um cursor fiel: ele
inventa um offset numérico (`String(nextOffset)`), que a API recusa com 400.

- **RED** — o spec do duplo passa a exigir que o `nextCursor` seja o **id** da
  última entrada (o contrato de produção) e que a página seguinte consuma esse
  cursor.
- **GREEN** — `HistoryEntry` ganha `id: string` (o cursor opaco);
  `InMemoryAuditService.listHistory` devolve o `id` da última entrada e
  consome o cursor procurando a entrada por `id`.
- ⚠️ **O `PrismaAuditService` passa a preencher o `id`** — e o `snapshot`
  gravado não muda.
- **Spec** — `user-use-cases.spec.ts` exercita **a segunda página** (hoje só
  passa `cursor: null`), e o e2e da API: pessoa com **3+** versões,
  `limit=2` → a página 1 traz `[1,2]` com cursor e a página 2 (com o cursor
  **real**) traz `[3]` e `nextCursor: null`. Hoje **nenhum** teste do repo
  exercita o round-trip cursor→HTTP→cursor.

### T6 — C6: a tag do contrato

- `admin-user-history.controller.ts:51` → `@ApiTags('admin-users')`.
- Regerar o contrato: `pnpm --filter @projeto/api openapi:export` (o
  `lint-staged` formata; o gate `check-openapi-contract` compara
  semanticamente).
- Conferir que as DUAS rotas de `/admin/users` caem na mesma tag — com o
  comando do §8, não a olho.

### T7 — C7: a data com fuso

- `page.tsx` formata com `timeZone` explícito (`America/Sao_Paulo`) **ou** o
  rótulo da coluna declara o fuso ("Quando (horário de Brasília)").
- **Spec** — a expectativa é uma **literal** (`"02/11/2026, 09:30:00"`), não
  `toLocaleString()` do próprio runtime: o spec atual calcula com o mesmo
  formatador que o código, e por isso não pode acusar (a mesma armadilha do
  `Duração` do e2e).

### T8 — C8: o `db:generate` também cobre o e2e do web

- `@projeto/web` ganha o script `db:generate`, que delega ao do `@projeto/api`
  (o web não tem Prisma; o e2e do web sobe a API, que importa `@prisma/client`).
- Verificar com `pnpm turbo run test:e2e --dry=json --filter=@projeto/web` que a
  task deixou de ser `<NONEXISTENT>`.
- ⚠️ Se o `db:generate` do web **não** puder existir (o pacote não tem Prisma),
  a alternativa é declarar a dependência no `turbo.json` com o filtro do
  pacote: `dependsOn: ["@projeto/api#db:generate"]`.

### T9 — C9 + M1: o cursor vira um range dentro da entidade, e a ordem pode ser descendente

⚠️ **Esta task executa a decisão da §4** — e ela **funde** o conserto do C9 com
a melhoria do M1, porque a query é a mesma.

- **O cursor continua sendo o `users_history.id`** (uuid) — o
  `PaginacaoQuerySchema` (que exige uuid) não muda, e o contrato das DUAS rotas
  não muda de formato.
- **O repositório resolve o cursor DENTRO da entidade** e usa um **range de
  `version`**:

  ```sql
  -- antes (o que o Prisma emite hoje, com o cursor como subselect)
  WHERE entity_id=$1 AND version >= (SELECT version FROM users_history WHERE id=$2)
  ORDER BY version ASC OFFSET 0        -- ← sem LIMIT, e o subselect NÃO é da entidade
  -- depois
  WHERE entity_id=$1 AND version < $2   -- ← $2 = a versão do cursor, resolvida com entity_id
  ORDER BY version DESC
  LIMIT $3
  ```

  Isso resolve os TRÊS problemas de uma vez: o `LIMIT` volta, o cursor de
  **outra** entidade deixa de devolver uma página errada (o subselect passa a
  filtrar por `entity_id` — e um cursor que não é desta entidade é
  **inválido**, não "página vazia"), e a ordem pode ser descendente.
- **A ordem entra no port** (`ListHistoryInput.ordem?: 'asc' | 'desc'`, padrão
  `'asc'`): a rota do DONO **não muda** (asc, como hoje), e a rota do ADMIN
  pede `'desc'`.
- ⚠️ **O `orderBy` continua sendo `version`** — nunca `id`: os ids são
  `gen_random_uuid()` (aleatórios), e ordenar por eles embaralharia as
  versões.
- **Spec** — o duplo (T5) segue as duas ordens; o repositório ganha spec de
  integração para o `LIMIT`, para o cursor de outra entidade e para a ordem
  descendente; e a rota do DONO continua asc (spec que trava o que **não**
  muda).

### T10 — C10: recusa e 404 não são "tente de novo"

- **RED** — `page.spec.tsx`: um 403 (ou 404) do histórico → o `Alerta` **não**
  contém "Tente de novo". O caso 500 que já existe é o **CONTROLE**: ele
  **tem** "Tente de novo".
- **GREEN** — `page.tsx` separa: 403 → "acesso restrito a este histórico";
  404 → "esta pessoa não tem histórico disponível"; 5xx/rede → a mensagem de
  hoje.

### T11 — C11 e C12: a descrição do 400 e o rótulo tipado

- `@ApiResponse({ status: 400, … })` do controller passa a citar o `:id`
  inválido, para casar com `docs/api/users.md` §3.8 e com o que a API devolve
  ao vivo. Regerar o contrato (T6).
- `OPERACAO` tipada por `AuditOperationType` (de `@projeto/shared-types`), com o
  valor desconhecido num branch explícito — preservando o fallback que o spec
  mede (`TRUNCATE` passa como veio). O spec de `lib/tenancy.spec.ts` ganha o
  caso "um valor novo do enum sai traduzido".

### T12 — C13: o export do OpenAPI formata a própria saída

- `apps/api/scripts/export-openapi.ts` formata o arquivo antes de gravar, e o
  motivo fica escrito no script (uma linha).

### T13 — C14 e C15: as três dívidas ficam registradas

- A rota do DONO passa a declarar `Promise<UserHistoryPageDto>` (o DTO já
  existe em `packages/shared-types` e **se documenta** como a resposta dela) —
  e passa pelo mesmo mapeamento da rota nova, para as duas surfaces não
  divergirem.
- A requisição inútil para id inexistente e o path param ausente entram na
  lista de pendências **com dono**, e não como dívida silenciosa.

### T14 — C16: o spec do id cru diz que o estado não é produzível

- O ramo do id cru **fica** (é defensivo, e uma rota de admin que mexa na
  pessoa o torna alcançável) — mas o spec que o exercita passa a **dizer**
  que o estado é construído à mão porque o app ainda não o produz, com o
  motivo (MEDIDO: `changed_by <> entity_id` → 0 linhas; toda mutação de
  `User` é owner-only).
- O comentário do `quemMudou` na tela ganha a mesma frase — para o próximo
  não "corrigir" o ramo como código morto.

### T15 — C17: a coluna do nome e do e-mail ganha largura (o conserto MEDIDO)

- A célula "Nome e e-mail naquele registro" ganha **largura fixa + `overflow-wrap: anywhere`** — é o que a MEDIÇÃO mostrou resolver (C17): a tabela cai de **2.097px** para **442px**, e "Quando"/"Quem mudou" passam de x=1956 para x=326.
- ⚠️ **`anywhere`, e não `break-word`**: `break-word` **não** reduz a contribuição min-content (é o que a spec do CSS diz, e o que a medição confirma — as duas dão 2.097px). E `anywhere` **sozinho** não resolve (2.066px) — precisa da largura.
- O e-mail ganha truncamento com o valor completo no `title` — o e-mail do VO tem 254 chars.
- **Spec** — `page.spec.tsx`: com nome de 100 chars e e-mail de 254, a largura da tabela fica **limitada** (a spec mede a largura, não a stringify).
- ⚠️ **A largura vai na CÉLULA que guarda o dado longo, e não no `CelulaTabela`**: um `width` fixo em todas as células quebraria as outras 4 tabelas do app (a de membros tem uma coluna "Nome" que precisa de espaço). A primitiva ganha o **apoio** (`wrap-anywhere` como default, que é o que reduz a contribuição min-content) e a **largura** é passada pelo caller — no histórico, a célula do nome/e-mail.
- ⚠️ A tabela de membros (`/empresa/[id]`) **já** sofre do mesmo transbordo (ela mostra e-mail de 254 chars) — e ela **não** é desta branch. A primitiva (`wrap-anywhere` como default) conserta as duas; a largura fixa é da tela do histórico.

### T16 — C18: o cabeçalho diz que o nome do ator é o ATUAL

- O cabeçalho "Quem mudou" vira "Quem mudou (nome atual)" — ou a coluna
  ganha uma nota. O dado já está certo; é o rótulo que não diz.
- ⚠️ A legenda e o texto da seção que citam a ordem continuam valendo — a
  inversão de M1 (se for escolhida) muda **esses** textos, e não este.

### T17 — C19: o comentário do `break-words` para de mentir

- `tabela.tsx:73` passa a dizer o que a medição mostra: o `break-words` (=
  `overflow-wrap: break-word`) **não** reduz a contribuição min-content da
  célula; o que impede a **página** de rolar é o `overflow-x-auto` do wrapper;
  e o que reduz a largura da **tabela** é `anywhere` + largura fixa (T15).
- O "MEDIDO 2026-11-16" vira "MEDIDO 2026-11-17", com o número do antes e o
  de agora — para o próximo ver que a medição existe e como refazê-la.

### T18 — C20: a região rolável é alcançável por teclado

- O wrapper de `Tabela` ganha `tabindex={0}` + `role="region"` + `aria-label`
  (o texto da legenda), para que as colunas fora da tela sejam alcançáveis por
  teclado no Firefox e no Safari.
- **Spec** — `primitivas.spec.tsx` (o spec do design system): o wrapper
  declara `role="region"` e um nome acessível.

### T19 — C21 e C22: dado ausente vira "—", e data inválida vira "—"

- A célula do nome e a do e-mail caem em "—" quando o campo não existir (o
  `quemMudou` **já** faz isso — a regra é a mesma, e a tela ganha um dono
  único).
- A célula "Quando" cai em "—" quando a data for inválida, em vez de renderizar
  "Invalid Date".
- **Spec** — `page.spec.tsx`: `snapshot` sem `nome`, e `changedAt` inválida.

### T20 — C23: `snapshot` nulo não derruba a tela

- A página trata `snapshot` ausente como "—" **antes** de dereferenciar, para
  que o raio do erro seja a seção — e não a tela inteira, que é o que a seção
  existe para proteger.
- **Spec** — `page.spec.tsx`: `snapshot: null` → a página **renderiza** (a
  pessoa e as empresas continuam na tela) e a seção mostra "—".

### T21 — M1 + M2 (web): uma página por visita, da mais RECENTE para a mais antiga

⚠️ Esta é a metade web da decisão da §4 — e ela **depende do T9** (a ordem
descendente vem da API).

- A tela pede **UMA página** por visita, com o cursor na URL (`?cursor=`), e
  mostra **da mais recente para a mais antiga**.
- O "carregar mais" é um **link** (`?cursor=<nextCursor>`) — sem client
  component: a página é RSC e o cursor viaja na query.
- O **teto de 10 páginas e a leitura de 5 MB saem juntos** (M2): uma página por
  visita, uma requisição.
- A legenda, o texto "da mais antiga para a mais recente" e as asserções dos
  specs (unit e e2e) mudam **junto** — e o e2e passa a afirmar que a **primeira
  linha é a mais recente**.
- **Spec** — `page.spec.tsx`: com o cursor na URL, a tela pede a página pedida;
  o "carregar mais" aponta para o `nextCursor`; e a ordem das linhas é
  decrescente por `version`.
- ⚠️ **A pessoa apagada** (C3) é resolvida no mesmo lugar: quando o inventário
  não traz a pessoa, a tela a tira do **último** `snapshot` do histórico (o
  nome com que ela foi apagada) e mostra que ela está apagada.

---

## §6. O que NÃO entra (e por quê)

| Não entra | Por quê |
|---|---|
| Mudar a ordem do histórico na **API** | §4 — depende de uma decisão que é do usuário; e (b)+(c) resolvem sem tocar num port de DUAS rotas |
| **Recolocar** a coluna "Motivo" | O `reason` é sempre `null` — a coluna renderizaria "—" em toda linha. A coluna volta quando a API gravar o motivo, e não antes |
| Paginação do **inventário** | A tela já baixa o inventário inteiro (shortcut declarado no arquivo). Corrigir isso é um endpoint novo (`GET /admin/tenancy/usuarios/:id`), e é escopo próprio |
| **Rewordar** o `Logger` para incluir `traceId` | M3 é opcional e o precedente é consistente; se entrar, entra para os DOIS loggers (`AdminUserHistory` e `AdminTenancyInventory`) |
| Um **gate** novo para a tag do OpenAPI | O gate `check-openapi-contract` já impede o drift entre código e contrato; a inconsistência de tag entre DOIS controllers é da LENDA do contrato, e um gate novo para isso é um gate que ninguém pediu |
| `escopo.ts` em 100% de cobertura | O comportamento já é medido no nível do banco; a cobertura baixa é de **linhas de plumbing** |
| Redesign da seção de UI/a11y | A tabela já tem legenda, `scope="col"`, `overflow-x-auto` e `break-words`; o `h2` existe; o `role="alert"` vem da variante. Não há redesign a fazer |

---

## §7. Riscos

| Risco | Como o plano lida |
|---|---|
| **T3 muda a API e a tela** e é a task com mais superfície | O §5 de T3 traz as **duas** alternativas (tela mostra apagada × parâmetro `includeDeleted`), e a escolha é explícita antes de codar |
| **T3 colide com o `notFound()`** da página (o inventário filtra apagadas) | É o ponto da task: os dois lados mudam **juntos**, e o spec e2e mede a pessoa apagada |
| **T5 muda o duplo** e os specs que dependem dele podem cair | O duplo passa a ser **mais fiel** ao port; os specs que usam cursor nele (`in-memory-audit-service.spec.ts`) continuam verdes porque o round-trip dentro do duplo não muda de resultado |
| **T9 muda o formato do cursor** e afeta a rota do DONO | A task avisa: o `PaginacaoQuerySchema` e as DUAS surfaces entram juntas, e ambas precisam de spec. E a preservação da ordem (`version ASC`) é exigida na task |
| **T7 muda a expectations** do spec do web e do e2e | A expectativa passa a ser uma **literal** — o spec para de derivar do mesmo código que ele mede |
| **T10 muda a tela** e um spec/e2e dependia do texto do `Alerta` | O caso 500 existente é o CONTROLE — ele continua com "Tente de novo". O que muda é só o ramo do 403/404 |
| **T2 e T4 tocam arquivos de uso amplo** | T2 toca a use case (um método); T4 toca um número e um spec novo |
| **T6 muda o contrato** e o `check-doc-claims` compara contagens | A claim de `docs/api/users.md` conta **decorators** (8), não tags — a tag não a move. Conferir na rodada de CI |
| A revisão de **UI/a11y** não foi completa | **Fechada**: o `ux-design-specialist` morreu por cota (429), e a revisão foi refeita pelo thread principal, com o browser, contra a tela **com o histórico populado** — 320px, 375px, zoom 200%, 768px, 1280px, contraste medido pelo `pnpm estilo:contraste`, e o caso de dark mode (que **não existe** no app). As três lacunas que o plano declarava estão medidas em §2.2 |

---

## §8. Como o plano é verificado

```bash
# 1. o snapshot: o estado não mudou desde a análise
pnpm ci:preflight          # exit 0, 0 erro

# 2. a suíte inteira, na ordem do repo
pnpm -r typecheck && pnpm lint
pnpm -r test               # unit
pnpm --filter @projeto/api test:e2e
pnpm --filter @projeto/web test:e2e

# 3. o contrato: o drift é zero e as DUAS rotas de admin/users caem na mesma tag
pnpm --filter @projeto/api openapi:export
git diff --stat apps/api/openapi.json
node -e "const d=require('./apps/api/openapi.json');console.log(Object.entries(d.paths).filter(([p])=>p.includes('/admin/users')).map(([p,i])=>p+' → '+Object.values(i)[0].tags))"

# 4. a cobertura não cai abaixo do piso
pnpm test:coverage

# 5. o cursor: a segunda página, com o cursor REAL
curl -s "http://localhost:3000/api/v1/admin/users/$ID/history?limit=2" -H "authorization: Bearer $TOKEN"
```

⚠️ O passo 3 regenera o `openapi.json` **fora** do Prettier — é o que a T12
corrige. O `git diff` acima precisa sair vazio **após** o `lint-staged`
formatar, ou a T12 ainda não foi feita.

---

## §9. O que a execução mudou

> A execução do plano (2026-11-17) rodou em **quatro ondas**, e a revisão
> (em paralelo, com revisor ≠ implementador) mudou o plano **antes** de ele
> ser executado.

### §9.1 Um ERRO do próprio plano, corrigido antes de executar

⚠️ **A §4 recomendava (b) + (c), e as duas NÃO COMPÕEM.** O cursor da API
anda com a ordem da leitura, e o cursor andava para o mais ANTIGO: a página
que a tela recebia era a das 100 versões mais antigas — que, com 500 versões,
**não contém** a mais recente. E o "carregar mais" de (c) buscaria páginas
**ainda mais antigas**.

A decisão correta é **(a)**: a ordem entra no **port** (`ListHistoryInput.ordem`),
e o cursor resolve dentro da entidade. Isso **fundiu** o C9 (o `LIMIT` e o
cursor de outra entidade) com o M1 (a ordem) numa query só — e a tarefa T5 (o
port expor o `id` da linha, sem o qual o duplo em memória não tinha de onde
tirar um cursor que a API aceite) virou a **premissa** do T9.

### §9.2 O que a revisão do diff achou depois de executado

| Achado | Onde | O que era |
|---|---|---|
| MÉDIO | `page.tsx` | a tela declarava a ordem **antiga** em 4 pontos (inclusive a legenda acessível) — e a API já devolvia descendente: a tabela dizia uma coisa e mostrava outra |
| BAIXO | `export-openapi.ts` | o `format` do Prettier rodava sem `filepath` → a config **default** (`printWidth: 80`), e não a do repo (100) |
| BAIXO | `user-use-cases.ts` | o registro da recusa interpolava o `:id` **cru** da URL — e um `\n` nele gravava uma linha de log em branco |

Os três foram corrigidos. O segundo e o terceiro ganharam spec.

### §9.3 O que a revisão MEDIU (e confirmou)

- **A paginação não tem off-by-one**: MEDIDO no Postgres local com o serviço
  real — `desc` limit=3 → `[7,6,5,4,3,2,1]`, `asc` limit=1 → 7 páginas, e
  nenhuma versão repetida nem perdida.
- **O `LIMIT` voltou**: o SQL emitido é
  `WHERE (entity_id = $1 AND version < $2) ORDER BY version DESC LIMIT $3`.
- **A RLS cobre a resolução do cursor**: com escopo de empresa, o cursor de
  outra empresa **some** para a sessão → 400 (fail-closed), e não página errada.
- **O wire da rota do DONO não mudou**: o `id` novo do port é descartado pelo
  mapeamento, e a data (que era `Date` no port) vira a mesma string ISO.

### §9.4 O que ficou por fazer

| Item | Por quê |
|---|---|
| `listArchive` mantém o cursor antigo do Prisma (o subselect sem `entity_id`) | É código **morto** hoje (nenhum caller) e é anterior à branch; e a ordem dele é `deletedAt desc`, que **não** é único — mas corrigi-lo é uma tarefa própria |
| O cursor não carrega a ordem | Um cliente que trocasse a ordem entre as páginas repetiria versões — **não é alcançável** pela API (cada rota tem uma ordem fixa) |
| A revisão de UI/a11y completa (dark mode, 320px com o histórico populado) | O `ux-design-specialist` morreu por cota (429); a revisão foi refeita pelo thread principal, e o caso de dark mode é **N/A** (o app não tem dark mode) |
