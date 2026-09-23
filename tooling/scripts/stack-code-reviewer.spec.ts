// tooling/scripts/stack-code-reviewer.spec.ts
//
// pt-BR: Testes do agent stack-code-reviewer. Cobre as 4 regras
// principais:
//   - ddd-h1-no-framework-imports-in-domain (blocker)
//   - prisma-required-audit-fields (blocker)
//   - nestjs-controller-required (blocker)
//   - nextjs-img-vs-image (major)

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { reviewFiles } from './stack-code-reviewer.js';

function tmpFile(name: string, content: string): string {
  const dir = join(tmpdir(), 'stack-review-test');
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

describe('stack-code-reviewer', () => {
  it('detecta blocker em domain com import proibido', () => {
    const file = tmpFile('domain/user.spec.ts', `import { Injectable } from '@nestjs/common';\n`);
    const report = reviewFiles([file]);
    expect(
      report.findings.some(
        (f) => f.severity === 'blocker' && f.rule === 'ddd-h1-no-framework-imports-in-domain',
      ),
    ).toBe(true);
  });

  it('detecta Prisma sem createdAt/updatedAt/version', () => {
    const file = tmpFile('schema.prisma', `model User {\n  id String @id\n  email String\n}\n`);
    const report = reviewFiles([file]);
    expect(report.findings.some((f) => f.rule === 'prisma-required-audit-fields')).toBe(true);
  });

  it('detecta <img> em next component', () => {
    // pt-BR: regex casa `<img` no início de linha (forma JSX mais comum —
    // ex: <img src="..." /> em linha própria). O agent NÃO deve pegar
    // `<img>` inline no meio de expressão JSX (falsos positivos).
    const file = tmpFile('component.tsx', `<img src="/x.png" alt="x" />\n`);
    const report = reviewFiles([file]);
    expect(report.findings.some((f) => f.rule === 'nextjs-img-vs-image')).toBe(true);
  });

  it('detecta controller NestJS sem @Controller()', () => {
    const file = tmpFile('broken.controller.ts', `import { Controller } from '@nestjs/common';\n`);
    const report = reviewFiles([file]);
    expect(report.findings.some((f) => f.rule === 'nestjs-controller-required')).toBe(true);
  });

  it('arquivo limpo não produz findings', () => {
    const file = tmpFile('clean.ts', `export const x = 1;\n`);
    const report = reviewFiles([file]);
    expect(report.findings).toHaveLength(0);
    expect(report.approved).toBe(true);
  });

  it('report não aprova quando há blocker', () => {
    const file = tmpFile(
      'domain/domain-import.ts',
      `import { Injectable } from '@nestjs/common';\n`,
    );
    const report = reviewFiles([file]);
    expect(report.approved).toBe(false);
  });

  it('report expõe contadores por severidade', () => {
    const file = tmpFile('multi.ts', `export function X() { return <img src="/x.png" />; }\n`);
    const report = reviewFiles([file]);
    expect(report.metrics.findings_by_severity).toMatchObject({
      blocker: expect.any(Number),
      major: expect.any(Number),
      minor: expect.any(Number),
      info: expect.any(Number),
    });
  });

  it('detecta múltiplos blockers de uma vez', () => {
    const file1 = tmpFile('domain/d1.ts', `import { Injectable } from '@nestjs/common';\n`);
    const file2 = tmpFile('domain/d2.ts', `import { Entity } from '@prisma/client';\n`);
    const report = reviewFiles([file1, file2]);
    const blockers = report.findings.filter((f) => f.severity === 'blocker');
    expect(blockers.length).toBeGreaterThanOrEqual(2);
  });

  it('ignora arquivos que não consegue ler (graceful skip)', () => {
    const file = tmpFile('clean2.ts', `export const y = 2;\n`);
    const report = reviewFiles([file, '/nope/does-not-exist.ts']);
    // Não lança; arquivo válido é revisado, inválido é pulado silenciosamente.
    expect(report.scope.files_reviewed).toBe(2);
  });

  it('schema Prisma com todos os audit fields é aprovado', () => {
    const file = tmpFile(
      'good-schema.prisma',
      `model User {\n  id String @id\n  email String\n  createdAt DateTime\n  updatedAt DateTime\n  version Int\n}\n`,
    );
    const report = reviewFiles([file]);
    const prismaFindings = report.findings.filter((f) => f.rule === 'prisma-required-audit-fields');
    expect(prismaFindings).toHaveLength(0);
  });

  it('limpa diretório temporário após uso', () => {
    const dir = join(tmpdir(), 'stack-review-test');
    rmSync(dir, { recursive: true, force: true });
    expect(() => mkdirSync(dir, { recursive: true })).not.toThrow();
  });
});
