---
name: plano-onboarding-empresa
version: 1.1
updated: 2026-10-21
demand_slug: onboarding-empresa
state_snapshot: .agents/runs/state-snapshot-20261021T000532Z.md
branch: feat/onboarding-empresa
base_main: f2041e2cb26b0d545c10671587a209040e19fc78
---

# Plano — Todo usuário pertence a uma empresa

> Data: 2026-10-21 · Branch: `feat/onboarding-empresa` (base `main` @ `f2041e2`)
> Demanda: *"todos os usuarios devem pertencer a uma empresa exceto os usuarios admin, usuarios que entrarem a partir de convites devem ser adicionados a empresa que o convidou e os que entrarem por conta propria devem ser redirecionados a uma pagina de criação de empresa e por padrão terão o perfil de dono com todas as permissões da empresa"*
> State-snapshot: [`.agents/runs/state-snapshot-20261021T000532Z.md`](../../../.agents/runs/state-snapshot-20261021T000532Z.md)

## 0. State snapshot (camada 0 — `state-aware-planning`)

| Item | Estado medido |
|---|---|
| Branch | `feat/onboarding-empresa`, criada de `main` @ `f2041e2` (= `origin/main`) |
| Working tree | limpo na criação da branch |
| Runtime | `api` container `healthy` (`/api/v1/health` → `database: ok`), Postgres 16 `healthy`, OTel Collector `up`; web **não** rodando (o e2e sobe o próprio servidor) |
| Schema | 13 migrations aplicadas; `Tenant`, `TenantMembership`, `Invitation`, `Profile.tenantId` presentes |
| Stack | Next.js 15 / React 19, NestJS 11, Prisma 6.19.3, Vitest 2.1.9 |
| Template | `v1.11.0` |
| Gates que importam | `check-e2e-flow-coverage` (fluxo novo sem linha no inventário = vermelho), coverage web 80% (`app/**/*.tsx` está no `exclude` — página RSC não entra no denominador), `pnpm ci:local` (preflight + lint + typecheck + unit + coverage + integration + e2e) |

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

| Capacidade | Onde |
|---|---|
| Criar conta **com** empresa própria, num passo (`destino: {tipo:'empresa'}`) | `tenancy.use-cases.ts` → `provisionarEmpresaPropria` |
| Criar conta **por convite** (`destino: {tipo:'convite', token}`) | `tenancy.use-cases.ts` → `criarContaPorConvite` |
| Aceitar convite de conta **existente** | `POST /invitations/accept` |
| Emitir convite (só `owner`) | `POST /tenants/:id/invitations` → `emitirConvite` |
| **Perfil de gerente com TODAS as permissões**, dentro da empresa nova | `prisma-tenant-onboarding.repository.ts` (perfil `gerente` da empresa + `listAllPermissions()`) |
| Membership = identidade na empresa; `profile_id` NULL = zero permissões | `tenant-membership-repository.port.ts` |
| Bucket GLOBAL = `users.profile_id` (admin do seed) | `findProfileId(userId, null)` |
| `guardarTenant` (cookie de empresa) — **sem caller** | `apps/web/lib/sessao.ts` |
| Formulário de cadastro público | `apps/web/app/users/novo/` |
| `POST /users` aceita `destino` opcional | `users.schemas.ts` (`DestinoSchema`) |

### O que FALTA (escopo do pedido)

| # | Gap | Evidência |
|---|---|---|
| G-001 | **Conta própria não chega a nenhuma empresa.** O login manda `/users` direto; a conta fica sem empresa e sem cookie de empresa. | `apps/web/app/login/actions.ts` |
| G-002 | **Não existe rota para criar empresa de quem JÁ tem conta.** `provisionarEmpresaPropria` grava conta + empresa na mesma transação — serve para o cadastro, não para a página de criação. | `tenant-onboarding.port.ts` |
| G-003 | **Não existe rota que liste as empresas do ator** — o redirect do login precisa dela. | `TenantMembershipRepositoryPort` (4 métodos, nenhum lista) |
| G-004 | **`guardarTenant` nunca é chamado** — sem `X-Tenant-Id` o dono resolve o bucket GLOBAL (`users.profile_id` = NULL) e fica com zero permissões. | `apps/web/lib/sessao.ts` + `lib/perfil.ts` |
| G-005 | **Convite não tem entrada pela UI** — nem página de convite, nem token no formulário de cadastro. | `apps/web/app/**` |
| G-006 | **`aceitarConvite` devolve `void`** — o `tenantId` do convite aceito se perde, e o cookie de empresa não pode ser gravado. | `tenancy.use-cases.ts` |
| G-007 | **A empresa nasce com UM perfil só** — o `admin` da empresa (apelido de "dono"). O pedido é TRÊS: `gerente`, `coordenador` e `funcionario`. | `prisma-tenant-onboarding.repository.ts` |

### Fora de escopo (decidido, não por esquecimento)

- **Tornar `destino` obrigatório em `POST /users`.** O e2e 12 afirma que "cadastrar sem `destino` continua funcionando (a rota aberta não regride)" — e o pedido é de DUAS etapas (conta → página de criação → empresa). Obrigar `destino` apagaria a tela de criação de empresa.
- **Convite com `role`/`perfil` configurável.** O convite gera `member` sem perfil — `profile_id = NULL`, que é **zero permissões** até o dono da empresa atribuir um. É comportamento medido na Fase 4 e **não muda**: o pedido é quem entra por convite PERTENCER à empresa que convidou, e a empresa é o vínculo; o perfil é decisão de quem administra a empresa.
- **Trocar de empresa em tempo de sessão** (1 conta, N empresas → seletor no header). O cookie `tenant_id` resolve; o seletor é produto, não pedido.
- **Recusar `POST /users` público.** A rota aberta é decisão de produto registrada.
- **Convite por e-mail.** Não há maileiro no repo; o token volta na resposta (já documentado em `tenancy-invitations.controller.ts`).

## 2. Regras de negócio

- **BR-001** — Toda conta que não é administradora de SISTEMA pertence a pelo menos uma empresa.
- **BR-002** — Quem entra por convite entra na empresa **que convidou**, com o papel do convite.
- **BR-003** — Quem cria a própria empresa vira **gerente** (`role = 'gerente'`) e veste o perfil `gerente` **daquela empresa**, com **todas** as permissões do catálogo.
- **BR-004** — O administrador de SISTEMA (bucket global: `users.profile_id` → perfil com `tenant_id IS NULL` e `is_admin`) pode não pertencer a empresa nenhuma.
- **BR-005** — Criar empresa é sempre "tudo ou nada": empresa + perfil + permissões + membership caem juntos, ou não cai nenhum.
- **BR-006** — Toda empresa nasce com **TRÊS** perfis: `gerente` (todas as permissões do catálogo + bypass **dentro da empresa**), `coordenador` (`users.read`, `users.write`, `audits.read` — administra PESSOAS, nada de `admin.*`) e `funcionario` (`users.read`).
- **BR-007** — **`admin` ≠ `gerente`.** `admin` é o administrador do **SISTEMA**: perfil GLOBAL (`tenant_id IS NULL`), acesso total, apontado por `users.profile_id`, criado pelo seed. `gerente` é o GERENTE da **EMPRESA**: perfil da empresa (`tenant_id` = o tenant), e vale sobre as funcionalidades DAQUELA empresa. Um perfil de empresa chamado `admin` seria um nome que significa "sistema" apontando para a empresa — por isso o slug é `gerente`.
  - ⚠️ **Renomeado em 2026-10-22**: o catálogo nasceu com `dono`/`gestor`/`funcionario`, e o pedido de produto trocou para `gerente`/`coordenador`/`funcionario` — o vocabulário da empresa é a hierarquia de cargos, e "dono" não descrevia o cargo. O `role` da membership acompanha (`'owner'` → `'gerente'`); o papel do convidado (`'member'`) não muda.

## 3. Contratos novos

### `POST /api/v1/tenants` — cria a empresa de quem já tem conta

- Guard: `JwtAuthGuard` (sessão obrigatória). Sem sessão → 401.
- Body: `{ nome: string, slug: string }` (`slug` = `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`).
- `201` → `{ id, nome, slug }`.
- `409` → slug já em uso. `400` → payload inválido.

### `GET /api/v1/me/tenants` — as empresas do ator

- Guard: `JwtAuthGuard`.
- `200` → `[{ id, nome, slug, role }]`. `[]` = a conta não pertence a empresa nenhuma (está em onboarding, ou é admin de sistema).

### `POST /api/v1/invitations/accept` — muda de forma

- `201` → `{ aceito: true, tenantId: string }`. O `tenantId` é o da empresa **que convidou** — sem ele, o web não grava o cookie de empresa depois do aceite (G-006).

## 4. Tarefas (TDD — Red→Green→Refactor)

| # | Task | RED | GREEN |
|---|---|---|---|
| T1 | Port `TenantOnboardingPort.abrirEmpresaParaUsuario(userId, empresa)` + impl Prisma (extrai o núcleo de `provisionarEmpresaPropria`: empresa + perfil `admin` da empresa + TODAS as permissões + membership `owner`) | spec unitário do repositório | — |
| T2 | `TenancyUseCases.criarEmpresa({ userId, nome, slug })` + `listarEmpresas(userId)` | spec de `tenancy.use-cases.spec.ts` | T1 |
| T3 | `TenantMembershipRepositoryPort.listarEmpresasDoUsuario(userId)` + impl Prisma (escopo SISTEMA + filtro `user_id`) | spec unitário do repositório | — |
| T4 | Controller de tenancy: `POST /tenants` e `GET /me/tenants` (Zod no body, `JwtAuthGuard`) | spec de controller | T2, T3 |
| T5 | `POST /invitations/accept` devolve `tenantId` | spec de tenancy + e2e 12 | T2 |
| T6 | Web `lib/empresas.ts` + tipos em `packages/shared-types/src/tenant.ts` | spec unitário do client | T4 |
| T7 | Web `/empresa/nova` (page + form + action): cria a empresa, grava o cookie, vai para `/users` | spec do schema + spec da action | T6 |
| T8 | Web login: funil — sem empresa e sem admin de sistema → `/empresa/nova`; com empresa → grava o cookie e vai para `/users` | spec da action | T6 |
| T9 | Web `/convite/[token]`: logado → aceita e vai para `/users`; sem sessão → `/users/novo?convite=…`; o cadastro carrega o token (`destino: {tipo:'convite'}`) | spec do schema + e2e | T6, T5 |
| T10 | e2e `f16-onboarding-empresa.spec.ts` (`// FLUXO: F16`) + linha no inventário de fluxos | spec novo | — |
| T11 | `pnpm ci:preflight` + `pnpm ci:local` (lint, typecheck, unit, coverage, integration, e2e) + prettier | — | — |
| T12 | Os **TRÊS perfis** de toda empresa (`gerente`, `coordenador`, `funcionario`) — catálogo no domínio (`domain/perfis-da-empresa.ts`), gravado nas DUAS entradas de empresa (cadastro com `destino` e página de criação) | spec unitário do catálogo + spec do repositório | T1 |

### Notas de implementação (medidas que valem mais que a intuição)

- **`POST /tenants` reusa a transação de `provisionarEmpresaPropria`**, que já resolve os três detalhes que matam: (a) a sessão nasce em SISTEMA (`abrirEscopo(tx, escopoDoTenant(null))`) porque o `RETURNING` do `INSERT` em `tenants` é avaliado pela policy de SELECT (`no_escopo_atual(id, false)` → FALSE sem escopo → "new row violates row-level security policy"); (b) o escopo desce para a empresa nova ANTES do `INSERT` do perfil, porque a policy `profiles_insercao` compara `tenant_id` com o GUC no momento do insert; (c) a membership é gravada por `criar_membership` (SECURITY DEFINER + HMAC do corpo), não por `INSERT` direto — o `REVOKE INSERT` da migration `20261020000004` é o que impede um ator de criar o próprio vínculo.
- **`GET /me/tenants` lê em escopo SISTEMA** e filtra por `user_id` na query. O filtro é da APLICAÇÃO, não da RLS (`memberships_leitura` = `no_escopo_atual(tenant_id, false)`, e `'*'` passa em tudo) — a justificativa é a mesma de `buscarConvitePorToken`: o id do ator vem do token, e a linha devolvida é só a dele.
- **O funil do login não confunde "gerente de empresa" com "admin de sistema".** O gerente de empresa tem `users.profile_id = NULL` (a empresa própria é criada com `profileId: null` — `prisma-tenant-onboarding.repository.ts`) e o perfil na **membership**; o admin de sistema tem `users.profile_id` apontando para o perfil global (`tenant_id IS NULL`). Logo `GET /me/profile` **sem** header (bucket global) é o que separa os dois: `isAdmin === true` ⇒ admin de sistema (BR-004).
- **`guardarTenant` grava cookie NÃO httpOnly** — o id da empresa não é segredo, e o cookie precisa ser lido por Server Action sem round-trip.
- **A e2e F8 ("quem entra pelo login sai da tela de login para a listagem") muda de expectativa**: a conta semeada não pertence a empresa nenhuma, e o funil novo a manda para `/empresa/nova`. O teste precisa dizer isso — o funil é o produto pedido, não uma regressão.
- **`POST /users` com `destino: {tipo:'convite'}` já existe e está medido** (e2e 12): a conta entra na empresa do convidador com `role = 'member'` e `profile_id = NULL`. O que falta é a ENTRADA pela UI (T9).
- **Os TRÊS perfis vivem num CATÁLOGO no domínio** (`apps/api/src/modules/tenancy/domain/perfis-da-empresa.ts`), e não numa lista no repositório: as DUAS entradas de empresa (o cadastro com `destino` e a página de criação) precisam produzir EXATAMENTE o mesmo conjunto — e duas listas divergiriam na primeira alteração, silenciosamente.
- **O `isAdmin` do `gerente` é o bypass do GUARD DENTRO DA EMPRESA**, e é por isso que ele NÃO faz do gerente um administrador de sistema: as rotas de sistema (feature flags) exigem `tenantId === null && isAdmin`, e o gerente tem `users.profile_id` NULL — o bucket global dele resolve para zero permissões. O `gerente` só é `isAdmin` no escopo em que o perfil EFETIVO é o dele. O `coordenador` NÃO tem nada de `admin.*` por causa da escalada: com `admin.manage-authorizations` ele poderia se dar `admin.manage-profiles` e editar o perfil do próprio gerente.

## 5. Fluxo resultante

```text
Cadastro por conta própria            Convite
─────────────────────────             ──────────────────────────────
POST /users {nome,email,senha}        POST /users {…, destino:{tipo:'convite',token}}
        │                                      │  (ou POST /invitations/accept, se já tem conta)
        ▼                                      ▼
  /login?cadastrado=1                  membership na empresa QUE CONVIDOU
        │                              (role do convite, perfil NULL = 0 permissões)
        ▼                                      │
  POST /auth/login                             ▼
        │                                 /users
        ▼
  GET /me/tenants
        │
        ├── tem empresa ──► guardarTenant(cookie) ──► /users
        │
        └── não tem empresa
                 │
                 ├── admin de sistema? ──► /users
                 └── não ──► /empresa/nova ──► POST /tenants
                                                        │
                                                        ▼
                                        empresa + os TRÊS perfis
                                        (gerente, coordenador, funcionário)
                                        + membership gerente → o `gerente`
```

## 6. Riscos

| Risco | Mitigação |
|---|---|
| O funil do login manda o admin de sistema para `/empresa/nova` | O funil consulta `GET /me/profile` sem header (bucket global) antes de decidir — BR-004 medida em spec |
| `POST /tenants` cria empresa e membership em transações separadas | A fronteira transacional é o MESMO `$transaction` de `provisionarEmpresaPropria` (BR-005) |
| A página de criação de empresa vira um beco sem saída (conta sem empresa não sai do lugar) | A conta sem empresa tem zero permissões e uma única tela disponível; o e2e F16 mede o caminho completo |
| Mudança no funil do login quebra a e2e F8 | F8 é atualizada no mesmo PR, com o motivo escrito no spec |
