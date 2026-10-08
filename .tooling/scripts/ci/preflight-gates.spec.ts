import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PREFLIGHT_CHECKS, preflightGates, idsDeclarados } from './preflight-gates';
import { RUNNERS, resolverChecks } from './preflight';
import { registryGateFiles } from './check-teeth-registry';

/**
 * A lista de gates do preflight é FONTE ÚNICA, e este spec existe para que
 * "fonte única" seja uma propriedade medida e não uma intenção.
 *
 * O furo que motivou a extração (medido em 2026-10-06): um gate inserido em
 * `preflight.ts` rodava, o preflight imprimia `✓`, e o `check-teeth-registry`
 * devolvia `EXIT=0` — porque o reconciliador comparava o registro contra um
 * LITERAL seu (`PREFLIGHT_GATES`), transcrito à mão, e não contra o que roda.
 * Gate novo não tinha obrigação nenhuma de entrar no registro.
 *
 * Por isso o primeiro teste daqui não afirma que `PREFLIGHT_GATES` "existe":
 * afirma que ele **acompanha** a lista. Um literal passa em toda checagem de
 * igualdade e falha nessa — que é a diferença entre a forma e o sistema.
 */

const REGISTRO = '.agents/specs/conventions/ci-defense-in-depth.md';
const PREFLIGHT_TS = '.tooling/scripts/ci/preflight.ts';

describe('preflightGates() — é derivado, não literal', () => {
  it('um gate novo na lista aparece em preflightGates() sem ninguém editar o reconciliador', () => {
    const antes = preflightGates().length;
    // O fantasma: gate que existe em `checks` e em nada mais. É exatamente o
    // que entrava por baixo do reconciliador.
    PREFLIGHT_CHECKS.push({
      id: 'gate-fantasma-do-spec',
      name: 'Gate fantasma do spec',
      file: '.tooling/scripts/ci/check-fantasma-do-spec.ts',
    });
    try {
      expect(preflightGates().length).toBe(antes + 1);
      expect(preflightGates().some((g) => g.file.endsWith('check-fantasma-do-spec.ts'))).toBe(true);
    } finally {
      PREFLIGHT_CHECKS.pop();
    }
    // Restauração também é asserção: um spec que suja a lista deixa o resto
    // da suíte verde sobre um estado que não existe mais em disco.
    expect(preflightGates().length).toBe(antes);
  });

  it('preflightGates() tem exatamente uma entrada por gate, com name e file', () => {
    expect(preflightGates()).toEqual(PREFLIGHT_CHECKS.map(({ name, file }) => ({ name, file })));
  });
});

describe('PREFLIGHT_CHECKS — a lista', () => {
  it('todo id é único', () => {
    const ids = idsDeclarados();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo id tem runner, e todo runner tem id', () => {
    const ids = new Set(idsDeclarados());
    const runners = new Set(Object.keys(RUNNERS));
    expect([...ids].filter((id) => !runners.has(id))).toEqual([]);
    expect([...runners].filter((id) => !ids.has(id))).toEqual([]);
  });

  it('um id sem runner é RECUSADO com o id nomeado, não descartado em silêncio', () => {
    // MEDIDO 2026-10-08: esta linha não existia, e o teste de par `id`↔runner
    // acima ficava 8/8 VERDE com o throw de `resolverChecks` removido e um
    // fallback verde no lugar. Motivo: no repo real todo id tem runner, então
    // o caminho de falha era INERTE — um gate que nunca pode disparar porque
    // o conjunto que ele vigia está vazio. Aqui o conjunto deixa de estar
    // vazio, e o throw é medido.
    PREFLIGHT_CHECKS.push({
      id: 'gate-sem-runner',
      name: 'Gate sem runner',
      file: '.tooling/scripts/ci/check-sem-runner.ts',
    });
    try {
      expect(() => resolverChecks()).toThrow(/gate-sem-runner/);
    } finally {
      PREFLIGHT_CHECKS.pop();
    }
  });

  it('todo file existe no disco — `file` é a chave da reconciliação, não enfeite', () => {
    const ausentes = PREFLIGHT_CHECKS.filter((c) => !existsSync(c.file)).map((c) => c.file);
    expect(ausentes).toEqual([]);
  });

  it('todo gate tem linha no Registro de dentes, casado por `file`', () => {
    const registrados = new Set(registryGateFiles(readFileSync(REGISTRO, 'utf8')));
    const orfaos = PREFLIGHT_CHECKS.filter((c) => !registrados.has(c.file)).map((c) => c.file);
    expect(orfaos).toEqual([]);
  });

  it('nenhum gate entra sem `file`', () => {
    // Sem `file` a reconciliação cai para semelhança de nome — a classe 2 do
    // `guard-classes.md`: cobre a forma que você conhece e só ela.
    expect(PREFLIGHT_CHECKS.filter((c) => !c.file.trim()).map((c) => c.id)).toEqual([]);
  });
});

describe('anti-regressão: a lista não pode se duplicar', () => {
  it('`preflight.ts` não declara array de checks próprio', () => {
    const src = readFileSync(PREFLIGHT_TS, 'utf8');
    // Se voltar um `const checks:` aqui, a lista volta a ter duas fontes e o
    // `preflight-gates.ts` passa a ser decoração — verde sobre estado falso.
    expect(src).not.toMatch(/const\s+checks\s*:/);
    expect(src).not.toMatch(/checks\s*:\s*Array\s*</);
  });
});
