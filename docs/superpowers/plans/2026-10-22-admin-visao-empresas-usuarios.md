---
name: plano-admin-visao-empresas-usuarios
version: 1.0
updated: 2026-10-22
demand_slug: admin-visao-empresas-usuarios
state_snapshot: .agents/runs/state-snapshot-20261022T205801Z.md
branch: feat/admin-visao-empresas-usuarios
base_main: 404a2458760b542b25e19329085969d3872b5c8a
---

# Plano — o administrador do sistema vê as empresas e os usuários, nos dois sentidos

> Data: 2026-10-22 · Branch: `feat/admin-visao-empresas-usuarios` (base `main` @ `404a245`)
> Demanda: *"crie um plano para que o usuarios administrador possa ver todas as empresas e todos os usuarios atrelados a empresa e todos os usuarios e todas as empresas atrelados a cada usuario, revise o plano, execute o plano, revise tudo, corrija todos os erros, commit, push e abra um pr"*
> State-snapshot: [`.agents/runs/state-snapshot-20261022T205801Z.md`](../../../.agents/runs/state-snapshot-20261022T205801Z.md)
> Regra: [`.agents/specs/conventions/estrutura-e-versionamento.md`](../../../.agents/specs/conventions/estrutura-e-versionamento.md)

## 0. State snapshot (camada 0 — `state-aware-planning`)

| Item | Estado medido |
|---|---|
| Branch | `main` @ `404a245` (working tree limpa no snapshot) |
| Runtime | API `200` em `/api/v1/health`, `database: ok`; web de dev fora do ar |
| Schema | 14 migrations no disco, **1 pendente** no banco local (G-001) |
| Cobertura | API 87,87% · web 99,53% (linhas) — acima do piso de 80% |
| Preflight | verde (0 erro; 2 checks pulados por ausência de material) |
| Gates que importam | `check-e2e-flow-coverage` (tela nova ⇒ linha no inventário + spec), `check-tenant-scope-source` (toda leitura de dado multi-tenant abre o escopo), `check-runbook-drift` |

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

| Capacidade | Onde |
|---|---|
| Escopo de leitura (bucket de SISTEMA `'*'` vs empresa) | `apps/api/src/shared/infrastructure/prisma/escopo.ts` — `comEscopoDeSistema`, `comEscopoDeEmpresa` |
| Regra do "administrador do sistema" (D2) | `apps/api/src/shared/auth/eh-administrador-de-sistema.ts` — `ehAdministradorDeSistema` |
| Leitura das empresas do ATOR, com o papel | `tenant-membership-repository.port.ts` — `listarEmpresasDoUsuario` |
| Guard de permissão + decorator | `profiles/infrastructure/http/guards/permissions.guard.ts`, `.../require-permission.decorator.ts` |
| Guard de página `/admin/*` (401→login · 403→restrito · 5xx→retry) | `apps/web/app/admin/guard-admin.tsx` — `exigirAdmin` |
| Cliente web SEM header de empresa (D14) | `apps/web/lib/flags.ts` — o `ApiClient` sem `getTenant` |
| Semente de admin e de quase-admin no e2e | `apps/web/e2e/support/rbac.ts` — `semearAdmin`, `semearQuaseAdmin` |

### O QUE FALTA (escopo do pedido)

| # | Pedido | O que existe hoje | Gap |
|---|---|---|---|
| G-001 | "ver **todas as empresas**" | `GET /me/tenants` devolve as empresas **do ator** | não há lista de empresas do sistema |
| G-002 | "**todos os usuários atrelados a empresa**" | `GET /users` devolve os usuários **do escopo** (RLS) | não há a lista de membros de uma empresa arbitrária |
| G-003 | "**todos os usuários**" | `GET /users` com escopo de SISTEMA devolve a base, mas **sem as empresas** de cada um | falta a leitura no sentido inverso |
| G-004 | "**todas as empresas atrelados a cada usuário**" | não existe | falta a leitura no sentido inverso |

⚠️ **O furo que a lista de usuários tem de fechar:** a conta do administrador do
sistema (`admin@admin.com`, do seed) **não pertence a empresa nenhuma** — ela
vive no bucket GLOBAL. Uma lista montada a partir de `tenant_memberships` a
ESQUECERIA, e "todos os usuários" seria uma lista de quase-todos. Por isso a
leitura de usuários parte de `users`, não de `tenant_memberships`.

### A leitura que muda o plano

⚠️ **A tela pedida é do ADMINISTRADOR DO SISTEMA, e não do gerente de empresa.**
São dois atores com o mesmo nome no código: o `gerente` de uma empresa tem
`isAdmin: true` **no perfil efetivo da empresa dele** (`perfis-da-empresa.ts`), e
o `admin` do sistema tem `isAdmin: true` **no perfil global** (`seed.ts`). Se a
rota respondesse "quem tem `isAdmin`", o gerente da ACME leria a base INTEIRA
— a escalada que o próprio repositório já fechou uma vez (Fase 8, ver
`admin-profiles.controller.ts`). A trava que já existe e que vale é **D2**
(`ehAdministradorDeSistema`: `tenantId === null && isAdmin`), a mesma das
feature flags.

## 2. Decisões

| # | Decisão | Por quê |
|---|---|---|
| D1 | O ator é o **administrador do sistema** (D2: `tenantId === null && isAdmin`). O gerente de empresa é recusado. | `ehAdministradorDeSistema` já existe e é a trava do bucket global. `admin.manage-users` sozinho NÃO segura: o `gerente` recebe `listAllPermissions()` no cadastro da empresa (`perfis-da-empresa.ts`). |
| D2 | A leitura abre o **bucket de SISTEMA**, explícito no repositório — nunca derivado do header. | ⚠️ **Desde o #118 o bucket de SISTEMA é a CREDENCIAL, e não o GUC**: quem abre a transação é o papel `app_system` (`comEscopoDeSistema`), e o GUC `'*'` na sessão de runtime devolve ZERO linhas. A RLS (`no_escopo_atual`, `usuario_no_escopo`) compara `current_user` com `app_system` no bucket global. O header é **capacidade declarada pelo cliente** (issue #102) e não pode abrir escopo. |
| D3 | O perfil mostrado é o **efetivo da membership** (`tenant_memberships.profile_id`), aceitando o perfil GLOBAL ou o DAQUELA empresa — o mesmo conjunto de `findProfileId`. | O `users.profile_id` é global e é `null` para toda conta criada pelo produto: mostrar ele diria "sem perfil" para quem tem, em toda linha, sempre (o defeito do #106). |
| D4 | Conta **soft-deleted** fora das DUAS listas (membros e usuários). | Mesma regra de `GET /users` (default `includeDeleted=false`) e de `listarEmpresasDoUsuario` (`user: { deletedAt: null }`). Uma lista só seria incoerente: o membro apagado sumiria do usuário mas continuaria na empresa. |
| D5 | **Sem paginação** nestas rotas. Atalho declarado no código. | As outras rotas de admin (`/admin/profiles`, `/admin/feature-flags`) também não paginam. `shortcut: sem paginação; a lista é do bucket de SISTEMA e cresce com a base — paginar quando o admin reportar lentidão.` |
| D6 | **Duas** rotas: `GET /admin/tenants` e `GET /admin/users`. Não uma rota com os dois lados. | Um recurso por rota é o padrão do repositório (`/admin/profiles`, `/admin/feature-flags`); e cada lista é útil sozinha (o admin pergunta "quem está na ACME" e "de quais empresas o Bruno é"). |
| D7 | O cliente web **omite** o header `X-Tenant-Id`. | D14 (o mesmo motivo de `lib/flags.ts`): mandar a empresa do cookie tira o ator do bucket global e D2 passa a recusar o admin legítimo. |
| D8 | O front lê o perfil **GLOBAL** (`obterMeuPerfilGlobal`), e não o da empresa. | D2 olha o bucket global. `obterMeuPerfil` (por empresa) devolveria o `isAdmin` do DONO — `true` em toda empresa nova — e a tela mostraria a tabela para um ator que a API recusa. |
| D9 | **Nenhuma escrita.** Só leitura — logo, **nenhuma migration** e **nenhuma mudança de schema**. | O pedido é ver. A migration pendente (G-001 do snapshot) é dívida de valor gravado, fora deste escopo. |

## 3. Tarefas (TDD: Red → Green → Refactor)

### T0 — Porta + adaptador Prisma

**Novos:**
- `apps/api/src/modules/tenancy/domain/ports/admin-tenancy-repository.port.ts`
- `apps/api/src/modules/tenancy/infrastructure/persistence/prisma-admin-tenancy.repository.ts`
- `apps/api/src/modules/tenancy/infrastructure/persistence/prisma-admin-tenancy.repository.spec.ts` (unitário, Prisma mockado)
- `apps/api/src/modules/tenancy/infrastructure/persistence/prisma-admin-tenancy.repository.integration.spec.ts` (Postgres real)

Contrato da porta:

```ts
export const ADMIN_TENANCY_REPOSITORY_PORT = Symbol('AdminTenancyRepositoryPort');

interface MembroDaEmpresa { id; nome; email; role; perfil: string | null }
interface EmpresaComMembros { id; nome; slug; membros: MembroDaEmpresa[] }
interface EmpresaComPerfil { id; nome; slug; role; perfil: string | null }
interface UsuarioComEmpresas { id; nome; email; empresas: EmpresaComPerfil[] }

export interface AdminTenancyRepositoryPort {
  listarEmpresasComMembros(): Promise<EmpresaComMembros[]>;
  listarUsuariosComEmpresas(): Promise<UsuarioComEmpresas[]>;
}
```

- `listarEmpresasComMembros`: `tenant.findMany` com `include: { memberships: { include: { user, profile } } }`, em `comEscopoDeSistema(…)` (a credencial do bucket de SISTEMA — ver D2), filtrando `user.deletedAt: null` e mapeando `tenant.name` → `nome`.
- `listarUsuariosComEmpresas`: `user.findMany` com `include: { memberships: { include: { tenant, profile } } }`, MESMO escopo, filtrando `deletedAt: null` na conta.
- O `perfil` é o **slug** do perfil efetivo da membership, e `null` quando a membership não tem perfil (`profileId` nulo) — ou quando o perfil é de **outra** empresa (a mesma exclusão de `findProfileId`).
- **Uma** query por lista (`include` do Prisma) — sem N+1.

### T1 — Use case (D2) + controller + wiring

- `tenancy.use-cases.ts`: `listarEmpresasDoSistema(ator)` e `listarUsuariosDoSistema(ator)`, ambas começando por `exigeAdministradorDoSistema(ator)` (D2 → 403 `FORBIDDEN`).
- `tenancy.use-cases.spec.ts`: o caso do **recuso** (ator que não é admin do sistema → 403) e o caso da delegação (ator legítimo → o repositório é chamado).
- **Novo** `apps/api/src/modules/tenancy/infrastructure/http/admin-tenancy.controller.ts`:
  - `GET /admin/tenants` → `EmpresaComMembros[]`
  - `GET /admin/users` → `UsuarioComEmpresas[]`
  - `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermission('admin.manage-users')` em **cada handler** (defense in depth — quem barra de fato é D2, como nas feature flags).
  - `@ApiBearerAuth()` + `@ApiResponse` por rota (o documento OpenAPI é gerado e conferido).
- `tenancy.module.ts`: `ProfilesModule` nos imports (o `PermissionsGuard` injeta `UserProfileUseCases`) + o binding da porta nova no `PrismaPersistenceModule` (é lá que os bindings Prisma moram).

### T2 — Tipos compartilhados

- `packages/shared-types/src/tenant.ts`: `MembroDaEmpresaDto`, `EmpresaComMembrosDto`, `EmpresaComPerfilDto`, `UsuarioComEmpresasDto`.
- `packages/shared-types/src/index.ts`: os exports.

### T3 — Web

- **Novo** `apps/web/lib/tenancy.ts`: `listarEmpresasComMembros()` e `listarUsuariosComEmpresas()`, com `ApiClient` **sem** `getTenant` (D7).
- `apps/web/app/admin/guard-admin.tsx`: **novo export** `exigirAdminDoSistema()` — o mesmo `exigirAdmin()`, mas lendo `obterMeuPerfilGlobal()` (D8), para não duplicar a distinção 401/403/5xx que o #107 consertou.
- **Nova** `apps/web/app/admin/tenancy/page.tsx`: duas tabelas — empresas (com os membros) e usuários (com as empresas) — com `<caption>` e `scope="col"` (o padrão a11y das flags).
- `apps/web/components/Sidebar.tsx`: link "Empresas e usuários" no bloco de admin.

### T4 — E2E (F17) + inventário

- **Novo** `apps/web/e2e/f17-admin-tenancy.spec.ts`, começando com `// FLUXO: F17`:
  1. o admin do sistema vê a empresa, o slug e o membro (e a empresa do membro);
  2. o quase-admin vê "Acesso restrito" e **não** vê o nome/e-mail do membro.
- `.agents/specs/conventions/e2e-playwright.md`: uma linha no **Inventário de Fluxos** (F17, rota `/admin/tenancy`) — o gate `check-e2e-flow-coverage` compara a rota do disco com a coluna `Rota`.

### T5 — Verificação

`pnpm ci:local` — lint, typecheck, unit, coverage, integração, e2e, tooling e boot.

## 4. O que NÃO entra (e por quê)

| Não entra | Por quê |
|---|---|
| Paginação, busca e ordenação nestas rotas | ninguém pediu; atalho declarado (D5) |
| Criar/remover membro, editar o papel | o pedido é **ver**; escrita é outro requisito (e outro risco) |
| Exportar CSV | não pedido |
| Contadores em cache | não pedido; a base é pequena |
| Migration nova | a feature é leitura pura (D9) |

## 5. Riscos

| Risco | Mitigação |
|---|---|
| **Escalada**: o gerente de uma empresa tem `isAdmin: true` no perfil efetivo da empresa e `listAllPermissions()` | D1 — D2 exige `tenantId === null`; e o e2e mede o quase-admin (recusado) |
| O `JwtAuthGuard` publica `isAdmin` do cache, que é **por escopo** | D8 — o front e a API leem o bucket global; o cliente web omite o header (D7) |
| **PII**: o admin passa a ver nome e e-mail de toda a base | É o pedido. O acesso é restrito ao admin do sistema por D2, e a rota é auditável pelo `JwtAuthGuard` |
| Performance sem paginação | D5 — atalho declarado; a lista é do bucket de SISTEMA |
| Escopo de tenancy esquecido numa leitura nova | `check-tenant-scope-source` (preflight) — a leitura abre o escopo antes de tocar a tabela |
