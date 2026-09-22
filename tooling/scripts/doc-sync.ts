// tooling/scripts/doc-sync.ts
//
// pt-BR: Agent que mapeia arquivos de código para documentos de referência
// e dispara ações (review/update/create/alert). Roda em pre-commit,
// pre-push e CI (sync-docs.yml).
//
// Mapeamentos canônicos vivem em CODE_DOC_MAPPINGS abaixo. Para cada
// pattern de código, lista os docs que precisam ser revisados quando o
// pattern bate.
//
// Uso:
//   tsx tooling/scripts/doc-sync.ts --files="a.ts\nb.ts" --mode=incremental --auto-apply-minor=false

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
      doc_file:
        'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md',
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
    doc_file:
      'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md',
    reason: 'Endpoints modificados — verificar tabela de endpoints',
    severity: 'minor',
  });
  return actions;
}

export function syncDocs(files: string[], _autoApplyMinor = false): DocSyncReport {
  const actions: DocAction[] = [];
  const filesChanged: string[] = [];
  let alerts = 0;

  for (const f of files) {
    const stacks = detectStacksBatch([f])[0].stacks;
    // pt-BR: pula arquivos cujo único stack é `monorepo` (configs de
    // workspace como pnpm-workspace.yaml, turbo.json, package.json na
    // raiz de apps/packages). Arquivos sob apps/api/, apps/web/, etc.,
    // também recebem o stack `monorepo`, mas aqui devem ser processados
    // porque têm stack específico aplicável.
    if (stacks.length === 1 && stacks[0] === 'monorepo') continue;

    // pt-BR: emite `review` action para cada mapping code→doc que casa
    // (além de checar docs ausentes). Garante que modificações em
    // arquivos mapeados sempre geram sinalização para o humano revisar.
    for (const m of CODE_DOC_MAPPINGS) {
      if (!m.codePattern.test(f)) continue;
      for (const d of m.docFiles) {
        actions.push({
          type: 'review',
          doc_file: d,
          reason: m.reason,
          severity: 'minor',
        });
      }
    }

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

function parseArgs(): {
  files: string[];
  mode: string;
  autoApplyMinor: boolean;
  outFile: string;
} {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (const a of args) {
    const [k, v] = a.replace(/^--/, '').split('=');
    opts[k] = v ?? true;
  }
  const files = String(opts['files'] ?? '')
    .split('\n')
    .filter(Boolean);
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
  console.log(
    `Actions: ${report.actions.length} | Alerts: ${report.alerts} | Health: ${report.docs_health_score}/100`,
  );
  for (const a of report.actions) {
    console.log(`  [${a.type}] ${a.doc_file} — ${a.reason}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
