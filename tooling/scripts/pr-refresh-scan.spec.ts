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
 * ## O repo de teste é construído pelo spec, não emprestado do CI
 *
 * A primeira versão deste spec media o **repo real**, com `origin/main` e
 * `HEAD~1`. Passava aqui e **quebrou no CI**:
 *
 *     Error: base inválida: "origin/main" não resolve neste repo
 *            (/home/runner/work/projeto-base/projeto-base/)
 *
 * O `actions/checkout` de um evento `pull_request` faz checkout shallow com
 * HEAD destacado num commit de merge: não existe `origin/main`, nem `HEAD~1`
 * (profundidade 1), nem remoto nenhum. Um spec que passa na máquina do autor e
 * falha no runner tem a **mesma forma** do `doc-sync.resolvePath.spec.ts` que
 * o X8 registrou — a premissa do teste é uma propriedade do ambiente, não do
 * código.
 *
 * A correção é a mesma que o resto do repo já usa: **o fixture é produzido
 * pelo teste**. O spec cria um repo git temporário com histórico conhecido e
 * mede contra ele — nenhum número vem da máquina, do remoto ou da profundidade
 * do clone. Um teste que depende de `HEAD~1` existir não testa o scanner;
 * testa o servidor de CI.
 *
 * ## O corpo do PR nunca vira entrada de shell
 *
 * Ele **não executa nada que venha do corpo.** O corpo é entrada não
 * confiável e mutável (quem abre o PR controla o texto inteiro). Um check que
 * executa um comando extraído desse texto é uma superfície de RCE em CI. Aqui
 * o corpo é apenas **texto analisado por regex**, e a única saída é um
 * relatório. Nenhum `exec`, nenhum `spawn`, nenhum shell: o único subprocesso
 * é o `git` com argumentos construídos aqui.
 *
 * Isso é testado por **canário**, não por leitura: o corpo pede para criar dois
 * arquivos e o teste afirma que eles não existem depois da varredura.
 *
 * ## Offline por padrão
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

import type { Medicao } from './pr-refresh-scan.js';
import { extrairClaims, medirBranch, varrer } from './pr-refresh-scan.js';

// O spec vive em tooling/scripts/, a raiz do repo está 2 níveis acima.
//
// `import.meta.url` e não `process.cwd()` — e o motivo é mais estreito do que
// "cwd é a máquina". MEDIDO (n=1, vitest 2.1.9): sob `vitest run --root
// tooling/scripts`, `process.cwd()` é a **raiz do repo**, não o root do vitest.
// `--root` muda a resolução de módulo; não faz `chdir`. Então `process.cwd()`
// daria o path certo hoje, por conta de um segundo fato não escrito — o pnpm
// executa scripts da raiz do pacote que os declara. Dois fatos independentes, e
// nenhum deles é contrato.
//
// `import.meta.url` depende de um só: onde este arquivo está no disco, que é
// propriedade do repositório. É por isso que ele, e não o cwd. Um path derivado
// do cwd vira verde na máquina de quem roda e vermelho no CI — a lição do X8.
const REPO = new URL('../..', import.meta.url).pathname;
const TSX = join(REPO, 'node_modules', '.bin', 'tsx');
const SCRIPT = join(REPO, 'tooling', 'scripts', 'pr-refresh-scan.ts');

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function commitar(repo: string, msg: string): string {
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg]);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

/**
 * Repo de 2 commits com números conhecidos de antemão:
 *
 *   base (A)  a.txt = "1\n2\n"
 *   HEAD (B)  a.txt = "1\n3\n"   -> +1 -1
 *             b.txt = "x\n"      -> +1
 *
 * Logo `A..B` = **1 commit, 2 arquivos, +2 inserções, −1 remoção**. Nenhum
 * número vem da máquina, do remoto ou do histórico do repo de desenvolvimento.
 */
function repoFixture(): { repo: string; base: string; esperado: Medicao } {
  const repo = mkdtempSync(join(tmpdir(), 'pr-refresh-repo-'));
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'a.txt'), '1\n2\n');
  const base = commitar(repo, 'base');
  writeFileSync(join(repo, 'a.txt'), '1\n3\n');
  writeFileSync(join(repo, 'b.txt'), 'x\n');
  commitar(repo, 'head');
  return {
    repo,
    base,
    esperado: { commits: 1, arquivos: 2, insercoes: 2, remocoes: 1 },
  };
}

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
    const { repo, base, esperado } = repoFixture();
    expect(medirBranch(repo, base)).toEqual(esperado);
  });

  it('a base não existe → erro nomeado, nunca um número inventado', () => {
    const { repo } = repoFixture();
    expect(() => medirBranch(repo, 'ref/que-nao-existe')).toThrow(/base/);
  });
});

describe('pr-refresh-scan: a divergência é o produto, e ela tem que aparecer', () => {
  it('cabeçalho divergente → reporta a classe, o declarado e o medido', () => {
    const { repo, base, esperado } = repoFixture();
    const falso = `**${esperado.commits + 19} commits, ${esperado.arquivos + 32} arquivos, +${esperado.insercoes + 4400}/−${esperado.remocoes + 101}**`;
    const arquivo = corpoFixture(`${falso}\n\n\`pnpm tooling:test\` — **283 testes** (153 + 130)`);
    const r = varrer({ bodyFile: arquivo, repo, base });
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
    const { repo, base, esperado } = repoFixture();
    const falso = `**${esperado.commits + 19} commits, ${esperado.arquivos + 32} arquivos, +${esperado.insercoes + 4400}/−${esperado.remocoes + 101}**`;
    const r = varrer({ bodyFile: corpoFixture(`${falso} e **283 testes**`), repo, base });
    const testes = r.claims.find((c) => c.classe === 'testes');
    expect(testes).toBeDefined();
    expect(testes?.medido).toBeNull();
    expect(testes?.divergente).toBe(false);
    // E o relatório tem de nomear o buraco, não fechar em silêncio: um gate que
    // não mede e não diz que não mediu é verde por omissão.
    expect(r.resumo).toContain('não mensurável');
  });

  it('cabeçalho verdadeiro → zero divergências, e o relatório diz por quê', () => {
    const { repo, base, esperado } = repoFixture();
    const arquivo = corpoFixture(
      `**${esperado.commits} commits, ${esperado.arquivos} arquivos, +${esperado.insercoes}/−${esperado.remocoes}**`,
    );
    const r = varrer({ bodyFile: arquivo, repo, base });
    expect(r.claims.filter((c) => c.divergente)).toHaveLength(0);
    expect(r.resumo).toContain('0 divergente');
  });

  it('CORPO VAZIO → zero claims, e o resumo diz "nenhuma claim" em vez de "0 divergente"', () => {
    // Um relatório que diz "0 divergente" sobre um corpo que não foi lido é
    // verde por ausência de dado — indistinguível de verde por ausência de
    // problema. Os dois estados precisam ter palavras diferentes.
    const { repo, base } = repoFixture();
    const r = varrer({ bodyFile: corpoFixture('só texto, nenhum número'), repo, base });
    expect(r.claims).toHaveLength(0);
    expect(r.resumo).toMatch(/nenhuma claim/i);
    expect(r.resumo).not.toMatch(/0 divergente/);
  });
});

describe('pr-refresh-scan: o corpo do PR nunca vira entrada de shell', () => {
  it('CANÁRIO: um corpo que manda criar dois arquivos não os cria', () => {
    // Se alguém "melhorar" o scanner para rodar o comando de re-medição escrito
    // no corpo — a variante que o design de gate+CI propunha — este teste fica
    // vermelho. É a prova de que a fronteira de segurança é do código, e não
    // uma promessa no cabeçalho.
    const dir = mkdtempSync(join(tmpdir(), 'pr-refresh-canario-'));
    const c1 = join(dir, 'canario-subshell');
    const c2 = join(dir, 'canario-backtick');
    const { repo, base } = repoFixture();
    const arquivo = corpoFixture(
      '**3 commits, 4 arquivos, +10/−2**\n\n' +
        `prova: $(${process.execPath} -e "require('fs').writeFileSync('${c1}','x')")\n` +
        `prova: \`${process.execPath} -e "require('fs').writeFileSync('${c2}','x')"\``,
    );
    const r = varrer({ bodyFile: arquivo, repo, base });
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

describe('pr-refresh-scan: o script roda como CLI', () => {
  it('CLI com corpo verdadeiro → exit 0 e "0 divergente" no stdout', () => {
    const { repo, base, esperado } = repoFixture();
    const arquivo = corpoFixture(
      `**${esperado.commits} commits, ${esperado.arquivos} arquivos, +${esperado.insercoes}/−${esperado.remocoes}**`,
    );
    const saida = execFileSync(TSX, [SCRIPT, `--body-file=${arquivo}`, `--base=${base}`], {
      // O cwd é o repo FIXTURE, não o repo de desenvolvimento: é assim que o
      // scanner resolve a raiz, e é o caminho que o CLI precisa percorrer.
      cwd: repo,
      encoding: 'utf8',
    });
    expect(saida).toContain('0 divergente');
  });

  it('CLI com corpo divergente → exit != 0 (o gate precisa poder travar)', () => {
    const { repo, base } = repoFixture();
    const arquivo = corpoFixture('**1 commit, 1 arquivo, +1/−0**');
    let exit = 0;
    try {
      execFileSync(TSX, [SCRIPT, `--body-file=${arquivo}`, `--base=${base}`], {
        cwd: repo,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      exit = (e as { status?: number }).status ?? -1;
    }
    expect(exit).not.toBe(0);
  });

  it('CLI sem --body-file → exit 2 e a mensagem de uso (não um relatório vazio)', () => {
    const { repo } = repoFixture();
    let exit = 0;
    let stderr = '';
    try {
      execFileSync(TSX, [SCRIPT], { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      exit = (e as { status?: number }).status ?? -1;
      stderr = (e as { stderr?: string }).stderr ?? '';
    }
    expect(exit).toBe(2);
    expect(stderr).toContain('--body-file');
  });

  it('a saída renderizada não contém NENHUM "???" — nem de artefato, nem de encode', () => {
    // A primeira versão deste CLI tinha `marca = '???????'` hardcoded na fonte.
    // Os 16 testes passavam: todos afirmavam sobre `relatorio.resumo`, e o
    // `???????` vivia na LINHA DA TABELA, que nada lia. Um relatório cuja saída
    // tem caracteres de substituição é um relatório ilegível que ainda sai
    // com exit 1 correto — o código está certo e a leitura é impossível.
    //
    // A guarda é genérica de propósito: `???` pega artefato de geração,
    // truncamento de encoding e Replacement Character, sem precisar saber
    // qual dos dois é. E é ela que impede o próximo `???????` de passar.
    const { repo, base, esperado } = repoFixture();
    const arquivo = corpoFixture(
      `**${esperado.commits} commits, ${esperado.arquivos} arquivos, +${esperado.insercoes}/−${esperado.remocoes}** e **302 testes**`,
    );
    const saida = execFileSync(TSX, [SCRIPT, `--body-file=${arquivo}`, `--base=${base}`], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(saida, 'a tabela saiu ilegível').not.toMatch(/\?{2,}/);
    expect(saida, 'a tabela saiu ilegível').not.toMatch(/�/);
  });

  it('a claim não mensurável é marcada na TABELA, não só no resumo', () => {
    // `relatorio.resumo` é o que os testes cobriam; a marca por linha é o que
    // o olho lê primeiro. Se as duas divergirem — ou se a marca sumir e o
    // resumo continuar — o leitor é induzido a uma conclusão errada.
    const { repo, base, esperado } = repoFixture();
    const arquivo = corpoFixture(
      `**${esperado.commits} commits, ${esperado.arquivos} arquivos, +${esperado.insercoes}/−${esperado.remocoes}** e **302 testes**`,
    );
    const saida = execFileSync(TSX, [SCRIPT, `--body-file=${arquivo}`, `--base=${base}`], {
      cwd: repo,
      encoding: 'utf8',
    });
    const linha = saida.split('\n').find((l) => l.includes('testes'));
    expect(linha, `nenhuma linha da tabela para "testes" em:\n${saida}`).toBeDefined();
    // `NÃO MEDE` = o git não mede contagem de testes. O texto completo
    // ("NÃO MENSURÁVEL") vive na coluna `medido=` e no resumo.
    expect(linha).toContain('NÃO MEDE');
    expect(linha).toContain('NÃO MENSURÁVEL');
  });
});
