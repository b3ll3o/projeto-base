// .tooling/scripts/ci/check-bloco-duplicado.ts
//
// Gate da regra DRY (parte 2): **lógica repetida**.
//
// Exit: 0 = ok, 1 = erro.
//
// A parte 1 (`check-repeticao`) mede a repetição de CONHECIMENTO — o termo.
// Esta mede a repetição de LÓGICA — o bloco de código.
//
// ⚠️ A JANELA é o que decide o sinal, e ela é MEDIDA, não chutada:
// MEDIDO 2026-10-22 sobre a árvore de produção, com 12 linhas de janela há
// 3 blocos repetidos — e os três são o markup JSX do formulário. Com 16
// linhas: **ZERO** blocos repetidos. O código de produção deste repo já é
// DRY na lógica; a repetição que sobra é de TERMO, e é o que a parte 1
// mede.
//
// Por isso a janela é 16 e não 12: com 12, o gate acusaria o boilerplate de
// formulário — que é repetição de MARCAÇÃO, não de decisão. Um gate que
// grita com o markup é um gate que ninguém ouve.
//
// Um bloco declarado em `dry-termos.json` (`blocos`) é dívida conhecida e sai
// como ressalva, com o motivo.

import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { CheckResult } from './check-types.js';
import { achaBlocosDuplicados, varreLinhas } from '../../../tooling/scripts/analisa-repeticao.js';
import { ARQUIVO_DECLARACAO, RAIZES_PRODUCAO } from './check-repeticao.js';

/**
 * A janela, em linhas.
 *
 * MEDIDO 2026-10-22: 12 → 3 blocos (markup JSX); 16 → 0 blocos. O corte fica
 * em 16, que é onde o sinal começa a ser de verdade.
 */
export const JANELA_PADRAO = 16;

export interface BlocoDeclarado {
  /** As primeiras linhas do bloco, para identificá-lo. */
  inicio: string;
  /** Por que a repetição existe. */
  motivo: string;
}

export interface Declaracao {
  blocos?: BlocoDeclarado[];
}

export function checkBlocoDuplicado(opts: { repoRoot: string; janela?: number }): CheckResult {
  const repoRoot = resolve(opts.repoRoot);
  const janela = opts.janela ?? JANELA_PADRAO;
  const errors: string[] = [];
  const advisories: string[] = [];

  let declaracao: Declaracao;
  try {
    const caminho = join(repoRoot, '.tooling', 'scripts', 'ci', ARQUIVO_DECLARACAO);
    declaracao = JSON.parse(readFileSync(caminho, 'utf8')) as Declaracao;
  } catch (erro) {
    return {
      ok: false,
      errors: [
        `declaração de blocos ilegível (${ARQUIVO_DECLARACAO}): ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      ],
    };
  }

  const porArquivo = new Map<string, string[]>();
  for (const raiz of RAIZES_PRODUCAO) {
    for (const [arquivo, linhas] of varreLinhas(join(repoRoot, raiz))) {
      if (arquivo.includes('.spec.')) continue;
      porArquivo.set(relative(repoRoot, arquivo), linhas);
    }
  }

  if (porArquivo.size === 0) {
    // Anti-vacuuidade: sem arquivos medidos, o gate não mediu nada.
    return {
      ok: false,
      errors: ['nenhum arquivo de produção foi medido — o gate não tem o que medir.'],
    };
  }

  const declarados = new Set((declaracao.blocos ?? []).map((b) => b.inicio));
  for (const bloco of achaBlocosDuplicados(porArquivo, janela)) {
    const inicio = bloco.linhas[0] ?? '';
    if (declarados.has(inicio)) {
      advisories.push(
        `bloco duplicado declarado: ${inicio.slice(0, 70)} (${bloco.arquivos} arquivo(s))`,
      );
      continue;
    }
    errors.push(
      `bloco de ${janela}+ linhas repetido em ${bloco.arquivos} arquivo(s) de produção — ` +
        `a lógica está duplicada (DRY):\n` +
        `      ${bloco.linhas.slice(0, 3).join('\n      ')}\n` +
        bloco.onde.map((a) => `      em ${a}\n`).join(''),
    );
  }

  return { ok: errors.length === 0, errors, advisories };
}
