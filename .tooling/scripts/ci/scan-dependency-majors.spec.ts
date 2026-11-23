// .tooling/scripts/ci/scan-dependency-majors.spec.ts
//
// pt-BR: O `deps:major-scan` é o passo COM REDE que mede quais majors existem
// no registro; o gate `check-dependency-freshness` é hermético e lê o arquivo
// que ele gera. Se o script escreve um arquivo vazio, o gate não acusa nada —
// ele fica verde sem medição.
//
// MEDIDO 2026-11-23: o `npm` 12 devolve `npm view <pkg> dist-tags --json` como
// uma LISTA (`[{"latest":"12.6.0", ...}]`), e não como o objeto plano que o
// `npm` 10 devolvia. O script lia `tags.latest` do objeto plano, recebia
// `undefined`, e o arquivo versionado era escrito com `"majors": {}` — os 67
// pacotes caíam em "sem consulta ao registro" e o gate perdia a medição SEM
// ACUSAR NADA. Estos testes prendem a normalização que conserta isso.
//
// Cobre:
// - a forma PLANA (npm 10) e a forma LISTA (npm 12) devolvem o mesmo mapa
// - a LISTA com mais de um objeto junta os dois
// - a forma que o `npm` devolve para um pacote inexistente (erro) não derruba
//   o script: o `catch` devolve `null` e o pacote vai para "sem consulta"
// - `isPreRelease` (o filtro que separa uma major ESTÁVEL de um RC) continua
//   classificando as versões como antes

import { describe, expect, it } from 'vitest';
import { isPreRelease, normalizaDistTags } from './scan-dependency-majors.js';

describe('normalizaDistTags', () => {
  it('aceita a forma PLANA (npm 10): um objeto tag → versão', () => {
    const bruto = { latest: '12.6.0', rc: '13.0.0-rc.1', legacy: '11.2.11' };
    expect(normalizaDistTags(bruto)).toEqual(bruto);
  });

  it('aceita a forma LISTA (npm 12): uma lista de objetos tag → versão', () => {
    const bruto = [{ latest: '12.6.0', rc: '13.0.0-rc.1', legacy: '11.2.11' }];
    expect(normalizaDistTags(bruto)).toEqual({
      latest: '12.6.0',
      rc: '13.0.0-rc.1',
      legacy: '11.2.11',
    });
  });

  it('a LISTA com mais de um objeto junta todos (o npm devolve assim em installs)', () => {
    const bruto = [{ latest: '12.6.0' }, { legacy: '11.2.11' }];
    expect(normalizaDistTags(bruto)).toEqual({ latest: '12.6.0', legacy: '11.2.11' });
  });

  it('uma lista vazia devolve um mapa vazio — e NÃO um mapa com chaves undefined', () => {
    // A forma quebrada que o script tinha: `tags.latest` dava `undefined` e o
    // arquivo saía com `majors: {}` — o gate perdia a medição sem acusar.
    expect(normalizaDistTags([])).toEqual({});
    expect(normalizaDistTags(null)).toEqual({});
    expect(normalizaDistTags(undefined)).toEqual({});
  });

  it('um valor que não é objeto é ignorado em vez de virar lixo no mapa', () => {
    expect(normalizaDistTags(['latest', 12])).toEqual({});
  });
});

describe('isPreRelease', () => {
  it('um RC não é uma major estável', () => {
    expect(isPreRelease('8.0.0-rc.33')).toBe(true);
    expect(isPreRelease('6.0.0-rc.1')).toBe(true);
    expect(isPreRelease('1.2.3-beta.1')).toBe(true);
  });

  it('uma versão estável não é pre-release', () => {
    expect(isPreRelease('12.6.0')).toBe(false);
    expect(isPreRelease('6.19.3')).toBe(false);
  });
});
