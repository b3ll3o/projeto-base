### Task 1.6: Matrix loader + validator (TDD)

**Files:**
- Modify: `tooling/scripts/review-router.ts`
- Modify: `tooling/scripts/review-router.spec.ts`

- [ ] **Step 1: Adicionar testes para matrix loader**

```typescript
// Adicionar em review-router.spec.ts
import { readFileSync } from 'node:fs';

describe('loadMatrix()', () => {
  it('parses YAML blocks from review-routing.md', () => {
    const md = `
# Title
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [nestjs-specialist]
\`\`\`
`;
    const result = loadMatrix(md);
    expect(result.path_globs).toHaveLength(1);
    expect(result.path_globs[0].pattern).toBe('apps/api/**');
  });

  it('returns empty matrix when no YAML blocks found', () => {
    const md = '# Just markdown, no YAML';
    const result = loadMatrix(md);
    expect(result.path_globs).toBeUndefined();
  });

  it('extracts multiple YAML blocks (path_globs, commit_types, diff_patterns)', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [nestjs-specialist]
\`\`\`
\`\`\`yaml
commit_types:
  feat:
    reviewers_added: [stack-code-reviewer]
\`\`\`
`;
    const result = loadMatrix(md);
    expect(result.path_globs).toHaveLength(1);
    expect(result.commit_types?.feat?.reviewers_added).toContain('stack-code-reviewer');
  });
});
```

- [ ] **Step 2: Rodar testes (esperar FAIL)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: FAIL — `loadMatrix` not exported.

- [ ] **Step 3: Implementar matrix loader**

```yaml
# Adicionar dependência em tooling/scripts/package.json (devDependencies):
yaml: ^2.5.0
```

```bash
cd tooling/scripts && pnpm install
```

```typescript
// Adicionar em review-router.ts
import * as YAML from 'yaml';

export interface Matrix {
  path_globs?: PathGlobRule[];
  commit_types?: Record<string, CommitTypeRule>;
  diff_patterns?: DiffPatternRule[];
  skip_rules?: Record<string, { skip_if: string[]; rationale?: string }>;
  always_on?: string[];
}

export function loadMatrix(markdown: string): Matrix {
  const yamlBlocks = markdown.matchAll(/```yaml\n([\s\S]*?)```/g);
  const result: Matrix = {};

  for (const match of yamlBlocks) {
    const yamlContent = match[1];
    try {
      const parsed = YAML.parse(yamlContent) as Matrix;
      Object.assign(result, parsed);
    } catch {
      // Skip invalid YAML blocks (will be caught by lint script)
      continue;
    }
  }

  return result;
}
```

- [ ] **Step 4: Rodar testes (esperar PASS)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: PASS — 16 testes verde.

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/review-router.ts tooling/scripts/review-router.spec.ts tooling/scripts/package.json tooling/scripts/pnpm-lock.yaml
git commit -m "feat(tooling): matrix loader (parses YAML blocks from convention md)"
```

### Task 1.7: CLI entrypoint + integration test

**Files:**
- Modify: `tooling/scripts/review-router.ts`
- Modify: `tooling/scripts/review-router.spec.ts`

- [ ] **Step 1: Adicionar teste de integração CLI**

```typescript
// Adicionar em review-router.spec.ts
import { execSync } from 'node:child_process';

describe('CLI entrypoint', () => {
  it('reads paths from --paths file, diff from stdin, emits YAML', () => {
    const tmpPaths = '/tmp/test-paths.txt';
    require('node:fs').writeFileSync(tmpPaths, 'apps/api/src/users.controller.ts\napps/api/prisma/schema.prisma');
    const tmpMatrix = '/tmp/test-matrix.md';
    require('node:fs').writeFileSync(tmpMatrix, `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**/*.ts"
    reviewers: [nestjs-specialist]
\`\`\`
`);

    const result = execSync(
      `cd ${__dirname} && node review-router.ts --paths=${tmpPaths} --matrix=${tmpMatrix}`,
      { input: '@Injectable()\nclass FooService {}', encoding: 'utf-8' }
    );

    expect(result).toContain('nestjs-specialist');
    require('node:fs').unlinkSync(tmpPaths);
    require('node:fs').unlinkSync(tmpMatrix);
  });
});
```

- [ ] **Step 2: Rodar teste (esperar FAIL)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: FAIL — CLI não implementado ainda.

- [ ] **Step 3: Implementar CLI entrypoint**

```typescript
// Substituir o bloco `if (import.meta.url === ...)` no final de review-router.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const pathsFile = args.find(a => a.startsWith('--paths='))?.split('=')[1];
  const matrixFile = args.find(a => a.startsWith('--matrix='))?.split('=')[1];
  const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1];

  if (!pathsFile || !matrixFile) {
    console.error('Usage: review-router.ts --paths=<file> --matrix=<file> [--output=<file>]');
    process.exit(2);
  }

  // Read inputs
  const pathsContent = (await import('node:fs')).readFileSync(pathsFile, 'utf-8');
  const paths = pathsContent.split('\n').filter(p => p.trim());
  const diff = await readStdin();
  const matrixContent = (await import('node:fs')).readFileSync(matrixFile, 'utf-8');

  // Classify
  const matrix = loadMatrix(matrixContent);
  const commits: string[] = []; // CLI takes paths+diff; commits via different flag
  const result = classify({ paths, commits, diff }, matrix);

  // Output
  const yamlOutput = YAML.stringify(result);
  if (outputFile) {
    (await import('node:fs')).writeFileSync(outputFile, yamlOutput);
  } else {
    console.log(yamlOutput);
  }
}

async function readStdin(): Promise<string> {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}
```

- [ ] **Step 4: Rodar teste (esperar PASS)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: PASS — 17 testes verde.

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/review-router.ts tooling/scripts/review-router.spec.ts
git commit -m "feat(tooling): CLI entrypoint for review-router classifier"
```

