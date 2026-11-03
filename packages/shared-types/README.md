# `@projeto/shared-types`

> O contrato entre o **web** e a **api**. Package **types-only**: não tem
> dependência de runtime, não compila para JavaScript, e o `test` é um `echo`.
>
> Medido em **2026-10-29**: **31 tipos** declarados, re-exportados pelo barrel
> `src/index.ts` sob o nome `@projeto/shared-types`.

## §1. A regra que este package existe para cumprir

> **Um tipo aqui é cópia do wire format, não do modelo de domínio.**
> Se a API não manda o campo, o tipo não tem o campo.
> — `packages/shared-types/src/user.ts`

A fonte da verdade é o que a API **realmente serializa**, medido contra a API
em execução — não o que o modelo de domínio tem dentro. A consequência prática
é que os nomes dos campos vêm em **camelCase do `class-transformer`** (não do
`@@map` do Prisma, que é para o banco) e que um rename no wire **quebra o
`tsc` dos dois lados** ao mesmo tempo, que é o ponto.

O que a regra já evitou: os tipos divergiam da API em três pontos (`name` vs
`nome`, `{data,pagination}` vs `{users,nextCursor}`, e campos
`createdBy/updatedBy/deletedBy` que a API nunca emite). O TypeScript não
acusava, porque o tipo mentia **na mesma direção** que o runtime — e a tela
mostrava uma lista vazia sem dizer por quê.

## §2. Como importar

```typescript
import type { UserOutputDto, MeProfileDto } from '@projeto/shared-types';
```

O barrel é `packages/shared-types/src/index.ts` e só exporta tipos — o
`import type` é o caminho normal, e o `package.json` aponta `main` e `types`
para `./src/index.ts` (sem build: o workspace consome o TypeScript direto).

## §3. Os tipos, por arquivo

### 3.1 `src/user.ts` — 14 tipos

| Tipo | O que representa |
|---|---|
| `UUID` | UUID v7 em string (RFC 4122 / RFC 9562). |
| `ISODateString` | Timestamp serializado em ISO 8601 (UTC, sufixo `Z`). |
| `UserOutputDto` | Saída canônica de um usuário. Tem `nome` (não `name`), `email`, `profileId` (global), `perfilEfetivoNoEscopo` (o do tenant, opcional), `version`, `createdAt`, `updatedAt`, `deletedAt`, `isDeleted`. |
| `CreateUserInputDto` | Entrada de `POST /users`: `nome`, `email`, `senha` (8..72) e `destino?`. |
| `DestinoContaDto` | Para ONDE a conta nasce: `{tipo:'empresa', nome, slug}` ou `{tipo:'convite', token}`. Discriminado por `tipo`, como na API. |
| `UpdateUserInputDto` | Entrada de `PATCH /users/:id` — rename-only (`novoNome`). |
| `RestoreUserInputDto` | Entrada de `POST /users/:id/restore`: `expectedVersion`, `reason?`. |
| `AuditOperationType` | `'INSERT' \| 'UPDATE' \| 'DELETE' \| 'RESTORE'`. |
| `UserHistoryEntryDto` | Uma entrada do read model de `users_history` (version, snapshot, operation, autor, motivo). |
| `UserArchiveEntryDto` | Uma entrada do read model de `users_archive` (version, snapshot, deletedAt, deletedBy, motivo). |
| `UsersPageDto` | Resposta paginada cursor-based de `GET /users`: `{ users, nextCursor }`. **Não** é `{data, pagination}`. |
| `UserHistoryPageDto` | Resposta paginada de `GET /users/:id/history`: `{ entries, nextCursor }`. |
| `ProblemDetailsError` | Campo de erro por validação: `field`, `message`, `code`. |
| `ProblemDetailsDto` | Resposta de erro RFC 7807 + extensão interna (`code`, `traceId`, `errors?`). |

### 3.2 `src/profile.ts` — 6 tipos

| Tipo | O que representa |
|---|---|
| `ProfileSummary` | Item de `GET /admin/profiles`: `id`, `slug`, `name`, `isAdmin`, `isSystem`, `description`, `permissionCount`. |
| `ProfileDetail` | `ProfileSummary` + `permissions`, `createdAt`, `updatedAt`, `version`. |
| `MeProfileDto` | Resposta de `GET /me/profile`: `profileId`, `profileSlug`, `profileName`, `isAdmin`, `permissions`. Não existe `userId` nem objeto `profile` aninhado. |
| `CreateProfileInputDto` | Entrada de `POST /admin/profiles`. **Sem** `isAdmin` — a API ignora o campo de propósito. |
| `UpdateProfileInputDto` | Entrada de `PATCH /admin/profiles/:id`; `name` é obrigatório. |
| `AssignProfileInputDto` | Entrada de `PUT /admin/users/:id/profile`; `profileId: UUID \| null` — `null` **limpa** o perfil (não existe DELETE para isso). |

### 3.3 `src/tenant.ts` — 9 tipos

| Tipo | O que representa |
|---|---|
| `EmpresaDto` | A empresa (a tenant): `id`, `nome`, `slug`. |
| `EmpresaDoUsuarioDto` | A empresa **do ator**: `EmpresaDto` + `role` (rótulo `gerente`/`member` — **não** é RBAC). |
| `CriarEmpresaInputDto` | Entrada de `POST /tenants`: `nome`, `slug`. |
| `ConviteAceitoDto` | Resposta de `POST /invitations/accept`: `{ aceito: true, tenantId }`. O `tenantId` volta porque é o que o web precisa para apontar a sessão. |
| `MembroDaEmpresaDto` | Um membro visto pelo admin do sistema: `id`, `nome`, `email`, `role`, `perfil` (slug efetivo naquela empresa, `null` se não tiver). |
| `EmpresaComMembrosDto` | `EmpresaDto` + `membros: MembroDaEmpresaDto[]`. |
| `EmpresaComPerfilDto` | `EmpresaDoUsuarioDto` + `perfil: string \| null`. |
| `UsuarioComEmpresasDto` | Um usuário e as empresas a que pertence. `empresas` vazia é resposta legítima (admin do sistema não pertence a empresa nenhuma). |
| `InventarioAdminTenancyDto` | O inventário da tenancy em **uma** resposta: `{ empresas, usuarios }`. As duas listas viajam juntas porque precisam contar a mesma história — em duas respostas seriam dois instantes do banco. |

### 3.4 `src/feature-flag.ts` — 2 tipos

| Tipo | O que representa |
|---|---|
| `FeatureFlagDto` | Uma linha da tela de flags: `chave`, `descricao`, `ativada`. O estado é booleano — nunca inferido da ausência de linha. |
| `UpdateFeatureFlagInputDto` | Corpo do PUT de toggle: só `ativada`. A chave vem na URL. |

### 3.5 `src/index.ts` — o barrel

Re-exporta os **31** tipos acima. Não declara nenhum — os 4 `export type {…}`
do arquivo são o agrupamento por domínio, e por isso a contagem por
`grep -cE '^export (type|interface)'` nele devolve **4** e não 31.

## §4. Como contar

```bash
# por arquivo — o barrel devolve 4 (os blocos de re-export), os outros a soma
grep -cE '^export (type|interface)' packages/shared-types/src/*.ts

# total de tipos DECLARADOS (sem o barrel)
grep -hE '^export (type|interface)' \
  packages/shared-types/src/user.ts \
  packages/shared-types/src/profile.ts \
  packages/shared-types/src/feature-flag.ts \
  packages/shared-types/src/tenant.ts | wc -l

# nomes re-exportados pelo barrel (31)
awk '/export type \{/,/\} from/' packages/shared-types/src/index.ts | grep -oE '[A-Z][A-Za-z]+' | wc -l
```

> ⚠️ A variante `sed -n '/export type {/,/} from/p' … | grep -cE '^\s+[A-Z]'`
> devolve **29**, não 31: o bloco de `feature-flag.ts` está numa linha só
> (`export type { FeatureFlagDto, UpdateFeatureFlagInputDto } from …`) e os
> dois nomes ficam depois do `{`, não no início de uma linha.

## §5. Regras de manutenção

- **Um tipo, um dono.** Se o mesmo shape aparece no web e na api, ele mora
  aqui — em vez de ser reescrito nos dois lados.
- **O `:id` de toda rota é UUID, não slug.** Nenhuma rota aceita slug; as
  páginas web recebem slug na URL e resolvem via `apps/web/lib/perfil.ts`.
- **Nada de tipo sem rota por trás.** Tipo que a API nunca devolveu é removido,
  não corrigido — foi o que aconteceu com `AuthorizationOutputDto`,
  `SyncAuthorizationsInputDto` e `ProfileOutputDto`.
- **Um rename no wire quebra os dois `tsc` ao mesmo tempo.** É o elo de
  compilação entre as pontas, e é a razão de o tipo ser a fonte da verdade do
  contrato em vez de um espelho manual.

## §6. Ver mais

- Catálogo de rotas do frontend: [`docs/web/rotas.md`](../../docs/web/rotas.md)
- Referência HTTP da API: [`docs/api/`](../../docs/api/)
- Fluxo do contrato: [`docs/flows/data-and-shared-types/`](../../docs/flows/data-and-shared-types/)
- Convenção de documentação: [`.agents/specs/conventions/documentacao.md`](../../.agents/specs/conventions/documentacao.md)
