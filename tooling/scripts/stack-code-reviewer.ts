// tooling/scripts/stack-code-reviewer.ts
//
// pt-BR: Agent que aplica regras de qualidade por stack. Roda em
// pre-commit, pre-push, CI (review-stack.yml). Reporta findings em
// JSON + console, e sai com código 1 quando há blocker.
//
// Uso:
//   tsx tooling/scripts/stack-code-reviewer.ts --files="a.ts\nb.ts" --mode=pre-push --out-file=report.json

import { readFileSync, writeFileSync } from 'node:fs';
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
  scope: {
    files_reviewed: number;
    stacks_detected: Stack[];
    rules_applied: number;
  };
  summary: string;
  findings: Finding[];
  metrics: { findings_by_severity: Record<Severity, number> };
}

const DDD_BLOCKED_IMPORTS = [
  /^@nestjs\//,
  /^@prisma\//,
  /^prisma\//,
  /class-validator/,
  /class-transformer/,
  /^reflect-metadata$/,
  /^rxjs$/,
];

// pt-BR: regra do spec §1 ("Domain puro") só vale para arquivos cujo path
// contém '/domain/' como componente de diretório. Sem esse gate, qualquer
// arquivo (ex.: test/e2e/*) que importe @nestjs/testing vira blocker falso.
function isDomainFile(file: string): boolean {
  return /(^|[\\/])domain([\\/]|$)/.test(file);
}

function checkDomain(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  if (!isDomainFile(file)) return findings;
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
    } catch {
      continue;
    }
    for (const s of detectStacksBatch([f])[0].stacks) stacks.add(s);
    findings.push(...checkDomain(f, content));
    findings.push(...checkPrisma(f, content));
    findings.push(...checkNestController(f, content));
    findings.push(...checkNextImage(f, content));
  }

  const counts: Record<Severity, number> = {
    blocker: 0,
    major: 0,
    minor: 0,
    info: 0,
  };
  for (const f of findings) counts[f.severity]++;

  const blockers = counts.blocker;
  const majors = counts.major;
  const approved = blockers === 0 && majors <= 3;

  return {
    approved,
    scope: {
      files_reviewed: files.length,
      stacks_detected: Array.from(stacks),
      rules_applied: 4,
    },
    summary: `${findings.length} finding(s) — ${blockers} blocker, ${majors} major`,
    findings,
    metrics: { findings_by_severity: counts },
  };
}

function parseArgs(): {
  files: string[];
  mode: string;
  outFile: string;
} {
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
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`[stack-code-reviewer] mode=${mode} files=${files.length}`);
  console.log(report.summary);
  for (const f of report.findings) {
    console.log(`  [${f.severity}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.description}`);
  }
  if (!report.approved) {
    console.error(`✗ Não aprovado (blocker=${report.metrics.findings_by_severity.blocker})`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
