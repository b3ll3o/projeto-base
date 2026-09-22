# Fase 8 — Agents Automation (Parte 3/3)

> **Continuação** da Fase 8. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-08-stack-code-reviewer-doc-sync.md)
>
> Esta é a parte 3 de 3 da Fase 8. Pule para a próxima parte ao final.

---

    const report = syncDocs(['apps/api/prisma/schema.prisma']);
    expect(report.actions.length).toBeGreaterThan(0);
  });

  it('arquivos monorepo não disparam sync', () => {
    const report = syncDocs(['package.json']);
    expect(report.actions).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/doc-sync.ts tooling/scripts/doc-sync.spec.ts
git commit -m "feat(agents): implement doc-sync script (D12)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8.4: Adicionar scripts de vitest para tooling

**Files:**
- Create: `tooling/scripts/vitest.config.ts`

- [ ] **Step 1: Vitest config para tooling**

```typescript
// tooling/scripts/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['*.spec.ts', 'lib/*.spec.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Adicionar scripts no package.json raiz**

```json
{
  "scripts": {
    "stack:review": "tsx tooling/scripts/stack-code-reviewer.ts",
    "docs:sync": "tsx tooling/scripts/doc-sync.ts",
    "tooling:test": "cd tooling/scripts && pnpm exec vitest run"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/vitest.config.ts package.json
git commit -m "chore(tooling): add vitest config for agent scripts

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8.5: GitHub Actions workflow `review-stack.yml`

**Files:**
- Create: `.github/workflows/review-stack.yml`

- [ ] **Step 1: Criar workflow**

```yaml
name: stack-code-review
on:
  pull_request:
    paths:
      - 'apps/**'
      - 'packages/**'
      - 'tooling/**'
      - '.agents/**'

jobs:
  review:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run stack-code-reviewer
        env:
          CHANGED_FILES: ${{ github.event.pull_request.base.ref }}
        run: |
          changed=$(git diff --name-only origin/${{ github.base_ref }}...HEAD | grep -E '\.(ts|tsx|prisma)$' || true)
          if [ -n "$changed" ]; then
            echo "$changed" | tr '\n' '\0' > /tmp/files.txt
            pnpm stack:review --files="$(cat /tmp/files.txt)" --mode=ci --out-file=stack-review-report.json
          fi
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: stack-review-report
          path: stack-review-report.json
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/review-stack.yml
git commit -m "ci: add stack-code-review workflow (D11 auto)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8.6: GitHub Actions workflow `sync-docs.yml`

**Files:**
- Create: `.github/workflows/sync-docs.yml`

- [ ] **Step 1: Criar workflow**

```yaml
name: docs-sync
on:
  pull_request:
    paths:
      - 'apps/**'
      - 'packages/**'
      - 'tooling/**'
      - 'docs/**'
      - '.agents/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run doc-sync
        run: |
          changed=$(git diff --name-only origin/${{ github.base_ref }}...HEAD || true)
          if [ -n "$changed" ]; then
            pnpm docs:sync --files="$changed" --mode=full --out-file=doc-sync-report.json
          fi
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: doc-sync-report
          path: doc-sync-report.json
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/sync-docs.yml
git commit -m "ci: add docs-sync workflow (D12 auto)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8.7: Workflow principal `ci.yml` (test + lint + typecheck + stack + docs)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar workflow**

```yaml
name: ci
on:
  push:
    branches: [feat/**]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: projeto
          POSTGRES_PASSWORD: projeto
          POSTGRES_DB: projeto_base
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://projeto:projeto@localhost:5432/projeto_base?schema=public
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck
      - run: pnpm turbo run test:unit --filter=@projeto/api
      - run: pnpm turbo run test:integration --filter=@projeto/api
      - run: pnpm turbo run test:e2e --filter=@projeto/api
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: main workflow (unit + integration + e2e + lint + typecheck)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8.8: Validar agentes rodando

- [ ] **Step 1: Rodar stack-code-reviewer em arquivos existentes**

```bash
changed=$(git ls-files apps/api/src modules/users --include="*.ts" | head -20)
pnpm stack:review --files="$changed" --out-file=tmp-report.json
cat tmp-report.json | jq '.summary'
```

Expected: relatório gerado.

- [ ] **Step 2: Rodar doc-sync**

```bash
pnpm docs:sync --files="$changed" --out-file=tmp-docs.json
cat tmp-docs.json | jq '.docs_health_score'
```

Expected: ≥ 80 (sem alertas).

- [ ] **Step 3: Rodar testes do tooling**

```bash
pnpm tooling:test 2>&1 | tail -10
```

Expected: passa.

- [ ] **Step 4: Commit (se ajustes)**

```bash
git status
```

---

**Próxima fase:** [`fase-09-tests-e2e.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-09-tests-e2e.md)
