// .tooling/scripts/ci/check-archive-integrity.spec.ts
//
// pt-BR: Testes do check de integridade do archive (task 1.4 do plano
// docs/superpowers/plans/2026-10-03-guard-classes.md, métrica B19).
//
// O defeito que estes testes existem para prender: o check calculava
// `join(repoRoot, '.agents/runs/archive')`, confirmava com `existsSync` que
// esse diretório existe, e então chamava `execSync('pnpm archive:lint')` SEM
// `--archive-dir`. O script `archive:lint` do package.json é
// `cd tooling/scripts && pnpm archive:lint`, e o default do linter é relativo
// ao cwd — então o early-return rodava em
// `tooling/scripts/.agents/runs/archive`, que não existe. **O archive real
// nunca era lido**, enquanto o check renderizava `✓`.
//
// A assinatura do bug: o `existsSync` — a prova de vida do gate — passava. A
// âncora e a execução estavam em sistemas de arquivos diferentes.
//
// Cobre:
// - a invocação recebe o archive ABSOLUTO, imune ao `cd` do script npm
// - arquivo inválido no archive REAL deixa o check vermelho (o que não acontecia)
// - arquivo inválido no diretório ERRADO não altera o resultado
// - precondição ausente continua `skipped`, nunca `✓` calado
// - archive EXISTENTE mas sem nenhum `.md` é `skipped`, não `✓` (issue #49)
// - archive preenchido com `.md` válido é verde DE VERDADE (contra-regra do skip)

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkArchiveIntegrity, buildLintArgs } from './check-archive-integrity.js';

/** Quantos `.md` o linter realmente veria — o denominador do "verifiquei". */
function countArchiveFiles(repoRoot: string): number {
  const dir = join(resolve(repoRoot), '.agents/runs/archive');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith('.md')).length;
}

const REPO = resolve(process.cwd());
const ARCHIVE = join(REPO, '.agents/runs/archive');
const WRONG_DIR = join(REPO, 'tooling/scripts/.agents/runs/archive');
const PLANTED = join(ARCHIVE, '2026-10-05-prova-plantada.md');

const INVALID = ['---', 'name: nao-e-um-archive', '---', '', 'body', ''].join('\n');

/**
 * Archive canônico VÁLIDO — todos os campos obrigatórios presentes.
 *
 * Cada valor foi verificado contra o linter real
 * (`tsx archive-lint.ts --archive-dir=<tmp>` → exit 0), não copiado da doc:
 * `archived_at` exige ISO 8601 **com hora** (`2026-10-06` sozinho é
 * rejeitado), `prs` são numéricos (`"#1"` é rejeitado) e `improvements`
 * mapeia para **números**, não strings.
 *
 * Existe para provar a DIREÇÃO do skip: sem este par verde/vermelho, um gate
 * que declare `skipped` para tudo também passaria.
 */
const VALID = [
  '---',
  'archived_at: 2026-10-06T00:00:00Z',
  'original_run: .agents/runs/2026-10-06-exemplo.md',
  'demand_slug: exemplo-de-demand',
  'prs:',
  '  - 1',
  'retro_refs:',
  '  - .agents/runs/b1-result.md',
  'improvements:',
  '  B1: 1',
  'status: archived',
  'tags:',
  '  - exemplo',
  '---',
  '',
  'body',
  '',
].join('\n');

afterEach(() => {
  if (existsSync(PLANTED)) rmSync(PLANTED, { force: true });
  if (existsSync(join(REPO, 'tooling/scripts/.agents'))) {
    rmSync(join(REPO, 'tooling/scripts/.agents'), { recursive: true, force: true });
  }
});

describe('buildLintArgs', () => {
  it('passa o archive por --archive-dir, em caminho ABSOLUTO', () => {
    const { archiveDir, args } = buildLintArgs(REPO);
    expect(args).toContain(`--archive-dir=${archiveDir}`);
    // Absoluto é o que torna o check imune ao `cd tooling/scripts` do script
    // npm. Um caminho relativo aqui é exatamente o bug B19 de volta.
    expect(archiveDir.startsWith('/')).toBe(true);
    expect(args.some((a) => a.includes('..'))).toBe(false);
  });

  it('o archiveDir aponta para o diretório que o check existencia', () => {
    const { archiveDir } = buildLintArgs(REPO);
    expect(archiveDir).toBe(join(REPO, '.agents/runs/archive'));
  });

  it('funciona com repoRoot relativo (o preflight passa ".")', () => {
    const { archiveDir } = buildLintArgs('.');
    expect(archiveDir.startsWith('/')).toBe(true);
    expect(archiveDir.endsWith('/.agents/runs/archive')).toBe(true);
  });
});

describe('checkArchiveIntegrity', () => {
  it('estado real do repo: o resultado declara o que ele sabe', async () => {
    // Antes este teste era `expect(r.ok).toBe(true)` e passava — mas o `ok:
    // true` vinha de um `✓` emitido sobre ZERO arquivos verificados. Um teste
    // que só afirma `ok:true` não distingue "verifiquei e passou" de "não havia
    // nada para verificar"; este afirma o ESTADO, seja ele qual for. É o que a
    // issue #49 pede: archive vazio e archive rightly preenchido produzem
    // saídas diferentes.
    const r = await checkArchiveIntegrity(REPO);
    expect(r.ok).toBe(true);
    if (countArchiveFiles(REPO) === 0) {
      expect(r.skipped).toBe(true);
      expect(r.reason).toContain('0 arquivo');
    } else {
      expect(r.skipped).toBeUndefined();
    }
  });

  it('archive EXISTENTE sem nenhum .md → skipped, não ✓ calado (issue #49)', async () => {
    // RED: antes deste fix o diretório existe (só o .gitkeep), então o ramo
    // `skipped` — que só dispara quando o diretório NÃO existe — nunca era
    // alcançado, e o linter rodava sobre o conjunto vazio devolvendo
    // `valid: true` por desenho. O `✓` era emitido sem ter verificado nada.
    const r = await checkArchiveIntegrity(REPO);
    expect(countArchiveFiles(REPO)).toBe(0); // precondição do cenário
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it('archive com .md VÁLIDO → verde de verdade, sem skip (contra-regra)', async () => {
    // A direção oposta. Sem este par, "declare skipped para tudo" também
    // passaria nos dois primeiros testes — e um gate que nunca verifica é
    // exatamente a classe 1 que a issue #49 denuncia, invertida.
    writeFileSync(PLANTED, VALID);
    const r = await checkArchiveIntegrity(REPO);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.skipped).toBeUndefined();
  });

  it('arquivo INVÁLIDO no archive REAL deixa o check vermelho', async () => {
    // Este é o RED que o B19 impossibilitava. Antes do fix, o check seguia
    // verde porque o linter olhava outro diretório.
    writeFileSync(PLANTED, INVALID);
    const r = await checkArchiveIntegrity(REPO);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('2026-10-05-prova-plantada.md');
  });

  it('arquivo inválido no diretório ERRADO não altera o resultado', async () => {
    // Guarda de direcionalidade pelo lado inverso: depois do fix, o diretório
    // onde o bug lia precisa ser irrelevante.
    mkdirSync(WRONG_DIR, { recursive: true });
    writeFileSync(join(WRONG_DIR, 'sujeira.md'), INVALID);
    const r = await checkArchiveIntegrity(REPO);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('archive ausente → skipped com motivo, nunca ok silencioso', async () => {
    const r = await checkArchiveIntegrity(join(REPO, 'package.json'));
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBeTruthy();
  });
});
