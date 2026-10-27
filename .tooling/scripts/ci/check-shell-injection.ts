/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do #117: comando de shell montado por concatenação
 * de valor externo.
 *
 * O defeito: `execSync(`git check-ignore ${JSON.stringify(filePath)}`)`. O
 * `JSON.stringify` embrulha em aspas DUPLAS, e dentro de aspas duplas o
 * shell expande `$(...)`, crase e `${...}`. Um nome de arquivo com
 * `$(comando)` executava o comando — no CI, com as permissões dele.
 *
 * A auditoria do #117 achou DOIS casos reais no repositório: o `check-ignore`
 * (um nome de arquivo vindo do PR) e o `gh pr view` do `pr-refresh-gate`
 * (`PR_NUMBER` e `GITHUB_REPOSITORY` interpolados crus no shell).
 *
 * ⚠️ POR QUE AST, E NÃO REGEX
 *
 * Um `grep` casaria os COMENTÁRIOS que citam o defeito — e o próprio repositório
 * tem comentários como `// era execSync(`git check-ignore ${...}`)`. Um gate que
 * acusa o próprio comentário do conserto é um gate que alguém desliga. A AST do
 * TypeScript vê o CÓDIGO: um template literal dentro de um comentário não é
 * uma TemplateExpression.
 *
 * A regra: `execSync`/`exec`/`spawnSync` cujo PRIMEIRO argumento é um
 * TemplateExpression (template literal COM interpolação). O valor interpolado
 * vai cru para o shell.
 *
 *   - `execSync('git ls-files')` → constante → PASSA.
 *   - `execSync(`git ls-files`)` → template SEM interpolação → é uma
 *     constante → PASSA.
 *   - `execSync(`cmd ${x}`)` → interpolação → ERRO.
 *   - `execFileSync('git', ['check-ignore', '--', p])` → não é shell → PASSA.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';
import type { CheckResult } from './check-types';

/** As funções que passam a primeira linha de comando para um shell. */
const FUNCOES_DE_SHELL = new Set(['execSync', 'exec', 'spawnSync']);

/** As pastas varridas. `node_modules` fica de fora pelo filtro de ignorar. */
const DIRETORIOS_VARRIDOS = ['tooling/scripts', '.tooling/scripts'];

/** As extensões varridas. */
const EXTENSOES = ['.ts', '.mts', '.cts'];

/** Um achado: onde está e o que é. */
interface Achado {
  arquivo: string;
  linha: number;
  trecho: string;
  funcao: string;
}

/** Lista recursivamente os arquivos de código sob um diretório. */
async function listarArquivos(raiz: string, diretorio: string): Promise<string[]> {
  const absoluto = path.join(raiz, diretorio);
  const out: string[] = [];

  let entradas: import('node:fs').Dirent[];
  try {
    entradas = await fs.readdir(absoluto, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entrada of entradas) {
    if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
    const caminho = path.join(absoluto, entrada.name);
    if (entrada.isDirectory()) {
      out.push(...(await listarArquivos(raiz, path.relative(raiz, caminho))));
    } else if (EXTENSOES.includes(path.extname(entrada.name))) {
      out.push(caminho);
    }
  }

  return out;
}

/**
 * Acha as chamadas de shell cujo comando é montado com interpolação.
 *
 * A AST é lida com `createSourceFile` — sem type-checker, que é o que
 * torna o gate barato o bastante para rodar em todo preflight.
 */
function acharChamadasComInterpolacao(texto: string, arquivo: string): Achado[] {
  const achados: Achado[] = [];

  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.ESNext, true);
  const visita = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isIdentifier(no.expression)) {
      const funcao = no.expression.text;
      if (FUNCOES_DE_SHELL.has(funcao)) {
        const primeiro = no.arguments[0];
        if (primeiro !== undefined && ts.isTemplateExpression(primeiro)) {
          const pos = fonte.getLineAndCharacterOfPosition(primeiro.getStart());
          achados.push({
            arquivo,
            linha: pos.line + 1,
            trecho: primeiro.getText().replace(/\s+/g, ' ').slice(0, 120),
            funcao,
          });
        }
      }
    }
    ts.forEachChild(no, visita);
  };
  visita(fonte);

  return achados;
}

/**
 * Gate: nenhuma chamada de shell com comando interpolado.
 */
export async function checkShellInjection(opts: { repoRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);

  for (const diretorio of DIRETORIOS_VARRIDOS) {
    const arquivos = await listarArquivos(root, diretorio);
    for (const arquivo of arquivos) {
      let texto: string;
      try {
        texto = await fs.readFile(arquivo, 'utf-8');
      } catch {
        continue;
      }

      for (const achado of acharChamadasComInterpolacao(texto, path.relative(root, arquivo))) {
        errors.push(
          `${achado.arquivo}:${achado.linha} — ${achado.funcao}() com comando interpolado: ` +
            `${achado.trecho}. O valor interpolado vai cru para o shell (é o vetor do #117). ` +
            `Use execFileSync() com o argv em array, e \`--\` antes de qualquer path.`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
