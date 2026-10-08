import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkBranchUpToDate } from './check-branch-up-to-date';
import type { GitRun } from './check-branch-up-to-date';
import { linhasDoRelato } from './check-types';

/**
 * Raiz do repo, derivada do PRÓPRIO spec e não de `process.cwd()`.
 *
 * O teste abaixo executa o check com `cwd` no repo de mentira, e `tsx` é um
 * caminho relativo a `node_modules`. Se qualquer um dos dois viesse do
 * `process.cwd()`, o teste mediria um repo de verdade em vez do de mentira —
 * e um gate que passa pelo motivo errado é pior que um gate que não existe.
 */
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_ROOT, '.tooling/scripts/ci/check-branch-up-to-date.ts');

/**
 * Executa `git` com a identidade **explícita**.
 *
 * MEDIDO no PR #53: o `git rebase` do par de integração passava na minha
 * máquina e falhava com `status 128` no CI. A causa não era o gate — era o
 * `git config --global user.name` da minha máquina, que existe aqui e não
 * existe no runner. Toda chamada `git` deste arquivo passa por aqui, para
 * que nenhuma herde a identidade de quem está rodando. Confirmado com
 * `GIT_CONFIG_GLOBAL=/dev/null`, que reproduz o CI localmente.
 */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  });
}

/**
 * Git de mentira, com as respostas que o gate recebe.
 *
 * O gate tem TRÊS saídas possíveis do `merge-base --is-ancestor` e elas não
 * se confundem: `0` (atualizado), `1` (atrasado) e qualquer outra
 * (sem ancestral comum). Um fake que só responde 0/1 faria o terceiro caminho
 * nunca ser exercitado — e é justamente o caminho que não pode ser
 * reportado como "atrasado", porque o conserto é outro.
 */
/** SHA de mentira, do tamanho que o git real devolve. */
const SHA = 'a1b2c3d4e5f6'.padEnd(40, '0');

function fakeGit(respostas: Record<string, number | string>): GitRun {
  return (args) => {
    for (const [chave, saida] of Object.entries(respostas)) {
      if (args.join(' ').includes(chave)) {
        return typeof saida === 'number'
          ? { status: saida, stdout: '', stderr: '' }
          : { status: 0, stdout: saida, stderr: '' };
      }
    }
    return { status: 1, stdout: '', stderr: '' };
  };
}

/**
 * Repo git de verdade, com `origin/main` e uma branch.
 *
 * Preferi `git` real a `run` falso nos testes de integração: o gate inteiro é
 * uma pergunta feita ao git, e um duplo que responde o que o teste quer
 * seria verde sobre uma invocação que o git real rejeita. Foi assim que a
 * primeira versão do teste de ancestral comum do `pr-refresh-gate` passou
 * verde medindo outra coisa.
 */
function repoReal(quantosMainDepois: number): string {
  const raiz = mkdtempSync(join(tmpdir(), 'branch-atrasada-'));
  const remoto = join(raiz, 'origin.git');
  const trabalho = join(raiz, 'work');
  const g = (...args: string[]) => git(trabalho, ...args);
  // A mensagem é parte do conteúdo do commit, e o conteúdo define o SHA.
  //
  // MEDIDO: com `-m c` em tudo, o primeiro commit de `main` saiu com o MESMO
  // SHA do commit da demanda (`9a816e2`) — mesma árvore vazia, mesmo autor,
  // mesma mensagem, mesmo segundo. `main` passou a conter o objeto da demanda
  // e a branch ficou "2 atrás" de um `main` que tinha recebido três commits novos. O gate
  // contava certo e o cenário é que estava errado: um teste que faz o
  // repositório mentir culpa o instrumento.
  const commitar = (msg: string) => g('commit', '--quiet', '--allow-empty', '-m', msg);

  git(raiz, 'init', '--quiet', '--bare', remoto);
  git(raiz, 'clone', '--quiet', remoto, trabalho);
  commitar('raiz');
  g('branch', '-M', 'main');
  g('push', '--quiet', 'origin', 'main');

  // A branch nasce de `main` e entrega trabalho.
  g('checkout', '--quiet', '-b', 'demanda');
  commitar('trabalho da demanda');
  g('push', '--quiet', 'origin', 'demanda');

  // `main` avança depois que a demanda foi implementada: é a situação que a
  // regra descreve ("demanda implementada com a main desatualizada").
  g('checkout', '--quiet', 'main');
  for (let i = 1; i <= quantosMainDepois; i++) commitar(`main ${i}`);
  g('push', '--quiet', 'origin', 'main');
  g('checkout', '--quiet', 'demanda');

  return trabalho;
}

/**
 * Repo com um rebase PARADO em conflito.
 *
 * Reproduz o que o git deixa no disco quando o rebase não conclui: HEAD
 * desanexado e o diretório `.git/rebase-merge` presente. Construí-lo com
 * `git rebase` de verdade exige uma conflict engineered (as duas branches
 * tocando a mesma linha) — que é mais setup do que o fato sob teste exige.
 * O que o gate lê é a **presença do diretório**, então é esse o estado
 * plantado.
 */
function repoComRebaseParado(): string {
  const repo = repoReal(1);
  // `git rev-parse --git-path` respeita worktrees e `GIT_DIR`; um
  // `.git/rebase-merge` chutado seria verde numa máquina e vermelho no CI.
  // `encoding` + stdout em pipe: o helper acima joga o stdout fora, e aqui
  // é justamente a saída que importa.
  const caminho = git(repo, 'rev-parse', '--git-path', 'rebase-merge').trim();
  mkdirSync(join(repo, caminho), { recursive: true });
  return repo;
}

describe('checkBranchUpToDate', () => {
  describe('decisão (git falso)', () => {
    it('verde quando a base é ancestral de HEAD', () => {
      const r = checkBranchUpToDate({
        run: fakeGit({ 'rev-parse': SHA, 'is-ancestor': 0, 'rev-list': '0\n' }),
      });
      expect(r.ok).toBe(true);
      expect(r.skipped).toBeUndefined();
      expect(r.errors).toEqual([]);
    });

    it('vermelho nomeando QUANTOS commits e QUAL base', () => {
      // Sem a base e a contagem, o revisor não tem como conferir a régua:
      // "atrasada" é uma afirmação, e a forma de falsificá-la é medir de novo.
      const r = checkBranchUpToDate({
        run: fakeGit({ 'rev-parse': SHA, 'is-ancestor': 1, 'rev-list': '7\n' }),
      });
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toMatch(/7/);
      expect(r.errors[0]).toMatch(/origin\/main/);
      // O conserto tem de estar na mensagem: um gate que só acusa deixa a
      // pessoa descobrir sozinha o que fazer.
      expect(r.errors[0]).toMatch(/rebase/);
    });

    it('a ressalva da ref local NÃO é contada como erro — 1 defeito, 1 erro', () => {
      // MEDIDO 2026-10-06: a ressalva "Atenção: medido contra a ref local"
      // vivia no MESMO array `errors`, e o preflight faz
      // `totalErrors += result.errors.length`. Resultado no console: uma branch
      // 1 commit atrás printava "❌ 2 erro(s) encontrado(s)" — dois defeitos
      // onde há um. Quem lê o número passa a procurar um segundo bug que não
      // existe, e o que existe de verdade é a contagem.
      //
      // A ressalva é conteúdo de verdade e não pode ser jogada fora: sem ela,
      // um verde local sobre uma ref velha vira prova. Então ela continua
      // impressa — o que muda é o CANAL, e é só isso que este teste fixa.
      const r = checkBranchUpToDate({
        run: fakeGit({ 'rev-parse': SHA, 'is-ancestor': 1, 'rev-list': '1\n' }),
      });
      expect(r.ok).toBe(false);
      // Um defeito = um erro. A ressalva não vira o segundo.
      expect(r.errors).toHaveLength(1);
      // ...e não foi silenciada: ela aparece, em outro canal.
      expect(r.advisories).toHaveLength(1);
      expect(r.advisories![0]).toMatch(/Atenção/);
      expect(r.advisories![0]).toMatch(/fetch/);
    });

    it('NÃO confunde "sem ancestral comum" com "atrasada"', () => {
      // `merge-base --is-ancestor` devolve 128 quando não há ancestral. Não é
      // "está 7 atrás": a história não converge, e o conserto é outro
      // (buscar a base), não rebasedar em cima dela.
      const atrasado = checkBranchUpToDate({
        run: fakeGit({ 'rev-parse': SHA, 'is-ancestor': 1, 'rev-list': '7\n' }),
      });
      const semBase = checkBranchUpToDate({
        run: fakeGit({ 'rev-parse': SHA, 'is-ancestor': 128, 'rev-list': '0\n' }),
      });
      expect(semBase.ok).toBe(false);
      expect(semBase.errors[0]).not.toBe(atrasado.errors[0]);
      expect(semBase.errors[0]).toMatch(/ancestral/i);
    });

    it('skipped declarado quando a base não existe — nunca verde calado', () => {
      // `rev-parse --verify` falhando é "não medido", e a diferença entre
      // "não havia o que verificar" e "verifiquei e passou" é o campo
      // `skipped`. Sem ele, um clone sem remoto diria que a branch está
      // atualizada.
      const r = checkBranchUpToDate({ run: fakeGit({}) });
      expect(r.skipped).toBe(true);
      expect(r.reason).toMatch(/origin\/main/);
      expect(r.errors).toEqual([]);
    });

    it('skipped também quando o cwd não é um repositório git', () => {
      const r = checkBranchUpToDate({ run: fakeGit({ 'is-ancestor': 128 }) });
      expect(r.skipped).toBe(true);
    });
  });

  describe('contra o git de verdade', () => {
    it('verde numa demandarebaseda (main não avançou depois)', () => {
      const repo = repoReal(0);
      const r = checkBranchUpToDate({ repoRoot: repo });
      expect(r.skipped).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
    });

    it('VERMELHO numa demanda implementada com a main desatualizada', () => {
      // O teste que dá sentido à regra: a demanda está inteira, o trabalho
      // está feito, e mesmo assim ela não contém a main atual.
      const repo = repoReal(3);
      const r = checkBranchUpToDate({ repoRoot: repo });
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toMatch(/3/);
    });

    it('após o rebase, a mesma demanda fica verde', () => {
      // O par com o teste anterior. Um gate que acusa "atrasada" e continua
      // acusando depois do rebase está medindo outra coisa; e um que accuse
      // antes e fique verde depois só prova que o `ok` é função do repositório,
      // não do argumento.
      const repo = repoReal(3);
      const antes = checkBranchUpToDate({ repoRoot: repo });
      git(repo, 'fetch', '--quiet', 'origin');
      git(repo, 'rebase', '--quiet', 'origin/main');
      const depois = checkBranchUpToDate({ repoRoot: repo });

      expect(antes.ok).toBe(false);
      expect(depois.ok).toBe(true);
      expect(depois.errors).toEqual([]);
    });

    it('VERMELHO, e nomeando o estado, com um rebase PARADO em conflito', () => {
      // A parte que a regra original esquecia: rebase não é um comando
      // atômico. Ele pode parar no meio, com conflito, deixando HEAD solto e
      // nenhum histórico pronto. Medir a demanda nesse estado produz uma
      // leitura sem sentido — e sem este ramo a mensagem seria "sem
      // ancestral comum", que é um conserto que NÃO resolve.
      const repo = repoComRebaseParado();

      const r = checkBranchUpToDate({ repoRoot: repo });

      expect(r.ok).toBe(false);
      expect(r.errors[0]).toMatch(/rebase/i);
      // O caminho de saída tem de estar na mensagem: quem parou num conflito
      // precisa saber que existe `git rebase --abort`.
      expect(r.errors[0]).toMatch(/--continue/);
      expect(r.errors[0]).toMatch(/--abort/);
      // E não pode ser reportado como "atrasada": o conserto é outro.
      expect(r.errors.join('\n')).not.toMatch(/atrás de/);
    });

    it('o modo CLI imprime a ressalva — o caminho isolado não engole o aviso', () => {
      // MEDIDO 2026-10-07: com a ressalva em `advisories`, o painel do
      // preflight passou a imprimi-la e o CLI do próprio arquivo continuou
      // imprimindo só `errors`. Rodar o check isolado
      // (`tsx .tooling/scripts/ci/check-branch-up-to-date.ts`) sumia com o
      // aviso que dá sentido ao número — e nenhum teste caía, porque o bloco
      // `if (process.argv[1])` estava fora do alcance de qualquer spec.
      //
      // Executa o binário de verdade contra um repo de verdade: o defeito é
      // justamente do caminho de impressão, e testar a função não diria nada
      // sobre ele.
      const repo = repoReal(3);
      // Precondição — sem isso o teste passa vacuamente: se o check deixasse
      // de produzir ressalva nenhuma, a igualdade abaixo continuaria valendo.
      const esperado = checkBranchUpToDate({ repoRoot: repo });
      expect(esperado.advisories).toHaveLength(1);

      let stderr = '';
      try {
        execFileSync(TSX, [SCRIPT], {
          cwd: repo,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        stderr = (err as { stderr?: string }).stderr ?? '';
      }

      expect(stderr).toMatch(/Atenção/);
      // Paridade estrita: a saída do CLI é exatamente o relato. Qualquer
      // categoria que um caminho imprima e o outro não quebra aqui.
      expect(stderr.trimEnd()).toBe(linhasDoRelato(esperado).join('\n'));
    });
  });
});
