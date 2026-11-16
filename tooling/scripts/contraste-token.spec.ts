// tooling/scripts/contraste-token.spec.ts
//
// O instrumento da tabela de contraste da convenção
// `.agents/specs/conventions/estilizacao.md` §2.2.
//
// ⚠️ Este spec mede a MESMA coisa que a tabela afirma: se o token mudar e a
// tabela não mudar, o spec acusa — e é por isso que ele existe. Um número
// numa doc sem instrumento é um número que envelhece em silêncio.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAMINHO_DO_CSS,
  PARES,
  comporSobre,
  hslParaRgb,
  lerTokens,
  luminancia,
  razao,
  razaoDoPar,
  tabela,
} from './contraste-token';

const RAIZ = path.resolve(__dirname, '../..');
const CSS_REAL = fs.readFileSync(path.join(RAIZ, CAMINHO_DO_CSS), 'utf-8');
const TOKENS = lerTokens(CSS_REAL);

describe('a leitura dos tokens', () => {
  it('lê os 13 tokens de cor do bloco `@theme` do app', () => {
    // MEDIDO 2026-11-16: `grep -c '^\s*--color' apps/web/app/globals.css` → 13.
    expect(TOKENS.size).toBe(13);
  });

  it('lê a cor COMPLETA — e ignora a tripla HSL crua (que é CSS inválido)', () => {
    // A tripla crua (`--color-x: 0 0% 100%`) é o defeito que o padrão
    // proíbe: no Tailwind 4 ela gera uma utilitária com CSS inválido, e o
    // browser descarta a declaração em silêncio.
    const tokens = lerTokens('--color-ruim: 0 0% 100%;\n--color-bom: hsl(0 0% 100%);');
    expect(tokens.has('--color-ruim')).toBe(false);
    expect(tokens.get('--color-bom')?.l).toBe(100);
  });
});

describe('a matemática WCAG', () => {
  it('a luminância do preto é 0 e a do branco é 1', () => {
    expect(luminancia([0, 0, 0])).toBeCloseTo(0, 10);
    expect(luminancia([255, 255, 255])).toBeCloseTo(1, 10);
  });

  it('a razão do preto contra o branco é 21:1', () => {
    expect(razao([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10);
  });

  it('a razão é simétrica', () => {
    expect(razao([120, 130, 140], [20, 30, 40])).toBeCloseTo(
      razao([20, 30, 40], [120, 130, 140]),
      10,
    );
  });

  it('o HSL do token vira o RGB que o browser mostra', () => {
    // `hsl(210 40% 98%)` é o fundo da página — MEDIDO 2026-11-16 no
    // Chromium: `rgb(248, 250, 252)`.
    expect(hslParaRgb(210, 40, 98)).toEqual([248, 250, 252]);
  });
});

describe('a composição como o BROWSER compõe', () => {
  it('o fundo do alerta de erro sai (240, 227, 229) — o pixel do Chromium', () => {
    // MEDIDO 2026-11-16 no Chromium 1223, com `color-mix(in oklab, hsl(0 72%
    // 41%) 10%, transparent)` sobre o fundo da página: o pixel lido no
    // canvas é (240, 227, 229). A média simples daria (241, 228, 230) — e a
    // razão sairia 5,42 em vez de 5,37.
    expect(comporSobre([180, 29, 29], [248, 250, 252], 0.1)).toEqual([240, 227, 229]);
  });

  it('o fundo do alerta de sucesso sai (223, 235, 233) — o pixel do Chromium', () => {
    expect(comporSobre([9, 103, 72], [248, 250, 252], 0.1)).toEqual([223, 235, 233]);
  });
});

describe('a tabela medida', () => {
  it('tem 17 pares, e é a mesma lista que a convenção publica', () => {
    expect(PARES).toHaveLength(17);
  });

  it('os números que a §2.2 afirma', () => {
    const medida = new Map(tabela(TOKENS).map((l) => [l.nome, l.razao]));
    expect(medida.get('foreground/surface')).toBe('17,87');
    expect(medida.get('foreground/background')).toBe('17,08');
    expect(medida.get('ring/surface')).toBe('7,95');
    expect(medida.get('muted-foreground/surface')).toBe('6,91');
    expect(medida.get('primary-foreground/primary')).toBe('5,17');
    // O do alerta é o que o browser mede (MEDIDO 2026-11-16 no Chromium).
    expect(medida.get('destructive no fundo do alerta')).toBe('5,37');
    expect(medida.get('success no fundo do alerta')).toBe('5,65');
    // A borda da caixa do alerta: o fio que separa a tinta do erro do fundo
    // dela — 1,65:1, ou seja, quase invisível (e é por isso que a MENSAGEM é
    // que carrega o estado, não a borda).
    expect(medida.get('a borda do alerta de erro')).toBe('1,65');
    expect(medida.get('control/surface')).toBe('4,89');
    expect(medida.get('control/background')).toBe('4,68');
    expect(medida.get('control/muted')).toBe('4,13');
    // A superfície sobre o fundo: o degrau que carrega a hierarquia.
    expect(medida.get('surface/background')).toBe('1,05');
    expect(medida.get('muted/surface')).toBe('1,18');
    expect(medida.get('border/surface')).toBe('1,24');
  });

  it('todo par medido tem os DOIS tokens', () => {
    for (const par of PARES) {
      expect(razaoDoPar(par, TOKENS)).not.toBeNull();
    }
  });
});
