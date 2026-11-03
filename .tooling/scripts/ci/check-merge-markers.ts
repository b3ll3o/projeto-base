/**
 * SEM shebang, de propósito — ver preflight-gates.ts para a justificativa
 * (este módulo é importado, não executado).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Fecha a classe "merge conflict resolvido no papel": **marcador de conflito
 * versionado**.
 *
 * ## O defeito (medido em 2026-11-03)
 *
 * O merge do #143 deixou no `main` publicado, dentro da tabela de histórico
 * de versões de `.agents/specs/conventions/estrutura-e-versionamento.md`:
 *
 * ```
 * <<<<<<< HEAD
 * =======
 * | `1.16.0` | **Auditoria de segurança** (minor bump — ...
 * | `1.15.2` | Bump patch — ...
 * >>>>>>> bbd0a9a (chore(version): 1.16.0 — a auditoria de seguranca)
 * ```
 *
 * Três linhas de marcador dentro de um arquivo de convenção, com as duas
 * linhas de versão duplicadas (a `1.15.2` já existia na tabela, e a `1.16.0`
 * do bloco de conflito era a **errada** — a auditoria de segurança é a
 * `1.17.0`).
 *
 * ## Por que nada pegou
 *
 * - `check-bloco-duplicado` mede **linhas de código** nas raízes de
 *   produção (`apps/`), não `.md` — a duplicação das linhas de versão estava
 *   fora do que ele varre.
 * - `check-doc-size` mede teto de linhas, não conteúdo.
 * - `check-doc-refs` valida links, não marcadores.
 * - A CI do #143 ficou **verde**: o merge resolvido no papel produz um
 *   arquivo que compila, linka e tem o tamanho certo.
 *
 * Ou seja: a classe inteira — "conflito de merge que ninguém notou" — não
 * tinha instrumento. Este gate é o instrumento.
 *
 * ## A regra
 *
 * `<<<<<<< ` e `>>>>>>> ` no início da linha são **ambíguos**: não existem em
 * sintaxe de nenhum formato de texto deste repo. `=======` **existe** — é o
 * underline de um heading setext em Markdown —, então ele **não** é
 * marcador sozinho: só conta dentro de um bloco de conflito.
 */

export interface Conflito {
  /** O caminho relativo do arquivo. */
  arquivo: string;
  /** A linha 1-based onde o marcador aparece. */
  linha: number;
  /** O texto do marcador encontrado. */
  marcador: string;
}

/** As extensões varridas — o texto que um merge pode contaminar. */
export const EXTENSOES = [
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.css',
  '.html',
];

/**
 * Os caminhos onde um marcador é **legítimo**: são registro datado de uma
 * execução, e citam o marcador como conteúdo (a passagem de um conflito é
 * conteúdo de plano, não um conflito no arquivo). Mesmas duas categorias do
 * `check-doc-size` — `registro-datado` e `artefato-de-execucao`.
 */
export const CAMINHOS_IGNORADOS = ['docs/superpowers/', '.agents/runs/'];

/** O início de um marcador de conflito — inequívoco em qualquer formato. */
const MARCADOR_INICIO = /^<<<<<<< /;
const MARCADOR_FIM = /^>>>>>>> /;
/** O separador — só vale dentro de um bloco de conflito. */
const MARCADOR_SEPARADOR = /^=======\s*$/;

/**
 * Encontra os marcadores de conflito num conteúdo.
 *
 * Função pura: o teste mede ela direto, e o gate mede o disco.
 */
export function detectaConflitos(conteudo: string): { linha: number; marcador: string }[] {
  const linhas = conteudo.split('\n');
  const achados: { linha: number; marcador: string }[] = [];
  let dentroDoBloco = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha === undefined) continue;
    if (MARCADOR_INICIO.test(linha)) {
      dentroDoBloco = true;
      achados.push({ linha: i + 1, marcador: linha.trimEnd() });
      continue;
    }
    if (MARCADOR_FIM.test(linha)) {
      dentroDoBloco = false;
      achados.push({ linha: i + 1, marcador: linha.trimEnd() });
      continue;
    }
    // O separador só é marcador DENTRO de um bloco — fora dele é o underline
    // de um heading setext, que é sintaxe válida de Markdown.
    if (dentroDoBloco && MARCADOR_SEPARADOR.test(linha)) {
      achados.push({ linha: i + 1, marcador: linha.trimEnd() });
    }
  }

  return achados;
}

/** Os arquivos versionados que o gate varre. */
function arquivosVersionados(repoRoot: string): string[] {
  let saida = '';
  try {
    saida = execFileSync('git', ['ls-files'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  return saida.split('\n').filter((f) => f.length > 0);
}

/** O arquivo é um dos que o gate ignora? */
export function ehIgnorado(caminho: string): boolean {
  return CAMINHOS_IGNORADOS.some((prefixo) => caminho.startsWith(prefixo));
}

/** A extensão do arquivo é uma das varridas? */
export function ehExtensaoVarrida(caminho: string): boolean {
  const ponto = caminho.lastIndexOf('.');
  if (ponto < 0) return false;
  const ext = caminho.slice(ponto);
  return EXTENSOES.includes(ext);
}

export function checkMergeMarkers(opts: { repoRoot: string }): CheckResult {
  const repoRoot = resolve(opts.repoRoot);
  const erros: string[] = [];
  const conflitos: Conflito[] = [];

  for (const caminho of arquivosVersionados(repoRoot)) {
    if (ehIgnorado(caminho)) continue;
    if (!ehExtensaoVarrida(caminho)) continue;

    let conteudo: string;
    try {
      conteudo = readFileSync(join(repoRoot, caminho), 'utf-8');
    } catch {
      continue;
    }

    for (const achado of detectaConflitos(conteudo)) {
      conflitos.push({ arquivo: caminho, linha: achado.linha, marcador: achado.marcador });
    }
  }

  for (const c of conflitos) {
    erros.push(
      `marcador de conflito versionado em '${c.arquivo}:${c.linha}': '${c.marcador}' — ` +
        `resolva o conflito (a linha entre <<<<<<< e >>>>>>> é a que vale) e versione o arquivo resolvido`,
    );
  }

  return {
    ok: erros.length === 0,
    errors: erros,
  };
}
