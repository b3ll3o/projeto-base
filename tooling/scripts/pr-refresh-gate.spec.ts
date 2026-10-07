import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { MARCADOR } from './pr-refresh-apply';
import { lerCorpo, verificarMarcador } from './pr-refresh-gate';
import type { ClaimVerificada, Relatorio } from './pr-refresh-scan';

/** Claim verificada com os campos que o gate lê: `linha` e `divergente`. */
function claim(linha: number, divergente: boolean, classe = 'commits'): ClaimVerificada {
  return {
    classe: classe as ClaimVerificada['classe'],
    valor: 10,
    declarado: '10 commits',
    linha,
    ini: 0,
    fim: 2,
    palavra: { ini: 3, fim: 10, texto: classe },
    medido: divergente ? 40 : 10,
    divergente,
  };
}

function relatorio(claims: ClaimVerificada[]): Relatorio {
  return { base: 'origin/main', claims, resumo: 'teste' };
}

/**
 * Corpo com 4 parágrafos separados por linha em branco. A claim fica no
 * parágrafo 1 (linhas 1-2) ou no 3 (linhas 5-6).
 */
const CORPO_SEM_MARCADOR = ['linha 1', 'linha 2', '', 'linha 4', 'linha 5', 'linha 6'].join('\n');
const CORPO_COM_MARCADOR = [
  'linha 1',
  `linha 2 ${MARCADOR}`,
  '',
  'linha 4',
  'linha 5',
  'linha 6',
].join('\n');
/** Marcador num parágrafo que NÃO é o da claim — não pode valer. */
const CORPO_MARCADO_OUTRO_PARAGRAFO = [
  'linha 1',
  'linha 2',
  '',
  'linha 4',
  `linha 5 ${MARCADOR}`,
  'linha 6',
].join('\n');

describe('verificarMarcador', () => {
  it('verde quando não há claim divergente', () => {
    // O gate vigia a divergência, não a ausência de marcador: um PR sem
    // claims numericas não tem nada a atualizar.
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, false)]));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('verde quando não há claim nenhuma', () => {
    expect(verificarMarcador(CORPO_SEM_MARCADOR, relatorio([])).ok).toBe(true);
  });

  it('vermelho quando a claim divergente está num parágrafo sem marcador', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('pr-refresh:live');
  });

  it('verde quando a claim divergente está num parágrafo marcado', () => {
    const r = verificarMarcador(CORPO_COM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('acusa só a claim divergente NÃO marcada, e nomeia a linha dela', () => {
    // Duas divergentes, uma no parágrafo 1 (sem marcador) e outra no 3 (com).
    const r = verificarMarcador(
      CORPO_MARCADO_OUTRO_PARAGRAFO,
      relatorio([claim(1, true, 'commits'), claim(5, true, 'arquivos')]),
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    // Formato `L7` — o mesmo que a saída do scanner usa (`DIVERGE  L7 commits`).
    expect(r.errors[0]).toContain('L1');
    expect(r.errors[0]).not.toContain('L5');
  });

  it('NÃO aceita marcador em OUTRO parágrafo como se cobrisse a claim', () => {
    // O escopo do marcador é o PARÁGRAFO (contrato de `linhasVivas`), não o
    // corpo. Um gate que só contasse "o corpo tem marcador?" passaria aqui.
    const r = verificarMarcador(CORPO_MARCADO_OUTRO_PARAGRAFO, relatorio([claim(1, true)]));
    expect(r.ok).toBe(false);
  });

  it('NÃO acusa claim não-divergente que esteja sem marcador', () => {
    // Contra-regra: sem isto o gate ensinaria a marcar o corpo inteiro, e o
    // marcador deixaria de significar "aqui a contagem é viva".
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, false), claim(5, true)]));
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('L5');
  });

  it('a mensagem diz o que fazer, não só que falhou', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    const msg = r.errors.join('\n');
    expect(msg).toMatch(/pnpm pr:refresh/);
    expect(msg).toContain('L1');
  });

  it('cita a base medida, para o autor conferir contra o próprio git', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.errors.join('\n')).toContain('origin/main');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // A mensagem NÃO pode prescrever UM conserto só.
  //
  // MEDIDO no PR #58: o parágrafo dizia "15 arquivos" falando dos scripts de
  // preflight, e o console mandava "marque o parágrafo e rode pr:refresh". O
  // hook obedeceria: trocaria a frase pela contagem de arquivos DO PR. O número
  // sairia verdadeiro e a frase deixaria de falar do que ela falava — e o gate
  // ficaria verde, que é o pior desfecho possível: um número certo sobre outro
  // assunto não tem sinal nenhum.
  //
  // O gate NÃO consegue decidir isso: "é uma claim deste PR?" é semântica, e um
  // classificador por palavra-chave seria uma superfície nova de falso positivo
  // (guard-classe 2: cobre só a forma que você conhece). A saída honesta é o
  // bifurco + o texto da linha, para o humano julgar.
  // ─────────────────────────────────────────────────────────────────────────

  it('apresenta os DOIS consertos, porque a forma da frase não diz de que assunto ela é', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    const msg = r.errors.join('\n');
    expect(msg).toMatch(/pnpm pr:refresh/); // conserto A: a frase é sobre este PR
    expect(msg).toMatch(/reescrev/i); // conserto B: a frase só tem a forma de uma claim
  });

  it('diz que marcar uma frase que NÃO é deste PR a troca pelo número de outro assunto', () => {
    // Sem esta linha o bifurco é decorativo: o autor lê "outros dois consertos",
    // escolhe o primeiro por reflexo e produz a frase verdadeira-sobre-outro-assunto.
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.errors.join('\n')).toMatch(/outro assunto/);
  });

  it('traz o texto da linha citada, para o humano julgar sem abrir o corpo', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.errors[0]).toContain('linha 1');
  });

  it('a citação da linha não deixa o corpo do PR reescrever o log do CI', () => {
    // O corpo vem do autor do PR. Ecoá-lo cru em stderr deixa o conteúdo do PR
    // controlar o log — e é o único dado desta função que o PR escolhe.
    const corpo = ['linha 1 \x1b[31mVERMELHO\x1b[0m fim', 'linha 2'].join('\n');
    const r = verificarMarcador(corpo, relatorio([claim(1, true)]));
    // eslint-disable-next-line no-control-regex
    expect(r.errors[0]).not.toMatch(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/);
    // ...e o texto continua legível depois de higienizado.
    expect(r.errors[0]).toContain('VERMELHO');
  });

  it('o `declarado` do scanner não deixa o corpo do PR reescrever o log do CI', () => {
    // pt-BR: `declarado` é `m[0]` do scanner — texto do CORPO DO PR — e entra
    // na MESMA mensagem que a citação, duas linhas acima. Ele chega aqui já
    // com o `\r` dentro: o `\s` do regex do scanner casa CR, LF, VT e U+2028/9.
    //
    // MEDIDO 2026-10-06 com o binário real e corpo `31\rcommits`:
    //
    //     L1 (commits): declara "31\rcommits", o medido na base origin/main é 7…
    //         linha um 31 commits e 15 arquivos aqui        ← higienizada
    //
    // A citação limpa e o `declarado` cru, na mesma string.
    //
    // Por que este teste é separado do da citação: a classe de caracteres
    // daquele é `[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]`, que EXCLUI `\x0d` porque a
    // mensagem é multi-linha e o `\n` é legítimo. Um mutante que higienize SÓ a
    // citação deixa o CR passar e o teste anterior continua VERDE. MEDIDO: é
    // exatamente o furo que a revisão de 2026-10-06 apontou.
    const corpo = 'linha um 31 commits e 15 arquivos aqui';
    const c = { ...claim(1, true), declarado: '31\rcommits' };
    const r = verificarMarcador(corpo, relatorio([c]));

    expect(r.errors[0]).not.toContain('\r');
    // E o texto continua legível depois de higienizado — não virou vazio.
    expect(r.errors[0]).toContain('declara "31 commits"');
  });

  it('a 1ª passada remove ANSI completo — sem ela sobram os `[31m` órfãos', () => {
    // MEDIDO 2026-10-06: o teste acima usa só `\x1b[31mVERMELHO\x1b[0m`, e a
    // classe que ele afirma (`[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]`) é satisfeita
    // INTEIRAMENTE pela 2ª passada — ela troca o ESC por espaço e não deixa
    // nenhum byte de controle. Ou seja: removendo a 1ª passada a suíte ficava
    // 25/25 verde, e o resultado seria `x [31mVERMELHO [0m y`.
    //
    // Nenhum byte de controle denuncia a ausência; o resto da sequência, sim.
    const corpo = 'linha 1 \x1b[31mVERMELHO\x1b[0m fim';
    const r = verificarMarcador(corpo, relatorio([claim(1, true)]));
    expect(r.errors[0]).not.toMatch(/\[\d+m/);
    expect(r.errors[0]).toContain('VERMELHO');
  });

  it('a 2ª passada remove controle que NÃO é ANSI — sem ela BEL/NUL/ESC-cru sobrevivem', () => {
    // Os três vetores de propósito: a 1ª passada só casa `\x1b[` seguido de um
    // byte final em `@-~`, então não toca em NENHUM deles (o ESC cru nem
    // começa com `[`). Se a 2ª desaparecer, os três entram inteiros no log.
    //
    // A classe exclui `\x0a` porque a mensagem é multi-linha e o `\n` é
    // legítimo — mas inclui `\x0d`, que é justamente o vetor do `declarado`.
    const corpo = 'linha 1 a\x07b\x00c\x1bHd fim';
    const r = verificarMarcador(corpo, relatorio([claim(1, true)]));
    // eslint-disable-next-line no-control-regex
    expect(r.errors[0]).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f]/);
    // ...e o texto continua legível, não virou vazio nem espaços.
    expect(r.errors[0]).toMatch(/a b c Hd fim/);
  });

  it('trunca a citação longa para caber num log de CI', () => {
    // pt-BR: `LARGURA_CITACAO` é o limite entre "cite o texto que o autor
    // reconheça" e "despeje o parágrafo inteiro no log". Sem este teste, dois
    // mutantes passavam — MEDIDO 2026-10-06, 1 vermelho cada a partir do
    // arquivo íntegro: `return limpo` (sem truncar) e `slice(LARGURA_CITACAO)`
    // (invertido, devolvendo 240 em vez de 160). O `toContain('linha 1')` do
    // teste acima não pega nenhum dos dois.
    const corpo = 'x'.repeat(400);
    const r = verificarMarcador(corpo, relatorio([claim(1, true)]));
    const citacao = r.errors[0]!.split('\n')[1]!.trim();

    expect(citacao).toHaveLength(160);
    expect(citacao.endsWith('…')).toBe(true);
  });

  it('NÃO imprime citação quando a linha citada não existe no corpo', () => {
    // Linha fora do corpo é dado corrompido upstream, não motivo para inventar
    // texto: o gate degrada para o `L<n>` e segue dizendo a mesma coisa.
    //
    // MEDIDO 2026-10-06: esta versão só afirmava `ok === false` e
    // `toContain('L99')`, e as DUAS continuam verdadeiras se `citarLinha`
    // inventar texto — trocando `return ''` por `return 'INVENTADO'` a suíte
    // ficava verde. Era um teste que afirmava ter provado algo que não provava,
    // a mesma forma do `gate-blind-to-uncommitted-work` que o repo já catalogou.
    //
    // O que segura é a AUSÊNCIA. A citação ocupa a linha 2 da mensagem
    // (índice 1) quando existe; sem citação, essa linha é a que sobrou do `\n`
    // do cabeçalho e fica vazia.
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(99, true)]));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('L99');
    expect(r.errors[0]!.split('\n')[1]).toBe('');
    expect(r.errors[0]).not.toContain('INVENTADO');
  });

  it('o marcador que o gate exige é o mesmo que o apply escreve', () => {
    // Duas strings distintas no mesmo código = o gate exigindo um token
    // que o apply nunca procura.
    const r = verificarMarcador(`linha 1 ${MARCADOR}`, relatorio([claim(1, true)]));
    expect(r.ok).toBe(true);
  });
});

describe('lerCorpo', () => {
  const envOriginal = process.env.PR_BODY_FILE;
  afterEach(() => {
    if (envOriginal === undefined) delete process.env.PR_BODY_FILE;
    else process.env.PR_BODY_FILE = envOriginal;
  });

  it('prefere o arquivo do payload do evento ao `gh`', () => {
    // No CI o corpo já vem no payload de `pull_request`; lê-lo de lá dispensa
    // conceder `pull-requests: read` ao token. Passar pelo `gh` seria trocar
    // uma permissão por uma chamada de rede sem ganho.
    const dir = mkdtempSync(join(tmpdir(), 'pr-body-'));
    const arquivo = join(dir, 'body.md');
    writeFileSync(arquivo, 'corpo do payload\n');
    process.env.PR_BODY_FILE = arquivo;
    expect(lerCorpo('org/repo', '999')).toBe('corpo do payload\n');
  });

  it('devolve null quando o arquivo do payload não existe', () => {
    // `null` = "não li", e o CLI trata isso como pulado (nunca verde).
    process.env.PR_BODY_FILE = join(tmpdir(), 'nao-existe-pr-body.md');
    expect(lerCorpo('org/repo', '999')).toBeNull();
  });

  it('sem arquivo e sem repo, devolve null em vez de chamar `gh` de vazio', () => {
    delete process.env.PR_BODY_FILE;
    expect(lerCorpo('', undefined)).toBeNull();
  });
});

/**
 * O gate pela CLI, que é como o CI o invoca.
 *
 * A primeira versão não tinha `try` em volta de `varrerTexto`, e o `throw` de
 * "base sem ancestral comum" subia e matava o processo com stack trace. Nenhum
 * teste pegou: os de `verificarMarcador` são puros e os de `lerCorpo` nunca
 * chegam perto de medir. MEDIDO no PR #53 — preflight vermelho por isso.
 */
describe('CLI (o caminho que o CI usa)', () => {
  // Ancorado neste arquivo, não em `process.cwd()`: `vitest --root tooling/scripts`
  // NÃO muda o cwd, que continua o repo — e um caminho relativo ao cwd
  // resolveria o tsx três níveis acima do projeto.
  const AQUI = dirname(fileURLToPath(import.meta.url));
  const REPO = join(AQUI, '../..');
  const GATE = join(AQUI, 'pr-refresh-gate.ts');
  const TSX = join(REPO, 'node_modules/tsx/dist/cli.mjs');

  function rodar(env: Record<string, string>) {
    const r = spawnSync(process.execPath, [TSX, GATE], {
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });
    return { status: r.status, stderr: r.stderr ?? '' };
  }

  /**
   * Repo com `origin/main` EXISTENTE mas sem ancestral comum com HEAD.
   *
   * É a condição real do CI: `actions/checkout` com `fetch-depth` default num
   * evento `pull_request` entrega o ref de merge e o histórico truncado, então
   * `git merge-base origin/main HEAD` não tem o que devolver. O `fetch` da base
   * **tem sucesso** — daí a importance de montar a base em vez de inventar um
   * nome de ref: com `origin/ref-que-nao-existe` o `buscarBase` falha antes e o
   * `catch` do `varrerTexto` nunca é alcançado. Foi assim que a primeira
   * versão deste teste passou verde com o `try/catch` removido.
   */
  function repoSemAncestralComum(): string {
    const raiz = mkdtempSync(join(tmpdir(), 'pr-sem-ancestral-'));
    const remoto = join(raiz, 'origin.git');
    const trabalho = join(raiz, 'work');
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: trabalho,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@t',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@t',
        },
      });

    execFileSync('git', ['init', '--quiet', '--bare', remoto]);
    execFileSync('git', ['clone', '--quiet', remoto, trabalho]);
    git('commit', '--quiet', '--allow-empty', '-m', 'raiz');
    git('branch', '-M', 'main');
    git('push', '--quiet', 'origin', 'main');
    // `--orphan` zera a história: HEAD passa a não descend de `main`.
    git('checkout', '--quiet', '--orphan', 'branch-do-pr');
    git('commit', '--quiet', '--allow-empty', '-m', 'trabalho');
    return trabalho;
  }

  it('NÃO sai verde quando a base não tem ancestral comum com HEAD', () => {
    // O esperado é 1 com "NÃO VERIFICADO" e o NOME do problema — não stack
    // trace, e não 0.
    const trabalho = repoSemAncestralComum();
    const arquivo = join(mkdtempSync(join(tmpdir(), 'pr-body-')), 'body.md');
    writeFileSync(arquivo, 'A branch tem 5 commits à frente de `origin/main`.\n');

    // Sanidade: o cenário tem de ser o que o teste afirma. Sem isto, um
    // `buscarBase` quebrado faria o gate sair 1 pelo motivo errado e o teste
    // passaria — verde sobre o defeito que deveria pegar.
    expect(() =>
      execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], {
        cwd: trabalho,
        stdio: ['ignore', 'ignore', 'pipe'],
      }),
    ).toThrow();

    const r = rodar({
      PR_BODY_FILE: arquivo,
      PR_BASE: 'origin/main',
      GITHUB_WORKSPACE: trabalho,
    });
    expect(r.stderr).toMatch(/NÃO VERIFICADO/);
    // Distingue os DOIS ramos: `!achada.ok` também diz "NÃO VERIFICADO", mas
    // a causa é outra e o `catch` não entrou.
    expect(r.stderr).toMatch(/sem ancestral comum/);
    // A metrADE do contrato que o cabeçalho do arquivo promete ("NÃO
    // VERIFICADO + como corrigir") é o texto de orientação — e ela tinha
    // cobertura ZERO: trocada por uma string inútil, os 16 seguiam verdes.
    // MEDIDO na revisão adversarial de 2026-10-06.
    expect(r.stderr).toMatch(/Como corrigir:.*fetch-depth/s);
    expect(r.stderr).not.toMatch(/^\s+at /m); // nenhum stack trace
    expect(r.status).toBe(1);
  });

  it('NÃO sai verde quando o fetch da base falha', () => {
    // Ramo irmão, e o que a primeira versão deste teste media sem saber:
    // `buscarBase` não tem a ref, o gate nem chega a varrer.
    const dir = mkdtempSync(join(tmpdir(), 'pr-body-'));
    const arquivo = join(dir, 'body.md');
    writeFileSync(arquivo, 'A branch tem 5 commits à frente de `origin/main`.\n');
    const r = rodar({
      PR_BODY_FILE: arquivo,
      PR_BASE: 'origin/ref-que-nao-existe',
      GITHUB_WORKSPACE: REPO,
    });
    expect(r.stderr).toMatch(/NÃO VERIFICADO/);
    expect(r.stderr).not.toMatch(/sem ancestral comum/);
    expect(r.stderr).not.toMatch(/^\s+at /m);
    expect(r.status).toBe(1);
  });

  it('NÃO sai verde quando não consegue ler o corpo', () => {
    // `GH_TOKEN`/repo vazios: `lerCorpo` devolve null e não mediu nada.
    const r = rodar({
      PR_BODY_FILE: join(tmpdir(), 'nao-existe-pr-body.md'),
      GITHUB_REPOSITORY: '',
      GH_TOKEN: '',
      GITHUB_ACTOR: '',
      GH_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'gh-empty-')),
    });
    expect(r.stderr).toMatch(/NÃO VERIFICADO/);
    expect(r.status).toBe(1);
  });

  it('NÃO afirma que mediu o que não existe quando o corpo não tem claim', () => {
    // Achado da revisão de spec de 2026-10-06. Corpo vazio é permitido pelo
    // GitHub, e a saída antiga dizia "0 claim(s) divergente(s), todas em
    // parágrafo marcado — OK": com corpo vazio não há claim E não há
    // marcador. Uma frase que afirma um marcador inexistente é pior que
    // silence — ela parece uma aprovação.
    const arquivo = join(mkdtempSync(join(tmpdir(), 'pr-body-')), 'body.md');
    writeFileSync(arquivo, '');
    const r = rodar({ PR_BODY_FILE: arquivo, PR_BASE: 'origin/main', GITHUB_WORKSPACE: REPO });

    // Sai 0: o corpo FOI lido e varrido, e a varredura terminou com zero.
    // Isso é medição completa com resultado zero, não "não consegui medir".
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/NÃO VERIFICADO/);
    // A afirmação que não pode estar lá:
    expect(r.stderr).not.toMatch(/em parágrafo marcado/);
    // E a ressalva que tem de estar — a limitação é o conteúdo, não ruído:
    expect(r.stderr).toMatch(/0 claim\(s\) reconhecida\(s\)/);
    expect(r.stderr).toMatch(/NÃO é o mesmo que "verificado e verde"/);
  });

  it('nomeia a limitação quando o corpo tem número que o scanner não reconhece', () => {
    // `37 erros` e `300 linhas` são contagens reais que o gate NÃO enxerga:
    // ele não pode dizer que "tudo que tem contagem está marcado".
    const arquivo = join(mkdtempSync(join(tmpdir(), 'pr-body-')), 'body.md');
    writeFileSync(
      arquivo,
      'Corrigi 37 erros e tirei 300 linhas.\n\n<!--pr-refresh:live--> mexi nisso\n',
    );
    const r = rodar({ PR_BODY_FILE: arquivo, PR_BASE: 'origin/main', GITHUB_WORKSPACE: REPO });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/37 erros/);
    expect(r.stderr).not.toMatch(/em parágrafo marcado/);
  });
});
