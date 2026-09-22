# Fase 8 — Agents Automation (Parte 2/3)

> **Continuação** da Fase 8. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-08-stack-code-reviewer-doc-sync.md)
>
> Esta é a parte 2 de 3 da Fase 8. Pule para a próxima parte ao final.

---

  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 2: Teste**

```typescript
// tooling/scripts/stack-code-reviewer.spec.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { reviewFiles } from './stack-code-reviewer.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('stack-code-reviewer', () => {
  it('detecta blocker em domain com import proibido', () => {
    const dir = join(tmpdir(), 'stack-review-test');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'user.spec.ts');
    writeFileSync(file, `import { Injectable } from '@nestjs/common';\n`);
    const report = reviewFiles([file]);
    expect(report.findings.some((f) => f.severity === 'blocker' && f.rule === 'ddd-h1-no-framework-imports-in-domain')).toBe(true);
  });

  it('detecta Prisma sem createdAt', () => {
    const file = '/tmp/test-schema.prisma';
    writeFileSync(file, `model User {\n  id String @id\n  email String\n}\n`);
    const report = reviewFiles([file]);
    expect(report.findings.some((f) => f.rule === 'prisma-required-audit-fields')).toBe(true);
  });

  it('detecta <img> em next component', () => {
    const file = '/tmp/test-component.tsx';
    writeFileSync(file, `export function X() { return <img src="/x.png" />; }\n`);
    const report = reviewFiles([file]);
    expect(report.findings.some((f) => f.rule === 'nextjs-img-vs-image')).toBe(true);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/stack-code-reviewer.ts tooling/scripts/stack-code-reviewer.spec.ts
git commit -m "feat(agents): implement stack-code-reviewer script (D11)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8.3: Script `tooling/scripts/doc-sync.ts`

**Files:**
- Create: `tooling/scripts/doc-sync.ts`

- [ ] **Step 1: Criar script**

```typescript
// tooling/scripts/doc-sync.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { detectStacksBatch } from './lib/stack-detector.js';

type ActionType = 'review' | 'update' | 'create' | 'alert';
interface DocAction {
  type: ActionType;
  doc_file: string;
  section?: string;
  current_text?: string;
  proposed_text?: string;
  reason: string;
  evidence?: { file: string; line: number; code: string };
  severity?: 'minor' | 'major';
  blocking_for_merge?: boolean;
}
interface DocSyncReport {
  status: 'success' | 'no-changes';
  actions: DocAction[];
  files_changed: string[];
  alerts: number;
  docs_health_score: number;
}

interface CodeDocMapping {
  codePattern: RegExp;
  docFiles: string[];
  reason: string;
}

const CODE_DOC_MAPPINGS: CodeDocMapping[] = [
  {
    codePattern: /apps\/api\/src\/modules\/users\/infrastructure\/http\/users\.controller\.ts$/,
    docFiles: [
      'docs/api/users.md',
      'apps/api/openapi.json',
      'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md',
    ],
    reason: 'Controller modificado — verificar contrato HTTP',
  },
  {
    codePattern: /apps\/api\/prisma\/schema\.prisma$/,
    docFiles: [
      'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md',
      'docs/STACK.md',
    ],
    reason: 'Schema Prisma modificado — verificar modelo',
  },
  {
    codePattern: /apps\/api\/src\/modules\/users\/domain\/value-objects\//,
    docFiles: [
      'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md',
    ],
    reason: 'VO modificado — atualizar regras',
  },
  {
    codePattern: /\.agents\/agents\/(stack-code-reviewer|doc-sync)\.md$/,
    docFiles: ['AGENTS.md'],
    reason: 'Agent modificado — atualizar catálogo',
  },
];

function mapCodeToDocFiles(file: string): string[] {
  const matches: string[] = [];
  for (const m of CODE_DOC_MAPPINGS) {
    if (m.codePattern.test(file)) matches.push(...m.docFiles);
  }
  return Array.from(new Set(matches));
}

function checkMissingDoc(file: string): DocAction | null {
  const docs = mapCodeToDocFiles(file);
  for (const d of docs) {
    if (!existsSync(d)) {
      return {
        type: 'create',
        doc_file: d,
        reason: `Doc de referência ausente para ${file}`,
        blocking_for_merge: false,
      };
    }
  }
  return null;
}

function checkIfMatchInPrisma(file: string, content: string): DocAction[] {
  const actions: DocAction[] = [];
  if (!/apps\/api\/prisma\/schema\.prisma$/.test(file)) return actions;
  if (/createdAt/.test(content) && !/AuditOperation/.test(content)) return actions;

  // Detecta novo model sem AuditOperation enum import
  const auditOpRegex = /model\s+\w+\s*{/g;
  const matches = content.match(auditOpRegex) || [];
  for (const _ of matches) {
    actions.push({
      type: 'review',
      doc_file: 'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md',
      reason: 'Verificar se tabela History/Archive correspondente foi criada',
      severity: 'minor',
    });
  }
  return actions;
}

function checkControllerDoc(file: string, content: string): DocAction[] {
  const actions: DocAction[] = [];
  if (!/\.controller\.ts$/.test(file)) return actions;
  if (!/@Post|@Get|@Patch|@Delete/.test(content)) return actions;

  actions.push({
    type: 'review',
    doc_file: 'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md',
    reason: 'Endpoints modificados — verificar tabela de endpoints',
    severity: 'minor',
  });
  return actions;
}

export function syncDocs(files: string[], autoApplyMinor = false): DocSyncReport {
  const actions: DocAction[] = [];
  const filesChanged: string[] = [];
  let alerts = 0;

  for (const f of files) {
    const stacks = detectStacksBatch([f])[0].stacks;
    if (stacks.includes('monorepo')) continue;

    const missing = checkMissingDoc(f);
    if (missing) actions.push(missing);

    let content = '';
    try {
      content = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    actions.push(...checkIfMatchInPrisma(f, content));
    actions.push(...checkControllerDoc(f, content));
  }

  // Auto-apply minor updates (no-op: só registra)
  for (const a of actions) {
    if (a.severity === 'major' && a.type !== 'alert') alerts++;
  }

  const docsHealth = Math.max(0, 100 - alerts * 10);

  return {
    status: actions.length === 0 ? 'no-changes' : 'success',
    actions,
    files_changed: filesChanged,
    alerts,
    docs_health_score: docsHealth,
  };
}

function parseArgs(): { files: string[]; mode: string; autoApplyMinor: boolean; outFile: string } {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (const a of args) {
    const [k, v] = a.replace(/^--/, '').split('=');
    opts[k] = v ?? true;
  }
  const files = String(opts['files'] ?? '').split('\n').filter(Boolean);
  return {
    files,
    mode: String(opts['mode'] ?? 'incremental'),
    autoApplyMinor: opts['auto-apply-minor'] === 'true',
    outFile: String(opts['out-file'] ?? 'doc-sync-report.json'),
  };
}

function main(): void {
  const { files, mode, outFile } = parseArgs();
  if (files.length === 0) {
    console.log('✓ Nenhum arquivo para sincronizar docs');
    return;
  }
  const report = syncDocs(files, false);
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`[doc-sync] mode=${mode} files=${files.length}`);
  console.log(`Actions: ${report.actions.length} | Alerts: ${report.alerts} | Health: ${report.docs_health_score}/100`);
  for (const a of report.actions) {
    console.log(`  [${a.type}] ${a.doc_file} — ${a.reason}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 2: Teste**

```typescript
// tooling/scripts/doc-sync.spec.ts
import { describe, it, expect } from 'vitest';
import { syncDocs } from './doc-sync.js';

describe('doc-sync', () => {
  it('detecta controller modificado', () => {
    const report = syncDocs(['apps/api/src/modules/users/infrastructure/http/users.controller.ts']);
    const review = report.actions.find((a) => a.type === 'review');
    expect(review).toBeDefined();
  });

  it('schema Prisma dispara review', () => {
