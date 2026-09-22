// tooling/scripts/lib/stack-detector.ts
//
// pt-BR: Helper compartilhado entre os agents `stack-code-reviewer` e
// `doc-sync`. Mapeia um path de arquivo para a(s) stack(s) aplicável(is),
// permitindo que cada agent aplique apenas regras relevantes.
//
// Stacks reconhecidas:
//   - `nestjs`           → controllers/providers/etc. sob `apps/api/src/`
//   - `nextjs`           → app/pages/components sob `apps/web/`
//   - `prisma`           → schema.prisma e adapters de persistência
//   - `ddd-hexagonal`    → qualquer coisa sob `*/domain/`
//   - `monorepo`         → arquivos dentro de apps/packages/tooling
//   - `shared`           → fallback quando nenhum padrão casa

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
