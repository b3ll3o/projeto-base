import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Scripts canônicos que devem existir no `package.json` raiz do template.
 *
 * Mantido sincronizado com o objeto `scripts` canônico definido em
 * `package.json` raiz + convenção `ci-defense-in-depth.md`. Se algum
 * desses for removido/renomeado sem atualizar o array, o CI pega.
 */
const REQUIRED_SCRIPTS = [
  'build',
  'dev',
  'lint',
  'typecheck',
  'test',
  'ci:preflight',
  'ci:local',
  'tdd:check',
] as const;

/**
 * Detecta drift no `package.json` raiz do template/monorepo.
 *
 * Drifts capturados:
 * 1. Arquivo inexistente
 * 2. JSON inválido
 * 3. Scripts canônicos faltando (removidos sem sincronizar a convenção)
 * 4. Scripts "fantasma": comandos que começam com `tsx <path>` apontando
 *    para um arquivo que não existe no `projectRoot`.
 *    (Detecta typos em paths muito comuns — `tooling/scripts/...`,
 *    `.tooling/scripts/...`, etc.)
 *
 * Limitações:
 * - Apenas detecta scripts `tsx <path>` — não cobre `node <path>`,
 *   `sh <path>` ou scripts compostos por `&&`. O escopo cobre os
 *   scripts canônicos que o template usa via `tsx` (preflight,
 *   stack:review, docs:sync).
 * - Não valida que o script tem conteúdo válido além de referenciar
 *   o arquivo — assume shell válido.
 */
export async function checkPackageJsonDrift(opts: {
  packageJsonPath: string;
  projectRoot?: string;
}): Promise<CheckResult> {
  const errors: string[] = [];
  const fullPath = path.resolve(opts.packageJsonPath);
  const projectRoot = path.resolve(opts.projectRoot ?? path.dirname(fullPath));

  let raw: string;
  try {
    raw = await fs.readFile(fullPath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      errors: [`package.json não encontrado em '${fullPath}': ${err}`],
    };
  }

  let parsed: { scripts?: Record<string, string> };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      errors: [`package.json não é JSON válido: ${err}`],
    };
  }

  if (!parsed.scripts || typeof parsed.scripts !== 'object') {
    return {
      ok: false,
      errors: [
        `drift detectado: package.json sem bloco 'scripts' (npm/pnpm não consegue executar tarefas)`,
      ],
    };
  }

  for (const required of REQUIRED_SCRIPTS) {
    if (!(required in parsed.scripts)) {
      errors.push(
        `drift detectado: script canônico '${required}' ausente do package.json (ver convenção ci-defense-in-depth.md)`,
      );
    }
  }

  for (const [name, command] of Object.entries(parsed.scripts)) {
    const tsxPath = extractTsxPath(command);
    if (!tsxPath) continue;
    const resolved = path.resolve(projectRoot, tsxPath);
    try {
      await fs.access(resolved);
    } catch {
      errors.push(
        `drift detectado: script '${name}' referencia 'tsx ${tsxPath}' mas o arquivo não existe em '${resolved}' (script fantasma)`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Extrai o primeiro path após `tsx` ou `pnpm tsx` em uma string de
 * comando. Retorna `null` se o comando não casa esses padrões.
 *
 * @example extractTsxPath('tsx .tooling/scripts/foo.ts') → '.tooling/scripts/foo.ts'
 * @example extractTsxPath('pnpm tsx tooling/scripts/foo.ts') → 'tooling/scripts/foo.ts'
 * @example extractTsxPath('echo hello && pnpm tsx tooling/x.ts') → 'tooling/x.ts'
 */
function extractTsxPath(command: string): string | null {
  const tsxRegex = /tsx\s+([^\s|&;]+)/;
  const match = tsxRegex.exec(command);
  return match ? match[1] : null;
}
