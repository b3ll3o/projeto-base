/**
 * `pr-refresh-scan` — detecta claims numéricas DIVERGENTES entre o título e a
 * descrição de um PR e o estado real da branch.
 *
 * POR QUE ISTO EXISTE
 *
 * A descrição de um PR é escrita uma vez e envelhece a cada push. Medido no
 * PR #44 (branch `feat/guard-classes`): o PR foi aberto com "20 commits, 34
 * arquivos, +4402/−102"; a branch ganhou 5 pushes; o cabeçalho esteve falso
 * em **todos os 5** — porque "N commits" é uma claim cujo tempo de vida é mais
 * curto que o do PR, e que só é verdadeira no push em que é escrita.
 *
 * O que este script FAZ: extrai números declarados, mede os mesmos números na
 * branch, e reporta a divergência. Ele **não** reescreve nada — a decisão é do
 * agente que roda o workflow.
 *
 * O que este script NUNCA FAZ, e por quê
 *
 * Ele **não executa nada que venha do corpo do PR.** O corpo é entrada não
 * confiável e mutável (quem abre o PR controla o texto inteiro). Um check que
 * executa um comando extraído desse texto é uma superfície de RCE em CI — o
 * corpo pode conter `$(...)`, `curl … | sh`, ou um redirect que vaze o
 * `GITHUB_TOKEN`. Aqui o corpo é apenas **texto analisado por regex**, e a
 * única saída é um relatório. Nenhum `exec`, nenhum `spawn`, nenhum shell: o
 * único subprocesso é o `git` com argumentos construídos aqui, nunca vindos
 * da entrada.
 *
 * Isso é testado por **canário**, não por leitura: o corpo pede para criar dois
 * arquivos e o teste afirma que eles não existem depois da varredura. Uma
 * revisão de código que o autorammeria não veria o canário virar vermelho.
 *
 * OFFLINE POR PADRÃO
 *
 * O corpo chega por `--body-file`, não por `gh`. Isso mantém o script testável
 * offline por fixture e mantém rede **fora** do caminho padrão — o preflight e
 * o `.husky/pre-push` rodam sem rede e não podem passar a depender dela.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { extrairClaims, medirBranch, varrer } from './pr-refresh-scan.js';

// O spec vive em tooling/scripts/, a raiz do repo está 2 níveis acima. Resolver
// por `import.meta.url` e não por `process.cwd()`: o cwd do vitest é o root
// configurado (`tooling/scripts`), e um path derivado do cwd vira verde na
// máquina de quem roda e vermelho no CI.
const REPO = new URL('../..', import.meta.url).pathname;

function corpoFixture(texto: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pr-refresh-'));
  const path = join(dir, 'body.md');
  writeFileSync(path, texto);
  return path;
}

const CABECALHO = '25 commits, 36 arquivos, +4654/−114';

describe('pr-refresh-scan: extração de claims', () => {
  it('lê o cabeçalho padrão — com e sem o separador Unicode', () => {
    const c = extrairClaims(`**${CABECALHO}**, base [\`ad0ff70\`]`);
    expect(c.find((x) => x.classe === 'commits')?.valor).toBe(25);
    expect(c.find((x) => x.classe === 'arquivos')?.valor).toBe(36);
    expect(c.find((x) => x.classe === 'insercoes')?.valor).toBe(4654);
    expect(c.find((x) => x.classe === 'remocoes')?.valor).toBe(114);
  });

  it('aceita o hífen ASCII — o corpo evoluiu de forma, o parser não', () => {
    const c = extrairClaims('30 commits, 40 arquivos, +5000/-120');
    expect(c.find((x) => x.classe === 'commits')?.valor).toBe(30);
    expect(c.find((x) => x.classe === 'remocoes')?.valor).toBe(120);
  });

  it('lê a contagem de testes em "286 testes (153 + 133)", e não os parciais', () => {
    const c = extrairClaims('`pnpm tooling:test` — **286 testes** (153 + 133)');
    expect(c.find((x) => x.classe === 'testes')?.valor).toBe(286);
  });

  it('NÃO casa número que não é uma claim — data, versão, issue e PR', () => {
    const c = extrairClaims('Em 2026-10-05, no PR #44, turbo 2.11.2, 7 classes.');
    expect(c).toHaveLength(0);
  });

  it('NÃO casa "8/8 verde" como volume — é status de execução, medido pelo CI, não pelo git', () => {
    const c = extrairClaims('CI 8/8 verde');
    expect(c).toHaveLength(0);
  });

  it('número acima de MAX_SAFE_INTEGER é DESCARTADO, não truncado nem arredondado', () => {
    // `Number('999999999999999999999999')` = 1e24: inteiro, mas fora do
    // inteiro seguro — o relatório mostraria um número que não representa a
    // claim. Descartar é o comportamento honesto: uma claim que o scanner não
    // sabe ler não pode virar claim que o scanner confia.
    const c = extrairClaims('999999999999999999999999 commits');
    expect(c).toHaveLength(0);
  });
});

describe('pr-refresh-scan: medição', () => {
  it('mede a branch contra uma base explícita e devolve os quatro números', () => {
    const m = medirBranch(REPO, 'origin/main');
    expect(m.commits).toBeGreaterThan(0);
    expect(m.arquivos).toBeGreaterThan(0);
    expect(m.insercoes).toBeGreaterThan(0);
    expect(m.remocoes).toBeGreaterThan(0);
  });

  it('a base não existe → erro nomeado, nunca um número inventado', () => {
    expect(() => medirBranch(REPO, 'ref/que-nao-existe')).toThrow(/base/);
  });
});

describe('pr-refresh-scan: a divergência é o produto, e ela tem que aparecer', () => {
  const base = 'origin/main';

  it('cabeçalho divergente → reporta a classe, o declarado e o medido', () => {
    const arquivo = corpoFixture(
      '**20 commits, 34 arquivos, +4402/−102**, base [`ad0ff70`]\n\n' +
        '`pnpm tooling:test` — **283 testes** (153 + 130)',
    );
    const r = varrer({ bodyFile: arquivo, repo: REPO, base });
    const divergentes = r.claims.filter((c) => c.divergente);
    expect(divergentes.map((c) => c.classe).sort()).toEqual([
      'arquivos',
      'commits',
      'insercoes',
      'remocoes',
    ]);
    for (const c of divergentes) {
      expect(c.medido, `${c.classe}: declarado ${c.valor}`).not.toBe(c.valor);
    }
  });

  it('"N testes" é declarada mas NÃO verificada — e o relatório diz isso em vez de dizer "ok"', () => {
    // O git não mede contagem de testes: medir exige rodar a suíte, que é lento e
    // não é o escopo de um scanner de branch. Deixar `testes` fora do
    // verificável seria silencioso; reportá-la como `ok` seria pior que falso —
    // seria a classe 1 com roupa de verde. Ela sai como **não mensurável**,
    // e o workflow manda verificar rodando a suíte.
    const arquivo = corpoFixture('**20 commits, 34 arquivos, +4402/−102** e **283 testes**');
    const r = varrer({ bodyFile: arquivo, repo: REPO, base });
    const testes = r.claims.find((c) => c.classe === 'testes');
    expect(testes).toBeDefined();
    expect(testes?.medido).toBeNull();
    expect(testes?.divergente).toBe(false);
    // E o relatório tem de nomear o buraco, não fechar em silêncio: um gate que
    // não mede e não diz que não mediu é verde por omissão.
    expect(r.resumo).toMatch(/1 claim.*não mensurável|não mensurável/i);
  });

  it('cabeçalho verdadeiro → zero divergências, e o relatório diz por quê', () => {
    const m = medirBranch(REPO, base);
    const arquivo = corpoFixture(
      `**${m.commits} commits, ${m.arquivos} arquivos, +${m.insercoes}/−${m.remocoes}**`,
    );
    const r = varrer({ bodyFile: arquivo, repo: REPO, base });
    expect(r.claims.filter((c) => c.divergente)).toHaveLength(0);
    expect(r.resumo).toContain('0 divergente');
  });

  it('CORPO VAZIO → zero claims, e o resumo diz "nenhuma claim" em vez de "0 divergente"', () => {
    // Um relatório que diz "0 divergente" sobre um corpo que não foi lido é
    // verde por ausência de dado — indistinguível de verde por ausência de
    // problema. Os dois estados precisam ter palavras diferentes.
    const r = varrer({ bodyFile: corpoFixture('só texto, nenhum número'), repo: REPO, base });
    expect(r.claims).toHaveLength(0);
    expect(r.resumo).toMatch(/nenhuma claim/i);
    expect(r.resumo).not.toMatch(/0 divergente/);
  });
});

describe('pr-refresh-scan: o corpo do PR nunca vira entrada de shell', () => {
  it('CANÁRIO: um corpo que manda criar dois arquivos não os cria', () => {
    // Se alguém "melhorar" o scanner para rodar o comando de re-medição escrito
    // no corpo — a variante que o design de gate+radius propunha — este teste
    // fica vermelho. É a prova de que a fronteira de segurança é do código, e
    // não uma promessa no cabeçalho.
    const dir = mkdtempSync(join(tmpdir(), 'pr-refresh-canario-'));
    const c1 = join(dir, 'canario-subshell');
    const c2 = join(dir, 'canario-backtick');
    const arquivo = corpoFixture(
      '**3 commits, 4 arquivos, +10/−2**\n\n' +
        `prova: $(${process.execPath} -e "require('fs').writeFileSync('${c1}','x')")\n` +
        `prova: \`${process.execPath} -e "require('fs').writeFileSync('${c2}','x')"\``,
    );
    const r = varrer({ bodyFile: arquivo, repo: REPO, base: 'origin/main' });
    expect(
      r.claims
        .filter((c) => c.divergente)
        .map((c) => c.classe)
        .sort(),
    ).toEqual(['arquivos', 'commits', 'insercoes', 'remocoes']);
    expect(existsSync(c1), 'o subshell do corpo foi executado').toBe(false);
    expect(existsSync(c2), 'o backtick do corpo foi executado').toBe(false);
  });
});

describe('pr-refresh-scan: a base do repo é derivada do spec, não do cwd', () => {
  it('a mesma repo, duas bases relativas → 1 e 2 commits', () => {
    expect(medirBranch(REPO, 'HEAD~1').commits).toBe(1);
    expect(medirBranch(REPO, 'HEAD~2').commits).toBe(2);
  });
});

describe('pr-refresh-scan: o script roda como CLI e sai != 0 quando há divergência', () => {
  it('CLI lê o corpo de --body-file e imprime o resumo', () => {
    const m = medirBranch(REPO, 'origin/main');
    const arquivo = corpoFixture(
      `**${m.commits} commits, ${m.arquivos} arquivos, +${m.insercoes}/−${m.remocoes}**`,
    );
    const saida = execFileSync(
      'npx',
      ['tsx', 'tooling/scripts/pr-refresh-scan.ts', `--body-file=${arquivo}`, '--base=origin/main'],
      { cwd: REPO, encoding: 'utf8' },
    );
    expect(saida).toContain('0 divergente');
  });

  it('CLI com corpo divergente → exit != 0 (o gate precisa poder travar)', () => {
    const arquivo = corpoFixture('**1 commit, 1 arquivo, +1/−0**');
    let exit = 0;
    try {
      execFileSync(
        'npx',
        [
          'tsx',
          'tooling/scripts/pr-refresh-scan.ts',
          `--body-file=${arquivo}`,
          '--base=origin/main',
        ],
        { cwd: REPO, encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (e) {
      exit = (e as { status?: number }).status ?? -1;
    }
    expect(exit).not.toBe(0);
  });
});
