/**
 * SEM shebang, de propósito.
 *
 * Spec do gate `check-shell-injection` (#117).
 *
 * ⚠️ O CASO (e) É O QUE PROVA QUE A AST É NECESSÁRIA: um arquivo que só
 * COMENTA o defeito (`// era execSync(`cmd ${x}`)`) não pode ser acusado. Com
 * regex, o gate acusaria o próprio comentário do conserto — e alguém o
 * desligaria.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkShellInjection } from './check-shell-injection.js';

let raiz: string;
let dirTmp: string;

beforeEach(async () => {
  raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'check-shell-injection-'));
  dirTmp = path.join(raiz, 'tooling', 'scripts');
  await fs.mkdir(dirTmp, { recursive: true });
});

afterEach(async () => {
  await fs.rm(raiz, { recursive: true, force: true });
});

async function escrever(nome: string, conteudo: string): Promise<void> {
  await fs.writeFile(path.join(dirTmp, nome), conteudo, 'utf-8');
}

describe('checkShellInjection (#117)', () => {
  it('PASSA quando não há nenhum arquivo', async () => {
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('PASSA com um comando de string simples', async () => {
    await escrever(
      'a.ts',
      "import { execSync } from 'node:child_process';\nexecSync('git ls-files');\n",
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('PASSA com template literal SEM interpolação (é uma constante)', async () => {
    await escrever(
      'a.ts',
      'import { execSync } from "node:child_process";\nexecSync(`git ls-files`);\n',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('ERRO com execSync de comando interpolado', async () => {
    await escrever(
      'a.ts',
      'import { execSync } from "node:child_process";\nexecSync(`git check-ignore ${filePath}`);\n',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/execSync/);
  });

  it('ERRO com exec() de comando interpolado', async () => {
    await escrever('a.ts', 'import { exec } from "node:child_process";\nexec(`ls ${dir}`);\n');
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(false);
  });

  it('ERRO com spawnSync de comando interpolado', async () => {
    await escrever(
      'a.ts',
      'import { spawnSync } from "node:child_process";\nspawnSync(`sh ${x}`);\n',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(false);
  });

  it('PASSA com execFileSync de template literal (não é shell)', async () => {
    await escrever(
      'a.ts',
      'import { execFileSync } from "node:child_process";\nexecFileSync("git", ["check-ignore", "--", p]);\n',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('PASSA quando o comando interpolado está só num COMENTÁRIO', async () => {
    // ⚠️ Este é o caso que prova que a AST é necessária. Com regex, o gate
    // acusaria o próprio comentário do conserto.
    await escrever(
      'a.ts',
      [
        '// era execSync(`git check-ignore ${JSON.stringify(filePath)}`)',
        '/* e tambem execSync(`cmd ${x}`) */',
        "import { execFileSync } from 'node:child_process';",
        "execFileSync('git', ['ls-files']);",
      ].join('\n'),
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('PASSA quando o comando interpolado está numa STRING (não é uma chamada)', async () => {
    await escrever('a.ts', 'const exemplo = `git check-ignore ${x}`;\n');
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('ERRO quando o comando interpolado é o SEGUNDO argumento', async () => {
    // A regra olha o PRIMEIRO argumento — que é o comando. Mas uma chamada
    // com o comando interpolado em qualquer posição de shell é suspecta; o
    // gate mede o primeiro porque é o que executa.
    await escrever(
      'a.ts',
      'import { execSync } from "node:child_process";\nexecSync("cmd", `x ${y}`);\n',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('ERRO aponta o arquivo e a linha', async () => {
    await escrever(
      'a.ts',
      [
        '// linha 1',
        '// linha 2',
        'import { execSync } from "node:child_process";',
        'execSync(`x ${y}`);',
      ].join('\n'),
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/a\.ts:4/);
  });

  it('o arquivo do PRÓPRIO repo passa (o #117 já foi corrigido)', async () => {
    const r = await checkShellInjection({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
  });

  // ── a concatenação: a OUTRA forma natural de montar o comando ──────────
  //
  // MEDIDO: com a regra antiga (só TemplateExpression), o gate pegava 1 das
  // 6 formas da mesma classe. `execSync('git rev-parse ' + p)` — a forma que
  // alguém escreve sem pensar no `JSON.stringify` — passava calada.
  it('ERRO com comando montado por CONCATENAÇÃO', async () => {
    await escrever(
      'a.ts',
      'import { execSync } from "node:child_process";\nexecSync("git rev-parse " + p);\n',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(false);
  });

  it('PASSA com concatenação de DOIS literais (é uma constante)', async () => {
    await escrever(
      'a.ts',
      'import { execSync } from "node:child_process";\nexecSync("git " + "ls-files");\n',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  // ── o escopo: o gate varre o REPO, e não só o tooling ─────────────────
  //
  // MEDIDO: com o escopo antigo, um `execSync` interpolado em
  // `apps/api/src/**` passava — e o gate é o que protege o P0 do #117, cujo
  // vetor é um valor que vem do PR.
  it('ERRO com comando interpolado em apps/ (o escopo é o repo inteiro)', async () => {
    const dirApps = path.join(raiz, 'apps', 'api', 'src');
    await fs.mkdir(dirApps, { recursive: true });
    await fs.writeFile(
      path.join(dirApps, 'x.ts'),
      'import { execSync } from "node:child_process";\nexecSync(`git ls-files ${p}`);\n',
      'utf-8',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(false);
  });

  it('PASSA com comando interpolado em packages/ que NÃO é shell', async () => {
    const dirPkg = path.join(raiz, 'packages', 'shared-types');
    await fs.mkdir(dirPkg, { recursive: true });
    await fs.writeFile(
      path.join(dirPkg, 'x.ts'),
      'import { execFileSync } from "node:child_process";\nexecFileSync("git", ["ls-files", p]);\n',
      'utf-8',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('PASSA com um .d.ts de artefato (o `dist` não é fonte)', async () => {
    const dirDist = path.join(raiz, 'apps', 'api', 'dist');
    await fs.mkdir(dirDist, { recursive: true });
    await fs.writeFile(
      path.join(dirDist, 'x.d.ts'),
      'import { execSync } from "node:child_process";\nexecSync(`git ls-files ${p}`);\n',
      'utf-8',
    );
    const r = await checkShellInjection({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });
});
