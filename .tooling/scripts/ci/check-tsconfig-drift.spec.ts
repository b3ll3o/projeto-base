import { describe, it, expect, beforeAll } from 'vitest';
import { checkTsconfigDrift } from './check-tsconfig-drift';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('checkTsconfigDrift', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    // Cria fixtures em diretório temporário único por test run
    // para garantir hermeticidade mesmo se /tmp/ci-fixtures não existir.
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tsconfig-drift-test-'));

    // Fixtures "consistent": todos definem os mesmos valores
    const consistentDir = path.join(tmpRoot, 'consistent');
    await fs.mkdir(consistentDir, { recursive: true });
    await fs.writeFile(
      path.join(consistentDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true } }),
    );
    await fs.writeFile(
      path.join(consistentDir, 'tsconfig.app.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true } }),
    );

    // Fixtures "drift": tsconfig.app.json diverge
    const driftDir = path.join(tmpRoot, 'drift');
    await fs.mkdir(driftDir, { recursive: true });
    await fs.writeFile(
      path.join(driftDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true } }),
    );
    await fs.writeFile(
      path.join(driftDir, 'tsconfig.app.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: false } }),
    );
  });

  it('deve passar quando strict e noUncheckedIndexedAccess são consistentes', async () => {
    const result = await checkTsconfigDrift({
      tsconfigsRoot: path.join(tmpRoot, 'consistent'),
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    expect(result.ok).toBe(true);
  });

  it('NÃO fica em silêncio quando a chave é declarada por MENOS de dois configs', async () => {
    // O furo medido. Fixture com UM config declarando a chave e outro herdando
    // por `extends` sem declará-la: `defined.length === 1 < 2`, o `continue`
    // antigo saía sem dizer nada e o gate devolvia `{ ok: true, errors: [] }` —
    // um ✓ para uma comparação que não aconteceu.
    const dir = path.join(tmpRoot, 'so-um-declara');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );
    await fs.writeFile(
      path.join(dir, 'tsconfig.app.json'),
      JSON.stringify({ extends: './tsconfig.json', compilerOptions: {} }),
    );

    const result = await checkTsconfigDrift({
      tsconfigsRoot: dir,
      consistentKeys: ['strict'],
    });
    // Continua VERDE: herdar não é defeito, e o contrato manda o que é verdade
    // sobre a medição para `advisories`, não para `errors`.
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    // E não é verde mudo: quem lê o painel precisa saber que 1 de 2 foi
    // comparado, ou "✓" e "todos os 2 concordam" continuam a mesma imagem.
    expect(result.advisories?.join('\n')).toMatch(/'strict' foi comparado em 1 de 2/);
    expect(result.advisories?.join('\n')).toMatch(/NÃO foram verificados/);
  });

  it('NÃO emite advisory quando a chave é declarada por TODOS os configs', async () => {
    // O contrafactual positivo do teste acima: sem ele, um gate que
    // imprimisse a ressalva sempre também passaria no teste anterior, e o
    // painel passaria a gritar "não verificado" sobre uma comparação que foi
    // feita. Advisory que não tem quandoGdizer, é ruído.
    const result = await checkTsconfigDrift({
      tsconfigsRoot: path.join(tmpRoot, 'consistent'),
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    expect(result.ok).toBe(true);
    expect(result.advisories).toBeUndefined();
  });

  it('no repo REAL a chave é declarada por 1 de 7 — e o gate diz isso', async () => {
    // O diferencial contra o repo de verdade, que é o que o teste em tmpdir
    // não prova. MEDIDO 2026-10-08 com
    // `npx tsx` chamando `checkTsconfigDrift({ tsconfigsRoot: '.', ... })`:
    // 7 configs encontrados, 1 declarando cada chave, `errors: []`.
    //
    // A contagem não é fixada aqui de propósito: ela envelhece a cada
    // `tsconfig.json` novo, e um número congelado na spec passa a mentir sem
    // nunca ficar vermelho. O que a spec exige é o que NÃO pode envelhecer —
    // que a ressalva exista e nomeie a chave.
    const result = await checkTsconfigDrift({
      tsconfigsRoot: REPO_ROOT,
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    const texto = (result.advisories ?? []).join('\n');
    expect(texto).toMatch(/'strict' foi comparado em 1 de (\d+) tsconfig/);
    expect(texto).toMatch(/'noUncheckedIndexedAccess' foi comparado em 1 de (\d+) tsconfig/);
    // E o gate segue verde: comparar pouco não é drift.
    expect(result.ok).toBe(true);
  });

  it('deve falhar quando noUncheckedIndexedAccess=true em um tsconfig e false em outro', async () => {
    const result = await checkTsconfigDrift({
      tsconfigsRoot: path.join(tmpRoot, 'drift'),
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('noUncheckedIndexedAccess'))).toBe(true);
  });
});
