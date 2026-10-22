// .tooling/scripts/ci/check-repeticao.spec.ts
//
// O DENTE do gate `check-repeticao`.
//
// ⚠️ Um gate que roda sobre uma árvore já verde é indistinguível de um gate
// que não faz nada. O que prova que este gate tem dentes é o **vermelho**:
// um termo declarado como `ok` que aparece hardcoded em produção tem de
// virar erro — e um termo declarado como dívida (`declarado`) tem de
// continuar em ressalva, senão o gate grita com o que já é dívida conhecida
// e ninguém o ouve.

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkRepeticao, type Declaracao } from './check-repeticao.js';

/** A raiz do REPO — e não `process.cwd()`, que no vitest é o root do projeto. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function repoFalso(termos: Declaracao['termos'], arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'check-repeticao-'));
  mkdirSync(join(raiz, '.tooling', 'scripts', 'ci'), { recursive: true });
  writeFileSync(
    join(raiz, '.tooling', 'scripts', 'ci', 'dry-termos.json'),
    JSON.stringify({ termos, blocos: [] }),
  );
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const completo = join(raiz, caminho);
    mkdirSync(join(completo, '..'), { recursive: true });
    writeFileSync(completo, conteudo);
  }
  return raiz;
}

describe('checkRepeticao — o dente', () => {
  it('um termo `ok` hardcoded em produção é ERRO, e nomeia o arquivo', () => {
    // A MUTAÇÃO: o termo está `ok` (ninguém hardcodeia) e o arquivo de
    // produção o escreve. O gate tem de acusar.
    const raiz = repoFalso(
      [
        {
          valor: 'gerente',
          dono: 'apps/api/src/dono.ts',
          constante: 'SLUG_GERENTE',
          estado: 'ok',
        },
      ],
      {
        'apps/api/src/dono.ts': "export const SLUG_GERENTE = 'gerente';\n",
        'apps/api/src/usuario.ts': "const papel = 'gerente';\n",
      },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('gerente');
    expect(r.errors[0]).toContain('apps/api/src/usuario.ts');
  });

  it('o DONO do termo não é acusado — ele é quem DEFINE o valor', () => {
    const raiz = repoFalso(
      [
        {
          valor: 'gerente',
          dono: 'apps/api/src/dono.ts',
          constante: 'SLUG_GERENTE',
          estado: 'ok',
        },
      ],
      {
        'apps/api/src/dono.ts': "export const SLUG_GERENTE = 'gerente';\n",
      },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('um spec que AFIRMA o valor não é acusado — o literal é o dente dele', () => {
    const raiz = repoFalso(
      [
        {
          valor: 'gerente',
          dono: 'apps/api/src/dono.ts',
          constante: 'SLUG_GERENTE',
          estado: 'ok',
        },
      ],
      {
        'apps/api/src/dono.ts': "export const SLUG_GERENTE = 'gerente';\n",
        'apps/api/src/dono.spec.ts': "expect(perfil.slug).toBe('gerente');\n",
      },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(true);
  });

  it('um termo em DÍVIDA declarada sai como ressalva, e não como erro', () => {
    // O CONTROLE POSITIVO: sem ele, o gate acusaria o que já é dívida
    // conhecida — e o painel somaria um erro que ninguém pode corrigir sem
    // pagar a fase do plano.
    const raiz = repoFalso(
      [
        {
          valor: 'gerente',
          dono: 'apps/api/src/dono.ts',
          constante: 'SLUG_GERENTE',
          estado: 'declarado',
          motivo: 'fase T3 do plano',
        },
      ],
      {
        'apps/api/src/dono.ts': "export const SLUG_GERENTE = 'gerente';\n",
        'apps/api/src/usuario.ts': "const papel = 'gerente';\n",
      },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(true);
    expect(r.advisories?.[0]).toContain('dívida DRY declarada');
  });

  it('declaração VAZIA é erro — o gate sem lista não mede nada', () => {
    const raiz = repoFalso([], { 'apps/api/src/dono.ts': 'export const a = 1;\n' });

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('VAZIA');
  });

  it('um dono que NÃO EXISTE é erro — a dívida precisa apontar para lugar nenhum', () => {
    // MEDIDO 2026-10-22: o termo `VALIDATION_ERROR` declarava o dono
    // `apps/api/src/shared/infrastructure/http/codigos-de-problema.ts`, que não
    // existe. A dívida é declarada, o gate a publicava como ressalva — e a
    // dívida apontava para um arquivo que não está lá. Uma dívida sem lugar
    // não é pública: ninguém sabe onde ela mora.
    const raiz = repoFalso(
      [
        {
          valor: 'VALIDATION_ERROR',
          dono: 'apps/api/src/shared/infrastructure/http/codigos-de-problema.ts',
          constante: 'CODIGO_VALIDACAO',
          estado: 'declarado',
          motivo: 'fase T2 do plano',
        },
      ],
      { 'apps/api/src/usuario.ts': "const codigo = 'VALIDATION_ERROR';\n" },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('NÃO EXISTE');
    expect(r.errors[0]).toContain('codigos-de-problema.ts');
  });

  it('um termo em DÍVIDA sem MOTIVO é erro — a dívida é pública COM a razão', () => {
    const raiz = repoFalso(
      [
        {
          valor: 'gerente',
          dono: 'apps/api/src/dono.ts',
          constante: 'SLUG_GERENTE',
          estado: 'declarado',
        },
      ],
      {
        'apps/api/src/dono.ts': "export const SLUG_GERENTE = 'gerente';\n",
        'apps/api/src/usuario.ts': "const papel = 'gerente';\n",
      },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('motivo');
  });

  it('a ressalva carrega o MOTIVO de cada dívida — a dívida é pública COM ele', () => {
    const raiz = repoFalso(
      [
        {
          valor: 'gerente',
          dono: 'apps/api/src/dono.ts',
          constante: 'SLUG_GERENTE',
          estado: 'declarado',
          motivo: 'fase T3 do plano',
        },
      ],
      {
        'apps/api/src/dono.ts': "export const SLUG_GERENTE = 'gerente';\n",
        'apps/api/src/usuario.ts': "const papel = 'gerente';\n",
      },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(true);
    expect(r.advisories?.[0]).toContain('dívida DRY declarada');
    // O MOTIVO dentro da ressalva: `dry.md` §5 promete que a dívida sai "como
    // ressalva COM o motivo", e a frase antiga prometia um motivo que não
    // aparecia em lugar nenhum.
    expect(r.advisories?.[0]).toContain('fase T3 do plano');
  });

  it('um termo hardcoded em TEMPLATE LITERAL é achado — o backtick é o terceiro formato', () => {
    // MEDIDO 2026-10-22: um literal em backtick era invisível para o gate,
    // que é o instrumento que COBRA. Um termo que o gate não vê é um termo
    // que ninguém paga a dívida.
    const raiz = repoFalso(
      [
        {
          valor: 'gerente',
          dono: 'apps/api/src/dono.ts',
          constante: 'SLUG_GERENTE',
          estado: 'ok',
        },
      ],
      {
        'apps/api/src/dono.ts': "export const SLUG_GERENTE = 'gerente';\n",
        'apps/api/src/usuario.ts': 'const papel = `gerente`;\n',
      },
    );

    const r = checkRepeticao({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('apps/api/src/usuario.ts');
  });

  it('o repo REAL está verde, com a dívida declarada em ressalva', () => {
    const r = checkRepeticao({ repoRoot: REPO_ROOT });

    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
