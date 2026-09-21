# Fase 10 — Docs, ADR, PR (Parte 2/4)

> **Continuação** da Fase 10. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing.md)
>
> Esta é a parte 2 de 3 da Fase 10. Pule para a próxima parte ao final.

---


Esperado: 100% no domain, ≥ 90% no application.

## Output

```yaml
result:
  agent: ddd-hexagonal-validation
  status: success | violations_found

  output:
    module: <module_path>
    findings:
      - severity: blocker
        rule: domain-imports-framework
        file: <file>:<line>
        description: "domain importa @nestjs/common"
        recommendation: "Mover para application/"
      - severity: major
        rule: missing-port
        file: <nenhum>
        description: "Use case depende de classe concreta, não de port"
        recommendation: "Criar interface em domain/ports/"
    summary: "2 blocker(s), 3 major(s)"
    coverage:
      domain: "100%"
      application: "92%"
      infrastructure: "85%"
    approved: false
```

## Anti-padrões

- ❌ Pular validação em refactor pequeno — sempre auditar.
- ❌ Aprovar com qualquer blocker.
- ❌ Sugerir renomear camadas (são convenção do projeto).
- ❌ Criticar estilo (formatação, naming); foco é arquitetura.

## Coordenação

| Agent | Relação |
|-------|---------|
| `nestjs-specialist` | Carrego lentes de DDD + Hexagonal; ele carrega NestJS puro |
| `stack-code-reviewer` | Eu valido manualmente; ele automatiza via regex/AST |
| `code-reviewer` | Revisão geral; eu foco arquitetura |
| `security-auditor` | Não duplico OWASP |

## Métricas de qualidade

- **Domain purity score:** 100% (qualquer framework = blocker)
- **Boundary violations:** 0
- **Coverage:** domain 100%, application ≥ 90%, infra ≥ 80%
```

- [ ] **Step 2: Adicionar skill ao `AGENTS.md` / `.agents/skills/`**

```bash
mkdir -p .agents/skills/ddd-hexagonal-validation
git add .agents/skills/ddd-hexagonal-validation/SKILL.md
git commit -m "feat(skills): add ddd-hexagonal-validation skill

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10.3: Atualizar `AGENTS.md` com a skill

**Files:**
- Modify: `AGENTS.md` (verificar se já menciona; adicionar referência)

- [ ] **Step 1: Adicionar entrada no índice de skills**

Adicionar linha na seção de skills:

```markdown
- [`ddd-hexagonal-validation`](.agents/skills/ddd-hexagonal-validation/SKILL.md) — auditoria manual de conformidade DDD + Hexagonal
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add ddd-hexagonal-validation skill to index

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10.4: README do módulo users

**Files:**
- Create: `apps/api/src/modules/users/README.md`

- [ ] **Step 1: Criar README do módulo**

```markdown
# Módulo `users`

Cadastro de usuários com auditoria completa.

## Estrutura DDD/Hexagonal

```text
users/
  domain/
    user.aggregate.ts          # Aggregate root
    value-objects/             # UserId, Email, UserName, AuditTimestamps
    events/                    # UserCreated, UserUpdated, UserDeleted, UserRestored
    ports/                     # UserRepositoryPort
    exceptions/                # UserNotFound, EmailAlreadyInUse, Concurrency, etc.
  application/
    use-cases/                 # CreateUser, UpdateUser, GetUser, ListUsers, SoftDelete, Restore, GetHistory
    dto/                       # CreateUserDto, UpdateUserDto, RestoreUserDto
    mappers/                   # User → UserOutputDto
  infrastructure/
    http/users.controller.ts   # NestJS controller com If-Match
    persistence/               # PrismaUserRepository + InMemory
```

## Endpoints HTTP

| Método | Path                          | Auth | Headers obrigatórios |
|--------|-------------------------------|------|----------------------|
| `POST`   | `/api/v1/users`             | Bearer | - |
| `GET`    | `/api/v1/users`             | Bearer | - |
| `GET`    | `/api/v1/users/:id`         | Bearer | - |
| `PATCH`  | `/api/v1/users/:id`         | Bearer | `If-Match: W/"v<n>"` |
| `DELETE` | `/api/v1/users/:id`         | Bearer | `If-Match: W/"v<n>"` |
| `POST`   | `/api/v1/users/:id/restore` | Bearer | `If-Match: W/"v<n>"` |
| `GET`    | `/api/v1/users/:id/history` | Bearer | - |

## Tabelas

- `users` — estado atual (incluindo `deletedAt` para soft delete)
- `users_history` — 1 linha por versão com snapshot JSONB
- `users_archive` — lixeira viva (1 linha por entidade deletada)

## Use cases (resumo)

| Use case | Lê | Escreve | Auditoria |
|----------|-----|---------|-----------|
| `CreateUserUseCase` | repo.findByEmail | repo.save | INSERT |
| `UpdateUserUseCase` | repo.findById | repo.updateWithLock | UPDATE |
| `GetUserUseCase` | repo.findById | - | - |
| `ListUsersUseCase` | repo.list | - | - |
| `SoftDeleteUserUseCase` | repo.findById | repo.softDelete | DELETE + archive |
| `RestoreUserUseCase` | repo.restore | repo.updateWithLock | RESTORE |
| `GetUserHistoryUseCase` | audit.listHistory | - | - |

## Testes

- Domain: 100% cobertura (`*.aggregate.ts`, `*.vo.ts`).
- Application: ≥ 90% (`*.use-case.ts`).
- Infrastructure: ≥ 80% (repo + controller).
- E2E: 6 cenários cobrindo CRUD, concurrency, restore, history.

## Como rodar

```bash
# Subir Postgres
docker compose up -d postgres

# Rodar migrations
pnpm --filter @projeto/api exec prisma migrate dev

# Subir API
pnpm --filter @projeto/api dev

# Testar endpoint
curl -X POST http://localhost:3000/api/v1/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@b.com","name":"Alice"}'
```

## Auditoria (compliance)

Toda mutação é registrada em `users_history` com:

- `entityId`, `version`, `previousVersion`
- `operation` (`INSERT` | `UPDATE` | `DELETE` | `RESTORE`)
- `snapshot` (JSONB completo do estado)
- `changedAt`, `changedBy`, `reason`

Soft deletes adicionalmente registram snapshot em `users_archive` (lixeira viva).
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/README.md
git commit -m "docs(users): add module README

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10.5: Atualizar `docs/STACK.md` com auditoria

**Files:**
- Modify: `docs/STACK.md` (adicionar seção de auditoria)

- [ ] **Step 1: Adicionar seção**

Acrescentar (preservando estrutura existente):

```markdown
## Auditoria de Dados (D3-D8)

Todas as entidades do projeto seguem o padrão de auditoria completa:

### Estrutura por entidade

```text
X (tabela principal)
XHistory (1 linha por versão, snapshot JSONB)
XArchive (lixeira viva para soft delete)
```

### Campos obrigatórios em `X`

```prisma
createdAt   DateTime  @default(now())
createdBy   String?   @db.Uuid
updatedAt   DateTime  @updatedAt
updatedBy   String?   @db.Uuid
deletedAt   DateTime?
deletedBy   String?   @db.Uuid
version     Int       @default(1)
```

### Optimistic Locking

- HTTP `If-Match: W/"v<n>"` em PATCH/DELETE/restore.
- Resposta retorna `ETag: W/"v<n+1>"`.
- Conflito → `412 Precondition Failed`, code `CONCURRENCY_CONFLICT`.

### Agents Automáticos

- `stack-code-reviewer` valida audit fields em todo PR.
- `doc-sync` mantém `docs/STACK.md` atualizado quando schema muda.
- ESLint rule `no-domain-imports-from-infra` bloqueia poluição do domain.
```

- [ ] **Step 2: Commit**

```bash
git add docs/STACK.md
git commit -m "docs(stack): add audit field section to STACK.md

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10.6: Atualizar `docs/MONOREPO.md` com novos agents

**Files:**
- Modify: `docs/MONOREPO.md`

- [ ] **Step 1: Adicionar seção dos agents**

```markdown
## Agents Automáticos (D11-D12)

O monorepo conta com 2 agents automatizados que rodam em **toda alteração de código**:

### `stack-code-reviewer`

- Lê `.agents/agents/stack-code-reviewer.md`
- Implementado em `tooling/scripts/stack-code-reviewer.ts`
- Roda em: pre-commit (Husky) + CI `review-stack.yml`
- Detecta: imports proibidos em `domain/`, audit fields faltando em Prisma, `<img>` em Next.js

### `doc-sync`

- Lê `.agents/agents/doc-sync.md`
- Implementado em `tooling/scripts/doc-sync.ts`
