# Review-Router — Fase 1: Foundation (Tooling + Matriz)

> **Parent plan:** [2026-09-22-review-router-plan.md](./2026-09-22-review-router-plan.md)
> **Spec:** [2026-09-22-review-router-design.md](../specs/2026-09-22-review-router-design.md)

**Fase 1: Foundation**
**Tasks:** 1.0–1.11 (12 tasks)
**Entrega:** Tooling (classifier headless TDD + matrix lint + matriz v1) + PR
**Validação:** `pnpm review:lint` verde + ≥ 17 testes unit PASS + `pnpm ci:local` verde

---

## Fase 1 — Foundation (Tooling + Matriz)

### Task 1.0: Setup branch + commit do design spec

**Files:**
- Create: branch `feat/review-router-agent`
- Modify: working tree

- [ ] **Step 1: Verificar branch atual**

```bash
git branch --show-current
```

Expected: `main`. Se não estiver, pare e reconcilie antes de prosseguir.

- [ ] **Step 2: Criar e checkout da branch**

```bash
git checkout -b feat/review-router-agent
```

Expected: `Switched to a new branch 'feat/review-router-agent'`

- [ ] **Step 3: Verificar spec de design existe**

```bash
ls -la docs/superpowers/specs/2026-09-22-review-router-design.md
```

Expected: arquivo presente (281 linhas).

- [ ] **Step 4: Commit do spec na branch**

```bash
git add docs/superpowers/specs/2026-09-22-review-router-design.md
git commit -m "docs(spec): review-router design (8 seções validadas + decisões D1-D8)"
```

Expected: 1 commit criado.

- [ ] **Step 5: Push da branch**

```bash
git push -u origin feat/review-router-agent
```

Expected: branch criada no remote.

### Task 1.1: Setup do package de tooling (scripts)

**Files:**
- Create: `tooling/scripts/package.json`
- Create: `tooling/scripts/tsconfig.json`
- Modify: root `package.json` (adicionar scripts)

- [ ] **Step 1: Criar `tooling/scripts/package.json`**

```json
{
  "name": "@repo/review-router-tooling",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "jest",
    "review:route": "tsx review-router.ts",
    "review:lint": "tsx lint-review-routing.ts"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Criar `tooling/scripts/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "./dist"
  },
  "include": ["./*.ts"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Instalar dependências**

```bash
cd tooling/scripts && pnpm install
```

Expected: `node_modules` criado, sem erros.

- [ ] **Step 4: Commit**

```bash
git add tooling/scripts/package.json tooling/scripts/tsconfig.json tooling/scripts/pnpm-lock.yaml
git commit -m "chore(tooling): setup package for review-router scripts"
```

### Task 1.2: Review-router classifier — failing test skeleton

**Files:**
- Create: `tooling/scripts/review-router.spec.ts`
- Create: `tooling/scripts/review-router.ts` (skeleton)

- [ ] **Step 1: Escrever teste falho**

```typescript
// tooling/scripts/review-router.spec.ts
import { classify } from './review-router.js';

describe('review-router classifier', () => {
  describe('classify()', () => {
    it('returns empty classification for empty inputs', () => {
      const result = classify({
        paths: [],
        commits: [],
        diff: ''
      });
      expect(result.domains).toEqual([]);
      expect(result.reviewers).toEqual([]);
      expect(result.evidence).toEqual([]);
    });

    it('classifies nestjs path glob', () => {
      const result = classify({
        paths: ['apps/api/src/users/users.controller.ts'],
        commits: ['feat(api): add user endpoint'],
        diff: ''
      });
      expect(result.domains).toContain('nestjs');
      expect(result.reviewers).toContain('nestjs-specialist');
    });
  });
});
```

- [ ] **Step 2: Rodar teste (esperar FAIL)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: FAIL — `Cannot find module './review-router.js'`

- [ ] **Step 3: Criar skeleton mínimo**

```typescript
// tooling/scripts/review-router.ts
export interface ClassifyInput {
  paths: string[];
  commits: string[];
  diff: string;
}

export interface ClassifyResult {
  domains: string[];
  reviewers: string[];
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  signal: 'path_glob' | 'commit_type' | 'diff_pattern';
  pattern: string;
  reviewers_added: string[];
}

export function classify(_input: ClassifyInput): ClassifyResult {
  return { domains: [], reviewers: [], evidence: [] };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  // TODO: implement CLI parsing in Task 1.7
  console.log('CLI not yet implemented');
}
```

- [ ] **Step 4: Rodar teste (esperar PASS)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: PASS (2 testes verde).

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/review-router.ts tooling/scripts/review-router.spec.ts
git commit -m "feat(tooling): review-router classifier skeleton + first tests"
```

