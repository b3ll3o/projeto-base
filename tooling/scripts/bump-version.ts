// tooling/scripts/bump-version.ts
//
// pt-BR (#126): o bump de versão dos docs canônicos, MECÂNICO.
//
// ⚠️ A RAIZ DO #126 NÃO ERA O FOOTER — ERA A PROCEDÊNCIA. MEDIDO em
// `.agents/workflows/release-mode.md:30`: o handoff do `doc-writer` nomeava
// TRÊS dos quatro arquivos versionados (`docs/TEMPLATE_USAGE.md` não estava
// na lista), e o `release-template.yml` — que LÊ os quatro e aborta se
// divergirem — só descobria isso no momento do release.
//
// A lista do `release-mode.md` foi corrigida (nomeia os quatro). Este script
// é a segunda metade: um bump que escreve os QUATRO de uma vez, para que
// "esquecer um" não dependa de atenção.
//
// ⚠️ MEDIDO em 2026-11-19: a lista deste script tinha QUATRO e o gate
// `check-version-footers` cobra SEIS — o `AGENTS.md` e o `README.md` ficavam
// de fora, e o bump produzia exatamente a divergência que o gate acusa (o
// `AGENTS.md` já tinha divergido para `1.13.0` no merge do #116 sem ninguém
// ver). A lista agora é a DO GATE: uma lista só, importada de lá.
//
// Uso:
//
//   pnpm tooling:bump-version 1.13.0
//
// ⚠️ Ele escreve os SEIS, e não "os que achar". Um arquivo que o bump escreve
// e o gate não conhece seria uma divergência garantida — e um que o gate cobra
// e o bump não escreve também.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FOOTERS_DE_VERSAO,
  type FooterEsperado,
} from '../../.tooling/scripts/ci/check-version-footers.js';

/**
 * Os SEIS footers — a lista do gate, importada.
 *
 * ⚠️ A lista é exportada e a spec a prende: uma lista de segurança que
 * ninguém prende é uma lista que alguém encolhe sem querer (o mesmo motivo
 * do `HOSTS_DESTINO_LOCAL` do PR #115).
 *
 * O TIPO também vem de lá (`FooterEsperado`): a lista e o tipo são o mesmo
 * fato, e um tipo repetido aqui é um terceiro lugar para divergir.
 */
export const FOOTERS: readonly FooterEsperado[] = FOOTERS_DE_VERSAO;

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Escapa os metacaracteres de uma regex. */
function escapa(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Troca a versão de um footer, e devolve o texto novo.
 *
 * Devolve `null` quando o footer não está no arquivo — e a ausência tem de
 * ser um ERRO, porque um bump que pula um arquivo é exatamente o defeito do
 * #126.
 */
export function trocarVersao(texto: string, rotulo: string, versao: string): string | null {
  const re = new RegExp(`(${escapa(rotulo)}\\s*)\\d+\\.\\d+\\.\\d+`);
  if (!re.test(texto)) return null;
  return texto.replace(re, `$1${versao}`);
}

/**
 * Aplica o bump nos SEIS footers. Devolve os arquivos que mudaram.
 */
export function aplicarBump(raiz: string, versao: string): string[] {
  if (!SEMVER.test(versao)) {
    throw new Error(`A versão '${versao}' não é X.Y.Z.`);
  }

  const alterados: string[] = [];
  for (const footer of FOOTERS) {
    const caminho = resolve(raiz, footer.arquivo);
    const antes = readFileSync(caminho, 'utf-8');
    const depois = trocarVersao(antes, footer.rotulo, versao);
    if (depois === null) {
      throw new Error(
        `${footer.arquivo}: não achei o footer '${footer.rotulo} X.Y.Z' — o bump não pode ` +
          `pular um arquivo (é o defeito do #126).`,
      );
    }
    if (depois !== antes) {
      writeFileSync(caminho, depois, 'utf-8');
      alterados.push(footer.arquivo);
    }
  }

  return alterados;
}

// O CLI — só quando o arquivo é executado diretamente.
if (process.argv[1] !== undefined && process.argv[1].includes('bump-version')) {
  const versao = process.argv[2];
  if (versao === undefined) {
    console.error('Uso: pnpm tooling:bump-version X.Y.Z');
    process.exit(1);
  }
  const alterados = aplicarBump(process.cwd(), versao);
  console.log(`bump-version: ${versao} aplicado em ${alterados.length} arquivo(s):`);
  for (const arquivo of alterados) console.log(`  ${arquivo}`);
}
