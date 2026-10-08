import { describe, it, expect, beforeAll } from 'vitest';
import { checkDocRefs } from './check-doc-refs';
import { detalhar, formatMark, relatarUmCheck } from './preflight';
import type { CheckResult } from './check-types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Diretorio isolado por suite: '/tmp/ci-fixtures' compartilhado era
// vulneravel a leftover de outra execucao.
const FIXTURES = path.join(os.tmpdir(), 'ci-fixtures-check-doc-refs');

describe('checkDocRefs', () => {
  beforeAll(async () => {
    // Garantir que os fixtures existam (idempotente).
    await fs.mkdir(path.join(FIXTURES, 'docs-ok'), { recursive: true });
    await fs.mkdir(path.join(FIXTURES, 'docs-broken-ref'), { recursive: true });
    await fs.mkdir(path.join(FIXTURES, 'docs-external-links'), { recursive: true });

    await fs.writeFile(
      path.join(FIXTURES, 'docs-ok/guia.md'),
      '# Guia\n\nVeja [intro](intro.md) para começar.\n',
    );
    await fs.writeFile(
      path.join(FIXTURES, 'docs-ok/intro.md'),
      '# Intro\n\nConteúdo introdutório.\n',
    );

    await fs.writeFile(
      path.join(FIXTURES, 'docs-broken-ref/guia.md'),
      '# Guia\n\nVeja [intro](arquivo-inexistente.md).\n',
    );

    await fs.writeFile(
      path.join(FIXTURES, 'docs-external-links/guia.md'),
      '# Guia\n\nVeja [site](https://example.com).\n',
    );

    // Link para memoria do agent: o alvo esta fora do repo e NAO existe em
    // path relativo a partir daqui. Existiu uma allowlist
    // `/(\.\.\/)+home\//` que engoleva qualquer link assim.
    await fs.mkdir(path.join(FIXTURES, 'docs-agent-memory-ref'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-agent-memory-ref/guia.md'),
      '# Guia\n\nMemory: [two-stage](../../../../home/leo/.claude/projects/x/memory/two-stage.md)\n',
    );

    // Os 3 fixtures abaixo eram referenciados por testes que NUNCA rodaram
    // (§F2-T8): a suite nao entrava em tooling:test nem no CI, entao os 3
    // vermelhos ficavam invisiveis. Criados aqui, e nao reaproveitados
    // pelos testes de §F2-T1, para nao criar dependencia de ordem entre
    // tasks.
    await fs.mkdir(path.join(FIXTURES, 'docs-fenced-block'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-fenced-block/guia.md'),
      '# Guia\n\n```ts\nconst x = [a](b);\n```\n\nVeja [intro](intro.md).\n',
    );
    await fs.writeFile(path.join(FIXTURES, 'docs-fenced-block/intro.md'), '# Intro\n');

    await fs.mkdir(path.join(FIXTURES, 'docs-inline-code'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-inline-code/guia.md'),
      '# Guia\n\nVeja [`intro.md`](intro.md) para começar.\n',
    );
    await fs.writeFile(path.join(FIXTURES, 'docs-inline-code/intro.md'), '# Intro\n');

    await fs.mkdir(path.join(FIXTURES, 'docs-mixed'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-mixed/guia.md'),
      '# Guia\n\n```\n[a](b)\n```\n\nVeja [real-broken](nao-existe.md).\n',
    );

    // F2-T1: os 2 links apontam para o MESMO alvo quebrado; um tem label
    // 100% inline-code, o outro nao. Com remocao do trecho inline-code o
    // primeiro colapsa para `[]()` e nunca casa com /\[([^\]]+)\]/ — o gate
    // reportava 1 erro em vez de 2, em silencio.
    await fs.mkdir(path.join(FIXTURES, 'docs-inline-code-label'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-inline-code-label/guia.md'),
      '# Guia\n\nVeja [`nao-existe.md`](./nao-existe.md) e tambem [aqui](./nao-existe.md).\n',
    );

    // F2-T2 (a): .md fora das raizes declaradas em `docsRoot` ainda entra no
    // escopo quando `docsRoots` lista outro diretorio. Sem `docsRoots`, o
    // arquivo nao e lido e o gate reporta verde sobre um escopo menor.
    await fs.mkdir(path.join(FIXTURES, 'docs-fora-de-docsRoot'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-fora-de-docsRoot/guia.md'),
      '# Guia\n\nVeja [intro](alvo-inexistente.md).\n',
    );

    // F2-T2 (b): o `walk` nao pode descer em node_modules — com `docsRoot: '.'`
    // isso media 500+ erros so de dependencias.
    await fs.mkdir(path.join(FIXTURES, 'docs-skip-dirs/node_modules/pacote-falso'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-skip-dirs/node_modules/pacote-falso/guia.md'),
      '# Guia\n\nVeja [intro](alvo-inexistente.md).\n',
    );
  });

  it('deve passar quando todas as refs apontam para arquivos existentes', async () => {
    const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-ok') });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve falhar com mensagem clara quando ref aponta para arquivo inexistente', async () => {
    const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-broken-ref') });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(
      /docs-broken-ref\/guia\.md: link para 'arquivo-inexistente\.md' quebrado/,
    );
  });

  it('NAO deve allowlistar link para memoria do agent (fora do repo)', async () => {
    // A allowlist `/(\.\.\/)+home\//` engoleva QUALQUER link com `../home/`,
    // nao so o caso legitimo — e mascarava 2 links que estavam genuinamente
    // quebrados, para um path que nao resolve em maquina nenhuma. Medido:
    // o path relativo resolve para `<pai-do-repo>/home/leo/...`, que nao
    // existe; o arquivo vive em `~/.claude/projects/...`.
    // A correcao foi consertar os 2 links (viraram codigo inline) e remover a
    // entrada. Este spec impede que a mascara volte.
    const result = await checkDocRefs({
      docsRoot: path.join(FIXTURES, 'docs-agent-memory-ref'),
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/docs-agent-memory-ref\/guia\.md: link para .*quebrado/);
  });

  it('deve ignorar refs externas (http://, https://)', async () => {
    const result = await checkDocRefs({
      docsRoot: path.join(FIXTURES, 'docs-external-links'),
    });
    expect(result.ok).toBe(true);
  });

  describe('checkDocRefs - inline code com label', () => {
    it('deve detectar link com label 100% inline-code (nao pode colapsar)', async () => {
      const result = await checkDocRefs({
        docsRoot: path.join(FIXTURES, 'docs-inline-code-label'),
      });
      expect(result.ok).toBe(false);
      // Os 2 links do arquivo apontam para o mesmo alvo quebrado: um com
      // label inline-code, um sem. Remover o inline-code faria o 1o virar
      // `[]()`, que o regex (label 1+ char) nunca casa — 1 erro em vez de 2.
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every((e) => e.includes('./nao-existe.md'))).toBe(true);
    });
  });

  describe('checkDocRefs - escopo', () => {
    it('deve cobrir .md declarado em docsRoots, mesmo fora de docsRoot', async () => {
      const result = await checkDocRefs({
        docsRoot: path.join(FIXTURES, 'docs-ok'),
        docsRoots: [path.join(FIXTURES, 'docs-fora-de-docsRoot')],
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/alvo-inexistente\.md/);
    });

    it('deve IGNORAR node_modules/ (e demais diretorios de build)', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-skip-dirs') });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('checkDocRefs - code block handling', () => {
    it('deve IGNORAR refs dentro de fenced code blocks ```', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-fenced-block') });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve IGNORAR refs dentro de inline code `backticks`', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-inline-code') });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve AINDA detectar refs quebradas fora de code blocks', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-mixed') });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toMatch(/real-broken/);
    });
  });

  // F4-T1: `CheckResult` era binario — `ok: true, errors: []` nao distingue
  // "verifiquei e passou" de "nao havia o que verificar". Um check que
  // early-return por pre-requisito ausente imprimia o MESMO token de sucesso
  // de um check que realmente rodou. Regra: o token de sucesso nao pode ser
  // o mesmo para os dois casos.
  describe('formatMark - o token de sucesso nao mente', () => {
    it('NAO pode renderizar ✓ quando o check nao chegou a rodar', () => {
      const skipped: CheckResult = { ok: true, errors: [], skipped: true, reason: 'sem diretório' };
      const mark = formatMark(skipped);
      expect(mark).not.toBe('✓');
      expect(mark).toContain('skipped:');
      expect(mark).toContain('sem diretório');
    });

    it('deve manter ✓ para o check que realmente rodou e passou', () => {
      expect(formatMark({ ok: true, errors: [] })).toBe('✓');
    });

    it('deve manter ✗ para o check que rodou e falhou', () => {
      expect(formatMark({ ok: false, errors: ['algo quebrado'] })).toBe('✗');
    });
  });
});

describe('detalhar - a contagem que o painel anuncia', () => {
  // MEDIDO 2026-10-06: uma branch 1 commit atrasada printava
  // "❌ 2 erro(s) encontrado(s)". Havia UM defeito. O segundo "erro" era a
  // ressalva "medido contra a ref `origin/main` local" — verdadeira sobre a
  // própria medição, e portanto conteúdo, não defeito.
  //
  // A consequência de errar a contagem não é cosmética: quem lê "2 erro(s)"
  // para caçar o segundo bug, não acha, e volta a olhar o primeiro — que era
  // o único que existia. Um número que não reconcilia com o que está impresso
  // acima dele treina a leitura a ignorar o número.
  const atrasada: CheckResult = {
    ok: false,
    errors: ['a branch está 1 commit(s) atrás de `origin/main`'],
    advisories: ['Atenção: medido contra a ref `origin/main` local'],
  };

  it('conta 1 erro para 1 defeito + 1 ressalva', () => {
    expect(detalhar(atrasada).erros).toBe(1);
  });

  it('IMPRIME a ressalva mesmo assim — silenciar não é o conserto', () => {
    const { linhas } = detalhar(atrasada);
    expect(linhas).toHaveLength(2);
    expect(linhas.join('\n')).toMatch(/Atenção/);
    // A ordem também é o contrato: o defeito primeiro, a ressalva depois.
    expect(linhas[0]).toMatch(/atrás/);
  });

  it('NÃO inventa advisory: check sem ressalva devolve só os erros', () => {
    const semRessalva = detalhar({ ok: false, errors: ['só o defeito'] });
    expect(semRessalva.erros).toBe(1);
    expect(semRessalva.linhas).toEqual(['só o defeito']);
  });
});

describe('relatarUmCheck - o ramo VERDE também tem linhas', () => {
  // MEDIDO 2026-10-07: `main()` chamava `detalhar` dentro de `if (!result.ok)`.
  // Nenhum check emitia `advisories` num resultado verde, então nada era
  // perdido — e nenhum teste existia, porque a decisão morava dentro da
  // preflight inteira. O primeiro check que emitir uma ressalva sobre um verde
  // a teria visto sumir em silêncio, sem erro e sem contagem.
  const verdeComRessalva: CheckResult = {
    ok: true,
    errors: [],
    advisories: ['Atenção: medido contra a ref `origin/main` local, que pode estar velha'],
  };

  it('imprime a ressalva de um check VERDE — o verde é o caso que ela qualifica', () => {
    const r = relatarUmCheck(verdeComRessalva);
    expect(r.mark).toBe('✓');
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatch(/Atenção/);
  });

  it('NÃO soma a ressalva de um verde como erro', () => {
    expect(relatarUmCheck(verdeComRessalva).erros).toBe(0);
  });

  it('um verde comum não ganha linha nenhuma', () => {
    // O par dos dois anteriores: sem isto, `linhas: [algo]` passesaria em
    // qualquer implementação, inclusive uma que inventasse uma linha.
    const limpo = relatarUmCheck({ ok: true, errors: [] });
    expect(limpo.linhas).toEqual([]);
    expect(limpo.mark).toBe('✓');
    expect(limpo.pulou).toBe(false);
  });

  it('skip continua sendo contado no ramo verde, sem virar erro', () => {
    const pulado = relatarUmCheck({ ok: true, errors: [], skipped: true, reason: 'sem harness' });
    expect(pulado.mark).toMatch(/skipped/);
    expect(pulado.pulou).toBe(true);
    expect(pulado.erros).toBe(0);
  });

  it('vermelho segue vermelho, com as linhas do defeito e da ressalva', () => {
    const vermelho = relatarUmCheck({
      ok: false,
      errors: ['a branch está 1 commit(s) atrás'],
      advisories: ['Atenção: ref local'],
    });
    expect(vermelho.mark).toBe('✗');
    expect(vermelho.erros).toBe(1);
    expect(vermelho.linhas).toHaveLength(2);
    expect(vermelho.pulou).toBe(false);
  });
});

describe('relatarUmCheck - skip que ACOMPANHA erro não pode sumir', () => {
  // MEDIDO 2026-10-07: `pulou` era `Boolean(result.ok && result.skipped)`, e
  // `&&` exige `ok: true`. Mas `ok` e `skipped` são independentes por contrato:
  // `check-package-json-drift.ts:131-134` devolve `ok: errors.length === 0`
  // JUNTO com `skipped: true`. Quando a validação do turbo não roda e JÁ há
  // erros, o resultado é `ok: false` + `skipped: true` — estado que a condição
  // descartava inteiro: o motivo do skip não saía, `totalSkipped` não
  // incrementava, e o resumo "N check(s) não rodaram" não disparava.
  //
  // É o estado silencioso que esta branch se propõe a fechar, dentro dela mesma.
  const puladoComErro: CheckResult = {
    ok: false,
    errors: ['task órfã: `foo`'],
    skipped: true,
    reason: 'validação de `turbo run <task>` não rodou: pnpm-workspace.yaml ausente',
  };

  it('conta o skip mesmo com erro — senão o resumo mente sobre o que rodou', () => {
    expect(relatarUmCheck(puladoComErro).pulou).toBe(true);
  });

  it('imprime o motivo do skip — os erros não dizem por que não rodou', () => {
    const linhas = relatarUmCheck(puladoComErro).linhas;
    expect(linhas.some((l) => l.includes('pnpm-workspace.yaml'))).toBe(true);
  });

  it('NÃO converte o skip em erro: o que conta erro continua sendo o check', () => {
    const r = relatarUmCheck(puladoComErro);
    expect(r.erros).toBe(1);
    expect(r.mark).toBe('✗');
  });

  it('NÃO duplica o motivo no pulo VERDE — a marca já o carrega', () => {
    // O par necessário: incluir a linha do skip sem condición faria o verde
    // imprimir o motivo duas vezes (uma na marca `– (skipped: …)`, outra nas
    // linhas). O vermelho é que precisa dela, porque a marca dele é só `✗`.
    const verde = relatarUmCheck({
      ok: true,
      errors: [],
      skipped: true,
      reason: 'sem harness',
    });
    const comMarca = verde.linhas.filter((l) => l.includes('sem harness'));
    expect(comMarca).toHaveLength(0);
    expect(verde.mark).toContain('sem harness');
    expect(verde.pulou).toBe(true);
  });
});
