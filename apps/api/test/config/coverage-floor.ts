// apps/api/test/config/coverage-floor.ts
//
// Lógica pura que decide se o gate de cobertura de 80% é aplicado na run
// atual. Vive fora do `vitest.config.ts` para poder ser testada — o config
// é avaliado pelo Vite e não é importável pelo runner de specs.
//
// POR QUE ISSO EXISTE (issue #40):
// O Vitest 2.1.9 constrói o reporter de coverage com o `ctx` do projeto
// RAIZ (`initCoverageProvider` → `ctx.config.coverage`,
// `dist/chunks/cli-api*.js:10582-10588`). Logo `coverage.thresholds` num
// projeto `defineWorkspace` é inerte, e não existe opt-out por projeto via
// config — nem `thresholds: { lines: 0 }` sobrepõe o piso herdado. Como a
// convenção só impõe 80% ao projeto `unit`, o piso precisa ser derivado do
// projeto ativo, e isso só é possível aqui, no config raiz.

/** Único projeto cujo coverage é enforced pela regra de 80%. */
export const ENFORCED_PROJECT = 'unit';

/**
 * Scripts que reportam coverage sem enforcement. `integration` só
 * exercita os adapters Prisma e `e2e` o boundary HTTP — ambos ficam
 * abaixo do piso por desenho, não por defeito.
 *
 * É um FALLBACK: os scripts `test:integration` e `test:e2e` já passam
 * `--project <nome>` no argv, então o caminho normal é o de
 * `selectedProjects`. Esta lista só entra em jogo quando o argv não
 * traz `--project` (ex.: alguém chama o vitest direto).
 */
const REPORT_ONLY_SCRIPTS: readonly string[] = ['test:integration', 'test:e2e'];

/** Contexto que o config raiz injeta — desconhecível daqui. */
export interface CoverageGateContext {
  /** Nomes de projeto declarados em `vitest.workspace.ts`. */
  projects: readonly string[];
  /** `process.env.npm_lifecycle_event` quando o run veio de um script. */
  lifecycleEvent?: string | undefined;
}

/**
 * Extrai TODOS os padrões declarados via `--project`.
 *
 * `--project` é `array: true` no CLI do Vitest (cac.js:1171-1175) e pode
 * ser repetido (`--project=unit --project=integration`), então não basta
 * ler o primeiro. Aceita as duas formas: `--project=x` e `--project x`.
 */
export function activeProjects(argv: readonly string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith('--project=')) {
      names.push(arg.slice('--project='.length));
    } else if (arg === '--project' && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next !== undefined) names.push(next);
      i += 1;
    }
  }
  return names;
}

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Converte um padrão de `--project` em regex com a MESMA semântica que o
 * Vitest 2.1.9 usa internamente (`resolveConfig` → `wildcardPatternToRegExp`:
 * `pattern.split('*').map(escapeRegExp).join('.*')`, ancorado e com flag `i`).
 *
 * Importante: o padrão NÃO é um nome literal. `--project=u*` é a forma
 * documentada de selecionar o projeto `unit`, e tratá-la como literal
 * desligaria o gate sem rodar um teste a menos.
 */
export function projectPatternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(REGEXP_SPECIALS, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`, 'i');
}

/**
 * Quais projetos do workspace a invocação realmente seleciona, resolvendo
 * os wildcards. Devolve lista vazia quando não há `--project` no argv.
 */
export function selectedProjects(argv: readonly string[], projects: readonly string[]): string[] {
  const patterns = activeProjects(argv).map(projectPatternToRegExp);
  if (patterns.length === 0) return [];
  return projects.filter((name) => patterns.some((re) => re.test(name)));
}

/**
 * O gate só fecha quando a invocação seleciona o projeto `unit` e nada
 * além dele. Se o agregado inclui `integration`/`e2e`, o piso de 80% não se
 * aplicaria — eles ficam abaixo por desenho.
 *
 * Sem `--project` reconhecível, a segurança é o gate: só os scripts
 * explicitamente report-only desligam, e qualquer outro uso herda o piso.
 */
export function isCoverageEnforced(argv: readonly string[], context: CoverageGateContext): boolean {
  const selected = selectedProjects(argv, context.projects);
  if (selected.length > 0) {
    return selected.every((name) => name === ENFORCED_PROJECT);
  }
  return !REPORT_ONLY_SCRIPTS.includes(context.lifecycleEvent ?? '');
}
