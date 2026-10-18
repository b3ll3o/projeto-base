import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkTeethCount } from './check-teeth-count';

/**
 * Raiz do repo derivada do PRÓPRIO spec, nunca de `process.cwd()` — mesmo
 * motivo do `check-branch-up-to-date.spec.ts`: um caminho relativo a
 * `node_modules` resolve a partir do cwd, e o teste mediria o repo errado.
 */
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_ROOT, '.tooling/scripts/ci/check-teeth-count.ts');

describe('checkTeethCount', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'check-teeth-count-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string = '') {
    const full = join(tmp, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  it('verde quando name count === array length, e file count < name count', async () => {
    // 3 entries, 2 arquivos únicos (eslint-drift entra 2x)
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      `export const PREFLIGHT_CHECKS = [
  { name: 'a', file: '.tooling/scripts/ci/check-x.ts', id: 'a' },
  { name: 'b', file: '.tooling/scripts/ci/check-x.ts', id: 'b' },
  { name: 'c', file: '.tooling/scripts/ci/check-y.ts', id: 'c' },
];`,
    );
    writeFile('.tooling/scripts/ci/check-x.ts');
    writeFile('.tooling/scripts/ci/check-y.ts');
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('vermelho quando o grep acha MENOS `name:` do que o array tem (entry sem nome)', async () => {
    // Cenário: alguém adicionou uma entry sem o campo `name:` (provavelmente
    // WIP), e o array tem 2 mas o grep só vê 1.
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      `export const PREFLIGHT_CHECKS = [
  { file: '.tooling/scripts/ci/check-x.ts', id: 'sem-nome' },
  { name: 'com-nome', file: '.tooling/scripts/ci/check-y.ts', id: 'com-nome' },
];`,
    );
    writeFile('.tooling/scripts/ci/check-x.ts');
    writeFile('.tooling/scripts/ci/check-y.ts');
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/DIVERGE/);
    expect(r.errors[0]).toMatch(/1 linhas/);
    expect(r.errors[0]).toMatch(/2 entradas/);
  });

  it('vermelho quando o par name/file quebra (file count === name count)', async () => {
    // 2 entries, 2 arquivos únicos — quebra a relação esperada (diferença = 1).
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      `export const PREFLIGHT_CHECKS = [
  { name: 'a', file: '.tooling/scripts/ci/check-x.ts', id: 'a' },
  { name: 'b', file: '.tooling/scripts/ci/check-y.ts', id: 'b' },
];`,
    );
    writeFile('.tooling/scripts/ci/check-x.ts');
    writeFile('.tooling/scripts/ci/check-y.ts');
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/paridade quebrada/);
  });

  it('vermelho quando preflight-gates.ts não existe', async () => {
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/PREFLIGHT_CHECKS/);
  });

  // Os 4 testes acima cobrem a FUNÇÃO. Este cobre o que eles não alcançam: o
  // bloco de CLI no fim do módulo — que é exatamente a classe
  // "gate sem bloco CLI roda como no-op", registrada em `guard-classes.md`.
  it('o bloco de CLI roda de verdade: imprime algo na árvore real', () => {
    const r = spawnSync(TSX, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8' });

    // A asserção que fecha a classe. MEDIDO 2026-10-17: o bloco existia e
    // saía 0, mas `linhasDoRelato` devolve `[]` quando não há erro nem
    // advisory — então o comando de remedição era mudo na árvore sadia, e
    // "mudo + exit 0" é indistinguível de "não mediu". Desligar o bloco
    // (stderr vazio) faria este teste ficar VERMELHO: é o dente que faltava.
    // MEDIDO 2026-10-18 (achado do revisor): a versão anterior exigia
    // `status === 0` E `stderr` casando `/OK/`, e as DUAS condições caem
    // juntas quando alguém adiciona um gate ao `PREFLIGHT_CHECKS` sem `file:`
    // — exatamente o defeito que este gate existe para denunciar. O spec
    // então ficava vermelho por um motivo que não é "o bloco parou de
    // rodar", e a mensagem não apontava para a paridade. Exigir SAÍDA (qualquer
    // uma) separa os dois: bloco morto ⇒ vazio ⇒ vermelho; drift ⇒ não-vazio
    // ⇒ verde, e quem vê o vermelho é o próprio gate do preflight.
    expect(r.stderr).not.toBe('');
  });

  // O teste acima só prova que o bloco IMPRIME. O exit code é a outra metade —
  // e MEDIDO 2026-10-18: trocar `process.exit(r.ok ? 0 : 1)` por `process.exit(0)`
  // deixava os 5 testes verdes. Nenhum deles rodava o CLI contra uma árvore
  // quebrada, então o conserto do `exit` — o primeiro dos dois, o que o revisor
  // apontou — estava sem dente.
  it('o CLI sai DIFERENTE de zero quando a paridade está quebrada', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'check-teeth-count-cli-'));
    try {
      mkdirSync(join(raiz, '.tooling/scripts/ci'), { recursive: true });
      // 2 entradas, 1 com `name:` — a divergência que o gate existe para denunciar.
      writeFileSync(
        join(raiz, '.tooling/scripts/ci/preflight-gates.ts'),
        `export const PREFLIGHT_CHECKS = [
  { file: '.tooling/scripts/ci/check-x.ts', id: 'sem-nome' },
  { name: 'com-nome', file: '.tooling/scripts/ci/check-y.ts', id: 'com-nome' },
];`,
      );

      // `repoRoot: '.'` resolve pelo cwd, e TSX/SCRIPT são absolutos: o CLI roda
      // contra a árvore plantada sem que o gate do repo real entre no meio.
      const r = spawnSync(TSX, [SCRIPT], { cwd: raiz, encoding: 'utf8' });

      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('DIVERGE');
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
