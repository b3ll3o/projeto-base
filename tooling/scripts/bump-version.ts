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
// é a segunda metade: um bump que escrever os QUATRO de uma vez, para que
// "esquecer um" não dependa de atenção.
//
// Uso:
//
//   pnpm tooling:bump-version 1.13.0
//
// ⚠️ Ele escreve os QUATRO, e não "os que achar". A lista está aqui, e é a
// mesma do gate `check-version-footers` — um arquivo que o bump escreve e o
// gate não conhece seria uma divergência garantida.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Um footer: onde está e como o texto dele é. */
interface Footer {
  arquivo: string;
  rotulo: string;
}

/**
 * Os QUATRO footers.
 *
 * ⚠️ A lista é exportada e a spec a prende: uma lista de segurança que
 * ninguém prende é uma lista que alguém encolhe sem querer (o mesmo motivo
 * do `HOSTS_DESTINO_LOCAL` do PR #115).
 */
export const FOOTERS: readonly Footer[] = [
  { arquivo: 'docs/MONOREPO.md', rotulo: '**Versão do documento:**' },
  { arquivo: 'docs/STACK.md', rotulo: '**Versão da stack:**' },
  { arquivo: 'docs/TEMPLATE_USAGE.md', rotulo: '**Versão do documento:**' },
  {
    arquivo: '.agents/specs/conventions/estrutura-e-versionamento.md',
    rotulo: '**Versão da convenção:**',
  },
];

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
 * Aplica o bump nos QUATRO footers. Devolve os arquivos que mudaram.
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
