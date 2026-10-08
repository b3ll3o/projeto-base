import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';

/**
 * As superfícies de tooling que este gate typecheca — cada uma por um
 * `tsconfig.json` próprio, todas na MESMA barra (`tsconfig.base.json`).
 *
 * Duas, e não uma, porque MEDIDO 2026-10-08 que `.tooling/` não era a única
 * árvore sem typecheck: `tooling/scripts/` tem um `tsconfig.json` próprio que
 * **nenhum script e nenhum job executava**, e que declarava `strict` sem
 * `noUncheckedIndexedAccess` — mais frouxo que a barra de `apps/` e
 * `packages/`, num lugar que `check-tsconfig-drift` não alcança porque sem
 * `extends` "ausente" e "herda" são a mesma chave.
 *
 * A lista é exportada e o gate faz `for` nela: um gate que cobre duas
 * superfícies e pode correr só a primeira é verde por ausência, que é a
 * mesma classe que este arquivo já documenta duas vezes.
 */
export const SUPERFICIES = ['.tooling/tsconfig.json', 'tooling/scripts/tsconfig.json'] as const;

/** Contrato mínimo de `spawnSync` que este gate usa. */
export type TscRun = (args: string[]) => { status: number | null; stderr: string; stdout: string };

/**
 * Uma linha de diagnóstico do `tsc`.
 *
 * O `tsc` tem DOIS formatos e eles não se confundem:
 *   - posicional: `arquivo.ts(1,1): error TS2322: mensagem`
 *   - `--pretty` (default em TTY): `arquivo.ts:1:1 - error TS2322: mensagem`
 *     e as linhas de continuação são indentadas com 2 espaços.
 *
 * O que separa um diagnóstico do outro texto no formato bonito é a
 * indentação — e é por isso que o padrão exige que a linha comece na coluna
 * 0. Uma versão anterior casava `…:\s*error TS\d+:` e portanto **não
 * reconhecia o formato `--pretty` inteiro**: gate que devolve "0 erros"
 * sobre uma saída cheia de erro é verde sobre nada verificado.
 *
 * O trailer `Found N errors.` não casa porque não traz `error TS<code>`.
 */
const DIAGNOSTIC = /^(?!\s)\S.*\berror\s+TS\d+\b/;

export function parseTscDiagnostics(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => DIAGNOSTIC.test(line));
}

/** Executa o `tsc` da raiz do repo com `process.execPath` (sem depender do PATH). */
function defaultRun(repoRoot: string): TscRun {
  const tscBin = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  return (args) => {
    const r = spawnSync(process.execPath, [tscBin, ...args], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    return { status: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
  };
}

/**
 * Typecheck da superfície `.tooling/` (issue #46).
 *
 * ## Por que isto é vermelho quando o `tsc` falha sem imprimir nada
 *
 * O `tsc` sai != 0 por motivos que não são erro de tipo: config inválida,
 * flag desconhecida, `tsc` ausente, OOM. Nesses casos ele frequentemente não
 * imprime nenhuma linha `error TSxxxx`. Um gate que contasse os diagnósticos
 * e reportasse "0 erros" nesses casos seria **verde sobre nada verificado** —
 * e pior, o relatório diria que passou. Por isso o `exit != 0` sem diagnóstico
 * é ele próprio um erro, com mensagem que nomeia a configuração.
 */
export function checkToolingTypecheck(opts?: { repoRoot?: string; run?: TscRun }): CheckResult {
  const repoRoot = opts?.repoRoot ?? process.cwd();
  const run = opts?.run ?? defaultRun(repoRoot);
  const errors: string[] = [];

  const ausentes = SUPERFICIES.filter((rel) => !existsSync(join(repoRoot, rel)));
  if (ausentes.length > 0) {
    // Todas, e não a primeira: se o `for` parasse no primeiro faltante, o
    // relatório diria um arquivo e deixaria o outro em silêncio.
    return {
      ok: false,
      errors: ausentes.map(
        (rel) =>
          `${rel} não existe em ${repoRoot} — sem ele esta superfície não tem ` +
          `nenhuma barra de tipo. Crie-o estendendo tsconfig.base.json.`,
      ),
    };
  }

  for (const rel of SUPERFICIES) {
    const result = run(['--noEmit', '-p', rel]);
    const diagnostics = parseTscDiagnostics(`${result.stderr}\n${result.stdout}`);

    if (diagnostics.length > 0) {
      // Lista plana, prefixada pela superfície, como os outros 13 gates: o
      // preflight já imprime cada linha, e um cabeçalho com contagem entraria
      // na lista como se fosse um erro. O prefixo é o que distingue o erro de
      // `.tooling/` do de `tooling/scripts/` quando os dois estão vermelhos.
      errors.push(...diagnostics.map((d) => `${rel}: ${d}`));
      continue;
    }

    if (result.status !== 0) {
      // Sem diagnóstico e com exit != 0: o compilador não chegou a typechecar.
      // Isso NÃO é "0 erros" — é "não verificado".
      const said =
        `${result.stderr}${result.stdout}`.trim() || '(nenhuma saída — o tsc nem chegou a rodar)';
      errors.push(
        `${rel}: o tsc saiu com status ${result.status} sem emitir nenhum ` +
          `diagnóstico — a superfície NÃO foi verificada. Saída do processo: ${said}`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1]?.endsWith('check-tooling-typecheck.ts')) {
  const r = checkToolingTypecheck();
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
