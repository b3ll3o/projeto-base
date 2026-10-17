---
name: plano-multi-tenant
description: Plano da demand multi-tenant — a aplicacao passa a ter Tenant, e o usuario pode ter um perfil diferente em cada empresa. Inclui a decisao de entrada (empresa propria ou convite) e a ordem de execucao sob o fluxo de desenvolvimento.
version: 1.2.0
updated: 2026-10-16
status: revisto
state_snapshot: .agents/runs/state-snapshot-20261017T000011Z.md
---

# Plano — multi-tenant com perfil por empresa

> Demand: *"a aplicacao deve ser multi tenent e o usuario pode ter um perfil
> diferente em cada empresa"*.
> Snapshot de estado: [`.agents/runs/state-snapshot-20261017T000011Z.md`](../../../.agents/runs/state-snapshot-20261017T000011Z.md)
> (`proceed: true`, `gaps_detectados: 6`).
> **v1.2.0** — o backfill da Fase 2 foi removido por medicao (ver
> [§Revisao](#revisao-v120)): nao existe banco de producao, e a exigencia de
> uma "fixture pre-tenancy" resolvia um problema inexistente.

---

## 1. Decisoes fechadas

| # | Decisao | Escolha | Por que |
|---|---------|---------|---------|
| D1 | Isolamento | **schema unico + `tenant_id`**, RLS Postgres como 2a camada | ops unico, uma migracao, aguenta N empresas |
| D2 | Contexto | **header `X-Tenant-Id`** por requisicao | trocar de empresa = trocar header, sem novo token |
| D3 | Perfis | **globais (`tenant_id IS NULL`) + customizados por tenant** | preserva o seed/`isSystem`/`isAdmin` do PR #97 |
| D4 | Identidade | **1 conta, N memberships**; `email` segue UNIQUE global | e a leitura literal da demand; resolve a ambiguidade do login |
| D5 | Entrada | **empresa propria OU convite** | escolhido pelo user; resolvido por 1 branch, nao 2 fluxos |

**D4 destrava o login.** `findByEmail(email: Email)`
(`users/domain/ports/user-repository.port.ts:61`) e global e e a porta de
login, e `users_email_key` e UNIQUE
(`migrations/20260922003354_init_audit_user/migration.sql:49`). Com 1 conta,
o login **nunca precisa saber o tenant** — ele emite token de identidade, e
o tenant entra depois, por header.

### D3 exige derrubar o UNIQUE global antes de criar os indices parciais

`profiles.slug` e hoje **UNIQUE global**
(`20261016000000_rbac_profile_authorization/migration.sql:15`). Dois indices
parciais **somados** a ele nao produzem o que a D3 promete: enquanto
`profiles_slug_key` estiver de pe, duas empresas **nao podem** ter ambas um
perfil com slug `"manager"`. A ordem importa — derrubar primeiro:

```sql
ALTER TABLE profiles DROP CONSTRAINT profiles_slug_key;

CREATE UNIQUE INDEX profiles_slug_global_uniq
  ON profiles (slug) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX profiles_tenant_slug_uniq
  ON profiles (tenant_id, slug) WHERE tenant_id IS NOT NULL;
```

No `schema.prisma`: `slug` perde o `@unique` (mantem `@@index([slug])`), ganha
`tenantId String?`.

`@@unique([tenantId, slug])` do Prisma **nao serve**: no Postgres
`NULL != NULL`, entao dois perfis de sistema com `tenant_id = NULL` e o mesmo
`slug` seriam aceitos e o seed duplicaria `admin` em silencio. Indices
parciais sao SQL puro — vao fora do Prisma, dentro da migration. (Alternativa
nativa do PG 15+, `UNIQUE NULLS NOT DISTINCT`, nao adotada: os indices
parciais ja expressam as duas regras e nao mudam o schema de `slug`.)

---

## 2. Ordem de execucao

Sequencial: cada fase escreve o mesmo codebase. O paralelismo permitido e de
**leitura** — ver [fluxo §3.4](../../fluxo-desenvolvimento.md).

### Fase 0 — Snapshot de estado (OBRIGATORIA) — **feita**

[`.agents/runs/state-snapshot-20261017T000011Z.md`](../../../.agents/runs/state-snapshot-20261017T000011Z.md).
6 gaps registrados, `proceed: true`.

### Fase 1 — `multi-tenant-specialist` (BLOQUEANTE)

Nenhum specialist do catalogo possui o dominio (medido **antes** desta fase; o
proprio agent que ela cria faz o grep voltar a 2):
`grep -rliE 'multi.?tenant|tenantId' .agents/agents/ .agents/memory/` = **0 arquivos**. `agent-architect` cria: agent + memory + `multi-tenant-audit`
(1:1, espelhando `prisma-audit`) + entradas de matriz (`path_glob` +
`demand_keyword`) + bump minor da convencao.

> **A premissa nao e o bloqueio automatico.** O `specialist-router` **nao**
> detectaria este gap: `always_on: [monorepo-specialist]`
> (`specialist-routing.md:264`) e incondicional, logo `specialists.size === 0`
> e inalcancavel e `gap_detected` sai sempre `false` (gap G-002 do snapshot).
> A Fase 1 se justifica pelo **grep**, nao pelo gate. Consertar o gate e
> trabalho proprio — nao entra nesta branch.

> **Segunda lacuna, com correcao:** nao existe convencao de migracao de dados
> em `conventions/`, **mas a regra ja existe em agent** —
> `prisma-db-specialist.md:160` proibe `DROP COLUMN` direto e prescreve os 3
> passos (add nullable, backfill, drop). Nao e "sem dono nem regra": e regra
> de agent que nunca foi promovida a convencao. O trabalho da Fase 1 e a
> promocao, nao a autoria.

### Fase 2 — Modelo de dados
`Tenant`, `TenantMembership` (`@@unique([userId, tenantId])`), `Profile.tenantId`,
`Invitation` (D5), os indices da secao D3 (na ordem: `DROP CONSTRAINT` antes
dos `CREATE INDEX`).

**Nao ha backfill, e `users.profile_id` nao e tocado.** Ver G-004 no snapshot:
nao existe banco de producao (nenhuma infra de deploy; o compose e template
local). Um backfill precisaria de um tenant padrao para onde apontar, e "criar
uma empresa padrao" e decisao de produto que ninguem pediu. O `profile_id`
pre-existente continua onde esta; a Fase 4 troca so o **caminho de leitura**.
Usuario sem membership nao e estado quebrado — e o estado de quem ainda nao
escolheu empresa, que e exatamente a entrada da D5. Precedente no proprio repo:
`20261009000000_user_password_hash:36` roda `UPDATE ... WHERE ... IS NULL`,
backfill defensivo num repo que tambem nunca teve producao.

**RLS nao entra nesta fase.** Ver Fase 3.

### Fase 3 — Contexto de tenant na fronteira
E o gargalo. Sem isto, tenant e so um campo.

| # | Ponto | Mudanca |
|---|-------|---------|
| 3.1 | `jwt-token.service.ts:185` reconstroi `TokenSubject` de 3 campos | **claim novo e descartado em silencio** — token assinado, valido, sem o claim. Nenhum erro, nenhum teste vermelho |
| 3.2 | `jwt-auth.guard.ts:117` le o header via `extractBearerToken` (def. em `:65-71`) | ponto de insercao de `X-Tenant-Id` (unico no backend) |
| 3.3 | `user-profile-cache.service.ts:29,41` chave = `userId` cru | 2 tenants do mesmo user colidem; `invalidateAll()` (`:51-53`) e global |
| 3.4 | `permissions.guard.ts:86` chama `obterMeuPerfil(user.sub)` — sem tenant | passa a chamar `obterMeuPerfil(user.sub, tenantId)` |
| 3.5 | `profiles.use-cases.ts:62-65` `AtorAutenticado { userId, isAdmin }` | vira `{ userId, tenantId, isAdmin }`. Atravessa **3** controllers (`admin-profiles`, `admin-users`, `admin-authorizations`) e alimenta as travas anti-escalada. Sem `tenantId` a checagem e **estruturalmente incapaz** de detectar cross-tenant |
| 3.6 | `api-client.ts:53-54` monta so 2 headers | ponto de insercao no front (unico) |

**3.1, 3.4, 3.5 e a assinatura de `obterMeuPerfil` (`:536`) sao o MESMO
change-set.** Separados, 3.3/3.4 nao tem o que passar para o cache e para o
guard: a assinatura so aceita tenant depois desta fase. E o inverso tambem
segura — esta fase precisa do dado que a Fase 2 cria.

**Rotas `@Public()` sao isentas de `X-Tenant-Id`.** `POST /users` e `@Public()`
(`users.controller.ts:106-107`) dentro de uma classe com
`@UseGuards(JwtAuthGuard)`: nao ha bearer, logo nao ha tenant hidratado.
`auth/login` e `auth/refresh` idem. A fronteira vale so para rotas
autenticadas e tenant-scoped — e o signup grava a Tenant nova / a Membership
do convite sem header de entrada.

**RLS entra aqui, com produtor explicito.** Nao na Fase 2: RLS no Postgres e
deny-by-default, e sem `SET LOCAL` **toda** query volta vazia — ligar na
Fase 2 quebraria a aplicacao inteira ate a Fase 3, em silencio. O produtor,
por requisicao, dentro da mesma transacao (Prisma usa pool — `SET` de sessao
se perderia na devolucao da conexao):

```sql
SELECT set_config('app.current_tenant', $1, true);  -- true = local a transacao

CREATE POLICY tenant_isolation ON <tabela>
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

### Fase 4 — Forma do dado por tenant
`users/domain/user.aggregate.ts:64` `#profileId: string | null` sai do
agregado: com D4 o User nao tem perfil proprio, o perfil vem da Membership.
Os repos leem por tenant. (A *assinatura* que consome tenant ja foi feita na
Fase 3 — aqui e a forma do dado.)

A **coluna** `users.profile_id` permanece no schema, orfa. Quao remove-la e
decisao adiada (ver §3): e a unica operacao deste trabalho que toca dado
existente, e ela exige decidir para onde vai um usuario sem membership.

### Fase 5 — Entrada: empresa propria OU convite (D5)
**Um branch, na cabeca do use case**, nao dois fluxos:

```
o usuario ja tem destino?
  sim (convite valido)  -> Membership na empresa que convidou, perfil = o do convite
  nao                   -> cria Tenant proprio + Membership admin, perfil admin de sistema
```

`POST /users` grava `User` + destino + `Membership` na **mesma transacao**.

O ramo do convite precisa de **produtor e aceite**, senao e inalcavel:
- **Produtor** — `POST /tenants/:id/invitations`: cria a `Invitation` com
  `token` aleatorio + `expiresAt` e a emite.
- **Aceite, conta nova** — o `POST /users` acima, apontando para o convite.
- **Aceite, conta existente** (o caso comum sob D4: 1 conta, N memberships) —
  `POST /invitations/accept`: essa pessoa ja tem User, entao cria **so** a
  Membership, sem novo User. Sem este passo, o "OU convite" do D5 fica meio
  caminho andado.

### Fase 6 — Superficie que quebra
| Arquivo | Por que quebra |
|---|---|
| `prisma/seed.ts:21,46` | `profile.upsert({ where: { slug } })` perde o input unico quando `slug` sai do `@unique` global (D3). Migrar para a chave composta, `tenantId: null` para perfis de sistema |
| `test/testcontainers-helper.ts:113-127` `cleanDatabase` | `tenants` precisa entrar, senao o isolamento entre specs quebra. `grep -i tenant` no arquivo = 0 |
| `apps/web/e2e/support/rbac.ts:92-102` `semearContaComPerfil` | liga `profileId` via `user.update` (`:99`); passa a criar membership |
| `test/e2e/scenarios/01..10-*.e2e.spec.ts` + `users.e2e.spec.ts` | assumem login → 1 perfil |
| `packages/shared-types/src/profile.ts:51-57` `MeProfileDto` | contrato compartilhado, sem tenant |
| `shared/audit/infrastructure/prisma-audit.service.ts:45` e `:107` | `UserHistory` grava em `:45`, `UserArchive` em `:107` (`upsert`). Ambos gravam snapshot sem tenant: "este user tinha o profile X" sem dizer em qual empresa |

### Fase 7 — Gate de isolamento
"Isolar no repository, nao no tipo" **nao compila** — nada obriga. Sem gate,
vira comentario de review. Artefato nomeado:
`apps/api/test/e2e/scenarios/11-tenant-isolation.e2e.spec.ts` — semeia 2
tenants + 2 usuarios e afirma que **usuario(A) invocando recurso(B) da 403/404**
(o inverso tambem). Cenario e2e registrado no inventario de fluxos
(`e2e-playwright.md ## Inventario de Fluxos`), que o
`check-e2e-flow-coverage` reconcilia.

So e executavel **depois da Fase 3**: o ator que o gate exercita e
`AtorAutenticado`, e sem `tenantId` (3.5) o gate nao tem o que comparar.
Precedente: [`2026-10-13-idor-rate-limit.md`](./2026-10-13-idor-rate-limit.md).

---

## 3. Fora de escopo

- Schema-per-tenant e DB-per-tenant (D1 ja decidiu contra).
- Marketplace de tenants, billing por empresa, plano por tenant.
- **Customizar os campos de um perfil global por tenant** (override). D3 = a
  empresa cria a propria row de perfil; nao e editar a row global.
- **Remover a coluna `users.profile_id`.** Fica orfa apos a Fase 4. A
  removela e `DROP COLUMN` — a regra de `prisma-db-specialist.md:160` exige
  antes um tenant padrao para onde backfilhar, e esse tenant nao existe. Decisao
  adiada, nao esquecida.
- SSO, SCIM, auditoria em nivel de tenant.
- Consertar o `gap_detected` inerte (G-002) — PR proprio.

---

## Evidencia

Medido nesta sessao. Comando e saida, sempre.

| Medida | Comando | Resultado |
|--------|---------|-----------|
| Models no schema | `grep -cE '^model ' apps/api/prisma/schema.prisma` | **5** |
| Specialist com dominio | `grep -rliE 'multi.?tenant\|tenantId' .agents/agents/ .agents/memory/` | **0 medido antes da Fase 1**; **2** depois (sao o proprio agent + memoria que ela criou) |
| Regra de migracao de dados em agent | `grep -n 'backfill' .agents/agents/prisma-db-specialist.md` | **1** (`prisma-db-specialist.md:160`) |
| Regra de migracao em `conventions/` | `grep -inE 'backfill\|migracao de dados' .agents/specs/conventions/*.md` | **3 medidos antes da Fase 1**, todos `post-merge-release.md`; **11 em 3 arquivos** depois (`migracao-de-dados.md` 7, `post-merge-release.md` 3, `README.md` 1) |
| `gap_detected` com o gate real | `pnpm specialist:route --demand="$PWD/<arq>" --paths="$PWD/<arq>"` (3 cenarios) | **`false`, exit 0, nos 3** — gate inerte (G-002). **Caminho relativo faz `FATAL: ENOENT` e sai 1**: quem copia o comando cru lê vermelho, quem lê só `gap_detected` lê o verde errado |
| Cobertura | `pnpm turbo run test:coverage --filter=@projeto/api` | 88,69% linhas / 92,13% branches, unico projeto `unit` do api. O `pnpm -r test --coverage` **nao existe** (`Unknown option: 'coverage'`) |
| Preflight | `pnpm ci:preflight` | 0 erros, **2 skipped medidos antes da Fase 1**; **1** depois (a Fase 1 alterou agents e o check de drift passou a rodar) |
| Estado do banco de dev | contagem por tabela | users=1, **profiles=0**, authorizations=0 |
| Banco de producao | `ls k8s .vercel fly.toml render.yaml terraform`; `grep -rlE 'railway\|fly\.io\|render\.com\|kubectl\|helm' --include='*.yml' --include='*.yaml'` | **nenhum** (so `pnpm-lock.yaml`, falso positivo de nome de pacote). O compose e template local com imagem pinada |

**Nao verificado:** `audit-context.vo.ts` e `prisma-audit.service.ts` linha a linha alem
dos pontos citados; `packages/shared-types/src/user.ts` completo. Ja foi **medido** em
Postgres 16 real que `UNIQUE` composto admite `(NULL, NULL)`: os 4 cenarios da D3 rodaram
e se comportaram como o esperado — nao veio so da doc.

---

## Revisao v1.2.0

Um defeito meu, achado ao ler `prisma/seed.ts` para checar a Fase 6. **G-004**
afirmava que o banco de dev (`users=1, profiles=0`) deixava a Fase 2 "sem
exercicio" e a Fase 7 "sem sobre o que rodar", exigindo uma "fixture
pre-tenancy". **As duas metades sao falsas:**

- **Fase 2 nao precisa de fixture** — o exercicio dela e a suite e2e, que roda
  em testcontainers: `setupTestDatabase` sobe Postgres novo e aplica as
  migrations (`testcontainers-helper.ts:91`). O proprio CI registra que service
  postgres seria dead code (`ci.yml:158`). O volume do banco de dev nao
  participa.
- **Fase 7 tem sobre o que rodar** — semeia 2 tenants + 2 usuarios dentro do
  proprio spec, no container novo.

E o achado que substitui o problema: **nao existe banco de producao**. Um
backfill precisaria de um tenant padrao para onde apontar, e criar esse tenant e
decisao de produto que a demanda nao pede — ela pede perfis por empresa, nao
uma empresa default. Correcao: **Fase 2 sem backfill**, `users.profile_id` fica
orfa e a Fase 4 muda so o caminho de leitura. `DROP COLUMN` entra em §3 como
decisao adiada, porque `prisma-db-specialist.md:160` exige o tenant padrao antes.

---

## Revisao v1.1.0

Dois subagentes independentes: um procurou erros de estrutura e execucao, o
outro conferiu 20 afirmacoes contra o disco. Resultado: **17 verdadeiras,
2 imprecisas, 1 com premissa falsa**, e 10 defeitos de execucao.

### Defeitos que impediam a execucao

| # | Defeito | Correcao |
|---|---------|----------|
| E1 | Fases 3 e 4 **circulares**: 3.4 passa tenant a `obterMeuPerfil`, que so aceita tenant na Fase 4 | assinatura movida para o change-set da Fase 3 (3.1-3.6) |
| E2 | **RLS na Fase 2 liga deny-all sem produtor** — `SET LOCAL` so chega na Fase 3 | RLS movido para a Fase 3, com produtor e `set_config(..., true)` |
| E3 | **Os indices parciais da D3 sao aditivos**: `profiles_slug_key` continua de pe e anula a customizacao por tenant | `ALTER TABLE profiles DROP CONSTRAINT profiles_slug_key;` antes dos `CREATE INDEX` |
| E4 | **O ramo "convite" da D5 e inalcavel** — nada cria `Invitation` | produtor (`POST /tenants/:id/invitations`) + aceite para conta existente |
| E5 | **`POST /users` e `@Public()`**: sem token, sem tenant hidratado | rotas `@Public()` declaradas isentas de `X-Tenant-Id` |
| E6 | **O gate da Fase 7 nao tem moradia nem ator com tenant** | artefato nomeado (`11-tenant-isolation.e2e.spec.ts`) + `tenantId` no ator (3.5) |

### Defeitos de precisão

- **Contradicao interna:** a §Fase 1 dizia "3 hits" de convencao de backfill e a
  tabela de Evidencia dizia "0". Medido: **3**. E "a fase de backfill nao tem
  dono nem regra" era mais forte que o disco — a regra existe em
  `prisma-db-specialist.md:160`.
- **Citacoes erradas:** `permissions.guard.ts:85` → **:86**; o archive grava em
  `prisma-audit.service.ts:**107**` (o `:45` so cobre o historico); a assinatura
  real e `findByEmail(email: Email)`. "Atravessa 4 controllers" → **3**; os
  specs `f9`-`f13` **nao existem** e foram citados os reais.
- **Evidencia invalida:** `gap_detected` era chamado de "codigo morto" citando um
  comando que **sai em exit 2 (Usage)** — `--demand`/`--paths` sao arquivos e o
  `--paths` faltava. A medicao nunca aconteceu; refeita, a conclusao se
  sustenta por `always_on` incondicional.