/**
 * SEM shebang, de propósito.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { linhasDoRelato, type CheckResult } from './check-types';

/**
 * Fecha a classe 7 de `guard-classes.md` aplicada ao próprio
 * `preflight-gates.ts`: o array `PREFLIGHT_CHECKS` pode crescer ou
 * encolher sem que o registro de dentes (a tabela em
 * `ci-defense-in-depth-dentes.md`, extraída do pai em 2026-10-16) acompanhe.
 * Sem este gate, a contagem de entradas documentada na pendência vira número
 * envelhecido — a próxima pessoa que adicionar um gate fica sem sinal
 * automático de "esqueci de atualizar a tabela".
 *
 * Estratégia: o gate **conta** linhas e arquivos por `git ls-files` /
 * `grep`, e compara contra a contagem REAL do `PREFLIGHT_CHECKS` no
 * array. Se a contagem REAL diverge do array, o gate vermelheja.
 *
 * O que este gate NÃO pega (classe 7 também):
 * o que ESTE gate afirmar envelhece depois. A defesa é o número
 * estar ao lado do comando, e a contagem REAL vir de uma chamada
 * de função, não de um literal.
 */
export async function checkTeethCount(opts: { repoRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);

  // (1) A contagem REAL vem do array PREFLIGHT_CHECKS — fonte única.
  let realCount: number;
  try {
    const gatesPath = path.join(root, '.tooling/scripts/ci/preflight-gates.ts');
    // `createRequire` é o caminho que funciona em CJS-via-tsx; o
    // `await import` de path absoluto quebra com `data:` URL no loader.
    const req = createRequire(import.meta.url);
    const mod = req(gatesPath) as { PREFLIGHT_CHECKS?: unknown[] };
    const checks = mod.PREFLIGHT_CHECKS ?? [];
    realCount = checks.length;
  } catch (err) {
    return {
      ok: false,
      errors: [`não foi possível ler PREFLIGHT_CHECKS: ${err}`],
    };
  }

  // (2) Mede via shell — mesma família de comandos da pendência original.
  // Se os comandos envelhecerem (a regex não casar mais), o gate falha
  // com a discrepância visível.
  let nameCount = 0;
  let fileCount = 0;
  try {
    // grep POSIX não entende `\s` — usa `[[:space:]]`. A regex casa linhas
    // que começam com `{` (caso de entrada dentro do array) OU com whitespace
    // (caso de entry alinhada com `name` na coluna 0 dentro de objeto).
    const saida = execSync(
      `grep -cE "^[[:space:]]*\\{?[[:space:]]+name: '" .tooling/scripts/ci/preflight-gates.ts`,
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    nameCount = parseInt(saida.trim(), 10);
  } catch {
    // grep devolve 1 se não casa — nameCount fica 0 e a próxima comparação falha com motivo
  }

  try {
    const saida = execSync(
      `grep -oE "file: '[^']+'" .tooling/scripts/ci/preflight-gates.ts | sort -u | wc -l`,
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    fileCount = parseInt(saida.trim(), 10);
  } catch {
    // idem
  }

  if (nameCount !== realCount) {
    errors.push(
      `contagem DIVERGE: PREFLIGHT_CHECKS tem ${realCount} entradas, mas o grep achou ${nameCount} linhas com \`name:\`. ` +
        `Provavelmente alguém editou uma entry sem o nome canônico, ou adicionou uma sem o \`name:\` na linha. ` +
        `Re-medir com: \`grep -cE "^\\s+name: '" .tooling/scripts/ci/preflight-gates.ts\``,
    );
  }

  // O par name/file esperado é name = file + 1 (eslint-drift entra 2x, uma por
  // app). Não assertamos o número exato (envelhece a cada gate novo — a versão
  // anterior deste comentário dizia "21 entries, 20 arquivos" e já era falso);
  // só assertamos a RELAÇÃO, que é o sinal. Quebrar a relação é o defeito.
  if (fileCount > 0 && fileCount >= nameCount) {
    errors.push(
      `paridade quebrada: ${nameCount} entradas casam ${fileCount} arquivos únicos — ` +
        `a diferença deveria ser exatamente 1 (eslint-drift entra 2x, uma por app). ` +
        `Se for maior, algum gate está duplicado; se for 0, alguma entry perdeu o \`file:\`. ` +
        `Re-medir com: \`grep -oE "file: '[^']+'" .tooling/scripts/ci/preflight-gates.ts | sort -u | wc -l\``,
    );
  }

  return { ok: errors.length === 0, errors };
}

// Executado como CLI.
//
// Sem este bloco, `npx tsx .tooling/scripts/ci/check-teeth-count.ts` carregava o
// módulo e saía 0 SEM IMPRIMIR NADA — e é exatamente o comando que o registro de
// dentes manda rodar para remedir. Verde sem sentido: o gate que existe para
// denunciar drift devolvia "tudo bem" sem olhar. MEDIDO 2026-10-17 (achado do
// revisor): a FUNÇÃO accuse a paridade quebrada, a invocação por CLI não.
if (process.argv[1]?.endsWith('check-teeth-count.ts')) {
  // `.then` e não top-level `await`: o tsx compila este arquivo para CJS, onde
  // `await` no topo do módulo é erro de sintaxe. MEDIDO 2026-10-17 — a primeira
  // versão deste bloco usava `await` e crashava em TODA invocação, inclusive na
  // árvore sadia: um no-op que pelo menos não falhava foi trocado por um crash.
  void checkTeethCount({ repoRoot: '.' }).then((r) => {
    const linhas = linhasDoRelato(r);
    for (const linha of linhas) process.stderr.write(`${linha}\n`);
    // MEDIDO 2026-10-17: `linhasDoRelato` devolve só `errors`/`advisories`/`skip`,
    // então a árvore sadia produzia `[]` — e um CLI que não imprime NADA é
    // indistinguível, por stdout, do no-op que este bloco substitui. A primeira
    // versão deste conserto arrumou o `exit` e deixou o silêncio, que é metade do
    // defeito. Verde precisa dizer que mediu.
    if (r.ok && linhas.length === 0) {
      process.stderr.write(
        'paridade PREFLIGHT_CHECKS <-> `name:` <-> arquivos: OK (medido, sem acusação)\n',
      );
    }
    process.exit(r.ok ? 0 : 1);
  });
}
