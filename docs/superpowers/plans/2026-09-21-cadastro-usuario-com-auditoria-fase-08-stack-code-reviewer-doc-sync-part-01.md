# Fase 8 — Agents Automation (stack-code-reviewer + doc-sync scripts)

> **Spec:** §6 Impacto cross-cutting — agents automáticos
> **Foco:** Implementar os 2 novos agents como scripts TypeScript executáveis. Cada um aplica regras específicas da stack / mapeia docs → código. Rodam em pre-commit, CI lint, CI PR review.
> **Pré-requisitos:** Fases 1-7 (para que tenham código para revisar).

---

## Task 8.1: Script base `tooling/scripts/lib/stack-detector.ts`

**Files:**
- Create: `tooling/scripts/lib/stack-detector.ts`

- [ ] **Step 1: Criar detector**

```typescript
// tooling/scripts/lib/stack-detector.ts
export type Stack = 'nestjs' | 'nextjs' | 'prisma' | 'ddd-hexagonal' | 'monorepo' | 'shared';

export interface DetectionResult {
  file: string;
  stacks: Stack[];
}

/** Mapeia path de arquivo para stacks aplicáveis. */
export function detectStack(file: string): Stack[] {
  const stacks: Stack[] = [];
  const f = file.replace(/\\/g, '/');

  // DDD + Hexagonal (qualquer arquivo dentro de domain/)
  if (/\/(domain)\//.test(f)) stacks.push('ddd-hexagonal');

  // NestJS
  if (/apps\/api\/src\//.test(f)) stacks.push('nestjs');
  if (/\.controller\.ts$/.test(f) && /apps\/api\//.test(f)) stacks.push('nestjs');

  // Next.js
  if (/apps\/web\//.test(f)) stacks.push('nextjs');
  if (/\/app\//.test(f) && /apps\/web\//.test(f)) stacks.push('nextjs');

  // Prisma
  if (/prisma\/schema\.prisma$/.test(f)) stacks.push('prisma');
  if (/infrastructure\/persistence\//.test(f)) stacks.push('prisma');

  // Monorepo
  if (/^(apps|packages|tooling)\//.test(f)) stacks.push('monorepo');

  if (stacks.length === 0) stacks.push('shared');
  return stacks;
}

export function detectStacksBatch(files: string[]): DetectionResult[] {
  return files.map((f) => ({ file: f, stacks: detectStack(f) }));
}
```

- [ ] **Step 2: Teste**

```typescript
// tooling/scripts/lib/stack-detector.spec.ts
import { describe, it, expect } from 'vitest';
import { detectStack } from './stack-detector.js';

describe('detectStack', () => {
  it('domain → ddd-hexagonal', () => {
    expect(detectStack('apps/api/src/modules/users/domain/user.aggregate.ts')).toContain('ddd-hexagonal');
  });
  it('prisma schema → prisma', () => {
    expect(detectStack('apps/api/prisma/schema.prisma')).toContain('prisma');
  });
  it('next page → nextjs', () => {
    expect(detectStack('apps/web/app/page.tsx')).toContain('nextjs');
  });
  it('shared package → shared', () => {
    expect(detectStack('packages/tsconfig/base.json')).toContain('monorepo');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/lib/stack-detector.ts tooling/scripts/lib/stack-detector.spec.ts
git commit -m "feat(tooling): add stack detector helper (shared between agents)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8.2: Script `tooling/scripts/stack-code-reviewer.ts`

**Files:**
- Create: `tooling/scripts/stack-code-reviewer.ts`

- [ ] **Step 1: Criar regras por stack**

```typescript
// tooling/scripts/stack-code-reviewer.ts
import { readFileSync } from 'node:fs';
import { detectStacksBatch, type Stack } from './lib/stack-detector.js';

type Severity = 'blocker' | 'major' | 'minor' | 'info';
interface Finding {
  severity: Severity;
  category: string;
  rule: string;
  file: string;
  line?: number;
  description: string;
  evidence: string;
  recommendation: string;
  references: string[];
}
interface ReviewReport {
  approved: boolean;
  scope: { files_reviewed: number; stacks_detected: Stack[]; rules_applied: number };
  summary: string;
  findings: Finding[];
  metrics: { findings_by_severity: Record<Severity, number> };
}

const DDD_BLOCKED_IMPORTS = [
  /^@nestjs\//, /^@prisma\//, /^prisma\//,
  /class-validator/, /class-transformer/, /^reflect-metadata$/, /^rxjs$/,
];

function checkDomain(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const m = /^import .* from ['"]([^'"]+)['"]/.exec(line);
    if (!m) return;
    const src = m[1];
    if (DDD_BLOCKED_IMPORTS.some((re) => re.test(src))) {
      findings.push({
        severity: 'blocker',
        category: 'ddd-purity',
        rule: 'ddd-h1-no-framework-imports-in-domain',
        file,
        line: idx + 1,
        description: `domain/ importa '${src}' — viola pureza do núcleo`,
        evidence: line.trim(),
        recommendation: 'Mover para infrastructure/ ou application/',
        references: [
          'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md §1',
        ],
      });
    }
  });
  return findings;
}

function checkPrisma(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  if (!file.endsWith('schema.prisma')) return findings;

  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(content)) !== null) {
    const name = m[1];
    const body = m[2];
    const isAux = name.endsWith('History') || name.endsWith('Archive');
    if (isAux) continue;
    const needs = [
      { field: 'createdAt', re: /createdAt\s+DateTime/ },
      { field: 'updatedAt', re: /updatedAt\s+DateTime/ },
      { field: 'version', re: /version\s+Int/ },
    ];
    for (const { field, re } of needs) {
      if (!re.test(body)) {
        findings.push({
          severity: 'blocker',
          category: 'audit-fields',
          rule: 'prisma-required-audit-fields',
          file,
          description: `Model '${name}' sem campo obrigatório '${field}'`,
          evidence: body.slice(0, 100),
          recommendation: `Adicionar '${field}' ao model.`,
          references: [
            'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md',
          ],
        });
      }
    }
  }
  return findings;
}

function checkNestController(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  if (!/\.controller\.ts$/.test(file)) return findings;
  if (!/^import\s/m.test(content) || !/^import\s.*@nestjs\/common/m.test(content)) return findings;
  if (!/@Controller\(/.test(content)) {
    findings.push({
      severity: 'blocker',
      category: 'nestjs',
      rule: 'nestjs-controller-required',
      file,
      description: 'Arquivo controller.ts sem @Controller() decorator',
      evidence: '(primeiros 200 chars)',
      recommendation: 'Adicionar @Controller("rota")',
      references: [],
    });
  }
  return findings;
}

function checkNextImage(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  if (!/\.(tsx|jsx)$/.test(file)) return findings;
  if (/^\s*<img\s/.test(content)) {
    findings.push({
      severity: 'major',
      category: 'nextjs',
      rule: 'nextjs-img-vs-image',
      file,
      description: '<img> detectado; usar next/image',
      evidence: '<img',
      recommendation: 'Substituir por <Image> de next/image',
      references: [],
    });
  }
  return findings;
}

export function reviewFiles(files: string[]): ReviewReport {
  const findings: Finding[] = [];
  const stacks = new Set<Stack>();
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, 'utf-8');
    } catch (err) {
      continue;
    }
    for (const s of detectStacksBatch([f])[0].stacks) stacks.add(s);
    findings.push(...checkDomain(f, content));
    findings.push(...checkPrisma(f, content));
    findings.push(...checkNestController(f, content));
    findings.push(...checkNextImage(f, content));
  }

  const counts: Record<Severity, number> = { blocker: 0, major: 0, minor: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  const blockers = counts.blocker;
  const majors = counts.major;
  const approved = blockers === 0 && majors <= 3;

  return {
    approved,
    scope: { files_reviewed: files.length, stacks_detected: Array.from(stacks), rules_applied: 4 },
    summary: `${findings.length} finding(s) — ${blockers} blocker, ${majors} major`,
    findings,
    metrics: { findings_by_severity: counts },
  };
}

function parseArgs(): { files: string[]; mode: string; outFile: string } {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  for (const a of args) {
    const [k, v] = a.replace(/^--/, '').split('=');
    opts[k] = v ?? 'true';
  }
  const files = (opts['files'] ?? '').split('\n').filter(Boolean);
  return {
    files,
    mode: opts['mode'] ?? 'pre-commit',
    outFile: opts['out-file'] ?? 'stack-review-report.json',
  };
}

function main(): void {
  const { files, mode, outFile } = parseArgs();
  if (files.length === 0) {
    console.log('✓ Nenhum arquivo para revisar');
    return;
  }
  const report = reviewFiles(files);
  require('node:fs').writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`[stack-code-reviewer] mode=${mode} files=${files.length}`);
  console.log(report.summary);
  for (const f of report.findings) {
    console.log(`  [${f.severity}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.description}`);
  }
  if (!report.approved) {
    console.error(`✗ Não aprovado (blocker=${report.metrics.findings_by_severity.blocker})`);
    process.exit(1);
