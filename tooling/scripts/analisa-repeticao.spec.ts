// tooling/scripts/analisa-repeticao.spec.ts
//
// pt-BR (2026-10-22): a medição da repetição.
//
// A ferramenta é o insumo da regra
// [`dry.md`](../../.agents/specs/conventions/dry.md),
// e o que ela mede decide o que o gate vai acusar. Um medidor errado acusa a
// coisa errada — e um gate que acusa a coisa errada é um gate que ninguém
// ouve.

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  contaPorArquivo,
  extraiLiterais,
  raizDoRepo,
  varreArquivos,
  varreLiterais,
} from './analisa-repeticao.js';

/**
 * A raiz do REPO, derivada do `__dirname` — e NÃO de `process.cwd()`.
 *
 * ⚠️ MEDIDO 2026-10-22: o `pnpm tooling:test` roda `vitest --root
 * tooling/scripts`, e o `--root` NÃO muda o `process.cwd()` — que continua
 * a raiz do repo. Um spec que assumisse o cwd do root acabava medindo
 * `../..` acima do repo, e o teste de fumaça dava 0 arquivos (verde que
 * não mede nada).
 */
const REPO_ROOT = resolve(__dirname, '..', '..');

describe('analisa-repeticao — o que é um literal', () => {
  it('lê aspas simples e duplas, e ignora o que está vazio', () => {
    const achados = extraiLiterais(`const a = 'users.read'; const b = "tenancy.invites";`);
    expect(achados).toEqual(['users.read', 'tenancy.invites']);
  });

  it('lê o que está em comentário — o termo citado também é um termo usado no arquivo', () => {
    const achados = extraiLiterais(`// o perfil 'dono' foi renomeado\nconst a = 'gerente';`);
    expect(achados).toContain('gerente');
  });
});

describe('analisa-repeticao — a contagem é por ARQUIVO', () => {
  it('o mesmo literal em 3 lugares do MESMO arquivo é 1 arquivo, e não repete', () => {
    // ⚠️ É o critério do gate: um literal usado 40× num arquivo só é um
    // arquivo só. Contar ocorrências daria a impressão de uma repetição que
    // não existe — e o gate acusaria o que não precisa ser acusado.
    const porArquivo = new Map([['a.ts', ['gerente', 'gerente', 'gerente']]]);
    const repetidos = contaPorArquivo(porArquivo);
    expect(repetidos).toHaveLength(0);
  });

  it('o mesmo literal em 2 arquivos é 2 arquivos, e o total conta as ocorrências', () => {
    const porArquivo = new Map([
      ['a.ts', ['gerente']],
      ['b.ts', ['gerente', 'gerente']],
    ]);
    const repetidos = contaPorArquivo(porArquivo);
    expect(repetidos).toHaveLength(1);
    expect(repetidos[0]?.valor).toBe('gerente');
    expect(repetidos[0]?.arquivos).toBe(2);
    expect(repetidos[0]?.ocorrencias).toBe(3);
  });

  it('a ordem é estável: o desempate é alfabético', () => {
    // ⚠️ Sem desempate estável, dois relatórios da mesma árvore saem
    // diferentes — e um relatório que muda de ordem entre duas execuções
    // não serve para COMPARAR duas execuções.
    const porArquivo = new Map([
      ['a.ts', ['zeta', 'alfa']],
      ['b.ts', ['zeta', 'alfa']],
    ]);
    const repetidos = contaPorArquivo(porArquivo);
    expect(repetidos.map((r) => r.valor)).toEqual(['alfa', 'zeta']);
  });
});

describe('analisa-repeticao — a varredura', () => {
  it('acha a raiz do repo de qualquer diretório dentro dele', () => {
    // ⚠️ O script npm roda de `tooling/scripts`, e de lá o `process.cwd()`
    // mediria o diretório errado — e sairia com "0 literais", que é o verde
    // que não mede nada.
    const de = join(REPO_ROOT, 'tooling', 'scripts');
    expect(raizDoRepo(de)).toBe(REPO_ROOT);
  });

  it('pula os diretórios gerados e externos', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'repeticao-'));
    mkdirSync(join(raiz, 'node_modules'), { recursive: true });
    mkdirSync(join(raiz, 'dist'), { recursive: true });
    writeFileSync(join(raiz, 'node_modules', 'x.ts'), "const a = 'fora';");
    writeFileSync(join(raiz, 'dist', 'y.ts'), "const a = 'fora';");
    writeFileSync(join(raiz, 'z.ts'), "const a = 'dentro';");

    const arquivos = varreArquivos(raiz);

    expect(arquivos.map((a) => a.split('/').pop())).toEqual(['z.ts']);
  });

  it('mede o repo de verdade sem explodir', () => {
    // O teste de fumaça: a medição tem que rodar sobre a árvore real e
    // devolver alguma coisa. Um medidor que devolve vazio na árvore real é
    // verde e não mede nada.
    const porArquivo = varreLiterais(join(REPO_ROOT, 'apps', 'api', 'src'));
    const repetidos = contaPorArquivo(porArquivo);
    expect(porArquivo.size).toBeGreaterThan(10);
    expect(repetidos.length).toBeGreaterThan(0);
  });
});
