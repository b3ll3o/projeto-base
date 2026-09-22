# Fase 1 — Foundation (Parte 2/4)

> **Continuação** da Fase 1. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation.md)
>
> Esta é a parte 2 de 3 da Fase 1. Pule para a próxima parte ao final.

---


- [ ] **Step 6: Commit**

```bash
git add packages/tsconfig
git commit -m "feat(packages): add @projeto/tsconfig with base/node/react presets

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.6: Criar `packages/eslint-config` com rule custom

**Files:**
- Create: `packages/eslint-config/package.json`
- Create: `packages/eslint-config/index.js`
- Create: `packages/eslint-config/rules/no-domain-imports-from-infra.js`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "@projeto/eslint-config",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./index.js",
  "dependencies": {
    "@eslint/js": "^9.12.0",
    "typescript-eslint": "^8.8.0",
    "eslint-plugin-import": "^2.31.0"
  },
  "peerDependencies": { "eslint": ">=9.0.0" }
}
```

- [ ] **Step 2: Criar regra custom `no-domain-imports-from-infra.js`**

```javascript
// packages/eslint-config/rules/no-domain-imports-from-infra.js
/**
 * Bloqueia imports proibidos em arquivos sob **/domain/**.
 * Domain deve ser TypeScript puro: nada de @nestjs/*, @prisma/*,
 * class-validator, ORM, framework HTTP.
 */
const FORBIDDEN = [
  /^@nestjs\//, /^@prisma\//, /^prisma\//,
  /class-validator/, /class-transformer/, /^reflect-metadata$/, /^rxjs$/,
  /\/infrastructure\//,
];

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Domain layer não pode importar de frameworks, ORM ou infrastructure.',
    },
    schema: [],
    messages: {
      forbidden:
        'Domain layer não pode importar de "{{module}}". Domain deve ser TypeScript puro.',
    },
  },
  create(context) {
    const filename = context.getFilename();
    const inDomain = /[\\/]domain[\\/]/.test(filename);
    if (!inDomain) return {};

    return {
      ImportDeclaration(node) {
        const source = node.source && node.source.value;
        if (typeof source !== 'string') return;
        if (FORBIDDEN.some((re) => re.test(source))) {
          context.report({ node, messageId: 'forbidden', data: { module: source } });
        }
      },
    };
  },
};
```

- [ ] **Step 3: Criar `index.js` da config**

```javascript
// packages/eslint-config/index.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import noDomainImportsFromInfra from './rules/no-domain-imports-from-infra.js';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'ddd-hexagonal': { rules: { 'no-domain-imports-from-infra': noDomainImportsFromInfra } } },
    rules: { 'ddd-hexagonal/no-domain-imports-from-infra': 'error' },
  },
  {
    ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**'],
  },
];
```

- [ ] **Step 4: Instalar + commit**

Run: `pnpm install`

```bash
git add packages/eslint-config
git commit -m "feat(packages): add @projeto/eslint-config with no-domain-imports-from-infra rule (D8)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.7: Criar `.gitignore` monorepo

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Criar `.gitignore`**

```gitignore
node_modules/
.turbo/
dist/
.next/
out/
coverage/
*.tsbuildinfo
.env
.env.local
.env.*.local
!.env.example
.DS_Store
*.log
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.pnpm-store/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore(monorepo): add .gitignore for node/turbo/next coverage

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.8: Configurar Prettier

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Criar `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2: Criar `.prettierignore`**

```text
node_modules/
.turbo/
dist/
.next/
coverage/
pnpm-lock.yaml
*.md
```

- [ ] **Step 3: Commit**

```bash
git add .prettierrc.json .prettierignore
git commit -m "chore(monorepo): configure prettier (100 cols, single quotes, trailing commas)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 1.9: Configurar Husky pre-commit hooks

**Files:**
- Modify: `package.json` (adicionar husky)
- Create: `.husky/pre-commit`
- Create: `.husky/_/husky.sh`

- [ ] **Step 1: Adicionar husky como devDep + preparar**

```bash
pnpm add -D -w husky lint-staged
pnpm exec husky init
```

- [ ] **Step 2: Substituir `.husky/pre-commit` por nossa versão**

```bash
cat > .husky/pre-commit <<'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Rodar lint-staged em arquivos staged
pnpm exec lint-staged

# Rodar stack-code-reviewer em arquivos .ts/.tsx/.prisma
changed_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|prisma)$')
if [ -n "$changed_files" ]; then
  echo "🔍 stack-code-reviewer..."
  pnpm tsx tooling/scripts/stack-code-reviewer.ts --files="$changed_files" --mode=pre-commit || exit 1
  echo "📝 doc-sync..."
  pnpm tsx tooling/scripts/doc-sync.ts --files="$changed_files" --mode=incremental --auto-apply-minor=true || exit 1
fi
EOF
chmod +x .husky/pre-commit
```

- [ ] **Step 3: Adicionar config `lint-staged` em `package.json`**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
    "*.md": ["prettier --write"],
    "*.{json,yaml,yml}": ["prettier --write"]
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add .husky package.json
git commit -m "chore(hooks): configure husky + lint-staged + pre-commit (stack-code-reviewer + doc-sync)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

