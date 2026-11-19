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

/**
 * Cria o repo git COM a tag, e devolve o caminho do arquivo que a tag mediu.
 *
 * O caso que a tag precisa medir é "o conteúdo mudou DEPOIS dela": então a
 * tag é criada com o conteúdo inicial, e a modificação acontece depois — como
 * num PR que mexe no doc e não mexe na versão.
 */
async function criarRepoComTag(tag: string, versao: string): Promise<void> {
  await escreverTodos(versao);
  criarTag(tag);
}

/** Reescreve um dos arquivos com a MESMA versão e outro conteúdo. */
async function mudarConteudoSemVersao(
  arquivo: string,
  rotulo: string,
  versao: string,
): Promise<void> {
  await fs.writeFile(path.join(raiz, arquivo), `conteudo novo\n\n${rotulo} ${versao}\n`, 'utf-8');
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

  // ── a terceira regra: o conteúdo mudou e a versão NÃO ─────────────────
  //
  // MEDIDO no PR #172: o rodapé do `README.md` passou de 47/49/17 para
  // 48/50/18 e o rótulo continuou `1.30.0` — que já era o da tag publicada.
  // Dois conteúdos com o mesmo rótulo, e o gate existente não via: ele compara
  // o NÚMERO entre os footers e contra a tag, não o resto da linha.
  it('ERRO quando o conteúdo do footer mudou desde a tag e a versão ficou', async () => {
    await criarRepoComTag('v1.11.0', '1.11.0');
    await mudarConteudoSemVersao('README.md', '**Versão:**', '1.11.0');
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /README\.md/.test(e) && /1\.11\.0/.test(e))).toBe(true);
  });

  it('PASSA quando o conteúdo mudou E a versão subiu', async () => {
    await criarRepoComTag('v1.11.0', '1.11.0');
    await mudarConteudoSemVersao('README.md', '**Versão:**', '1.12.0');
    // os outros cinco precisam acompanhar, senão a PRIMEIRA regra acusa
    for (const footer of FOOTERS_DE_VERSAO) {
      if (footer.arquivo !== 'README.md')
        await escreverFooter(footer.arquivo, footer.rotulo, '1.12.0');
    }
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('PASSA quando nada mudou desde a tag', async () => {
    await criarRepoComTag('v1.11.0', '1.11.0');
    const r = await checkVersionFooters({ repoRoot: raiz });
    expect(r.ok).toBe(true);
  });

  it('o repo REAL passa (os quatro footers estão alinhados)', async () => {
    const r = await checkVersionFooters({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
  });

  // ── a lista é a raiz do defeito ─────────────────────────────────────────
  it('a lista tem OS SEIS footers, e os seis arquivos existem no repo', async () => {
    // ⚠️ Este é o teste que impede a reincidência do #126: a raiz do defeito
    // foi a lista do `release-mode.md` nomear TRÊS. Se a lista deste gate
    // nomear menos, o gate passa a medir a mesma coisa que media antes.
    //
    // MEDIDO em 2026-10-29: a lista nomeava QUATRO e o repo tem SEIS — o
    // `AGENTS.md` divergiu para 1.13.0 sem o gate ver. Por isso os dois
    // extras são nomeados aqui: é a lista, não o texto, que fecha a classe.
    expect(FOOTERS_DE_VERSAO.length).toBe(6);
    const arquivos = FOOTERS_DE_VERSAO.map((f) => f.arquivo);
    expect(arquivos).toContain('docs/MONOREPO.md');
    expect(arquivos).toContain('docs/STACK.md');
    expect(arquivos).toContain('docs/TEMPLATE_USAGE.md');
    expect(arquivos).toContain('.agents/specs/conventions/estrutura-e-versionamento.md');
    expect(arquivos).toContain('AGENTS.md');
    expect(arquivos).toContain('README.md');
  });

  it('os seis arquivos da lista existem de verdade no repo', async () => {
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
