import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

interface TsconfigShape {
  [key: string]: unknown;
  compilerOptions?: { [key: string]: unknown };
}

/**
 * Detecta drift entre tsconfigs do monorepo. Garante que chaves
 * obrigatórias tenham o mesmo valor em todos os tsconfig.json do
 * tsconfigsRoot.
 *
 * Caso de uso: a falha #3 do CI foi causada por `noUncheckedIndexedAccess`
 * habilitado em `tsconfig.base.json` mas esquecido em um tsconfig
 * derivado (ex.: `apps/web/tsconfig.json`). Drift entre base e derivados
 * causa falhas intermitentes no typecheck porque o mesmo código passa
 * em um workspace e falha em outro.
 *
 * Limitações conhecidas:
 * - Apenas chaves em `compilerOptions` (não em outros campos do tsconfig).
 * - Não resolve `extends` — trabalha com o JSON literal. Para herança
 *   completa, rodar `tsc --showConfig` em cada projeto.
 * - Exclui `node_modules` para evitar scan de dependências publicadas
 *   (que tipicamente não trazem tsconfig.json, mas é defesa em
 *   profundidade caso alguma traga).
 */
export async function checkTsconfigDrift(opts: {
  tsconfigsRoot: string;
  consistentKeys: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.tsconfigsRoot);

  async function findTsconfigs(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const tsconfigs: string[] = [];
    for (const entry of entries) {
      // Exclui dependências publicadas.
      if (entry.isDirectory() && entry.name === 'node_modules') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        tsconfigs.push(...(await findTsconfigs(full)));
      } else if (/^tsconfig.*\.json$/.test(entry.name)) {
        // pt-BR: casa `tsconfig.json` (base) e variantes como
        // `tsconfig.app.json`, `tsconfig.spec.json` que NestJS/Next.js
        // comumente usam para builds de produção vs testes.
        tsconfigs.push(full);
      }
    }
    return tsconfigs;
  }

  let files: string[];
  try {
    files = await findTsconfigs(root);
  } catch (err) {
    return {
      ok: false,
      errors: [`tsconfigsRoot '${opts.tsconfigsRoot}' não existe ou não é acessível: ${err}`],
    };
  }

  if (files.length === 0) {
    return { ok: true, errors: [] };
  }

  // Carrega todos os tsconfigs
  const configs = await Promise.all(
    files.map(async (file) => {
      const content = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(content) as TsconfigShape;
      return {
        file: path.relative(root, file),
        compilerOptions: parsed.compilerOptions ?? {},
      };
    }),
  );

  // Para cada chave, verifica se o valor é o mesmo em todos os configs.
  // pt-BR: configs que herdam via `extends` tipicamente NÃO declaram a
  // chave (ex.: `tsconfig.base.json` define `strict=true` e os filhos
  // apenas fazem `extends` sem sobrescrever). Valores `undefined` no
  // JSON literal significam "herda do extends" e portanto são
  // compatíveis com qualquer valor definido em outro config — só
  // reportamos drift quando DOIS OU MAIS configs definem valores
  // diferentes para a mesma chave.
  for (const key of opts.consistentKeys) {
    const defined = configs.filter((c) => c.compilerOptions[key] !== undefined);
    if (defined.length < 2) {
      // Sem configs suficientes que declarem a chave explicitamente
      // para comparar; nada a reportar.
      continue;
    }
    const values = defined.map((c) => JSON.stringify(c.compilerOptions[key]));
    const first = values[0];
    const drift = values.some((v) => v !== first);
    if (drift) {
      const summary = configs
        .map((c) => `${c.file}:${key}=${JSON.stringify(c.compilerOptions[key])}`)
        .join(', ');
      errors.push(`drift em '${key}': ${summary}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
