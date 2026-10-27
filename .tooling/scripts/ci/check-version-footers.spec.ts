/**
 * SEM shebang, de propósito.
 *
 * Spec do gate `check-version-footers` (#126).
 *
 * A raiz do #126 é a PROCEDÊNCIA: o handoff do `release-mode.md` nomeava
 * TRÊS dos quatro arquivos versionados. O gate que fecha a reincidência
 * precisa, portanto, de saber QUAIS são os quatro — e a lista é exportada e
 * presa aqui, pelo mesmo motivo do `HOSTS_DESTINO_LOCAL` do PR #115.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  checkVersionFooters,
  FOOTERS_DE_VERSAO,
  compararVersoes,
  versaoNumerica,
} from './check-version-footers.js';

let raiz: string;

/** Escreve um dos quatro footers com a versão pedida. */
async function escreverFooter(arquivo: string, rotulo: string, versao: string): Promise<void> {
  const completo = path.join(raiz, arquivo);
  await fs.mkdir(path.dirname(completo), { recursive: true });
  await fs.writeFile(completo, `conteudo\n\n${rotulo} ${versao}\n`, 'utf-8');
}

/** Escreve os quatro footers com a MESMA versão. */
async function escreverTodos(versao: string): Promise<void> {
  for (const footer of FOOTERS_DE_VERSAO) {
    await escreverFooter(footer.arquivo, footer.rotulo, versao);
  }
}

/** Cria um repo git com uma tag, para o gate ter o que medir. */
function criarTag(tag: string): void {
  execFileSync('git', ['init', '-q'], { cwd: raiz });
  execFileSync('git', ['config', 'user.email', 'teste@exemplo.com'], { cwd: raiz });
  execFileSync('git', ['config', 'user.name', 'Teste'], { cwd: raiz });
  execFileSync('git', ['add', '-A'], { cwd: raiz });
  execFileSync('git', ['commit', '-qm', 'inicial'], { cwd: raiz });
  execFileSync('git', ['tag', tag], { cwd: raiz });
}

beforeEach(async () => {
  raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'check-version-footers-'));
});

afterEach(async () => {
  await fs.rm(raiz, { recursive: true, force: true });
});

describe('checkVersionFooters (#126)', () => {
  it('PASSA quando os quatro declaram a mesma versão e não há tag', async () => {
    await escreverTodos('1.11.0');
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('ERRO quando um dos quatro diverge', async () => {
    await escreverTodos('1.11.0');
    await escreverFooter('docs/STACK.md', '**Versão da stack:**', '1.12.0');
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /divergem/.test(e))).toBe(true);
  });

  it('ERRO quando um footer falta', async () => {
    await escreverTodos('1.11.0');
    await fs.rm(path.join(raiz, 'docs/STACK.md'));
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /docs\/STACK\.md/.test(e))).toBe(true);
  });

  it('ERRO quando os quatro concordam mas a versão é MENOR que a da última tag', async () => {
    await escreverTodos('1.10.0');
    criarTag('v1.11.0');
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /última tag/.test(e))).toBe(true);
  });

  it('PASSA quando os quatro concordam e a versão é MAIOR que a da última tag', async () => {
    await escreverTodos('1.12.0');
    criarTag('v1.11.0');
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('PASSA quando os quatro concordam e a versão é IGUAL à da última tag', async () => {
    // A tag é o que já foi LANÇADO; o próximo release é o que o bump prepara.
    // Igualdade não é erro — só "menor" é.
    await escreverTodos('1.11.0');
    criarTag('v1.11.0');
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('o repo REAL passa (os quatro footers estão alinhados)', async () => {
    const r = await checkVersionFooters({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
  });

  // ── a lista é a raiz do defeito ─────────────────────────────────────────
  it('a lista tem OS QUATRO footers, e os quatro arquivos existem no repo', async () => {
    // ⚠️ Este é o teste que impede a reincidência do #126: a raiz do defeito
    // foi a lista do `release-mode.md` nomear TRÊS. Se a lista deste gate
    // nomear três, o gate passa a medir a mesma coisa que media antes.
    expect(FOOTERS_DE_VERSAO.length).toBe(4);
    const arquivos = FOOTERS_DE_VERSAO.map((f) => f.arquivo);
    expect(arquivos).toContain('docs/MONOREPO.md');
    expect(arquivos).toContain('docs/STACK.md');
    expect(arquivos).toContain('docs/TEMPLATE_USAGE.md');
    expect(arquivos).toContain('.agents/specs/conventions/estrutura-e-versionamento.md');
  });

  it('os quatro arquivos da lista existem de verdade no repo', async () => {
    for (const footer of FOOTERS_DE_VERSAO) {
      await expect(fs.access(path.join(process.cwd(), footer.arquivo))).resolves.toBeUndefined();
    }
  });
});

describe('versaoNumerica() / compararVersoes()', () => {
  it('lê uma versão X.Y.Z', () => {
    expect(versaoNumerica('1.12.0')).toEqual([1, 12, 0]);
  });

  it('devolve null para o que não é versão', () => {
    expect(versaoNumerica('1.12')).toBeNull();
    expect(versaoNumerica('v1.12.0')).toBeNull();
    expect(versaoNumerica('CHANGE_ME')).toBeNull();
  });

  it('compara por major, minor e patch', () => {
    expect(compararVersoes([1, 12, 0], [1, 11, 0])).toBeGreaterThan(0);
    expect(compararVersoes([1, 11, 0], [1, 12, 0])).toBeLessThan(0);
    expect(compararVersoes([1, 12, 0], [1, 12, 0])).toBe(0);
    expect(compararVersoes([2, 0, 0], [1, 99, 99])).toBeGreaterThan(0);
  });
});
