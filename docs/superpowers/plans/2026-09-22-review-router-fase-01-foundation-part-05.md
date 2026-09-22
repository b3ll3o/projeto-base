### Task 1.8: Matrix lint script (TDD)

**Files:**
- Create: `tooling/scripts/lint-review-routing.ts`
- Create: `tooling/scripts/lint-review-routing.spec.ts`

- [ ] **Step 1: Criar teste falho**

```typescript
// tooling/scripts/lint-review-routing.spec.ts
import { lintMatrix } from './lint-review-routing.js';
import { readFileSync } from 'node:fs';

describe('lintMatrix()', () => {
  it('passes for valid matrix', () => {
    const valid = readFileSync('.agents/specs/conventions/review-routing.md', 'utf-8');
    const result = lintMatrix(valid);
    expect(result.errors).toEqual([]);
  });

  it('reports error for malformed YAML', () => {
    const md = `\`\`\`yaml\npath_globs:\n  - pattern: [invalid\n\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/yaml/i);
  });

  it('warns when referenced reviewer does not exist', () => {
    const md = `\`\`\`yaml\npath_globs:\n  - pattern: "x"\n    reviewers: [non-existent-agent]\n\`\`\``;
    const result = lintMatrix(md);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/non-existent-agent/);
  });

  it('rejects duplicate pattern definitions', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [a]
  - pattern: "apps/api/**"
    reviewers: [b]
\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.some(e => e.includes('duplicate'))).toBe(true);
  });

  it('checks LOC limit (max 300 lines)', () => {
    const md = 'x\n'.repeat(350);
    const result = lintMatrix(md);
    expect(result.errors.some(e => e.includes('LOC'))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar teste (esperar FAIL)**

```bash
cd tooling/scripts && pnpm test -- lint-review-routing.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implementar lint script**

```typescript
// tooling/scripts/lint-review-routing.ts
import { loadMatrix } from './review-router.js';
import * as YAML from 'yaml';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface LintResult {
  errors: string[];
  warnings: string[];
  info: string[];
}

const MAX_LOC = 300;

export function lintMatrix(markdown: string, knownReviewers?: string[]): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // LOC check
  const lineCount = markdown.split('\n').length;
  if (lineCount > MAX_LOC) {
    errors.push(`LOC ${lineCount} exceeds maximum ${MAX_LOC}`);
  }

  // Parse YAML blocks
  const yamlBlocks = markdown.matchAll(/```yaml\n([\s\S]*?)```/g);
  const seenPatterns = new Set<string>();
  let matrix;

  try {
    matrix = loadMatrix(markdown);
  } catch (e: any) {
    errors.push(`YAML parse error: ${e.message}`);
    return { errors, warnings, info };
  }

  // Check path_globs
  for (const rule of matrix.path_globs ?? []) {
    if (seenPatterns.has(rule.pattern)) {
      errors.push(`duplicate pattern: ${rule.pattern}`);
    }
    seenPatterns.add(rule.pattern);

    if (knownReviewers) {
      for (const reviewer of rule.reviewers) {
        if (!knownReviewers.includes(reviewer)) {
          warnings.push(`reviewer not found in .agents/agents/: ${reviewer}`);
        }
      }
    }
  }

  // Check commit_types reviewers
  for (const [type, rule] of Object.entries(matrix.commit_types ?? {})) {
    if (knownReviewers) {
      for (const reviewer of rule.reviewers_added ?? []) {
        if (!knownReviewers.includes(reviewer)) {
          warnings.push(`reviewer not found in .agents/agents/: ${reviewer} (commit_type: ${type})`);
        }
      }
    }
  }

  // Check diff_patterns regex validity
  for (const rule of matrix.diff_patterns ?? []) {
    try {
      new RegExp(rule.regex);
    } catch (e: any) {
      errors.push(`invalid regex in diff_patterns: ${rule.regex} (${e.message})`);
    }
  }

  return { errors, warnings, info };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const matrixFile = args.find(a => a.startsWith('--matrix='))?.split('=')[1];
  const agentsDir = args.find(a => a.startsWith('--agents='))?.split('=')[1] ?? '.agents/agents/';

  if (!matrixFile) {
    console.error('Usage: lint-review-routing.ts --matrix=<file> [--agents=<dir>]');
    process.exit(2);
  }

  const content = readFileSync(matrixFile, 'utf-8');
  const knownReviewers = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    : undefined;

  const result = lintMatrix(content, knownReviewers);

  for (const e of result.errors) console.error(`ERROR: ${e}`);
  for (const w of result.warnings) console.warn(`WARN: ${w}`);
  for (const i of result.info) console.log(`INFO: ${i}`);

  process.exit(result.errors.length > 0 ? 1 : 0);
}
```

- [ ] **Step 4: Rodar testes (esperar PASS — exceto o que requer matrix file existente)**

```bash
cd tooling/scripts && pnpm test -- lint-review-routing.spec.ts
```

Expected: 4 testes PASS (o primeiro que depende do matrix file real só vai passar após Task 1.9).

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/lint-review-routing.ts tooling/scripts/lint-review-routing.spec.ts
git commit -m "feat(tooling): matrix lint script (validates YAML + reviewer refs + LOC)"
```

### Task 1.9: Criar a matriz inicial (`review-routing.md`)

**Files:**
- Create: `.agents/specs/conventions/review-routing.md`

- [ ] **Step 1: Criar arquivo com frontmatter + 4 blocos YAML**

```markdown
---
name: review-routing
version: 1
updated: 2026-09-22
maintainer: review-router
---

# Convenção: review-routing (matriz de roteamento de revisores)

> Fonte da verdade que o `review-router` consulta para decidir quais
> reviewers despachar após cada task. Edite aqui quando:
> - Novo specialist agent for criado em `.agents/agents/`
> - Nova classe de arquivos surgir (ex: novo app `apps/landing/`)
> - Regra de skip precisar ajuste

## 1. PATH GLOBS

```yaml
path_globs:
  - pattern: "apps/api/**/domain/**"
    reviewers: [nestjs-specialist, stack-code-reviewer]
    stacks: [ddd-hexagonal]
    rationale: "Pureza DDD é crítica em domain/"

  - pattern: "apps/api/**/application/**"
    reviewers: [nestjs-specialist, stack-code-reviewer]
    stacks: [ddd-hexagonal]

  - pattern: "apps/api/**/infrastructure/**"
    reviewers: [nestjs-specialist, stack-code-reviewer]
    stacks: [nestjs]

  - pattern: "apps/api/**/*.controller.ts"
    reviewers: [nestjs-specialist, stack-code-reviewer]

  - pattern: "apps/api/prisma/**"
    reviewers: [nestjs-specialist, stack-code-reviewer, doc-sync]
    stacks: [prisma]

  - pattern: "apps/web/app/**"
    reviewers: [nextjs-specialist, stack-code-reviewer]

  - pattern: "apps/web/components/**"
    reviewers: [nextjs-specialist]

  - pattern: "packages/**"
    reviewers: [monorepo-specialist, stack-code-reviewer]

  - pattern: "pnpm-workspace.yaml"
    reviewers: [monorepo-specialist]
    blocking: true

  - pattern: "turbo.json"
    reviewers: [monorepo-specialist]
    blocking: true

  - pattern: "tsconfig*.json"
    reviewers: [monorepo-specialist]

  - pattern: ".agents/agents/**"
    reviewers: [agent-architect, doc-sync]

  - pattern: ".agents/skills/**"
    reviewers: [agent-architect, doc-sync]

  - pattern: ".agents/workflows/**"
    reviewers: [agent-architect]

  - pattern: ".agents/specs/**"
    reviewers: [doc-sync]

  - pattern: ".agents/memory/**"
    reviewers: [agent-architect]

  - pattern: "docs/**"
    reviewers: [doc-sync, doc-writer]

  - pattern: "docs/adr/**"
    reviewers: [doc-writer]

  - pattern: "tooling/scripts/ci/**"
    reviewers: [monorepo-specialist]

  - pattern: ".github/workflows/**"
    reviewers: [monorepo-specialist, security-auditor]

  - pattern: "**/auth/**"
    reviewers: [security-auditor, nestjs-specialist]
    blocking_if_diff_matches: ["jwt", "bcrypt", "session", "cookie"]

  - pattern: "**/*.test.ts"
    reviewers: [test-writer]

  - pattern: "**/*.spec.ts"
    reviewers: [test-writer]
```

## 2. COMMIT TYPES (Conventional Commits)

```yaml
commit_types:
  feat:
    reviewers_added: [stack-code-reviewer]
  fix:
    reviewers_added: []
    conditional:
      - if_path_matches: "**/auth/**"
        reviewers_added: [security-auditor]
  refactor:
    reviewers_added: [stack-code-reviewer, refactorer]
  perf:
    reviewers_added: []
  docs:
    reviewers_added: [doc-sync]
    may_skip: [code-quality-reviewer]
  chore:
    may_skip: [spec-compliance-reviewer]
  ci:
    reviewers_added: [monorepo-specialist]
  test:
    reviewers_added: [test-writer]
```

## 3. DIFF PATTERNS (regex)

```yaml
diff_patterns:
  # NestJS
  - regex: "@(Injectable|Controller|Module|Get|Post|Put|Delete|Patch)\\("
    reviewers_added: [nestjs-specialist]
  - regex: "class-validator|@IsEmail|@IsUUID|@IsNotEmpty"
    reviewers_added: [nestjs-specialist]

  # Next.js
  - regex: "'use client'|useEffect|useState"
    reviewers_added: [nextjs-specialist]
  - regex: "next/image|next/font"
    reviewers_added: [nextjs-specialist]

  # DDD
  - regex: "static\\s+(criar|create)\\("
    reviewers_added: [nestjs-specialist, stack-code-reviewer]

  # Security (always)
  - regex: "bcrypt|argon2|hash\\(|jwt\\.sign|jwt\\.verify"
    reviewers_added: [security-auditor]
    blocking: true
  - regex: "process\\.env\\.|secrets?\\.|credentials?\\."
    reviewers_added: [security-auditor]
    blocking: true
  - regex: "\\$queryRaw|\\$executeRaw"
    reviewers_added: [security-auditor]

  # Monorepo
  - regex: "workspace:\\*"
    reviewers_added: [monorepo-specialist]

  # Prisma
  - regex: "prisma\\.\\w+\\.(create|find|update|delete|upsert)"
    reviewers_added: [stack-code-reviewer]
```

## 4. SKIP HEURISTICS

```yaml
skip_rules:
  spec-compliance-reviewer:
    skip_if:
      - "task.scope == 'trivial' AND files_changed <= 1"
      - "commit_type == 'chore' AND task.scope != 'large'"
      - "all_changed_paths endsWith .md OR .txt"
    rationale: "Spec irrelevante para housekeeping"

  code-quality-reviewer:
    skip_if:
      - "all_changed_paths endsWith .md OR .txt"
      - "task.scope == 'docs'"
    rationale: "Sem código, sem quality de código"

always_on:
  - spec-compliance-reviewer
  - code-quality-reviewer
```

## 5. Histórico de Versões

| Versão | Data | Mudança |
|--------|------|---------|
| 1 | 2026-09-22 | Versão inicial |
```

- [ ] **Step 2: Verificar LOC ≤ 300**

```bash
wc -l .agents/specs/conventions/review-routing.md
```

Expected: ≤ 300 linhas.

- [ ] **Step 3: Rodar lint script**

```bash
cd tooling/scripts && pnpm review:lint --matrix=../../.agents/specs/conventions/review-routing.md --agents=../../.agents/agents/
```

Expected: 0 errors, alguns warnings (reviewer refs que ainda não existem em `.agents/agents/`, ex: `refactorer`, `test-writer`, etc. — todos já existem na verdade).

- [ ] **Step 4: Rodar TODOS os testes (lint + classifier)**

```bash
cd tooling/scripts && pnpm test
```

Expected: TODOS os testes PASS (lint agora passa o teste que dependia do matrix file real).

- [ ] **Step 5: Commit**

```bash
git add .agents/specs/conventions/review-routing.md
git commit -m "feat(agents): review-routing matrix v1 (path globs + commit types + diff patterns + skip rules)"
```

### Task 1.10: Update root package.json scripts + lint preflight

**Files:**
- Modify: root `package.json`
- Modify: `.tooling/scripts/ci/preflight.ts` (adicionar check para review-routing.md)

- [ ] **Step 1: Adicionar scripts ao root package.json**

```json
{
  "scripts": {
    "review:route": "cd tooling/scripts && pnpm review:route",
    "review:lint": "cd tooling/scripts && pnpm review:lint --matrix=../../.agents/specs/conventions/review-routing.md --agents=../../.agents/agents/"
  }
}
```

- [ ] **Step 2: Rodar lint via root**

```bash
pnpm review:lint
```

Expected: passa (mesmo resultado que Step 1.9.3).

- [ ] **Step 3: Adicionar preflight check**

Localizar `.tooling/scripts/ci/preflight.ts` e adicionar chamada:

```typescript
// Adicionar ao array de checks
import { execSync } from 'node:child_process';

// ... no main():
try {
  execSync('pnpm review:lint', { stdio: 'inherit' });
} catch (e) {
  console.error('review:lint falhou');
  process.exit(1);
}
```

- [ ] **Step 4: Rodar preflight completo**

```bash
pnpm ci:preflight
```

Expected: verde (todos os checks passam, incluindo novo review:lint).

- [ ] **Step 5: Commit**

```bash
git add package.json .tooling/scripts/ci/preflight.ts
git commit -m "chore(tooling): wire review:lint into root scripts + preflight"
```

### Task 1.11: PR da Fase 1

- [ ] **Step 1: Verificar working tree limpo**

```bash
git status
```

Expected: limpo (todos commits feitos).

- [ ] **Step 2: Rodar `pnpm ci:local`**

```bash
pnpm ci:local
```

Expected: 3 camadas de defesa passam (pre-push + preflight + quality job local).

- [ ] **Step 3: Push e abrir PR**

```bash
git push
gh pr create --base main --title "feat(agents): review-router foundation (classifier + matrix + lint)" --body "Fase 1 do design review-router. Adiciona classificador headless (TDD), matrix v1, lint script. Sem mudança de behavior — tooling standalone."
```

Expected: PR aberto, CI passa.

- [ ] **Step 4: Aguardar review de 2 agentes + merge**

Após review aprovado: `gh pr merge --squash`.

---

