import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkE2eFlowCoverage,
  lerInventario,
  reconciliarFluxosE2E,
  type SpecE2E,
} from './check-e2e-flow-coverage';

/**
 * Fixtures herméticas: convenção e specs são escritos num diretório temporário,
 * nunca lidos do repo real.
 *
 * Um gate cujo spec lê o objeto que ele mede prova que o repo está consistente
 * hoje, e quebra no primeiro dia em que o repo fica inconsistente de um jeito que
 * o autor não perceba — que é o dia em que ele precisa do gate. Aqui o
 * vermelho é construído, não herdado.
 */

const CONVENCAO = [
  '---',
  'name: e2e-playwright',
  '---',
  '',
  '## Inventário de Fluxos',
  '',
  '| Fluxo | Rota | Nome | Spec | Estados cobertos |',
  '|-------|------|------|------|-------------------|',
  '| F1 | `/users` | Listagem | `f1-listagem.spec.ts` | com dados |',
  '| F2 | `/users/novo` | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
  '',
  ' prosa fora da tabela com `| F9 | pipes | que | nao-e-tabela | x |`',
  '',
].join('\n');

const SPEC_F1 = '// FLUXO: F1 — Listagem\ntest("x", () => {});\n';
const SPEC_F2 = '// FLUXO: F2 — Cadastro\ntest("y", () => {});\n';

/**
 * Os specs do inventário, com os NOMES que a tabela declara.
 *
 * MEDIDO: a primeira versão desta fixture nomeava os arquivos `spec-0.spec.ts`,
 * `spec-1.spec.ts` — e o teste "verde quando os dois lados dizem a mesma coisa"
 * ficou VERMELHO com as duas divergências de nome. O gate estava certo: um
 * inventário que aponta para `f1-listagem.spec.ts` e um spec chamado
 * `spec-0.spec.ts` são dois lados desatualizados, mesmo que o conteúdo do
 * cabeçalho case. A fixture mentia sobre o repositório que ela representava.
 */
function specsDoInventario(...extras: string[]): SpecE2E[] {
  return [
    { arquivo: 'f1-listagem.spec.ts', conteudo: SPEC_F1 },
    { arquivo: 'f2-cadastro.spec.ts', conteudo: SPEC_F2 },
    ...extras.map((conteudo, i) => ({ arquivo: `extra-${i}.spec.ts`, conteudo })),
  ];
}

describe('lerInventario', () => {
  it('lê id e spec da tabela, ignorando a prosa que vem depois', () => {
    const { linhas, erro } = lerInventario(CONVENCAO);
    expect(erro).toBeUndefined();
    expect(linhas).toEqual([
      { id: 'F1', spec: 'f1-listagem.spec.ts' },
      { id: 'F2', spec: 'f2-cadastro.spec.ts' },
    ]);
  });

  it('localiza a coluna Spec pelo cabeçalho, não pela posição', () => {
    // `Estados cobertos` antes de `Spec`: um parse posicional leria a coluna
    // errada e casaria fluxo com "com dados" — verde por acidente.
    const reordenada = CONVENCAO.replace(
      '| Fluxo | Rota | Nome | Spec | Estados cobertos |',
      '| Fluxo | Estados cobertos | Spec | Rota | Nome |',
    )
      .replace(
        '| F1 | `/users` | Listagem | `f1-listagem.spec.ts` | com dados |',
        '| F1 | com dados | `f1-listagem.spec.ts` | `/users` | Listagem |',
      )
      .replace(
        '| F2 | `/users/novo` | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
        '| F2 | sucesso | `f2-cadastro.spec.ts` | `/users/novo` | Cadastro |',
      );
    const { linhas } = lerInventario(reordenada);
    expect(linhas.map((l) => l.spec)).toEqual(['f1-listagem.spec.ts', 'f2-cadastro.spec.ts']);
  });

  it('nomeia a seção faltando, em vez de devolver inventário vazio', () => {
    const { linhas, erro } = lerInventario('# Convenção\n\nsem inventário aqui\n');
    expect(linhas).toEqual([]);
    expect(erro).toContain('## Inventário de Fluxos');
  });

  it('nomeia a coluna faltando, em vez de usar índice fora da faixa', () => {
    const semColuna = CONVENCAO.replace(
      '| Fluxo | Rota | Nome | Spec | Estados cobertos |',
      '| Fluxo | Rota | Nome |',
    )
      .replace(
        '| F1 | `/users` | Listagem | `f1-listagem.spec.ts` | com dados |',
        '| F1 | `/users` | Listagem |',
      )
      .replace(
        '| F2 | `/users/novo` | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
        '| F2 | `/users/novo` | Cadastro |',
      );
    const { linhas, erro } = lerInventario(semColuna);
    expect(linhas).toEqual([]);
    expect(erro).toContain('coluna "spec"');
  });
});

describe('reconciliarFluxosE2E', () => {
  it('verde quando inventário e specs dizem a mesma coisa', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario(),
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.medidos).toBe(2);
  });

  it('acusa spec que declara fluxo fora do inventário, nomeando os dois lados', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario('// FLUXO: F7 — Inexistente\n'),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('extra-0.spec.ts');
    expect(r.errors.join('\n')).toContain('F7');
    expect(r.errors.join('\n')).toContain('e2e-playwright.md');
  });

  it('acusa fluxo do inventário sem spec que o declare', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: [{ arquivo: 'f1-listagem.spec.ts', conteudo: SPEC_F1 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('F2');
    expect(r.errors.join('\n')).toContain('nenhum spec declara esse fluxo');
  });

  it('acusa spec sem cabeçalho FLUXO:', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario('test("órfão", () => {});\n'),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('extra-0.spec.ts');
    expect(r.errors.join('\n')).toContain('FLUXO');
  });

  it('acusa dois specs que declaram o mesmo fluxo', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: [
        { arquivo: 'f1-listagem.spec.ts', conteudo: SPEC_F1 },
        { arquivo: 'f1-outra.spec.ts', conteudo: SPEC_F1 },
        { arquivo: 'f2-cadastro.spec.ts', conteudo: SPEC_F2 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('2 specs');
  });

  it('acusa inventário vazio — conjunto vazio passa vacuamente, e isso não é verde', () => {
    const vazio = '## Inventário de Fluxos\n\n| Fluxo | Spec |\n|---|---|\n';
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: vazio,
      specs: specsDoInventario(),
    });
    expect(r.ok).toBe(false);
    expect(r.medidos).toBe(0);
    expect(r.errors.join('\n')).toContain('0 linhas');
  });
});

describe('checkE2eFlowCoverage (repo de mentira)', () => {
  /** Só as convenções — sem `apps/web/e2e`. */
  function repoSemE2E(): string {
    const raiz = mkdtempSync(join(tmpdir(), 'check-e2e-'));
    mkdirSync(join(raiz, '.agents/specs/conventions'), { recursive: true });
    writeFileSync(join(raiz, '.agents/specs/conventions/e2e-playwright.md'), CONVENCAO);
    return raiz;
  }

  /** Convenção + diretório de e2e vazio. */
  function repoFalso(): string {
    const raiz = repoSemE2E();
    mkdirSync(join(raiz, 'apps/web/e2e'), { recursive: true });
    return raiz;
  }

  /** Convenção + diretório de e2e com os dois specs do inventário. */
  function repoCompleto(): string {
    const raiz = repoFalso();
    writeFileSync(join(raiz, 'apps/web/e2e/f1-listagem.spec.ts'), SPEC_F1);
    writeFileSync(join(raiz, 'apps/web/e2e/f2-cadastro.spec.ts'), SPEC_F2);
    return raiz;
  }

  it('skip declarado quando a convenção não existe — nada a reconciliar', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'check-e2e-'));
    const r = checkE2eFlowCoverage({ repoRoot: raiz });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('e2e-playwright.md');
  });

  it('skip declarado quando o diretório de e2e não existe', () => {
    // MEDIDO: a primeira versão desta fixture chamava `repoFalso()`, que
    // CRIA `apps/web/e2e` — então o `skip` não vinha, e o teste falhava
    // affirmando `skipped` num resultado que não o tinha. A fixture
    // representava um repositório diferente do que o nome dizia.
    const r = checkE2eFlowCoverage({ repoRoot: repoSemE2E() });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('e2e');
  });

  it('acusa diretório de e2e sem nenhum spec — verde por ausência de objeto', () => {
    const r = checkE2eFlowCoverage({ repoRoot: repoFalso() });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('nenhum *.spec.ts');
  });

  it('verde com a ressalva de que mede paridade, não execução', () => {
    const r = checkE2eFlowCoverage({ repoRoot: repoCompleto() });
    expect(r.ok).toBe(true);
    expect(r.advisories?.join('\n')).toContain('DECLARATIVA');
  });

  it('acusa o meio-cumprido: spec novo sem linha no inventário', () => {
    const raiz = repoCompleto();
    writeFileSync(join(raiz, 'apps/web/e2e/f3-novo.spec.ts'), '// FLUXO: F3 — Novo\n');
    const r = checkE2eFlowCoverage({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('F3');
  });
});
