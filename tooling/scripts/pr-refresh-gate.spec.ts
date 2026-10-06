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
});
