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

export interface DocAction {
  type: ActionType;
  doc_file: string;
  section?: string;
  current_text?: string;
  proposed_text?: string;
  reason: string;
  evidence?: { file: string; line: number; code: string };
  severity?: 'minor' | 'major';
  blocking_for_merge?: boolean;
  /**
   * pt-BR: o arquivo de CÓDIGO que disparou a ação. Sem ele, duas ações do
   * mesmo doc e do mesmo motivo são indistinguíveis — e foi assim que o
   * parecer da semana saiu com 3 linhas idênticas de "Endpoints modificados"
   * (uma por controller). O `reason` diz O QUÊ; o `source_file` diz ONDE.
   */
  source_file?: string;
}

export interface DocSyncReport {
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

/**
 * pt-BR: docs que aparecem em mais de um mapeamento têm UM dono — o nome
 * repetido em dois lugares é a hora em que um deles vira o outro.
 */
const DOC_DE_MODELO_DADOS =
  'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md';
const DOC_DE_CONTRATO_HTTP =
  'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md';
const DOC_DE_STACK = 'docs/STACK.md';
const DOC_DE_DADOS = 'docs/system-design/dados.md';

/**
 * O doc canônico de um bounded context — a regra da matriz de
 * `documentacao.md` §3: `apps/api/src/modules/<bc>/` → `docs/api/<bc>.md`.
 */
export function docDeBc(bc: string): string {
  return `docs/api/${bc}.md`;
}

/**
 * O bounded context de um controller, pelo path do arquivo.
 *
 * O padrão NÃO é ancorado no começo: um path ABSOLUTO (o `resolvePath` os
 * preserva) tem o mesmo sufixo.
 */
export function bcDoController(file: string): string | null {
  const m = /apps\/api\/src\/modules\/([^/]+)\//.exec(file);
  return m?.[1] ?? null;
}

const CODE_DOC_MAPPINGS: CodeDocMapping[] = [
  {
    codePattern: /apps\/api\/src\/modules\/auth\/infrastructure\/http\/auth\.controller\.ts$/,
    docFiles: ['apps/api/openapi.json', 'docs/adr/0002-autenticacao-jwt-argon2.md'],
    // pt-BR (2026-10-13): o mapeamento entrou junto com o módulo de auth.
    // Sem ele, criar o controller não dispara NENHUMA verificação de doc —
    // e o primeiro sintoma de um contrato de autenticação fora de sincronia
    // é um 401 que ninguém sabe explicar. O ADR é onde vive o que o JWT NÃO
    // garante (revogação); o contrato em prosa (`docs/api/auth.md`) vem da
    // regra GENÉRICA do bounded context, não desta lista.
    reason: 'Controller de auth modificado — verificar contrato e ADR',
  },
  {
    codePattern: /apps\/api\/src\/modules\/users\/infrastructure\/http\/users\.controller\.ts$/,
    docFiles: ['apps/api/openapi.json', DOC_DE_CONTRATO_HTTP],
    reason: 'Controller de users modificado — verificar contrato HTTP',
  },
  {
    codePattern: /apps\/api\/prisma\/schema\.prisma$/,
    docFiles: [
      DOC_DE_MODELO_DADOS,
      DOC_DE_STACK,
      // pt-BR (2026-11-09): o desenho dos dados do system design tem o
      // PRISMA como fonte — sem este mapeamento, mudar o schema deixaria o
      // diagrama ER e a tabela de escopo envelhecendo em silêncio.
      DOC_DE_DADOS,
    ],
    reason: 'Schema Prisma modificado — verificar modelo',
  },
  {
    codePattern: /apps\/api\/src\/modules\/users\/domain\/value-objects\//,
    docFiles: [DOC_DE_MODELO_DADOS],
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

/**
 * Os models auditados (com rastro de autoria: `createdAt` + `createdBy`) que
 * NÃO têm a tabela History/Archive correspondente.
 *
 * MEDIDO 2026-11-16: a versão anterior emitia UMA ação por model do schema,
 * todas com o mesmo doc e o mesmo motivo — 12 linhas IDÊNTICAS no parecer da
 * semana (PR #167). E o guard era o INVERSO do comentário ao lado: ele saía
 * cedo quando o schema NÃO tinha a enum `AuditOperation`, que é exatamente o
 * caso que a função existe para checar.
 *
 * Sem a enum de auditoria o schema não tem histórico de versão — aí a lista
 * é vazia POR DEFINIÇÃO, e não por omissão.
 */
export function modelsSemParDeHistorico(schema: string): string[] {
  if (!/enum\s+AuditOperation\b/.test(schema)) return [];

  const corpos = new Map<string, string>();
  const modelo = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let achado: RegExpExecArray | null;
  while ((achado = modelo.exec(schema)) !== null) {
    const nome = achado[1];
    const corpo = achado[2];
    if (nome !== undefined && corpo !== undefined) corpos.set(nome, corpo);
  }

  const semPar: string[] = [];
  for (const [nome, corpo] of corpos) {
    if (/(History|Archive)$/.test(nome)) continue;
    // Rastro de autoria: o model é auditado e por isso tem histórico.
    if (!/createdAt\b/.test(corpo) || !/createdBy\b/.test(corpo)) continue;
    const temPar = [...corpos.keys()].some((k) => k === `${nome}History` || k === `${nome}Archive`);
    if (!temPar) semPar.push(nome);
  }
  return semPar;
}

function checkIfMatchInPrisma(file: string, content: string): DocAction[] {
  if (!/apps\/api\/prisma\/schema\.prisma$/.test(file)) return [];
  const semPar = modelsSemParDeHistorico(content);
  if (semPar.length === 0) return [];
  return [
    {
      type: 'review',
      doc_file: DOC_DE_MODELO_DADOS,
      reason: `Model sem tabela History/Archive correspondente — verificar: ${semPar.join(', ')}`,
      severity: 'minor',
      source_file: file,
    },
  ];
}

/**
 * O doc canônico do bounded context do controller — a regra da matriz de
 * `documentacao.md` §3 (`apps/api/src/modules/<bc>/` → `docs/api/<bc>.md`).
 *
 * MEDIDO 2026-11-16: a versão anterior mandava QUALQUER controller para UM
 * doc só (o contrato HTTP do módulo de users) — o `health.controller.ts`
 * apontava para a spec de cadastro de usuário. E, como o motivo era o mesmo
 * para todos, 3 controllers diferentes produziam 3 linhas idênticas no
 * parecer.
 *
 * O verbo HTTP é lido do ARQUIVO: sem decorator de verbo o controller não
 * tem endpoint, e a ação só existe se o arquivo pôde ser lido — é o que
 * mantém `readFileSync` no caminho real (ver `doc-sync.resolvePath.spec.ts`).
 */
function checkControllerDoc(file: string, content: string): DocAction[] {
  if (!/\.controller\.ts$/.test(file)) return [];
  if (!/@(Post|Get|Patch|Delete)\b/.test(content)) return [];
  const bc = bcDoController(file);
  if (!bc) return [];
  const doc = docDeBc(bc);
  // O doc canônico do BC ainda não existe: COBERTURA é do
  // `check-doc-coverage` (a matriz da §3 da `documentacao.md`). Aqui seria a
  // mesma falta acusada duas vezes — e o doc-sync é report-only.
  if (!existsSync(resolvePath(doc))) return [];
  return [
    {
      type: 'review',
      doc_file: doc,
      reason: `Controller ${bc} modificado — verificar contrato e tabela de endpoints`,
      severity: 'minor',
      source_file: file,
    },
  ];
}

export function syncDocs(files: string[]): DocSyncReport {
  const actions: DocAction[] = [];
  const filesChanged: string[] = [];
  let alerts = 0;

  // pt-BR: o MESMO arquivo pode entrar N vezes — o relatório semanal passa a
  // lista de arquivos da semana, e um arquivo tocado em 6 commits entra 6
  // vezes. Cada entrada repetida virava um conjunto inteiro de ações
  // repetidas no parecer.
  for (const f of new Set(files)) {
    const stacks = detectStacksBatch([f])[0]?.stacks ?? [];
    // pt-BR: pula arquivos cujo único stack é `monorepo` (configs de
    // workspace como pnpm-workspace.yaml, turbo.json, package.json na
    // raiz de apps/packages). Arquivos sob apps/api/, apps/web/, etc.,
    // também recebem o stack `monorepo`, mas aqui devem ser processados
    // porque têm stack específico aplicável.
    if (stacks.length === 1 && stacks[0] === 'monorepo') continue;

    const doArquivo: DocAction[] = [];

    // pt-BR: emite `review` action para cada mapping code→doc que casa
    // (além de checar docs ausentes). Garante que modificações em
    // arquivos mapeados sempre geram sinalização para o humano revisar.
    for (const m of CODE_DOC_MAPPINGS) {
      if (!m.codePattern.test(f)) continue;
      for (const d of m.docFiles) {
        doArquivo.push({
          type: 'review',
          doc_file: d,
          reason: m.reason,
          severity: 'minor',
          source_file: f,
        });
      }
    }

    const missing = checkMissingDoc(f);
    if (missing) doArquivo.push({ ...missing, source_file: f });

    let content = '';
    try {
      content = readFileSync(resolvePath(f), 'utf-8');
    } catch {
      // O arquivo não pôde ser lido: as checagens que dependem do CONTEÚDO
      // não têm o que perguntar, mas as que dependem do PATH (o doc
      // canônico do BC) continuam válidas.
      content = '';
    }
    doArquivo.push(...checkIfMatchInPrisma(f, content));
    doArquivo.push(...checkControllerDoc(f, content));

    if (doArquivo.length > 0) filesChanged.push(f);
    actions.push(...doArquivo);
  }

  // pt-BR: mesma ação = mesmo tipo, mesmo doc, mesmo motivo, mesma origem.
  // Sem esta deduplicação o parecer da semana saiu com 24 ações das quais
  // 15 eram cópias (12 de "History/Archive" + 3 de "Endpoints modificados").
  const vistas = new Set<string>();
  const unicas: DocAction[] = [];
  for (const a of actions) {
    const chave = `${a.type}|${a.doc_file}|${a.reason}|${a.source_file ?? ''}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    unicas.push(a);
  }

  // Auto-apply minor updates (no-op: só registra)
  for (const a of unicas) {
    if (a.severity === 'major' && a.type !== 'alert') alerts++;
  }

  const docsHealth = Math.max(0, 100 - alerts * 10);

  return {
    status: unicas.length === 0 ? 'no-changes' : 'success',
    actions: unicas,
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
