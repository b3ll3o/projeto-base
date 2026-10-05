/**
 * O VEREDITO do differential, e nao a sua saida.
 *
 * POR QUE ESTE SPEC EXISTE
 *
 * O script tem 18 formas, uma prova de vida, uma contagem — e uma linha final
 * que decide tudo: `[ "$div" -eq 0 ] || exit 1`. Nenhum spec cobria essa linha.
 * Troquei `-eq 0` por `-ge 0` e rodei TUDO: 283 testes verdes, preflight verde,
 * differential rodando as 18 formas contra o turbo real e reportando 0
 * divergentes — enquanto o gate que o mundo consome estava permanentemente
 * desligado. Um operador, uma linha, e nenhuma suite perceive.
 *
 * E o caminho espelhado e o unico honesto: `preflight.ts` so le o exit code,
 * entao nao ha seam de producao onde injetar divergencia. O script deriva
 * `ROOT` do proprio path (linha 45-46), o que significa que um diretorio
 * temporario com a MESMA profundidade FAZ O PAPEL DE RAIZ — e o parser do
 * espelho e um arquivo comum que a spec escreve. O veredito e o de producao,
 * sem instrumentacao.
 *
 * CONTROLE NEGATIVO
 *
 * Um "sai != 0" sem o "sai == 0" correspondente nao distingue "o veredito
 * funciona" de "esse script sempre falha". O espelho roda as DUAS direcoes:
 * com o parser real (nenhuma divergencia, exit 0) e com um parser
 * deliberadamente errado (divergencia, exit != 0).
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO = resolve(process.cwd());
const SCRIPT_REL = '.tooling/scripts/ci/turbo-redirect-differential.sh';
const PARSER_REL = '.tooling/scripts/ci/check-package-json-drift.ts';

// Duas formas, nao dezoito. A forma crua (`build`) e a forma com redirect
// (`build 2>&1 ALVO`) — a que a classe 4 do guard-classes diz ser a mais
// comum. O corpus completo das 18 roda no preflight de todo push; aqui o que
// esta em teste e a DECISAO, e a decisao nao depende do tamanho do corpus.
const CORES = ['build', 'build 2>&1 ALVO'];

/**
 * O parser com a classe 4 de volta: devolve vazio, o caller nao acha task, e
 * a comparacao casa `[]` com nada. E a mutacao que o script existe para pegar.
 */
const PARSER_CEGO = `export function extractTurboRunTasks(_command: string): string[] {
  return [];
}
`;

const RAIZES: string[] = [];
afterAll(() => {
  for (const raiz of RAIZES) rmSync(raiz, { recursive: true, force: true });
});

/** Troca o heredoc CASES por um corpus menor, sem tocar em mais nada. */
function comCorpusMenor(origem: string, formas: string[]): string {
  const destino = origem.replace(
    /<<'CASES'\n[\s\S]*?\nCASES\n/,
    `<<'CASES'\n${formas.join('\n')}\nCASES\n`,
  );
  return destino;
}

function espelho(parser: 'real' | 'cego'): string {
  const raiz = mkdtempSync(join(tmpdir(), 'espelho-turbo-'));
  RAIZES.push(raiz);
  const ci = join(raiz, '.tooling', 'scripts', 'ci');
  mkdirSync(ci, { recursive: true });

  // O script e copiado, nao symlink: `$0` precisa ser o path do espelho para
  // que `dirname`/`../..` derivem a raiz do espelho. E a raiz que ele le para
  // achar o packageManager e o parser — exatamente o que a spec quer trocar.
  const script = comCorpusMenor(readFileSync(join(REPO, SCRIPT_REL), 'utf8'), CORES);
  writeFileSync(join(ci, 'turbo-redirect-differential.sh'), script);
  copyFileSync(join(REPO, PARSER_REL), join(ci, 'check-package-json-drift.ts'));
  if (parser === 'cego') writeFileSync(join(ci, 'check-package-json-drift.ts'), PARSER_CEGO);

  // `packageManager` lido do repo: o espelho nao pode divergir da fonte unica
  // (a classe "gate mede a maquina" comeca exatamente aqui).
  const pm = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).packageManager;
  writeFileSync(
    join(raiz, 'package.json'),
    `{ "name": "@x/raiz", "version": "0.0.0", "private": true, "packageManager": ${JSON.stringify(pm)} }\n`,
  );
  symlinkSync(join(REPO, 'node_modules'), join(raiz, 'node_modules'));
  return raiz;
}

function rodar(raiz: string) {
  const r = spawnSync('bash', [join(raiz, SCRIPT_REL)], { encoding: 'utf8', timeout: 120_000 });
  return { code: r.status, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const CONTAGEM = /(\d+) formas testadas contra o turbo real, (\d+) divergentes/;

describe('differential turbo: o veredito decide pela divergencia, nao pela forma', () => {
  it('o corpus do espelho e menor — sem isso a mutacao abaixo nao seria distinguivel', () => {
    const origem = readFileSync(join(REPO, SCRIPT_REL), 'utf8');
    const menor = comCorpusMenor(origem, CORES);
    expect(menor !== origem, 'a troca do heredoc CASES nao aconteceu').toBe(true);
    expect(menor, 'o veredito desapareceu na troca de corpus').toContain(
      '[ "$div" -eq 0 ] || exit 1',
    );
  });

  it('controle: parser real => as 2 formas batem, o veredito libera (exit 0)', () => {
    const { code, saida } = rodar(espelho('real'));
    const m = CONTAGEM.exec(saida);
    expect(m, `sem linha de contagem; saida:\n${saida}`).not.toBeNull();
    expect(Number(m![2]), `divergencias no parser real:\n${saida}`).toBe(0);
    expect(code, `o veredito nao liberou um differential sem divergencia:\n${saida}`).toBe(0);
  });

  it('mutacao: parser que devolve vazio => divergencia, o veredito barra (exit != 0)', () => {
    const { code, saida } = rodar(espelho('cego'));
    const m = CONTAGEM.exec(saida);
    expect(
      m,
      `o script abortou antes de contar — a mutacao nao chegou ao veredito:\n${saida}`,
    ).not.toBeNull();
    expect(
      Number(m![2]),
      `o parser cego nao produziu divergencia nenhuma:\n${saida}`,
    ).toBeGreaterThan(0);
    expect(code, `o veredito liberou um differential com divergencia:\n${saida}`).not.toBe(0);
  });
});
