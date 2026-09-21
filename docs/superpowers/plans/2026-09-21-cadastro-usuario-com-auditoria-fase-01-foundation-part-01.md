# Fase 1 — Foundation: Scaffold Monorepo

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-design.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-design.md)
> **Foco:** Estrutura base do monorepo (pnpm workspaces, Turborepo, tsconfig, ESLint, packages compartilhados).
> **Pré-requisitos:** Nenhum (primeira fase).

---

## Task 1.1: Inicializar `pnpm-workspace.yaml`

**Files:**
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Criar arquivo**

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tooling/*'
```

- [ ] **Step 2: Verificar que pnpm reconhece workspaces**

Run: `pnpm install --no-frozen-lockfile 2>&1 | head -5`
Expected: instala sem erros (pode criar `pnpm-lock.yaml`).

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore(monorepo): initialize pnpm workspaces

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.2: Criar `package.json` raiz com scripts orquestrados

**Files:**
- Create: `package.json`

- [ ] **Step 1: Criar `package.json` raiz**

```json
{
  "name": "projeto-base",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:e2e": "turbo run test:e2e",
    "tdd:check": "turbo run tdd:check",
    "stack:review": "tsx tooling/scripts/stack-code-reviewer.ts",
    "docs:sync": "tsx tooling/scripts/doc-sync.ts",
    "format": "prettier --write \"**/*.{ts,tsx,md,json,yaml,yml}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json,yaml,yml}\"",
    "clean": "turbo run clean && rm -rf node_modules .turbo"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.6.0",
    "prettier": "^3.3.0",
    "tsx": "^4.19.0",
    "@types/node": "^20.16.0"
  }
}
```

- [ ] **Step 2: Instalar deps raiz**

Run: `pnpm install`
Expected: instala turbo + typescript + prettier + tsx.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(monorepo): add root package.json with orchestrated scripts

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.3: Criar `turbo.json` com pipelines

**Files:**
- Create: `turbo.json`

- [ ] **Step 1: Criar `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local", "tsconfig.base.json"],
  "tasks": {
    "build":     { "dependsOn": ["^build"],            "outputs": ["dist/**", ".next/**"] },
    "dev":       { "cache": false, "persistent": true },
    "lint":      { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"],            "outputs": [] },
    "test":      { "dependsOn": ["^build"],            "outputs": ["coverage/**"] },
    "test:unit": { "outputs": ["coverage/**"] },
    "test:integration": { "cache": false, "outputs": [] },
    "test:e2e":  { "cache": false, "outputs": [] },
    "tdd:check": { "dependsOn": ["test:unit"],         "outputs": [] },
    "stack:review": { "cache": false, "outputs": ["stack-review-report.json"] },
    "docs:sync":    { "cache": false, "outputs": ["doc-sync-report.json"] },
    "ci:quality":   { "dependsOn": ["tdd:check", "stack:review", "docs:sync"], "outputs": [] },
    "clean":     { "cache": false }
  }
}
```

- [ ] **Step 2: Validar JSON**

Run: `cat turbo.json | jq . > /dev/null && echo "✓ JSON válido"`

- [ ] **Step 3: Commit**

```bash
git add turbo.json
git commit -m "chore(monorepo): configure turbo pipelines (build/test/lint/tdd)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.4: Criar `tsconfig.base.json`

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Criar config TS base**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "baseUrl": ".",
    "paths": {
      "@projeto/shared-types": ["./packages/shared-types/src"],
      "@projeto/ui": ["./packages/ui/src"],
      "@projeto/shared-audit": ["./apps/api/src/shared/audit"],
      "@projeto/shared-domain": ["./apps/api/src/shared/domain"]
    }
  },
  "exclude": ["node_modules", "dist", ".next", ".turbo"]
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore(monorepo): add tsconfig.base.json with path aliases

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.5: Criar `packages/tsconfig` (preset compartilhado)

**Files:**
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`
- Create: `packages/tsconfig/node.json`
- Create: `packages/tsconfig/react.json`

- [ ] **Step 1: Criar `packages/tsconfig/package.json`**

```json
{
  "name": "@projeto/tsconfig",
  "version": "0.0.1",
  "private": true,
  "files": ["base.json", "node.json", "react.json"]
}
```

- [ ] **Step 2: Criar `packages/tsconfig/base.json`** (extends root)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json"
}
```

- [ ] **Step 3: Criar `packages/tsconfig/node.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Criar `packages/tsconfig/react.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "incremental": true,
    "allowJs": false,
    "noEmit": true
  }
}
```

- [ ] **Step 5: Instalar + build**

Run: `pnpm install && pnpm --filter @projeto/tsconfig build || echo "(no build script, ok)"`
Expected: instala workspace.
