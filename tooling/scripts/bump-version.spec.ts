// tooling/scripts/bump-version.spec.ts
//
// pt-BR (#126): spec do bump MECÂNICO dos footers de versão.
//
// A raiz do #126 era a PROCEDÊNCIA: o handoff do `release-mode.md` nomeava
// TRÊS dos quatro arquivos versionados, e um bump que esquece um arquivo é
// uma divergência garantida. Este script escreve os QUATRO — e a spec mede
// exatamente isso, inclusive o caso em que um footer NÃO está no arquivo
// (que é onde um bump "parcial" se esconderia).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicarBump, trocarVersao, FOOTERS } from './bump-version.js';

/**
 * A raiz do REPO.
 *
 * ⚠️ Não é `process.cwd()`: o vitest roda com o CWD em `tooling/scripts`
 * (`--root tooling/scripts`), e um `process.cwd()` aqui mediria um caminho que
 * não existe — o teste passaria por um motivo errado, ou falharia sem dizer
 * o quê. A raiz vem do próprio arquivo, que é onde o caminho relativo é
 * relativo.
 */
const RAIZ_DO_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let raiz: string;

beforeEach(async () => {
  raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'bump-version-'));
});

afterEach(async () => {
  await fs.rm(raiz, { recursive: true, force: true });
});

/** Cria os quatro arquivos com a versão dada. */
async function criar(versao: string): Promise<void> {
  for (const footer of FOOTERS) {
    const completo = path.join(raiz, footer.arquivo);
    await fs.mkdir(path.dirname(completo), { recursive: true });
    await fs.writeFile(completo, `conteudo\n\n${footer.rotulo} ${versao}\n`, 'utf-8');
  }
}

/** Lê a versão de um dos arquivos. */
async function ler(footer: (typeof FOOTERS)[number]): Promise<string> {
  const texto = await fs.readFile(path.join(raiz, footer.arquivo), 'utf-8');
  const m = new RegExp(
    `${footer.rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+\\.\\d+\\.\\d+)`,
  ).exec(texto);
  return m?.[1] ?? '';
}

describe('trocarVersao()', () => {
  it('troca a versão do footer', () => {
    const novo = trocarVersao(
      'texto\n\n**Versão do documento:** 1.11.0\n',
      '**Versão do documento:**',
      '1.12.0',
    );
    expect(novo).toContain('**Versão do documento:** 1.12.0');
  });

  it('devolve null quando o footer NÃO está no arquivo', () => {
    // ⚠️ É este o caso que a issue descreve: um bump que pula um arquivo.
    expect(trocarVersao('nada aqui', '**Versão do documento:**', '1.12.0')).toBeNull();
  });

  it('não mexe no texto ao redor', () => {
    const antes = 'intro\n\n**Versão do documento:** 1.11.0\n\nresto\n';
    const depois = trocarVersao(antes, '**Versão do documento:**', '1.12.0');
    expect(depois).toBe('intro\n\n**Versão do documento:** 1.12.0\n\nresto\n');
  });
});

describe('aplicarBump() (#126)', () => {
  it('aplica a versão nos QUATRO footers', async () => {
    await criar('1.11.0');
    const alterados = aplicarBump(raiz, '1.12.0');
    expect(alterados.length).toBe(4);
    for (const footer of FOOTERS) {
      expect(await ler(footer)).toBe('1.12.0');
    }
  });

  it('RECUSA uma versão que não é X.Y.Z', async () => {
    await criar('1.11.0');
    expect(() => aplicarBump(raiz, '1.12')).toThrow(/X\.Y\.Z/);
  });

  it('RECUSA quando um dos footers NÃO está no arquivo', async () => {
    // ⚠️ O caso do #126: um bump que pula um arquivo. Aqui ele é um ERRO, e
    // não um "bump parcial" silencioso.
    //
    // ⚠️ O arquivo EXISTE e não tem o footer — e não "o arquivo não existe".
    // A diferença importa: com o arquivo ausente, o `readFileSync` estoura
    // ANTES da checagem do footer, e a mutação (pular o arquivo em vez de
    // recusar) continuaria verde — o teste passaria por um motivo que não é o
    // que ele mede.
    await criar('1.11.0');
    await fs.writeFile(path.join(raiz, 'docs/TEMPLATE_USAGE.md'), 'conteudo sem footer\n', 'utf-8');
    expect(() => aplicarBump(raiz, '1.12.0')).toThrow(/TEMPLATE_USAGE|footer/);
  });

  it('RECUSA quando um dos ARQUIVOS não existe', async () => {
    await criar('1.11.0');
    await fs.rm(path.join(raiz, 'docs/TEMPLATE_USAGE.md'));
    expect(() => aplicarBump(raiz, '1.12.0')).toThrow();
  });

  it('a lista tem os QUATRO arquivos, e eles existem no repo real', async () => {
    // A lista é a raiz do defeito: se ela encolher, o bump volta a pular um.
    expect(FOOTERS.length).toBe(4);
    const arquivos = FOOTERS.map((f) => f.arquivo);
    expect(arquivos).toContain('docs/MONOREPO.md');
    expect(arquivos).toContain('docs/STACK.md');
    expect(arquivos).toContain('docs/TEMPLATE_USAGE.md');
    expect(arquivos).toContain('.agents/specs/conventions/estrutura-e-versionamento.md');

    for (const footer of FOOTERS) {
      await expect(fs.access(path.join(RAIZ_DO_REPO, footer.arquivo))).resolves.toBeUndefined();
    }
  });
});
