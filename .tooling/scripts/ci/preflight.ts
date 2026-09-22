#!/usr/bin/env tsx
/**
 * Pre-flight CI checks. Roda ANTES de `turbo run lint typecheck test`
 * para falhar rápido em problemas estruturais.
 *
 * Checks incluídos:
 * 1. checkDocRefs — cross-refs quebradas em .md (docs e .agents/specs)
 * 2. checkTsconfigDrift — drift de chaves em tsconfigs do monorepo
 * 3. checkEslintDrift — detecta configs ESLint legadas (apps + packages)
 *
 * Exit code 0 = OK, 1 = pelo menos 1 falha, 2 = erro inesperado.
 */
import { checkDocRefs } from './check-doc-refs';
import { checkTsconfigDrift } from './check-tsconfig-drift';
import { checkEslintDrift } from './check-eslint-drift';
import { checkTurboDrift } from './check-turbo-drift';
import { checkPackageJsonDrift } from './check-package-json-drift';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { CheckResult } from './check-types';

/**
 * Valida a matriz de roteamento do review-router (Task 1.10).
 * Reexecuta `pnpm review:lint` (CLI) para fail-fast em YAML quebrado,
 * LOC excessivo, duplicate patterns, regex inválida ou reviewer refs
 * desconhecidos antes do push (defesa em profundidade simétrica ao
 * `pnpm review:lint` manual).
 *
 * Usa execSync em vez de importar lintMatrix diretamente para evitar
 * cross-package import (tooling/scripts é package isolado no monorepo).
 */
function checkReviewRoutingLint(): CheckResult {
  const matrixPath = 'tooling/scripts/lint-review-routing.ts';
  const matrixFile = '.agents/specs/conventions/review-routing.md';

  if (!existsSync(matrixPath) || !existsSync(matrixFile)) {
    // Sem matriz ou sem lint ainda (repo pré-Task 1.8/1.9) — não falha.
    return { ok: true, errors: [] };
  }

  try {
    execSync('pnpm review:lint', { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, errors: [] };
  } catch (err: any) {
    const stderr = (err.stderr?.toString() ?? '').trim();
    const stdout = (err.stdout?.toString() ?? '').trim();
    const detail = stderr || stdout || err.message;
    return {
      ok: false,
      errors: [`review:lint falhou:\n${detail}`],
    };
  }
}

async function main(): Promise<void> {
  console.log('\u{1F50D} Pre-flight CI checks\n');
  const checks: Array<{ name: string; fn: () => CheckResult | Promise<CheckResult> }> = [
    { name: 'Cross-refs em docs', fn: () => checkDocRefs({ docsRoot: 'docs' }) },
    { name: 'Cross-refs em .agents/specs', fn: () => checkDocRefs({ docsRoot: '.agents/specs' }) },
    {
      name: 'tsconfig drift (strict, noUncheckedIndexedAccess)',
      fn: () =>
        checkTsconfigDrift({
          tsconfigsRoot: '.',
          consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
        }),
    },
    // `apps/api/.eslintrc.js` é convenção NestJS válida (escopo fora deste plano).
    // Migrar NestJS para flat config é decisão separada; por ora allowlist.
    {
      name: 'ESLint config drift (apps)',
      fn: () => checkEslintDrift({ appsRoot: 'apps', allowlist: ['api/.eslintrc.js'] }),
    },
    {
      name: 'ESLint config drift (packages)',
      fn: () => checkEslintDrift({ appsRoot: 'packages', allowlist: [] }),
    },
    {
      name: 'turbo.json drift (pipeline canônico)',
      fn: () => checkTurboDrift({ turboPath: 'turbo.json' }),
    },
    {
      name: 'package.json drift (scripts canônicos + fantasmas)',
      fn: () => checkPackageJsonDrift({ packageJsonPath: 'package.json', projectRoot: '.' }),
    },
    {
      name: 'review-routing matrix lint (YAML + LOC + reviewer refs)',
      fn: () => checkReviewRoutingLint(),
    },
  ];

  let totalErrors = 0;
  for (const check of checks) {
    process.stdout.write(`  • ${check.name}... `);
    const result = await check.fn();
    if (result.ok) {
      console.log('✓');
    } else {
      console.log('✗');
      for (const err of result.errors) {
        console.log(`      ${err}`);
      }
      totalErrors += result.errors.length;
    }
  }

  console.log('');
  if (totalErrors > 0) {
    console.error(`❌ ${totalErrors} erro(s) encontrado(s). Corrigir antes de push.`);
    process.exit(1);
  }
  console.log('✓ Todos os checks passaram.');
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(2);
});
