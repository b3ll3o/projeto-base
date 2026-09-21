# Fase 1 — Foundation (Parte 4/4)

> **Continuação** da Fase 1. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation.md)
>
> Esta é a parte 3 de 3 da Fase 1. Pule para a próxima parte ao final.

---

```json
{
  "extends": "@projeto/tsconfig/base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "node_modules", "dist"]
}
```

- [ ] **Step 3: Criar `src/user.ts` (tipos de contrato User)**

```typescript
// packages/shared-types/src/user.ts

export type UUID = string;
export type ISODateString = string;

export interface UserOutputDto {
  id: UUID;
  email: string;
  name: string;
  version: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  createdBy: UUID | null;
  updatedBy: UUID | null;
}

export interface CreateUserInputDto {
  email: string;
  name: string;
}

export interface UpdateUserInputDto {
  email?: string;
  name?: string;
}

export interface RestoreUserInputDto {
  version: number;
  reason?: string;
}

export type AuditOperationType = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface UserHistoryEntryDto {
  version: number;
  previousVersion: number | null;
  operation: AuditOperationType;
  snapshot: UserOutputDto;
  changedAt: ISODateString;
  changedBy: UUID | null;
  reason: string | null;
}

export interface UserArchiveEntryDto {
  id: UUID;
  snapshot: UserOutputDto;
  version: number;
  deletedAt: ISODateString;
  deletedBy: UUID | null;
  reason: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface ProblemDetailsDto {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors?: Array<{ field: string; message: string; code: string }>;
  traceId: string;
}
```

- [ ] **Step 4: Criar `src/index.ts`**

```typescript
export * from './user.js';
```

- [ ] **Step 5: Validar typecheck**

Run: `pnpm --filter @projeto/shared-types typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types
git commit -m "feat(packages): add @projeto/shared-types with user DTOs (User/History/Archive)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.11: Criar `tooling/scripts/` placeholder

**Files:**
- Create: `tooling/scripts/.gitkeep`
- Create: `tooling/scripts/README.md`

- [ ] **Step 1: Criar diretório + README**

```markdown
# tooling/scripts

Scripts utilitários do monorepo, executados via `pnpm tsx tooling/scripts/<name>.ts`.

| Script | Propósito |
|--------|-----------|
| `stack-code-reviewer.ts` | D11 — revisão automática por stack |
| `doc-sync.ts` | D12 — sincronização de docs |
```

- [ ] **Step 2: Commit**

```bash
git add tooling/scripts
git commit -m "chore(tooling): scaffold scripts directory (placeholder)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.12: Validar monorepo completo

- [ ] **Step 1: Rodar todos os comandos orquestrados**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

Expected: tudo passa (ainda não temos apps, mas tooling passa).

- [ ] **Step 2: Validar `turbo`**

Run: `pnpm turbo run build --dry-run=json | jq '.tasks[] | .task' | sort -u`
Expected: lista as tasks configuradas.

- [ ] **Step 3: Commit final de validação (se houver ajustes)**

```bash
git status
# Se houver mudanças:
# git add -A && git commit -m "chore(monorepo): validate foundation phase 1"
```

---

**Próxima fase:** [`fase-02-shared-audit.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-02-shared-audit.md)
