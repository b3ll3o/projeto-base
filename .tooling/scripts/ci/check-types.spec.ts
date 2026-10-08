import { describe, it, expect } from 'vitest';
import { linhasDoRelato } from './check-types';
import { detalhar, formatMark } from './preflight';
import type { CheckResult } from './check-types';

/**
 * MEDIDO 2026-10-08: tres lugares renderizam o motivo de um skip —
 * `formatMark`, `detalhar` e `linhasDoRelato`. Dois deles caem em
 * `?? 'sem motivo declarado'`; o terceiro nao. `CheckResult` declara
 * `skipped?` e `reason?` de forma INDEPENDENTE, entao nada no tipo obriga o
 * par — e o terceiro imprimia a string `(skipped: undefined)`.
 *
 * Nenhum check da arvore faz isso hoje (MEDIDO: os 8 sitios `skipped: true`
 * pareiam com `reason`). E latente.
 *
 * Por que o teste de paridade de `check-branch-up-to-date.spec.ts` nao pega:
 * ele compara a saida do CLI com `linhasDoRelato(esperado)` — o renderizador
 * contra ele mesmo. Um teste que so mede concordancia com a implementacao nao
 * tem como ver divergencia de implementacao. E por isso que este spec existe
 * separado: ele mede uma PROPRIEDADE (nenhum renderizador imprime `undefined`),
 * e nao concordancia.
 */
describe('linhasDoRelato - o motivo do skip nunca vira undefined', () => {
  const semMotivo: CheckResult = { ok: true, errors: [], skipped: true };

  it('SEM reason: diz que nao ha motivo, e nao imprime "undefined"', () => {
    const linhas = linhasDoRelato(semMotivo);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toContain('sem motivo declarado');
    expect(linhas[0]).not.toContain('undefined');
  });

  it('os TRES renderizadores concordam sobre a MESMA CheckResult sem motivo', () => {
    // Os tres discordavam: o painel dizia "sem motivo declarado" e o CLI
    // dizia "undefined" — o mesmo fato, duas frases.
    const vermelhoSemMotivo: CheckResult = { ok: false, errors: ['x'], skipped: true };
    const doDetalhar = detalhar(vermelhoSemMotivo).linhas;
    const tudo = [formatMark(semMotivo), ...linhasDoRelato(semMotivo), ...doDetalhar];

    // Nenhuma LINHA, de nenhum renderizador, pode conter a string "undefined".
    for (const saida of tudo) expect(saida).not.toContain('undefined');

    // E a linha do motivo — a última de cada renderizador — diz a mesma coisa
    // nos tres. Sem a ultima linha de `doDetalhar` estariamos medindo 'x'.
    for (const linha of [formatMark(semMotivo), linhasDoRelato(semMotivo)[0], doDetalhar.at(-1)!]) {
      expect(linha).toContain('sem motivo declarado');
    }
  });

  it('COM reason: o motivo real atravessa intacto', () => {
    const comMotivo: CheckResult = { ok: true, errors: [], skipped: true, reason: 'turbo ausente' };
    expect(linhasDoRelato(comMotivo)[0]).toBe('(skipped: turbo ausente)');
  });

  it('a ordem se mantem: errors, advisories, motivo', () => {
    const completo: CheckResult = {
      ok: false,
      errors: ['erro 1'],
      advisories: ['ressalva'],
      skipped: true,
      reason: 'motivo',
    };
    expect(linhasDoRelato(completo)).toEqual(['erro 1', 'ressalva', '(skipped: motivo)']);
  });

  it('SEM skip: a lista e so errors + advisories, sem linha de motivo', () => {
    expect(linhasDoRelato({ ok: false, errors: ['e'], advisories: ['a'] })).toEqual(['e', 'a']);
  });

  it('advisories ausente NAO vira "undefined" no meio da lista', () => {
    expect(linhasDoRelato({ ok: false, errors: ['e'] })).toEqual(['e']);
  });
});
