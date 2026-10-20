# Plano — Admin editar perfil (nome/descrição) e permissões

> Data: 2026-10-19 · Branch: `feat/admin-editar-perfis` (base `main` @ `39d65ba`)
> Demanda: "usuário admin deve poder editar perfis e permissões dentro do perfil"

## 0. State snapshot (camada 0 — `state-aware-planning`)

| Item | Estado medido |
|---|---|
| Branch | `feat/admin-editar-perfis`, criada de `main` @ `39d65ba` (= `origin/main`) |
| Working tree | 3 modificados (`AGENTS.md`, `apps/api/prisma/seed.ts`, `docs/como-rodar.md`) + `docs/agents/` untracked. Só os 2 últimos são desta sessão; `AGENTS.md` é de outra origem. |
| Runtime | api container `healthy` (`/api/v1/health` → `database: ok`), web `next dev` no host (:3001), Postgres com 13 migrations aplicadas |
| Stack | Next.js 15 / React 19, NestJS 11, Prisma 6.19.3, Vitest 2.1.9 |
| Template | `v1.11.0` |
| Gates que importam | `check-e2e-flow-coverage` (fluxo novo sem linha no inventário = vermelho), coverage web 80% lines/functions/branches — **`app/**/*.tsx` está no `exclude`** (`apps/web/vitest.config.ts:246`), então página RSC não entra no denominador |

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

| Capacidade | Onde |
|---|---|
| Editar **permissões** do perfil pela UI | `apps/web/app/admin/profiles/[slug]/page.tsx:59` (`saveAuthorizations`) + checkboxes (105-127) + `trocarPermissoes` (`lib/perfil.ts:250`) |
| Gate de perfil de sistema na UI | `[slug]/page.tsx:90` — `isSystem` renderiza lista somente-leitura |
| `PATCH /admin/profiles/:id` | `admin-profiles.controller.ts:115`, body `{name, description?}` |
| Client `atualizarPerfil(id, {name, description})` | `lib/perfil.ts:198` — **pronto, com spec unitário (`:359`), e ZERO callers de produção** |
| Domain | `Profile.renomear()` / `alterarDescricao()` (`profile.aggregate.ts:283,293`), version bump, `ProfileUpdatedEvent` |
| Travas | `atualizar` recusa `isSystem` **e** `isAdmin` (`profiles.use-cases.ts:268-273`) |
| e2e das permissões | `e2e/f11-admin-perfil-detalhe.spec.ts` (3 testes) |

### O que FALTA (escopo do pedido)

| # | Gap | Evidência |
|---|---|---|
| G1 | **Não existe edição de `name`/`description` em nenhuma tela.** `[slug]/page.tsx:73-83` mostra os metadados como texto puro | `atualizarPerfil` sem caller |
| G2 | Falta spec unitário da página `[slug]` (única página admin com spec é `flags`) e falta e2e de edição de metadados | `apps/web/app/admin/**/*.spec.tsx` → só `flags` |
| G3 | Nova rota/fluxo exige linha no inventário de fluxos | gate `check-e2e-flow-coverage` |

### Fora de escopo (decidido, não por esquecimento)

- **Excluir perfil** (`deletarPerfil` existe sem caller) — pedido é *editar*, não excluir.
- **`isAdmin`/`isSystem` editáveis** — proibido por design: não existe mutator no agregado e o input não tem os campos (`profile.aggregate.ts:143-146`).
- **Zod nos controllers de profiles** — `admin-profiles.controller.ts` usa interface TS crua. Endurecimento real, mas ortogonal: a feature funciona porque os value-objects validam `ProfileName`. Vira issue própria.
- **`app/error.tsx` no admin** — a raiz já tem `app/error.tsx`; o padrão do repo é erro subir para ele (`new/page.tsx:50-53`).

## 2. Tarefas (TDD — Red→Green→Refactor)

| # | Task | RED | GREEN |
|---|---|---|---|
| T1 | spec unitário de `[slug]/page.tsx` — **só render**: `name` e `description` viram inputs com `defaultValue` do perfil; formulário ausente quando `isSystem` **ou** `isAdmin` | spec novo | — |
| T2 | Editar `name`/`description` no detalhe: inputs no lugar dos metadados somente-leitura, Server Action inline `salvarMetadados` → `atualizarPerfil` + `revalidatePath` | — | T1 verde |
| T3 | e2e `f15-admin-editar-perfil.spec.ts` (`// FLUXO: F15`): admin edita nome+descrição, salva e **o banco é lido** (`prismaE2E().profile.findUniqueOrThrow`); segundo caso: perfil `isAdmin` não tem formulário | spec novo | — |
| T4 | Linha F15 no inventário de `e2e-playwright.md` (+ contagem de fluxos) | — | gate `check-e2e-flow-coverage` verde |
| T5 | `pnpm ci:preflight` + coverage web ≥ 80% + prettier + typecheck | — | — |

### Notas de implementação (revisão de 2026-10-19 aplicada)

- **`name` valida 2..80, não "não-vazio"**: `ProfileName` (`profile-name.vo.ts:9-10`) é `MIN_LENGTH=2`, `MAX_LENGTH=80`, com `trim()` antes de medir. O input espelha o VO — `required minLength={2} maxLength={80}` — senão `"a"` e 200 chars viram 400 e caem no `app/error.tsx` genérico, sem mensagem. O precedente em `new/page.tsx` (que põe só `required` no `name`) é o defeito, não o padrão.
- **`description` vazia significa "limpar"**: a action manda o valor como digitado (inclusive `""`). Não copiar o `...(description !== '' ? …)` de `new/page.tsx:57`, que faz vazio significar "manter" e torna impossível apagar a descrição. `alterarDescricao` não tem VO: persiste a string crua.
- **T3 precisa ler o BANCO, não a tela.** `expect(input).toHaveValue(...)` passa **sem gravação nenhuma**: input uncontrolled mantém o valor digitado após o re-render. A prova é `prismaE2E()` (exportado por `e2e/support/dados.ts`; `semearPerfil` devolve o `id`), como em `11-tenant-isolation.e2e.spec.ts:371`. Na tela, assertar o `<h1>` (derivado do servidor), nunca o `value` do input.
- **Não assertar `version` como número fixo**: `atualizar` chama `renomear` **e** `alterarDescricao` (`profiles.use-cases.ts:275-276`), cada um bumpando +1 — um PATCH é **version +2**.
- **`trim()` diverge na tela**: o VO persiste aparado; o input uncontrolled continua mostrando o que foi digitado (`"Editor "`). Divergência visual conhecida, não bug.
- **T1 é render-only por decisão**: com a action inline (igual às outras 4), o comportamento dela não é testável unitariamente — todas as actions com spec moram em `actions.ts`. A prova da escrita é T3 lendo o banco.
- **Gate de metadados ampliado para `isSystem` || `isAdmin`**: `atualizar` recusa os dois (`use-cases.ts:268,271`) e o seed marca todo perfil como `isSystem: true` — sem a condição, o clique leva 403 garantido.

### Notas de implementação

- A action fica **inline** no arquivo, como as outras 4 actions admin — não criar `actions.ts`.
- `revalidatePath` nos mesmos 2 paths que `saveAuthorizations` já usa (`/admin/profiles/[slug]` e `/admin/profiles`).
- Sem estado de loading novo: os formulários admin do repo não desabilitam botão no submit (achado da revisão de `apps/web`, não medido ao vivo) — não pioro nem corrijo fora do escopo.

## 3. Riscos

1. **Gate de inventário**: T3 sem T4 deixa `ci:preflight` vermelho.
2. **Coverage não é a razão de T1**: `app/**/*.tsx` está no `exclude` (`vitest.config.ts:246`) — a página nem entra no denominador. T1 existe porque **não há spec nenhum** para `[slug]/page.tsx` e o render dos metadados ficaria sem verificação.
3. **O caminho de sucesso do `PATCH` nunca rodou contra Prisma real**: use-case unit usa `InMemoryProfileRepo`, o spec do repo tem `updateMany` stubbado, o controller não tem teste do handler `update`, e o único PATCH de e2e (`11-tenant-isolation.e2e.spec.ts:356`) espera **403**. **T3 lendo o banco é a primeira prova do PATCH bem-sucedido** — se ele não fechar essa lacuna, o feature entra em produção sem nenhum caminho verde de verdade.
4. **Concorrência**: `atualizar` usa optimistic lock (`prisma-profile.repository.ts:120-123`); dois admins no mesmo perfil → `ConcurrencyException`. Erro sobe para `app/error.tsx`; sem retry automático.
5. **Divergência visual após `trim`**: o input uncontrolled mostra o que foi digitado, o banco e o `<h1>` mostram o aparado.
