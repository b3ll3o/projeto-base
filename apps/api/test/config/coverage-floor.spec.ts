// apps/api/test/config/coverage-floor.spec.ts
//
// Testes da lógica que decide o enforcement do gate de cobertura (issue #40).
// É a única parte do fix que tem comportamento observável, então é a única
// que precisa de teste automatizado: se `isCoverageEnforced` voltar a
// devolver `true` para `integration`, o gate quebra com um erro que parece
// bug de configuração.

import { describe, expect, it } from 'vitest';
// pt-BR: extensão `.js` explícita — o tsconfig da api usa
// `moduleResolution: node16`, que exige isso em todo import relativo
// (TS2835). Mesmo padrão dos specs em `src/`.
import {
  ENFORCED_PROJECT,
  activeProjects,
  isCoverageEnforced,
  selectedProjects,
} from './coverage-floor.js';
// pt-BR: importado para amarrar `ENFORCED_PROJECT` ao nome real. Sem este
// teste, renomear o projeto no workspace desligaria o gate em silêncio.
import workspace from '../../vitest.workspace.js';

const NODE = '/usr/bin/node';
const VITEST = 'node_modules/vitest/vitest.mjs';

/** argv mínimo, como o Node o entrega ao carregar o config. */
const argv = (...args: string[]): string[] => [NODE, VITEST, 'run', ...args];

/** Os mesmos nomes que `vitest.workspace.ts` declara hoje. */
const KNOWN = ['unit', 'integration', 'e2e'];

const check = (args: string[], lifecycleEvent?: string): boolean =>
  isCoverageEnforced(argv(...args), { projects: KNOWN, lifecycleEvent });

describe('activeProjects', () => {
  it('lê a forma inline `--project=<nome>`', () => {
    expect(activeProjects(argv('--project=unit'))).toEqual(['unit']);
  });

  it('lê a forma posicional `--project <nome>`', () => {
    expect(activeProjects(argv('--project', 'unit'))).toEqual(['unit']);
  });

  it('lê todas as repetições — `--project` é array no CLI do Vitest', () => {
    expect(activeProjects(argv('--project=unit', '--project=integration'))).toEqual([
      'unit',
      'integration',
    ]);
  });

  it('não confunde o valor da flag com o próximo argumento', () => {
    expect(activeProjects(argv('--coverage', '--project', 'e2e', '--reporter=json'))).toEqual([
      'e2e',
    ]);
  });

  it('ignora `--project` sem valor no fim do argv', () => {
    expect(activeProjects(argv('--project'))).toEqual([]);
  });

  it('devolve lista vazia quando `--project` não aparece', () => {
    expect(activeProjects(argv('--coverage'))).toEqual([]);
  });
});

describe('selectedProjects', () => {
  it('resolve o nome exato', () => {
    expect(selectedProjects(argv('--project=unit'), KNOWN)).toEqual(['unit']);
  });

  it('expande wildcard contra os projetos conhecidos', () => {
    expect(selectedProjects(argv('--project=u*'), KNOWN)).toEqual(['unit']);
    expect(selectedProjects(argv('--project=*it'), KNOWN)).toEqual(['unit']);
  });

  it('é case-insensitive, como o Vitest', () => {
    expect(selectedProjects(argv('--project=UNIT'), KNOWN)).toEqual(['unit']);
    expect(selectedProjects(argv('--project=INTEGRATION'), KNOWN)).toEqual(['integration']);
  });

  it('ancora o padrão: não casa por substring', () => {
    // `uni` NÃO casa com `unit` — o Vitest ancora o regex gerado
    // (resolveConfig → wildcardPatternToRegExp, `^...$`).
    expect(selectedProjects(argv('--project=uni'), KNOWN)).toEqual([]);
  });

  it('une vários padrões e devolve cada projeto uma vez', () => {
    expect(selectedProjects(argv('--project=unit', '--project=u*'), KNOWN)).toEqual(['unit']);
  });

  it('devolve vazio sem `--project` no argv', () => {
    expect(selectedProjects(argv(), KNOWN)).toEqual([]);
  });
});

describe('isCoverageEnforced', () => {
  it('aplica o gate no projeto unit', () => {
    expect(check(['--project', ENFORCED_PROJECT])).toBe(true);
  });

  it('aplica o gate na forma inline', () => {
    expect(check(['--project=unit'])).toBe(true);
  });

  it('NÃO aplica o gate no projeto integration', () => {
    expect(check(['--project', 'integration'])).toBe(false);
  });

  it('NÃO aplica o gate no projeto e2e', () => {
    expect(check(['--project', 'e2e'])).toBe(false);
  });

  it('NÃO aplica o gate quando a invocação mistura unit com report-only', () => {
    expect(check(['--project=unit', '--project=integration'])).toBe(false);
  });

  it('aplica o gate com wildcard que seleciona SÓ o unit', () => {
    // Regressão do issue #40: `--project=u*` roda as 245 specs do unit,
    // mas um comparador literal trataria `u*` como nome de projeto e
    // desligaria o gate silenciosamente.
    expect(check(['--project=u*'])).toBe(true);
  });

  it('NÃO aplica o gate com wildcard que seleciona unit E os demais', () => {
    // `--project=*` roda o workspace inteiro; o agregado inclui
    // integration/e2e, que ficam abaixo do piso por design.
    expect(check(['--project=*'])).toBe(false);
  });

  it('sem --project, aplica o gate por padrão', () => {
    expect(check(['--coverage'])).toBe(true);
  });

  it('sem --project, o script test:coverage herda o piso', () => {
    expect(check([], 'test:coverage')).toBe(true);
  });

  it('sem --project, os scripts report-only desligam o gate', () => {
    expect(check([], 'test:integration')).toBe(false);
    expect(check([], 'test:e2e')).toBe(false);
  });

  it('prioriza --project sobre o lifecycle event quando ambos existem', () => {
    expect(check(['--project', 'unit'], 'test:integration')).toBe(true);
    expect(check(['--project', 'e2e'], 'test:coverage')).toBe(false);
  });

  it('padrão que não casa com nenhum projeto conhecido mantém o gate', () => {
    // Não sabemos o que o usuário quis dizer: a segurança é o gate.
    expect(check(['--project=zzz'])).toBe(true);
  });
});

describe('alinhamento com o workspace', () => {
  // pt-BR: `defineWorkspace` devolve `WorkspaceProjectConfiguration[]`, uma
  // união que inclui `string` (a forma "caminho para um config") e a forma
  // função — nenhum dos dois membros tem `.test` acessível, então o
  // encadeamento direto não compila. O narrowing abaixo é por valor, não
  // por cast: se a forma do objeto mudar, `declared` sai vazio e o
  // segundo teste abaixo falha em vez de passar calado.
  const projectNames = (configs: readonly unknown[]): string[] =>
    configs
      .map((config) =>
        typeof config === 'object' && config !== null
          ? (config as { test?: { name?: unknown } }).test?.name
          : undefined,
      )
      .filter((name): name is string => typeof name === 'string');

  const declared = projectNames(workspace);

  it('o workspace declara um projeto com o nome de ENFORCED_PROJECT', () => {
    // Se alguém renomear `unit` no workspace sem atualizar
    // `ENFORCED_PROJECT`, o gate passaria a não se aplicar em lugar
    // nenhum — e nenhum teste falharia. Este é o amarra.
    expect(declared).toContain(ENFORCED_PROJECT);
  });

  it('a lista usada nos testes bate com o workspace real', () => {
    expect(declared).toEqual(KNOWN);
  });

  it('o script test:coverage do package.json aponta para o projeto enforced', async () => {
    const pkg = await import('../../package.json', { with: { type: 'json' } });
    const script = (pkg.default as { scripts?: Record<string, string> }).scripts?.['test:coverage'];
    expect(script).toBeDefined();
    expect(script).toContain(`--project ${ENFORCED_PROJECT}`);
  });
});
