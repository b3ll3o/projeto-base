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
//   tsx tooling/scripts/doc-sync.ts --files="a.ts\nb.ts" --mode=incremental

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectStacksBatch } from './lib/stack-detector.js';

// pt-BR: REPO_ROOT é resolvido a partir do próprio módulo (import.meta.url),
// tornando a função `syncDocs` robusta a QUALQUER CWD (CLI do repo root,
// testes rodando em tooling/scripts/, uso programático de outros scripts).
// `tooling/scripts/doc-sync.ts` está 2 níveis abaixo da raiz do repo.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

/** Resolve path relativo ao REPO_ROOT, preservando paths absolutos. */
function resolvePath(p: string): string {
  return isAbsolute(p) ? p : join(REPO_ROOT, p);
}

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

// MEDIDO 2026-10-15: `apps/api/openapi.json` é artefato GERADO por
// `openapi:export`. Assertar a existência dele reprovava o CI: reproduzido num
// checkout limpo (`git archive HEAD`), `auth.controller.ts` devolve `Alerts: 1 |
// Health 90/100` e EXIT=1 — localmente passava porque o dev tem o arquivo
// gerado em disco. Continua como alvo de `review` — só sai do `existsSync`.
//
// ATUALIZADO 2026-10-29: desde o #125 a spec é VERSIONADA
// (`git ls-files apps/api/openapi.json` devolve a linha), então o motivo
// original — o arquivo não existir em checkout limpo — não vale mais. A
// exclusão foi mantida por ser defensiva (o alvo é um artefato gerado, não um
// doc escrito à mão) e o comentário acima deixou de afirmar que ele é
// gitignored, o que já não é verdade.
export const GENERATED_DOC_FILES = new Set(['apps/api/openapi.json']);

const CODE_DOC_MAPPINGS: CodeDocMapping[] = [
  {
    codePattern: /apps\/api\/src\/modules\/auth\/infrastructure\/http\/auth\.controller\.ts$/,
    docFiles: [
      'docs/api/auth.md',
      'apps/api/openapi.json',
      'docs/adr/0002-autenticacao-jwt-argon2.md',
    ],
    // pt-BR (2026-10-13): o mapeamento entrou junto com o módulo de auth.
    // Sem ele, criar o controller não dispara NENHUMA verificação de doc —
    // e o primeiro sintoma de um contrato de autenticação fora de sincronia
    // é um 401 que ninguém sabe explicar. `docs/api/auth.md` é o contrato
    // em prosa; o ADR é onde vive o que o JWT NÃO garante (revogação).
    reason: 'Controller de auth modificado — verificar contrato e ADR',
  },
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
    if (!GENERATED_DOC_FILES.has(d) && !existsSync(resolvePath(d))) {
      return {
        type: 'create',
        doc_file: d,
        reason: `Doc de referência ausente para ${file}`,
        // MEDIDO 2026-10-15: este era o ÚNICO caminho que podia acusar doc
        // ausente e ele não trazia `severity` — as outras 3 Emissores punham
        // `minor`. Sem nenhum `major` no código inteiro, `alerts` era
        // estruturalmente 0, o health era estruturalmente 100, e o `|| exit 1`
        // do pre-commit era código morto. Um doc ausente é a única coisa aqui
        // que deve reprovar.
        severity: 'major',
        blocking_for_merge: true,
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

export function syncDocs(files: string[]): DocSyncReport {
  const actions: DocAction[] = [];
  const filesChanged: string[] = [];
  let alerts = 0;

  for (const f of files) {
    const stacks = detectStacksBatch([f])[0]?.stacks ?? [];
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
      content = readFileSync(resolvePath(f), 'utf-8');
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
  outFile: string;
} {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (const a of args) {
    // Default no destructure, e não `if (k === undefined) continue`: MEDIDO
    // 2026-10-08, `''.split('=')` devolve `['']`, então a chave NUNCA é
    // `undefined` — o guard era inerte e o `?? true` já cobre o valor ausente.
    // O default abaixo é o valor real em runtime, escrito como tal.
    const [k = '', v] = a.replace(/^--/, '').split('=');
    opts[k] = v ?? true;
  }
  // MEDIDO 2026-10-15: via `pnpm run` (o que os 2 workflows do CI usam) o
  // pnpm converte o newline do argv na PAR de caracteres `\n`. Com 161
  // arquivos, `split('\n')` devolvia 1 item e o gate revisava 1 arquivo
  // reportando Health 100/100 — o caminho verde que o hook local nunca teve,
  // porque o `.husky/pre-commit` chama `pnpm tsx` e o argv chega cru.
  // Aceita as duas formas; um nome de arquivo com barra invertida é impossível
  // num path versionado pelo git.
  const files = String(opts['files'] ?? '')
    .split(/\\n|\n/)
    .filter(Boolean);
  return {
    files,
    mode: String(opts['mode'] ?? 'incremental'),
    outFile: String(opts['out-file'] ?? 'doc-sync-report.json'),
  };
}

function main(): void {
  const { files, mode, outFile } = parseArgs();
  if (files.length === 0) {
    console.log('✓ Nenhum arquivo para sincronizar docs');
    return;
  }
  const report = syncDocs(files);
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`[doc-sync] mode=${mode} files=${files.length}`);
  console.log(
    `Actions: ${report.actions.length} | Alerts: ${report.alerts} | Health: ${report.docs_health_score}/100`,
  );
  for (const a of report.actions) {
    console.log(`  [${a.type}] ${a.doc_file} — ${a.reason}`);
  }
  // MEDIDO 2026-10-15: `grep -c "process.exit" tooling/scripts/doc-sync.ts`
  // devolvia 0 — o `|| exit 1` do pre-commit e o job sync-docs eram código
  // morto. Mesmo formato do irmão `stack-code-reviewer.ts` (`grep -n
  // "process.exit" tooling/scripts/stack-code-reviewer.ts`), sem número de
  // linha: o próprio diff desloca a referência.
  if (report.alerts > 0) {
    console.error(
      `✗ ${report.alerts} doc(s) de referência ausente(s) — Health ${report.docs_health_score}/100`,
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
