import { describe, expect, it } from 'vitest';
import { checkToolingTypecheck, parseTscDiagnostics } from './check-tooling-typecheck';

/**
 * Raiz real do repo. Nao um path ficticio: o gate faz short-circuit quando o
 * `tsconfig` nao existe na raiz, e com `/repo` todos os testes abaixo
 * exercitavam esse early-return em vez do caminho que Reuben queriam.
 * O `run` e falso, entao nenhum `tsc` e executado.
 */
const REPO_ROOT = process.cwd();

/**
 * Envolve `tsc` num objeto que responde o mesmo contrato de
 * `spawnSync`, para os testes nao dependerem do compilador instalado.
 */
function fakeTsc(result: { status: number | null; stderr: string; stdout?: string }) {
  return () => ({ status: result.status, stderr: result.stderr, stdout: result.stdout ?? '' });
}

const TSCONFIG = '.tooling/tsconfig.json';

describe('parseTscDiagnostics', () => {
  it('extrai uma linha por diagnóstico de erro', () => {
    const out = [
      ".tooling/scripts/ci/check-doc-refs.ts(112,11): error TS18048: 'target' is possibly 'undefined'.",
      ".tooling/scripts/ci/check-doc-refs.ts(117,25): error TS2345: Argument of type 'string'.",
    ].join('\n');
    expect(parseTscDiagnostics(out)).toHaveLength(2);
  });

  it('ignora o trailer de resumo, que não é um diagnóstico', () => {
    const out = [
      ".tooling/scripts/ci/a.ts(1,1): error TS2322: Type 'x'.",
      '',
      'Found 1 error in 1 file.',
    ].join('\n');
    const errors = parseTscDiagnostics(out);
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toMatch(/Found 1 error/);
  });

  it('não conta uma linha que não é erro como diagnóstico', () => {
    // `tsc --pretty` escreve cabeçalho de grupo; o gate não pode contar isso.
    const out = ['src/a.ts:1:1 - error TS2322: Type mismatch', '  Type "x" is not assignable'].join(
      '\n',
    );
    expect(parseTscDiagnostics(out)).toHaveLength(1);
  });

  it('devolve lista vazia para saída sem erro nenhum', () => {
    expect(parseTscDiagnostics('')).toEqual([]);
  });
});

describe('checkToolingTypecheck', () => {
  it('verde quando o tsc sai com 0 e nenhum diagnóstico', () => {
    const r = checkToolingTypecheck({
      repoRoot: REPO_ROOT,
      run: fakeTsc({ status: 0, stderr: '' }),
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('vermelho listando os diagnósticos', () => {
    const r = checkToolingTypecheck({
      repoRoot: REPO_ROOT,
      run: fakeTsc({
        status: 2,
        stderr: '.tooling/scripts/ci/a.ts(1,1): error TS2322: Type mismatch.\nFound 1 error.',
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/TS2322/);
    // Estas duas separam os DOIS ramos. O fallback de `status !== 0`
    // interpola a saída bruta do processo — que também contém `TS2322` —,
    // então `toMatch(/TS2322/)` sozinho é satisfeito tanto pelo gate que
    // listou o diagnóstico quanto pelo que nunca viu nenhum. Com o parser
    // neutralizado, este teste ficava VERDE: era o teste que deveria
    // prender o parser que não prendia.
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).not.toMatch(/NÃO foi verificada/);
  });

  // O tsc falha por motivos que não são diagnóstico de tipo: config inválida,
  // flag desconhecida, OOM. Nesses casos ele sai != 0 sem necessariamente
  // imprimir uma linha `error TSxxxx`. Sem este teste o gate reportaria
  // "0 erros" — verde sobre nada verificado, que é o pior resultado possível.
  it('NÃO reporta verde quando o tsc falha sem imprimir diagnóstico', () => {
    const r = checkToolingTypecheck({
      repoRoot: REPO_ROOT,
      run: fakeTsc({ status: 1, stderr: 'error TS5025: Unknown compiler option.' }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/nenhum diagnóstico/i);
  });

  it('NÃO reporta verde quando o tsc morre sem saída nenhuma', () => {
    const r = checkToolingTypecheck({
      repoRoot: REPO_ROOT,
      run: fakeTsc({ status: null, stderr: '' }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/nenhum diagnóstico/i);
  });

  it('diz qual arquivo de config foi typecheckado no caminho verde', () => {
    // Sem isto, um gate que typechecasse o path errado continua verde.
    const seen: string[][] = [];
    checkToolingTypecheck({
      repoRoot: REPO_ROOT,
      run: (args: string[]) => {
        seen.push(args);
        return { status: 0, stderr: '', stdout: '' };
      },
    });
    expect(seen[0]).toContain('--noEmit');
    expect(seen[0]).toContain(TSCONFIG);
  });

  it('vermelho, e nomeando o config, quando o tsconfig nao existe na raiz', () => {
    // Este ramo e o que transformou 6 REDs em "pelo motivo errado" quando a
    // fixture usava `/repo`: o early-return engolia o resto.
    let called = false;
    const r = checkToolingTypecheck({
      repoRoot: '/caminho/que/nao/existe',
      run: () => {
        called = true;
        return { status: 0, stderr: '', stdout: '' };
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(TSCONFIG);
    expect(called).toBe(false);
  });

  it('o arquivo de config que o gate usa existe no repo real', () => {
    // O gate pode estar verde porque aponta para um config inexistente —
    // o tsc sai != 0 sem diagnóstico e o teste acima transformaria isso em
    // vermelho, mas só se este arquivo existir. Cobre a premissa.
    const r = checkToolingTypecheck({ repoRoot: process.cwd() });
    expect(r.errors.join('\n')).not.toMatch(/NaoSuchFile|ENOENT|não existe/);
  });
});
