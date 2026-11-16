/**
 * Razão de contraste dos tokens do padrão de estilização.
 *
 * ⚠️ Este script é o INSTRUMENTO da tabela de contraste da convenção
 * `.agents/specs/conventions/estilizacao.md` §2.2. A tabela afirmava 16
 * razões de contraste sem NENHUM comando que as reproduzisse — e a
 * AGENTS.md §1.2 diz que um doc que mente é defeito (P0): uma tabela sem
 * instrumento envelhece em silêncio.
 *
 * O que ele mede: a razão WCAG 2.x (`(L₁+0,05)/(L₂+0,05)`) entre os tokens
 * REAIS de `apps/web/app/globals.css` (bloco `@theme`).
 *
 *   L = 0,2126·R + 0,7152·G + 0,0722·B
 *   (canal linearizado: v ≤ 0,03928 ? v/12,92 : ((v+0,055)/1,055)^2,4)
 *
 * ## O fundo do ALERTA
 *
 * ⚠️ O `Alerta` não pinta `bg-destructive`: ele pinta `bg-destructive/10`,
 * que o Tailwind 4 emite como `color-mix(in oklab, … 10%, transparent)`.
 * Misturar com `transparent` em oklab devolve a MESMA cor com alfa 0,1 (a
 * cor transparente é `rgb(0 0 0 / 0)`, e a mistura é feita com alfa
 * pré-multiplicado) — e o browser COMPÕE esse alfa sobre a página em sRGB.
 * Por isso o fundo do alerta é `0,1·destructive + 0,9·background` em sRGB,
 * e é essa a conta que reproduz o número que o browser mede.
 *
 * ## O que ele NÃO mede
 *
 * - **Se o par é o certo** — o script calcula; o significado é humano.
 * - **O contraste de um texto sobre uma FOTO ou um gradiente** — a página
 *   do app não tem nenhum.
 * - **O contraste real do texto renderizado** — anti-aliasing, subpixel e a
 *   fonte importada mudam o número percebido em fração de ponto.
 *
 * Uso:
 *   pnpm estilo:contraste
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Um token de cor do bloco `@theme`, em HSL. */
export interface Token {
  nome: string;
  h: number;
  s: number;
  l: number;
}

/** RGB em 0..255. */
export type Rgb = readonly [number, number, number];

/**
 * Lê os tokens `--color-*` de um CSS.
 *
 * ⚠️ Só `hsl(...)` — que é o formato que o padrão exige (a cor COMPLETA no
 * token; ver a §2.2 da convenção). Um token em hex ou em tripla HSL crua
 * não é lido, e isso é proposital: o token cru é CSS INVÁLIDO no Tailwind 4,
 * e o script não deve fingir que ele é uma cor.
 */
export function lerTokens(css: string): Map<string, Token> {
  const tokens = new Map<string, Token>();
  const re = /--color-([a-z-]+)\s*:\s*hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/g;
  let achado: RegExpExecArray | null;
  while ((achado = re.exec(css)) !== null) {
    const [, nome, h, s, l] = achado;
    tokens.set(`--color-${nome}`, {
      nome: `--color-${nome}`,
      h: Number(h),
      s: Number(s),
      l: Number(l),
    });
  }
  return tokens;
}

/** HSL → RGB (0..255). */
export function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lum - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** O RGB de um token. */
export function rgbDoToken(token: Token): Rgb {
  return hslParaRgb(token.h, token.s, token.l);
}

/**
 * Compõe uma cor com alfa sobre um fundo — como o BROWSER compõe.
 *
 * ⚠️ Não é a média em ponto flutuante. O Chromium compõe em 8 bits
 * PRÉ-MULTIPLICADO (MEDIDO 2026-11-16 no Chromium 1223, com 4 casos-prova):
 *
 *   alfa8   = round(alfa · 255)
 *   srcPre  = round(canal · alfa8 / 255)      (pré-multiplicado, 8 bits)
 *   out     = floor(srcPre + fundo · (255 − alfa8) / 255)
 *
 * A diferença importa: a média simples dá (241, 228, 230) para o fundo do
 * alerta de erro, e o browser dá (240, 227, 229) — e a razão sai 5,42 em vez
 * de 5,37. Como a tabela da convenção é o número que a PESSOA vê, o script
 * tem que compor como o browser compõe.
 */
export function comporSobre(cor: Rgb, fundo: Rgb, alfa: number): Rgb {
  const alfa8 = Math.round(alfa * 255);
  const escala = alfa8 / 255;
  const destino = (255 - alfa8) / 255;
  return cor.map((canal, i) => {
    const pre = Math.round(canal * escala);
    const doFundo = fundo[i] ?? 0;
    return Math.floor(pre + doFundo * destino);
  }) as unknown as Rgb;
}

/** A luminância relativa WCAG de um RGB. */
export function luminancia(rgb: Rgb): number {
  const canal = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb.map(canal);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** A razão de contraste WCAG entre dois RGB. */
export function razao(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [maior, menor] = la >= lb ? [la, lb] : [lb, la];
  return (maior + 0.05) / (menor + 0.05);
}

/** Um par medido: os dois tokens, e onde o par acontece. */
export interface Par {
  /** O nome do par, como na tabela da convenção. */
  nome: string;
  /** O token da tinta (o primeiro da razão). */
  tinta: string;
  /** O token do fundo. */
  fundo: string;
  /** A opacidade da tinta sobre o fundo — 1 para as contas diretas. */
  alfa?: number;
  /**
   * O fundo não é o token cru: é ESTE token a esta opacidade sobre o fundo
   * da página. É o caso do `Alerta`, cujo fundo é `bg-destructive/10` sobre a
   * página — e o texto (e a borda) do alerta é medido SOBRE ele.
   */
  fundoAlfa?: { token: string; alfa: number };
  /** Onde o par acontece na tela. */
  onde: string;
}

/**
 * Os pares da §2.2.
 *
 * ⚠️ Esta lista é a MESMA da tabela da convenção — e é a que o gate
 * `check-doc-claims` mede. Mudar um par aqui é mudar a tabela junto.
 */
export const PARES: readonly Par[] = [
  {
    nome: 'foreground/surface',
    tinta: '--color-foreground',
    fundo: '--color-surface',
    onde: 'texto em painel, card e campo',
  },
  {
    nome: 'foreground/background',
    tinta: '--color-foreground',
    fundo: '--color-background',
    onde: 'texto corrido da página',
  },
  {
    nome: 'ring/surface',
    tinta: '--color-ring',
    fundo: '--color-surface',
    onde: 'anel de foco sobre card',
  },
  {
    nome: 'ring/background',
    tinta: '--color-ring',
    fundo: '--color-background',
    onde: 'anel de foco sobre a página',
  },
  {
    nome: 'muted-foreground/surface',
    tinta: '--color-muted-foreground',
    fundo: '--color-surface',
    onde: 'legenda e metadado',
  },
  {
    nome: 'muted-foreground/background',
    tinta: '--color-muted-foreground',
    fundo: '--color-background',
    onde: 'legenda e metadado na página',
  },
  {
    nome: 'primary-foreground/primary-hover',
    tinta: '--color-primary-foreground',
    fundo: '--color-primary-hover',
    onde: 'texto do botão primário no hover',
  },
  {
    nome: 'primary-foreground/primary',
    tinta: '--color-primary-foreground',
    fundo: '--color-primary',
    onde: 'texto do botão primário',
  },
  {
    nome: 'destructive no fundo do alerta',
    tinta: '--color-destructive',
    fundo: '--color-background',
    fundoAlfa: { token: '--color-destructive', alfa: 0.1 },
    onde: 'texto de erro do `Alerta`',
  },
  {
    nome: 'success no fundo do alerta',
    tinta: '--color-success',
    fundo: '--color-background',
    fundoAlfa: { token: '--color-success', alfa: 0.1 },
    onde: 'texto do aviso de sucesso',
  },
  {
    nome: 'a borda do alerta de erro',
    tinta: '--color-destructive',
    fundo: '--color-background',
    alfa: 0.3,
    fundoAlfa: { token: '--color-destructive', alfa: 0.1 },
    onde: 'a caixa do `Alerta` de erro (30% do token)',
  },
  {
    nome: 'control/surface',
    tinta: '--color-control',
    fundo: '--color-surface',
    onde: 'contorno de campo sobre card',
  },
  {
    nome: 'control/background',
    tinta: '--color-control',
    fundo: '--color-background',
    onde: 'contorno de campo e de select sobre a página',
  },
  {
    nome: 'control/muted',
    tinta: '--color-control',
    fundo: '--color-muted',
    onde: 'contorno do botão secundário no hover',
  },
  {
    nome: 'surface/background',
    tinta: '--color-surface',
    fundo: '--color-background',
    onde: 'a superfície (card, painel, campo) sobre o fundo da página',
  },
  {
    nome: 'muted/surface',
    tinta: '--color-muted',
    fundo: '--color-surface',
    onde: 'tint de hover — não é texto',
  },
  {
    nome: 'border/surface',
    tinta: '--color-border',
    fundo: '--color-surface',
    onde: 'divisória decorativa — não é texto nem contorno',
  },
];

/** A razão de um par, ou `null` quando falta um dos tokens. */
export function razaoDoPar(par: Par, tokens: Map<string, Token>): number | null {
  const tokenTinta = tokens.get(par.tinta);
  const tokenFundo = tokens.get(par.fundo);
  if (tokenTinta === undefined || tokenFundo === undefined) return null;
  const rgbTinta = rgbDoToken(tokenTinta);

  // O fundo pode ser uma MISTURA sobre a página (o `Alerta`).
  let rgbFundo = rgbDoToken(tokenFundo);
  if (par.fundoAlfa !== undefined) {
    const tokenDaMistura = tokens.get(par.fundoAlfa.token);
    if (tokenDaMistura === undefined) return null;
    rgbFundo = comporSobre(rgbDoToken(tokenDaMistura), rgbFundo, par.fundoAlfa.alfa);
  }

  // A tinta chega à superfície: com opacidade, o que fica na tela é a
  // COMPOSTA — e a razão é entre ela e o fundo, não entre o token cru e a
  // composição (MEDIDO 2026-11-16: a borda do alerta é 1,67 — o fio que
  // separa a caixa do erro do fundo dela, e é ~1,7:1).
  const superficie = par.alfa === undefined ? rgbTinta : comporSobre(rgbTinta, rgbFundo, par.alfa);
  return razao(superficie, rgbFundo);
}

/** O número no formato pt-BR do repo: vírgula como separador decimal. */
export function numeroPtBr(valor: number, casas = 2): string {
  return valor.toFixed(casas).replace('.', ',');
}

/** O caminho do CSS do padrão, relativo à raiz do repo. */
export const CAMINHO_DO_CSS = path.join('apps', 'web', 'app', 'globals.css');

/** A tabela medida, para o CLI e para o spec. */
export function tabela(
  tokens: Map<string, Token>,
): { nome: string; razao: string; onde: string }[] {
  return PARES.map((par) => {
    const valor = razaoDoPar(par, tokens);
    return {
      nome: par.nome,
      razao: valor === null ? '—' : numeroPtBr(valor),
      onde: par.onde,
    };
  });
}

if (process.argv[1]?.endsWith('contraste-token.ts')) {
  const raiz = process.cwd();
  const css = fs.readFileSync(path.join(raiz, CAMINHO_DO_CSS), 'utf-8');
  const tokens = lerTokens(css);
  console.log(`Tokens lidos: ${tokens.size} (de ${CAMINHO_DO_CSS})`);
  console.log('');
  console.log('| Par | Razão | Onde o par acontece |');
  console.log('|---|---|---|');
  for (const linha of tabela(tokens)) {
    console.log(`| \`${linha.nome}\` | ${linha.razao} | ${linha.onde} |`);
  }
}
