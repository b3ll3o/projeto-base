// tooling/scripts/commit-msg-gate.spec.ts
//
// pt-BR: Testes do gate de Conventional Commits. Cobre a função pura
// `verificarMensagemCommit` e, no fim, um **diferencial contra o histórico
// real**: roda o gate sobre todo `git log --format=%s` do repositório.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TIPOS, verificarMensagemCommit } from './commit-msg-gate.js';

describe('verificarMensagemCommit() — formato', () => {
  it('aceita tipo com escopo', () => {
    const r = verificarMensagemCommit('feat(gates): o que muda e por quê');
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('aceita tipo sem escopo — 7 dos commits tipados do histórico não têm', () => {
    const r = verificarMensagemCommit('ci: o preflight ganha a reconciliação do catálogo');
    expect(r.errors).toEqual([]);
  });

  it('aceita o marcador de breaking change', () => {
    const r = verificarMensagemCommit('feat(api)!: o contrato de autenticação muda');
    expect(r.errors).toEqual([]);
  });

  it('rejeita tipo fora da lista, nomeando o tipo e a lista', () => {
    const r = verificarMensagemCommit('perf(api): mais rápido');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('perf');
    expect(r.errors[0]).toContain(TIPOS.join(', '));
  });

  it('rejeita mensagem sem ": " e devolve a primeira linha no erro', () => {
    const r = verificarMensagemCommit('feat(gates) sem dois pontos');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('sem dois pontos');
  });

  it('rejeita descrição vazia', () => {
    expect(verificarMensagemCommit('feat(gates):').ok).toBe(false);
  });

  it('rejeita mensagem vazia', () => {
    const r = verificarMensagemCommit('   \n\n');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('vazia');
  });

  it('recusa escopo com espaço — o regex permissivo deixaria a mensagem parecer válida', () => {
    expect(verificarMensagemCommit('feat(dois argumentos): x').ok).toBe(false);
  });

  it('recusa escopo com parêntese dentro', () => {
    expect(verificarMensagemCommit('feat(gates(a)): x').ok).toBe(false);
  });
});

describe('verificarMensagemCommit() — limites deliberadamente ausentes', () => {
  it('aceita assunto de 119 caracteres — o histórico tem, e limite só gera --amend', () => {
    const longo = `feat(gates): ${'x'.repeat(119 - 'feat(gates): '.length)}`;
    expect(longo.length).toBe(119);
    expect(verificarMensagemCommit(longo).errors).toEqual([]);
  });

  it('aceita corpo longo livre depois da linha de assunto', () => {
    const msg = 'fix(auth): corrige o cálculo do TTL\n\n' + 'linha de corpo\n'.repeat(40);
    expect(verificarMensagemCommit(msg).errors).toEqual([]);
  });
});

describe('verificarMensagemCommit() — commits gerados pelo git saem declarados', () => {
  // Um teste que só afirma `ok: true` não distingue "verifiquei e passei" de
  // "não havia nada para verificar". Cada forma abaixo tem que vir com
  // `skipped` e `reason` — silêncio é o estado que a regra dos 3 estados proíbe.
  const CASOS: ReadonlyArray<readonly [string, string]> = [
    ['Merge pull request #28 from b3ll3o/feat/archify-flow-spec', 'Merge'],
    ["Merge branch 'main' into feat/x", 'Merge'],
    ['Revert "feat(gates): o que muda"', 'Revert'],
    ['fixup! feat(gates): o que muda', 'fixup!'],
    ['squash! feat(gates): o que muda', 'squash!'],
    ['amend! feat(gates): o que muda', 'amend!'],
  ];

  for (const [mensagem, marca] of CASOS) {
    it(`declara o bypass de "${marca}" em vez de silenciar`, () => {
      const r = verificarMensagemCommit(mensagem);
      expect(r.ok).toBe(true);
      expect(r.skipped).toBe(true);
      expect(r.reason).toBeTruthy();
      expect(r.reason).toContain(marca);
    });
  }

  it('não confunde um tipo chamado "merge" com um merge do git', () => {
    const r = verificarMensagemCommit('merge: algum tipo que não está na lista');
    expect(r.skipped).toBeUndefined();
    expect(r.ok).toBe(false);
  });
});

describe('diferencial contra o histórico real', () => {
  /**
   * Base congelada: 2 subjects anteriores a este gate que não seguem o formato
   * e que a **hook nunca vê** — squash-merge e commit raiz são feitos pelo
   * GitHub ou na criação do repo, não por `git commit` local. Congelar é
   * deliberado: um número ("13 linhas") envelhece a cada commit posterior, e
   * o que precisa é que a lista **não cresça**.
   */
  const LEGADO = new Set([
    'first commit',
    '[catalog] 78/78 flows + B34 retroactive enrichment (#33)',
  ]);

  it('todo subject do git log passa, fora a base congelada', () => {
    const raiz = raizDoRepo();
    const saida = execFileSync('git', ['log', '--format=%s'], {
      cwd: raiz,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });

    const subjects = saida.split('\n').filter((s) => s.trim().length > 0);
    expect(subjects.length).toBeGreaterThan(100);

    const divergentes = subjects
      .map((s) => ({ s, r: verificarMensagemCommit(s) }))
      .filter(({ s, r }) => !r.ok && !LEGADO.has(s))
      .map(({ s, r }) => `${s}  ->  ${r.errors.join(' | ')}`);

    expect(divergentes).toEqual([]);
  });

  it('a base congelada ainda existe no histórico — senão ela envelheceu calada', () => {
    const raiz = raizDoRepo();
    const saida = execFileSync('git', ['log', '--format=%s'], { cwd: raiz, encoding: 'utf8' });
    for (const legado of LEGADO) {
      expect(saida.split('\n')).toContain(legado);
    }
  });
});

/**
 * O caminho que o `.husky/commit-msg` de fato executa: o binário, o arquivo de
 * mensagem e o **exit code**.
 *
 * MEDIDO 2026-10-20: apagar o `if (!r.ok) { … process.exit(1); }` do bloco CLI
 * deixou os 20 testes verdes E o hook aceitando `perf(api): mais rapido`. Os
 * testes acima cobrem a função pura; o hook consome o **outro** lado dela, e um
 * lado que ninguém exercita regredi calado — sem CI que o note, porque este
 * gate é local e deliberadamente não entra no `preflight`.
 *
 * `wip` e não `perf` de propósito: `perf` é rejeitado por este gate mas
 * ACEITO por `review-router.ts`, então usá-lo aqui faria o teste depender de uma
 * divergência de vocabulário que pode ser resolvida sem que este teste deva
 * mudar. `wip` não está em lista nenhuma.
 */
describe('o caminho executado pelo hook — exit code do binário', () => {
  const roda = (mensagem: string): { status: number; stdout: string; stderr: string } => {
    const raiz = raizDoRepo();
    const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
    const arq = join(dir, 'msg');
    writeFileSync(arq, mensagem);
    try {
      const saida = execFileSync(
        join(raiz, 'node_modules/.bin/tsx'),
        [join(raiz, 'tooling/scripts/commit-msg-gate.ts'), arq],
        { cwd: raiz, encoding: 'utf8', stdio: 'pipe' },
      );
      return { status: 0, stdout: saida, stderr: '' };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('BLOQUEIA com exit 1 e nomeia o culpado no stderr', () => {
    const { status, stderr } = roda('wip(api): rascunho sem tipo válido');
    expect(status, `o hook liberou uma mensagem inválida:\n${stderr}`).toBe(1);
    expect(stderr).toContain('tipo "wip" fora da lista');
  });

  it('LIBERA com exit 0 uma mensagem válida', () => {
    expect(roda('feat(gates): o que muda e por quê').status).toBe(0);
  });

  it('LIBERA um commit do git com exit 0 E o motivo no stdout — nunca em silêncio', () => {
    // A árvore sadia só exercita metade do conserto se o `skipped` sair 0 sem
    // dizer por quê: aí o gate não se distingue de um que não rodou.
    const { status, stdout } = roda('Merge pull request #7 from origin/main');
    expect(status).toBe(0);
    expect(stdout).toContain('Conventional Commits não se aplica');
  });
});

describe('CRLF — o mesmo byte, o mesmo veredito', () => {
  it('aceita assunto com CRLF sem corpo', () => {
    expect(verificarMensagemCommit('feat: x\r\n').ok).toBe(true);
  });

  it('aceita assunto com CRLF COM corpo — antes reprovava, e a mensagem comia a linha', () => {
    const r = verificarMensagemCommit('feat(gates): x\r\n\r\ncorpo com\r\nlinhas\r\n');
    expect(r.ok, `reprovou por causa do \\r:\n${r.errors.join('\n')}`).toBe(true);
  });

  it('a mensagem de erro não carrega \\r cru', () => {
    const r = verificarMensagemCommit('nada disso é conventional\r\n\r\ncorpo\r\n');
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).not.toContain('\r');
  });
});

/**
 * Raiz por busca ascendente a partir do próprio arquivo, não por `process.cwd()`
 * — o cwd de um spec depende de onde o runner foi lançado, e um diferencial que
 * mede o repositório errado é verde sobre o conjunto vazio.
 */
function raizDoRepo(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, '.git'))) {
    const pai = dirname(dir);
    if (pai === dir) throw new Error('raiz do repo não encontrada a partir do spec');
    dir = pai;
  }
  return dir;
}
