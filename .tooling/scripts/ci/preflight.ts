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

async function main(): Promise<void> {
  console.log('\u{1F50D} Pre-flight CI checks\n');
  const checks: Array<{ name: string; fn: () => Promise<{ ok: boolean; errors: string[] }> }> = [
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
