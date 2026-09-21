# Fase 1 — Foundation (Parte 3/4)

> **Continuação** da Fase 1. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation.md)
>
> Esta é a parte 3 de 4 da Fase 1. Pule para a próxima parte ao final.

---

## Task 1.10: Criar `packages/shared-types` (DTOs compartilhados)

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/user.ts`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "@projeto/shared-types",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test:unit": "echo \"no tests\" && exit 0",
    "build": "echo \"no build needed (source-only)\" && exit 0",
    "clean": "rm -rf dist .turbo"
  },
  "devDependencies": {
    "@projeto/tsconfig": "workspace:*",
    "@projeto/eslint-config": "workspace:*",
    "typescript": "^5.6.0",
    "eslint": "^9.12.0"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

