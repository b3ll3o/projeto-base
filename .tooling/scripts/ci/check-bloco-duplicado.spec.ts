// .tooling/scripts/ci/check-bloco-duplicado.spec.ts
//
// O DENTE do gate `check-bloco-duplicado`.
//
// O que prova que este gate tem dentes é o **vermelho**: dois arquivos de
// produção com o MESMO bloco de lógica têm de virar erro — e um bloco
// declarado como dívida conhecida tem de continuar em ressalva.

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkBlocoDuplicado } from './check-bloco-duplicado.js';

/** A raiz do REPO — e não `process.cwd()`, que no vitest é o root do projeto. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * 16 linhas de lógica — o mesmo bloco nos dois arquivos.
 *
 * ⚠️ O arquivo tem EXATAMENTE as 16 linhas: com mais linhas acima ou abaixo,
 * a varredura acharia uma SEGUNDA janela sobreposta (a que desliza uma
 * linha), e ela também é duplicada — o gate acusaria as duas, e o teste
 * pareceria estar falhando por um motivo que não é o dele.
 */
const BLOCO = Array.from({ length: 16 }, (_, i) => `  const passo${i} = ${i};`).join('\n');

function repoFalso(blocos: unknown[], arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'check-bloco-'));
  mkdirSync(join(raiz, '.tooling', 'scripts', 'ci'), { recursive: true });
  writeFileSync(
    join(raiz, '.tooling', 'scripts', 'ci', 'dry-termos.json'),
    JSON.stringify({ termos: [], blocos }),
  );
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const completo = join(raiz, caminho);
    mkdirSync(join(completo, '..'), { recursive: true });
    writeFileSync(completo, conteudo);
  }
  return raiz;
}

describe('checkBlocoDuplicado — o dente', () => {
  it('o MESMO bloco de 16 linhas em 2 arquivos de produção é ERRO', () => {
    // A MUTAÇÃO: o segundo arquivo recebe a cópia do bloco. O gate tem de
    // accusationar — é a duplicação de LÓGICA que o DRY proíbe.
    const raiz = repoFalso([], {
      'apps/api/src/a.ts': `${BLOCO}\n`,
      'apps/api/src/b.ts': `${BLOCO}\n`,
    });

    const r = checkBlocoDuplicado({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('repetido');
    expect(r.errors[0]).toContain('apps/api/src/a.ts');
  });

  it('um bloco DECLARADO sai como ressalva, e não como erro', () => {
    // O CONTROLE POSITIVO: a dívida conhecida não pode virar erro — senão o
    // gate grita com o que a equipe já sabe que existe.
    const raiz = repoFalso([{ inicio: 'const passo0 = 0;', motivo: 'marcador de teste' }], {
      'apps/api/src/a.ts': `${BLOCO}\n`,
      'apps/api/src/b.ts': `${BLOCO}\n`,
    });

    const r = checkBlocoDuplicado({ repoRoot: raiz });

    expect(r.ok).toBe(true);
    expect(r.advisories?.[0]).toContain('bloco duplicado declarado');
  });

  it('um spec com o mesmo bloco NÃO é acusado — spec repetido é teste repetido', () => {
    const raiz = repoFalso([], {
      'apps/api/src/a.ts': `${BLOCO}\n`,
      'apps/api/src/a.spec.ts': `${BLOCO}\n`,
    });

    const r = checkBlocoDuplicado({ repoRoot: raiz });

    expect(r.ok).toBe(true);
  });

  it('NENHUM arquivo medido é erro — o gate não mediu nada', () => {
    const raiz = repoFalso([], {});

    const r = checkBlocoDuplicado({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('nenhum arquivo');
  });

  it('o repo REAL está verde — a lógica de produção NÃO repete bloco', () => {
    // MEDIDO 2026-10-22: com 16 linhas de janela, ZERO blocos repetidos em
    // produção. O código já é DRY na lógica; a repetição que sobra é de TERMO
    // — e é o que a parte 1 (`check-repeticao`) mede.
    const r = checkBlocoDuplicado({ repoRoot: REPO_ROOT });

    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
