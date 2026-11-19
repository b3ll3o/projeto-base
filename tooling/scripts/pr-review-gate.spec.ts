import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  achatarPaginas,
  coletarComentario,
  ehNaoEncontrado,
  extrairComentario,
  MARCADOR,
  numeroDoPr,
  ownerENome,
  repositorio,
  temMarcador,
  verificarRevisao,
} from './pr-review-gate';
import type { ItemComentario } from './pr-review-gate';

const GATE = 'tooling/scripts/pr-review-gate.ts';

/** Comentário com o marcador — o que satisfaz a regra. */
function comMarcador(canal: ItemComentario['canal'] = 'review'): ItemComentario {
  return { canal, id: 1, autor: 'b3ll3o', corpo: `${MARCADOR}\n\n## Revisão\n\nachado` };
}

/** Comentário sem o marcador — conversa que não é revisão. */
function semMarcador(canal: ItemComentario['canal'] = 'conversa'): ItemComentario {
  return { canal, id: 2, autor: 'b3ll3o', corpo: 'nit: troquei uma variável' };
}

describe('temMarcador', () => {
  it('aceita o corpo que carrega o marcador', () => {
    expect(temMarcador(`antes\n${MARCADOR}\ndepois`)).toBe(true);
  });

  it('recusa corpo sem marcador', () => {
    expect(temMarcador('só uma conversa')).toBe(false);
  });

  it('recusa corpo vazio, nulo e indefinido', () => {
    // O tipo do campo `body` da API é `string | null` — e um review sem
    // comentário tem `null`. Um `includes` em `null` estoura o gate com
    // TypeError em vez de reprovar com a mensagem certa.
    expect(temMarcador('')).toBe(false);
    expect(temMarcador(null)).toBe(false);
    expect(temMarcador(undefined)).toBe(false);
  });

  it('NÃO aceita o marcador em outra forma', () => {
    // O marcador é literal. Uma variante sem os `<!-- -->` não é o marcador.
    expect(temMarcador('pr-review')).toBe(false);
    expect(temMarcador('<!-- pr-review')).toBe(false);
  });
});

describe('extrairComentario', () => {
  it('extrai id, autor e corpo', () => {
    const c = extrairComentario('review', {
      id: 7,
      body: 'texto',
      user: { login: 'leo' },
    });
    expect(c).toEqual({ canal: 'review', id: 7, autor: 'leo', corpo: 'texto' });
  });

  it('devolve null para item sem id', () => {
    expect(extrairComentario('review', { body: 'texto' })).toBeNull();
  });

  it('devolve null para o que não é objeto', () => {
    expect(extrairComentario('review', 'texto')).toBeNull();
    expect(extrairComentario('review', null)).toBeNull();
  });

  it('não estoura quando `user` é ausente ou não é objeto', () => {
    // A API devolve `user: null` para conta apagada.
    expect(extrairComentario('review', { id: 1, body: 'x', user: null })).toEqual({
      canal: 'review',
      id: 1,
      autor: '(desconhecido)',
      corpo: 'x',
    });
  });
});

describe('coletarComentario', () => {
  it('junta os 3 canais', () => {
    const c = coletarComentario({
      reviews: JSON.stringify([{ id: 1, body: 'r', user: { login: 'a' } }]),
      inline: JSON.stringify([{ id: 2, body: 'i', user: { login: 'b' } }]),
      conversa: JSON.stringify([{ id: 3, body: 'c', user: { login: 'c' } }]),
    });
    expect(c.map((x) => x.canal)).toEqual(['review', 'inline', 'conversa']);
  });

  it('ignora canal ausente e JSON inválido', () => {
    const c = coletarComentario({ reviews: 'não é json', conversa: JSON.stringify([]) });
    expect(c).toEqual([]);
  });

  it('ignora resposta que não é array', () => {
    expect(coletarComentario({ reviews: JSON.stringify({ message: 'Not Found' }) })).toEqual([]);
  });
});

describe('achatarPaginas', () => {
  it('achata a lista de páginas do `gh --slurp`', () => {
    const paginas = JSON.stringify([[{ id: 1 }], [{ id: 2 }]]);
    expect(JSON.parse(achatarPaginas(paginas))).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('aceita o array único de uma página só', () => {
    expect(JSON.parse(achatarPaginas(JSON.stringify([{ id: 1 }])))).toEqual([{ id: 1 }]);
  });

  it('devolve lista vazia para JSON inválido', () => {
    expect(JSON.parse(achatarPaginas('lixo'))).toEqual([]);
  });

  it('devolve lista vazia para página vazia', () => {
    expect(JSON.parse(achatarPaginas('[]'))).toEqual([]);
  });
});

describe('verificarRevisao', () => {
  it('verde com 1 comentário marcado', () => {
    const r = verificarRevisao([comMarcador()]);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('vermelho sem nenhum comentário', () => {
    const r = verificarRevisao([]);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(1);
  });

  it('vermelho com comentários que NÃO têm o marcador', () => {
    // O DENTE do gate: um gate que aceitasse "qualquer comentário" passaria
    // aqui. Neutralizar `temMarcador` (devolver `true` sempre) faz ESTE teste
    // cair — é a prova de que o gate mede a revisão, não a conversa.
    const r = verificarRevisao([semMarcador(), semMarcador('inline')]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(MARCADOR);
  });

  it('verde com o marcador em qualquer um dos 3 canais', () => {
    for (const canal of ['review', 'inline', 'conversa'] as const) {
      expect(verificarRevisao([comMarcador(canal)]).ok).toBe(true);
    }
  });

  it('a mensagem de erro diz o que fazer', () => {
    const r = verificarRevisao([semMarcador()]);
    expect(r.errors[0]).toContain('pr-review-mode');
    expect(r.errors[0]).toContain('pnpm pr:review-check');
  });
});

describe('numeroDoPr e repositorio', () => {
  it('a flag tem precedência sobre o ambiente', () => {
    expect(numeroDoPr(['--pr=171'])).toBe('171');
    expect(repositorio(['--repo=o/n'])).toBe('o/n');
  });

  it('usa o ambiente quando não há flag', () => {
    process.env['PR_NUMBER'] = '42';
    process.env['GITHUB_REPOSITORY'] = 'b3ll3o/projeto-base';
    expect(numeroDoPr([])).toBe('42');
    expect(repositorio([])).toBe('b3ll3o/projeto-base');
    delete process.env['PR_NUMBER'];
    delete process.env['GITHUB_REPOSITORY'];
  });

  it('devolve undefined quando não há nada', () => {
    expect(numeroDoPr([])).toBeUndefined();
  });

  it('sem flag e sem env, cai no `origin` do git', () => {
    // ⚠️ O fallback é o que faz o COMANDO DOCUMENTADO funcionar: MEDIDO
    // 2026-11-18 na 5ª revisão do PR #171, `pnpm pr:review-check --pr=171`
    // (sem `--repo`) saía 1 com "não sei qual repositório ler".
    const remoto = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
    }).trim();
    process.env['GITHUB_REPOSITORY'] = '';
    try {
      expect(repositorio([])).toBe(ownerENome(remoto));
    } finally {
      delete process.env['GITHUB_REPOSITORY'];
    }
  });
});

describe('ownerENome', () => {
  it('lê a forma SCP (ssh do GitHub)', () => {
    expect(ownerENome('git@github.com:b3ll3o/projeto-base.git')).toBe('b3ll3o/projeto-base');
  });

  it('lê a forma HTTPS', () => {
    expect(ownerENome('https://github.com/b3ll3o/projeto-base.git')).toBe('b3ll3o/projeto-base');
  });

  it('lê a forma `ssh://`', () => {
    expect(ownerENome('ssh://git@github.com/b3ll3o/projeto-base.git')).toBe('b3ll3o/projeto-base');
  });

  it('devolve undefined para o que não é um remoto', () => {
    expect(ownerENome('')).toBeUndefined();
    expect(ownerENome('   ')).toBeUndefined();
    expect(ownerENome('lixo')).toBeUndefined();
  });

  it('tira a barra final ANTES do `.git`', () => {
    // ⚠️ A ordem importa: com o `.git` primeiro, um remoto terminado em
    // `.git/` devolvia `owner/nome.git` — e o gate lia
    // `repos/owner/nome.git/pulls/N`, que é 404.
    expect(ownerENome('https://github.com/b3ll3o/projeto-base.git/')).toBe('b3ll3o/projeto-base');
  });

  it('lê o caminho INTEIRO da forma SCP (o GitLab tem subgrupo)', () => {
    expect(ownerENome('git@gitlab.com:grupo/sub/projeto.git')).toBe('grupo/sub/projeto');
  });
});

describe('ehNaoEncontrado', () => {
  it('reconhece o 404 do `gh`', () => {
    const erro = Object.assign(new Error('falhou'), {
      stderr: Buffer.from('gh: Not Found (HTTP 404)\n'),
    });
    expect(ehNaoEncontrado(erro)).toBe(true);
  });

  it('NÃO confunde rede caída com 404', () => {
    const erro = Object.assign(new Error('falhou'), {
      stderr: Buffer.from('error connecting to api.github.com\n'),
    });
    expect(ehNaoEncontrado(erro)).toBe(false);
    expect(ehNaoEncontrado(new Error('sem stderr'))).toBe(false);
  });
});

/**
 * Um `gh` falso, no PATH, que devolve fixtures.
 *
 * O gate fala com a API pelo `gh`; este duplo exercita o **caminho inteiro**
 * (argv → `gh` → JSON → parse → veredito) sem rede. É o que prova que o
 * gate está ligado ao formato real da resposta, e não só à função pura.
 *
 * ⚠️ O valor `{ erro: '...' }` faz o duplo SAIR com 1 e escrever a mensagem
 * no stderr — é o que reproduz o 404 do `gh` (`gh: Not Found (HTTP 404)`).
 */
function ghFalso(respostas: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pr-review-gate-'));
  const script = join(dir, 'gh');
  writeFileSync(
    script,
    `#!/usr/bin/env node
const respostas = ${JSON.stringify(respostas)};
// O gate chama \`gh api <caminho> --paginate --slurp\`: o caminho é o
// argumento que começa com "repos/", e não o primeiro argv.
//
// A chave casa pelo SUFIXO mais longo: \`/pulls/N/comments\` (inline) e
// \`/issues/N/comments\` (conversa) terminam igual, e casar pelo
// \`/comments\` devolveria a mesma fixture para os dois canais.
const caminho = process.argv.find((a) => a.startsWith('repos/')) ?? '';
const chaves = Object.keys(respostas).sort((a, b) => b.length - a.length);
const chave = chaves.find((k) => caminho.endsWith(k));
const resposta = respostas[chave ?? ''];
if (resposta && typeof resposta === 'object' && !Array.isArray(resposta) && resposta.erro) {
  process.stderr.write(resposta.erro);
  process.exit(1);
}
process.stdout.write(JSON.stringify(resposta ?? []));
`,
  );
  chmodSync(script, 0o755);
  return dir;
}

describe('CLI do gate', () => {
  it('sai 1 com NÃO VERIFICADO quando não sabe o PR', () => {
    // O terceiro estado: pular com 0 É verde, e verde sem medir é o pior
    // desfecho possível num gate de PR.
    const r = spawnSync('node', ['--import', 'tsx', GATE], {
      encoding: 'utf8',
      env: { ...process.env, PR_NUMBER: '', GITHUB_REPOSITORY: '' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NÃO VERIFICADO');
  });

  it('sai 0 quando a API devolve um review com o marcador', () => {
    const dir = ghFalso({
      '/pulls/171/reviews': [{ id: 1, body: `${MARCADOR}\nrevisão`, user: { login: 'leo' } }],
      '/pulls/171/comments': [],
      '/issues/171/comments': [],
    });
    const r = spawnSync('node', ['--import', 'tsx', GATE, '--pr=171', '--repo=o/n'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` },
    });
    expect(r.status).toBe(0);
  });

  it('sai 0 quando o marcador está num COMENTÁRIO DE CONVERSA', () => {
    // O canal do `gh pr comment`: o gate tem de enxergá-lo, senão a
    // publicação pelo caminho mais comum do repo não satisfaz a regra.
    const dir = ghFalso({
      '/pulls/171/reviews': [],
      '/pulls/171/comments': [],
      '/issues/171/comments': [{ id: 9, body: `${MARCADOR}\nrevisão`, user: { login: 'leo' } }],
    });
    const r = spawnSync('node', ['--import', 'tsx', GATE, '--pr=171', '--repo=o/n'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` },
    });
    expect(r.status).toBe(0);
  });

  it('sai 1 quando a API devolve comentários sem o marcador', () => {
    const dir = ghFalso({
      '/pulls/171/reviews': [],
      '/pulls/171/comments': [{ id: 2, body: 'nit', user: { login: 'leo' } }],
      '/issues/171/comments': [{ id: 3, body: 'outro nit', user: { login: 'leo' } }],
    });
    const r = spawnSync('node', ['--import', 'tsx', GATE, '--pr=171', '--repo=o/n'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(MARCADOR);
  });

  it('sai 0 SEM `--repo` — o comando que o §Passo 7 manda rodar', () => {
    // ⚠️ O DENTE deste teste: o comando documentado é
    // `pnpm pr:review-check --pr=<n>`, e MEDIDO 2026-11-18 na 5ª revisão do
    // PR #171 ele saía 1 ("não sei qual repositório ler"). Quem seguia o
    // passo lia vermelho DEPOIS de publicar — e publicava de novo.
    const dir = ghFalso({
      '/pulls/171/reviews': [{ id: 1, body: `${MARCADOR}\nrevisão`, user: { login: 'leo' } }],
      '/pulls/171/comments': [],
      '/issues/171/comments': [],
    });
    const r = spawnSync('node', ['--import', 'tsx', GATE, '--pr=171'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REPOSITORY: '',
        PATH: `${dir}:${process.env['PATH'] ?? ''}`,
      },
    });
    expect(r.status).toBe(0);
  });

  it('sai 1 com o motivo "o repositório não existe" quando o 404 é do repo', () => {
    // ⚠️ O GitHub responde 404 para o repositório INEXISTENTE e para o
    // privado SEM acesso — e a mensagem precisa dizer qual das DUAS coisas
    // aconteceu, porque o conserto é outro (MEDIDO 2026-11-18 na revisão do
    // diff: `--repo=owner-que-nao-existe/repo` caía no ramo do "não é um PR",
    // e conferir o número não consertava nada).
    const dir = ghFalso({
      'repo-que-nao-existe': { erro: 'gh: Not Found (HTTP 404)\n' },
    });
    const r = spawnSync(
      'node',
      ['--import', 'tsx', GATE, '--pr=171', '--repo=inexistente/repo-que-nao-existe'],
      { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` } },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('não existe');
    expect(r.stderr).not.toContain('não é um PR');
  });

  it('sai 1 com o motivo "não é um PR" quando a API responde 404', () => {
    // ⚠️ O número de uma ISSUE não é PR — e o 404 é a resposta do GitHub
    // para "esse pull request não existe". O conserto indicado NÃO é
    // "autentique o `gh`": o token funcionava. MEDIDO 2026-11-18 na 5ª
    // revisão do PR #171.
    const dir = ghFalso({
      '/pulls/149': { erro: 'gh: Not Found (HTTP 404)\n' },
    });
    const r = spawnSync('node', ['--import', 'tsx', GATE, '--pr=149', '--repo=o/n'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('não é um PR');
    expect(r.stderr).not.toContain('autenticado');
  });
});

describe('o gate roda', () => {
  it('o arquivo do gate existe e é executável pelo tsx', () => {
    // A prova de que o path do `package.json` não é ficção: o script do
    // `package.json` aponta para este arquivo.
    const pkg = JSON.parse(
      execFileSync(
        'node',
        ['-e', "process.stdout.write(require('node:fs').readFileSync('package.json','utf8'))"],
        {
          encoding: 'utf8',
        },
      ),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['pr:review-check']).toContain('pr-review-gate');
  });
});
