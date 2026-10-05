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
import { checkDockerDrift } from './check-docker-drift';
import { checkArchiveIntegrity } from './check-archive-integrity';
import { checkMemoryDirConcordance } from './check-memory-dir-concordance';
import { checkTeethRegistry } from './check-teeth-registry';
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
    // Sem matriz ou sem lint ainda (repo pré-Task 1.8/1.9) — não falha,
    // mas também não pode reportar que verificou.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `matriz de routing ausente (${matrixPath} ou ${matrixFile})`,
    };
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

/**
 * Marca de um check que rodou até o fim.
 *
 * `skipped` NAO pode renderizar `✓`: o painel precisa distinguir "verifiquei e
 * passou" de "não havia o que verificar". Sem essa separação, um check que
 * faz early-return por pré-requisito ausente reporta sucesso sem ter
 * verificado nada — o token de sucesso mente, e é o pior tipo de bug de gate
 * porque parece que o gate funcionou.
 */
export function formatMark(r: CheckResult): string {
  if (!r.ok) return '✗';
  if (r.skipped) return `– (skipped: ${r.reason ?? 'sem motivo declarado'})`;
  return '✓';
}

async function main(): Promise<void> {
  console.log('\u{1F50D} Pre-flight CI checks\n');
  const checks: Array<{
    name: string;
    /**
     * O ARQUIVO que implementa o gate. Não é decoração: a task 3.2 do plano
     * `guard-classes` reconcilia este array contra o registro de dentes, e
     * contra a matriz de roteamento — e não há como casar um nome de
     * exibição ('Cross-refs em .md versionados') com uma entrada de registro
     * ('`check-doc-refs`') sem o path. Sem este campo, a reconciliação seria
     * por semelhança de nome: exatamente a classe 2 — cobre a forma que você
     * conhece e só ela.
     */
    file: string;
    fn: () => CheckResult | Promise<CheckResult>;
  }> = [
    // F2-T2: escopo = todo `.md` versionado (git ls-files), nao só `docs` +
    // `.agents/specs`. Antes, `AGENTS.md` — o indice que todo agent le
    // primeiro para decidir a quem despachar — ficava fora do gate.
    // `docsRoots` é o fallback (walk) caso o git não esteja disponível.
    {
      name: 'Cross-refs em .md versionados',
      file: '.tooling/scripts/ci/check-doc-refs.ts',
      fn: () => checkDocRefs({ docsRoot: '.', docsRoots: ['docs', '.agents/specs'] }),
    },
    {
      name: 'tsconfig drift (strict, noUncheckedIndexedAccess)',
      file: '.tooling/scripts/ci/check-tsconfig-drift.ts',
      fn: () =>
        checkTsconfigDrift({
          tsconfigsRoot: '.',
          consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
        }),
    },
    {
      name: 'ESLint config drift (apps)',
      file: '.tooling/scripts/ci/check-eslint-drift.ts',
      fn: () => checkEslintDrift({ appsRoot: 'apps', allowlist: [] }),
    },
    {
      name: 'ESLint config drift (packages)',
      file: '.tooling/scripts/ci/check-eslint-drift.ts',
      fn: () => checkEslintDrift({ appsRoot: 'packages', allowlist: [] }),
    },
    {
      name: 'turbo.json drift (pipeline canônico)',
      file: '.tooling/scripts/ci/check-turbo-drift.ts',
      fn: () => checkTurboDrift({ turboPath: 'turbo.json' }),
    },
    {
      name: 'package.json drift (scripts canônicos + fantasmas)',
      file: '.tooling/scripts/ci/check-package-json-drift.ts',
      fn: () => checkPackageJsonDrift({ packageJsonPath: 'package.json', projectRoot: '.' }),
    },
    {
      name: 'docker drift (.dockerignore + Dockerfile size/base)',
      file: '.tooling/scripts/ci/check-docker-drift.ts',
      fn: () => checkDockerDrift('.'),
    },
    {
      name: 'review-routing matrix lint (YAML + LOC + reviewer refs)',
      file: 'tooling/scripts/lint-review-routing.ts',
      fn: () => checkReviewRoutingLint(),
    },
    {
      name: 'archive integrity (.agents/runs/archive/*.md frontmatter canônico)',
      file: '.tooling/scripts/ci/check-archive-integrity.ts',
      fn: () => checkArchiveIntegrity('.'),
    },
    {
      // Task 1.3 do plano guard-classes. Fecha a divergência que reinava em
      // silêncio: o destino da retrospectiva já foi declarado 10 vezes, em 7
      // arquivos, em 6 notações — uma delas um `test -f` executável com path
      // de máquina, falso em toda máquina.
      name: 'destino da retrospectiva (fonte única, sem 2ª declaração)',
      file: '.tooling/scripts/ci/check-memory-dir-concordance.ts',
      fn: () => checkMemoryDirConcordance({ repoRoot: '.' }),
    },
    {
      // Task 3.2 do plano guard-classes. Reconcilia o registro de dentes com
      // o preflight E com a matriz de roteamento. Sem ele, o registro
      // envelhece em silêncio e um gate pode morar num diretório que nenhuma
      // `path_glob` alcança — classe 1, condição inalcançável: todo mundo
      // vê verde e nenhuma revisão é despachada.
      name: 'registro de dentes (registro ↔ preflight ↔ roteamento)',
      file: '.tooling/scripts/ci/check-teeth-registry.ts',
      fn: () => checkTeethRegistry(),
    },
  ];

  let totalErrors = 0;
  let totalSkipped = 0;
  for (const check of checks) {
    process.stdout.write(`  • ${check.name}... `);
    const result = await check.fn();
    if (!result.ok) {
      console.log('✗');
      for (const err of result.errors) {
        console.log(`      ${err}`);
      }
      totalErrors += result.errors.length;
    } else {
      if (result.skipped) totalSkipped++;
      console.log(formatMark(result));
    }
  }

  console.log('');
  if (totalErrors > 0) {
    console.error(`❌ ${totalErrors} erro(s) encontrado(s). Corrigir antes de push.`);
    process.exit(1);
  }
  // O resumo repete a mesma regra do painel: um check que não rodou não pode
  // ser somado como se tivesse passado.
  if (totalSkipped > 0) {
    console.log(
      `⚠ ${totalErrors} erro(s); ${totalSkipped} check(s) não rodaram (skipped) — ` +
        `ver as marcas acima. "Todos passaram" seria mentira enquanto houver skip.`,
    );
    return;
  }
  console.log('✓ Todos os checks passaram.');
}

// Gate IIFE: sem isso, importar `formatMark` num teste executa a preflight
// inteira em background — o teste passa, mas o processo paga por uma checagem
// que ele nao pediu. Mesmo padrao de `stack-code-reviewer.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Erro inesperado:', err);
    process.exit(2);
  });
}
