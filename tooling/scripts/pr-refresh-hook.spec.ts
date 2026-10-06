/**
 * `pr-refresh-hook` — a orquestração que roda a cada push.
 *
 * ## O que está sendo testado aqui
 *
 * NÃO é o scanner (tem spec próprio, com repo git de verdade) nem a reescrita
 * (idem). Aqui o sujeito é a **sequência de decisões**: o que fazer quando não
 * há PR, quando a base não veio, quando o push não vai passar, quando o corpo
 * não tem marcador, e — o mais importante — que nenhuma dessas é lida como
 * sucesso.
 *
 * ## Por que a fronteira de segurança é testada de novo aqui
 *
 * O corpo do PR é entrada não confiável e mutável. O `pr-refresh-apply` já
 * tem o canário dele; este arquivo tem o **deste** porque o hook é o único
 * lugar onde o corpo cruza uma fronteira de verdade — a rede. O canário não
 * pergunta "o texto foi preservado": pergunta se o corpo ganhou um caminho até
 * um subprocesso. A resposta tem de ser não, e ela é do hook, não do apply.
 *
 * ## Nenhum teste deste arquivo toca a rede
 *
 * O `gh` e o `git fetch` entram por dependência injetada. A medição NÃO: ela
 * roda o `git` real contra um repo temporário, porque um hook cuja medição é
 * uma double não prova que ele mede a coisa certa — prova que ele repassa o
 * resultado da double.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Deps } from './pr-refresh-hook.js';
import { buscarBase, executar } from './pr-refresh-hook.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture de repo: 1 commit, 2 arquivos, +2 inserções, −1 remoção contra a
// base. Nenhum número vem da máquina ou do repo de desenvolvimento — é a mesma
// disciplina do `pr-refresh-scan.spec.ts`, e a razão de ela estar repetida
// aqui em vez de importada: um spec importado de outro spec roda as suites
// alheias dentro desta, e o número que falha some no meio das outras.
function git(repo: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // Um `git` que falha no fixture precisa dizer POR QUÊ. Com stderr em
    // `ignore`, o teste quebrava com "Command failed: git push -q origin main"
    // e nenhuma pista — que foi exatamente o que aconteceu ao preparar a
    // fixture do remoto.
    const s = typeof e === 'object' && e !== null && 'stderr' in e ? String(e.stderr) : '';
    throw new Error(`git ${args.join(' ')} falhou: ${s.trim() || e}`);
  }
}

function repoFixture(): { repo: string; base: string } {
  const repo = mkdtempSync(join(tmpdir(), 'pr-refresh-hook-repo-'));
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'a.txt'), '1\n2\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base']);
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  writeFileSync(join(repo, 'a.txt'), '1\n3\n');
  writeFileSync(join(repo, 'b.txt'), 'x\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'head']);
  return { repo, base };
}

// Verdadeiro = o que o repo acima mede de verdade: 1 commit, 2 arquivos.
// Não é um número redondo porque o fixture é o número — trocar por "38/42"
// faria toda asserção de "está em dia" passar por ser stale, e o teste viraria
// verde pela razão errada.
const CABECALHO_VERDADEIRO = '**1 commit, 2 arquivos**';
const CABECALHO_VELHO = '**30 commits, 40 arquivos**';
const MARCA = '<!--pr-refresh:live-->';

interface Chamadas {
  fetch: number;
  relacao: number;
  leitura: number;
  escritas: Array<{ pr: number; corpo: string }>;
  ordem: string[];
}

function cenario(
  corpo: string,
  over: Partial<Deps> & { repo?: string; base?: string } = {},
): { deps: Deps; spies: Chamadas } {
  const { repo, base } = repoFixture();
  const spies: Chamadas = { fetch: 0, relacao: 0, leitura: 0, escritas: [], ordem: [] };
  const deps: Deps = {
    branch: 'feat/teste',
    repo: over.repo ?? repo,
    base: over.base ?? base,
    atualizarBase: () => {
      spies.fetch += 1;
      spies.ordem.push('fetch');
      return { ok: true, erro: '' };
    },
    relacaoComRemoto: () => {
      spies.relacao += 1;
      spies.ordem.push('relacao');
      return 'ff';
    },
    prAberto: () => 44,
    corpo: (pr) => {
      spies.leitura += 1;
      spies.ordem.push('corpo');
      return corpo;
    },
    estadoDoPr: () => 'OPEN',
    aplicar: (pr, texto) => {
      spies.ordem.push('aplicar');
      spies.escritas.push({ pr, corpo: texto });
    },
    ...over,
  };
  return { deps, spies };
}

describe('buscarBase — `origin/main` é ref de tracking, não nome de branch no remoto', () => {
  // MEDIDO 2026-10-06 no push que ligou este hook: `git fetch --quiet -- origin
  // origin/main` → `fatal: couldn't find remote ref origin/main`, exit 128. O
  // `origin/` do valor é o NOME LOCAL da ref de tracking; passado como refspec
  // ele diz ao remoto "me traga a branch `origin/main`", que não existe. O
  // hook então respondia `base-indisponivel` em TODO push — nunca mediava nada,
  // e a causa (um refspec errado) não aparecia em lugar nenhum.
  //
  // O teste monta um remoto de verdade porque um double de `fetch` não
  // distinguiria `origin/main` de `main`: a diferença é inteiramente do lado do
  // git, e só o git a resolve.
  const comRemoto = (): { repo: string; remoto: string } => {
    const raiz = mkdtempSync(join(tmpdir(), 'pr-refresh-hook-remote-'));
    const remoto = join(raiz, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', remoto], { stdio: 'ignore' });
    // `git init --bare` deixa o HEAD do remoto apontando para `master`, que
    // não existe. Sem esta linha, `git clone` do remoto sai numa branch
    // inexistente, o primeiro commit cria `master`, e o `push origin main`
    // falha com "src refspec main does not match any" — que é o sintoma que
    // apareceu, e que nada no teste explicava.
    git(remoto, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    const repo = join(raiz, 'work');
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { stdio: 'ignore' });
    git(repo, ['remote', 'add', 'origin', remoto]);
    return { repo, remoto };
  };

  const commitar = (repo: string, arquivo: string, texto: string, msg: string): void => {
    writeFileSync(join(repo, arquivo), texto);
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg]);
  };

  it('atualiza a ref de tracking a partir de `origin/main` (o refspec antigo estourava aqui)', () => {
    const { repo, remoto } = comRemoto();
    commitar(repo, 'a.txt', '1\n', 'primeiro');
    git(repo, ['push', '-q', 'origin', 'main']);
    const antes = git(repo, ['rev-parse', 'origin/main']).trim();

    // O remoto andou; a ref local não. É exatamente a janela que o `fetch`
    // existe para fechar. O segundo clone aponta para o BARE: clonar de `repo`
    // (não-bare, com `main` marcado) faz o push ser recusado com "refusing to
    // update checked out branch" — que é o motivo, não uma hipótese.
    const outro = mkdtempSync(join(tmpdir(), 'pr-refresh-hook-outro-'));
    execFileSync('git', ['clone', '-q', remoto, outro], { stdio: 'ignore' });
    commitar(outro, 'b.txt', '2\n', 'segundo');
    git(outro, ['push', '-q', 'origin', 'main']);

    const r = buscarBase(repo, 'origin/main');
    expect(r.ok).toBe(true);
    expect(git(repo, ['rev-parse', 'origin/main']).trim()).not.toBe(antes);
    expect(git(repo, ['rev-parse', 'origin/main']).trim()).toBe(
      git(outro, ['rev-parse', 'HEAD']).trim(),
    );
  });

  it('`ok: false` DIZ O QUÊ — auth, branch remota apagada e rede caída são coisas diferentes', () => {
    // Sem isto, o operador lê "não consegui atualizar" e não sabe se corrige a
    // rede, o token ou o nome da base. Um estado que não diz a causa obriga a
    // adivinhar — que é como um hook verde nasce.
    const { repo } = comRemoto();
    const r = buscarBase(repo, 'origin/nao-existe');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/nao-existe/);
  });

  it('base que não é ref de tracking (um SHA local) não vira refspec de fetch', () => {
    const { repo } = comRemoto();
    commitar(repo, 'a.txt', '1\n', 'primeiro');
    const sha = git(repo, ['rev-parse', 'HEAD']).trim();
    // Um SHA não tem branch no remoto: transformá-lo em refspec seria pedir ao
    // git uma branch chamada com 40 hex, que falha. O `ok: true` aqui significa
    // "nada a buscar", não "busquei".
    const r = buscarBase(repo, sha);
    expect(r.ok).toBe(true);
  });
});

describe('executar — os quatro predicados na ordem', () => {
  it('T1: sem PR aberto para a branch, não mede e não escreve', () => {
    const { deps, spies } = cenario(CABECALHO_VELHO, { prAberto: () => null });
    const r = executar(deps);
    expect(r.estado).toBe('sem-pr');
    // A medição é o trabalho caro, e ela é inútil sem PR. Medir mesmo assim
    // seria gastar um subprocesso por push para descobrir que não há o que
    // atualizar.
    expect(spies.leitura).toBe(0);
    expect(spies.escritas).toHaveLength(0);
  });

  it('T1: a base é buscada ANTES de ler o corpo — base velha é base mentirosa', () => {
    const { deps, spies } = cenario(CABECALHO_VELHO);
    executar(deps);
    expect(spies.ordem.slice(0, 2)).toEqual(['fetch', 'relacao']);
    expect(spies.ordem.indexOf('fetch')).toBeLessThan(spies.ordem.indexOf('corpo'));
  });

  it('base que não veio → estado nomeado e ZERO escrita, mesmo com divergência à mão', () => {
    // Este é o teste que impede o pior desfecho do hook: sem rede, ele tem um
    // corpo stale na mão e uma árvore local; medir contra uma base velha dá
    // um número errado e WRITÁ-LO no corpo converte um dado velho em um errado.
    const { deps, spies } = cenario(`${CABECALHO_VELHO} ${MARCA}`, {
      atualizarBase: () => ({ ok: false, erro: "couldn't find remote ref main" }),
    });
    const r = executar(deps);
    expect(r.estado).toBe('base-indisponivel');
    expect(spies.escritas).toHaveLength(0);
  });

  it('o motivo da base entra no detalhe — "não consegui" sozinho obriga a adivinhar', () => {
    // MEDIDO 2026-10-06: o hook respondia `base-indisponivel` por um refspec
    // errado e a linha não dizia qual. O conserto (auth / branch apagada /
    // rede) dependia de alguém rodar o `git fetch` à mão para descobrir.
    const { deps } = cenario(`${CABECALHO_VELHO} ${MARCA}`, {
      atualizarBase: () => ({ ok: false, erro: "couldn't find remote ref nao-existe" }),
    });
    expect(executar(deps).detalhe).toContain('nao-existe');
  });

  it('a base é buscada UMA vez, mesmo quando o resultado é `ok: false`', () => {
    // Ler `.ok` e `.erro` em dois `deps.atualizarBase()` faria dois fetches — e
    // o `erro` viria de uma tentativa diferente da que falhou.
    const { deps, spies } = cenario(`${CABECALHO_VELHO} ${MARCA}`, {
      atualizarBase: () => {
        spies.fetch += 1;
        return { ok: false, erro: 'caiu' };
      },
    });
    executar(deps);
    expect(spies.fetch).toBe(1);
  });

  it('push que não é fast-forward → não escreve: o corpo passaria a descrever um push que o git vai recusar', () => {
    const { deps, spies } = cenario(`${CABECALHO_VELHO} ${MARCA}`, {
      relacaoComRemoto: () => 'nao-ff',
    });
    const r = executar(deps);
    expect(r.estado).toBe('push-recusado');
    expect(spies.escritas).toHaveLength(0);
  });

  it('branch nova (sem ref no remoto) → escreve: o push vai criar a ref, não competir com ela', () => {
    const { deps, spies } = cenario(`${CABECALHO_VELHO} ${MARCA}`, {
      relacaoComRemoto: () => 'nova',
    });
    expect(executar(deps).estado).toBe('reescrito');
    expect(spies.escritas).toHaveLength(1);
  });

  it('T4: PR que fechou entre medir e escrever → não escreve', () => {
    const { deps, spies } = cenario(`${CABECALHO_VELHO} ${MARCA}`, { estadoDoPr: () => 'MERGED' });
    const r = executar(deps);
    expect(r.estado).toBe('fechado');
    expect(spies.escritas).toHaveLength(0);
  });
});

describe('executar — os estados que NÃO são sucesso', () => {
  it('corpo com claims corretos → `em-dia`, e não é o mesmo estado que "não fez nada"', () => {
    const { deps, spies } = cenario(`${CABECALHO_VERDADEIRO} ${MARCA}`);
    const r = executar(deps);
    expect(r.estado).toBe('em-dia');
    expect(r.escritas).toHaveLength(0);
    expect(spies.escritas).toHaveLength(0);
  });

  it('SEM MARCADOR e com divergência → `sem-marcador`, que diz que o hook está inativo', () => {
    // O estado que não pode virar verde. Um hook que não escreve porque não
    // encontrou o marcador e um hook que não escreve porque está em dia são o
    // MESMO código de saída para quem só olha stdout em verde — e o primeiro
    // é o que faz o trabalho parar sem ninguém perceber.
    const { deps, spies } = cenario(CABECALHO_VELHO);
    const r = executar(deps);
    expect(r.estado).toBe('sem-marcador');
    expect(r.detalhe).toContain('marcadas=0');
    expect(spies.escritas).toHaveLength(0);
  });

  it('divergência SÓ em citação, com região marcada sadia → estado próprio, e não `em-dia`', () => {
    // Há divergência no corpo. Ela está fora da região viva. `em-dia` aqui
    // seria mentira: o corpo tem número velho. O estado é outro porque quem lê
    // precisa saber que existe algo velho, mesmo que ninguém tenha mexido.
    const corpo = [`${CABECALHO_VERDADEIRO} ${MARCA}`, '', 'Ela foi aberta com "20 commits".'].join(
      '\n',
    );
    const { deps, spies } = cenario(corpo);
    const r = executar(deps);
    expect(r.estado).toBe('divergencia-fora-do-vivo');
    expect(r.divergentes).toBe(1);
    expect(spies.escritas).toHaveLength(0);
  });

  it('leitura do corpo que falha → `falha` nomeado, e nada é escrito', () => {
    const { deps, spies } = cenario(CABECALHO_VELHO, {
      corpo: () => {
        throw new Error('HTTP 401');
      },
    });
    const r = executar(deps);
    expect(r.estado).toBe('falha');
    expect(r.detalhe).toContain('HTTP 401');
    expect(spies.escritas).toHaveLength(0);
  });
});

describe('executar — a escrita', () => {
  it('reescreve só a região viva e publica o corpo novo no PR certo', () => {
    const corpo = [`${CABECALHO_VELHO} ${MARCA}`, '', 'Ela foi aberta com "20 commits".'].join(
      '\n',
    );
    const { deps, spies } = cenario(corpo);
    const r = executar(deps);
    expect(r.estado).toBe('reescrito');
    expect(spies.escritas).toHaveLength(1);
    const publicado = spies.escritas[0];
    expect(publicado?.pr).toBe(44);
    expect(publicado?.corpo).toContain(`${CABECALHO_VERDADEIRO} ${MARCA}`);
    // A citação sobrevive intacta — inclusive o número stale dela, que é
    // histórico e não é do hook para mudar.
    expect(publicado?.corpo).toContain('"20 commits"');
    expect(r.escritas.map((e) => e.classe).sort()).toEqual(['arquivos', 'commits']);
  });

  it('rodar duas vezes: a segunda é `em-dia` e não publica nada', () => {
    const { deps, spies } = cenario(`${CABECALHO_VELHO} ${MARCA}`);
    expect(executar(deps).estado).toBe('reescrito');
    const reaplicado = cenario(spies.escritas[0]?.corpo ?? '');
    expect(executar(reaplicado.deps).estado).toBe('em-dia');
    expect(reaplicado.spies.escritas).toHaveLength(0);
  });
});

describe('executar — nunca derruba o push', () => {
  it('uma dependência que LANÇA vira `falha`, e não um stack trace no meio do git push', () => {
    // O hook roda dentro do `git push`. Um throw aqui sai como stack trace e
    // impede o push — que é exatamente o oposto do combinado: falha de rede,
    // auth expirada ou bug novo não podem virar "não dá para commitar".
    const { deps } = cenario(CABECALHO_VELHO, {
      relacaoComRemoto: () => {
        throw new Error('git: rede caiu');
      },
    });
    expect(() => executar(deps)).not.toThrow();
    expect(executar(deps).estado).toBe('falha');
  });

  it('`aplicar` que falha depois de decidir escrever → `falha`, não `reescrito`', () => {
    // O PATCH é a única escrita externa. Se ele falha, dizer `reescrito` seria
    // publicar um estado que o GitHub não tem.
    const { deps } = cenario(`${CABECALHO_VELHO} ${MARCA}`, {
      aplicar: () => {
        throw new Error('HTTP 422');
      },
    });
    expect(executar(deps).estado).toBe('falha');
  });
});

describe('executar — fronteira de segurança (canário)', () => {
  it('o corpo não ganha caminho até um comando: pede para executar e nada executa', () => {
    // Canário, como o dos outros dois arquivos. O corpo pede para criar um
    // arquivo e o teste afirma que ele não existe depois. `relacaoComRemoto` e
    // `corpo` recebem TEXTO e NÚMERO de quem pede, nunca o corpo — e o corpo só
    // sai daqui por `reescrever`, que devolve string.
    const marca = join(tmpdir(), `pr-refresh-canario-${process.pid}`);
    const corpo = `${CABECALHO_VELHO} ${MARCA}\n\n\`touch ${marca}\` $(touch ${marca}-sub)`;
    const { deps } = cenario(corpo);
    const r = executar(deps);
    expect(existsSync(marca)).toBe(false);
    expect(existsSync(`${marca}-sub`)).toBe(false);
    // O canário acima só prova o disco; falta provar que o texto chegou
    // inteiro à saída, senão "não executou" também é compatível com "não viu".
    expect(r.estado).toBe('reescrito');
  });
});
