#!/usr/bin/env tsx
/**
 * Pre-flight CI checks. Roda ANTES de `turbo run lint typecheck test`
 * para falhar rápido em problemas estruturais.
 *
 * Checks incluídos:
 * 1. checkDocRefs — cross-refs quebradas em .md (docs e .agents/specs)
 * 2. checkTsconfigDrift — drift de chaves em tsconfigs do monorepo
 * 3. checkEslintDrift — detecta configs ESLint legadas (apps + packages)
 *
 * Exit code 0 = OK, 1 = pelo menos 1 falha, 2 = erro inesperado.
 */
import { checkDocRefs } from './check-doc-refs';
import { checkTsconfigDrift } from './check-tsconfig-drift';
import { checkEslintDrift } from './check-eslint-drift';
import { checkTurboDrift } from './check-turbo-drift';
import { checkPackageJsonDrift } from './check-package-json-drift';
import { checkDockerDrift } from './check-docker-drift';
import { checkArchiveIntegrity } from './check-archive-integrity';
import { checkAgentMemoryDrift } from './check-agent-memory-drift';
import { checkToolingTypecheck } from './check-tooling-typecheck';
import { checkMemoryDirConcordance } from './check-memory-dir-concordance';
import { checkTeethRegistry } from './check-teeth-registry';
import { checkSelfFiringGuards } from './check-self-firing-guard';
import { checkHarnessOwner } from './check-harness-owner';
import { checkBranchUpToDate } from './check-branch-up-to-date';
import { checkE2eFlowCoverage } from './check-e2e-flow-coverage';
import { checkCiLocalE2e } from './check-ci-local-e2e';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { CheckResult } from './check-types';
import { PREFLIGHT_CHECKS, idsDeclarados } from './preflight-gates';

/**
 * Valida a matriz de roteamento do review-router (Task 1.10).
 * Reexecuta `pnpm review:lint` (CLI) para fail-fast em YAML quebrado,
 * LOC excessivo, duplicate patterns, regex inválida ou reviewer refs
 * desconhecidos antes do push (defesa em profundidade simétrica ao
 * `pnpm review:lint` manual).
 *
 * Usa execSync em vez de importar lintMatrix diretamente para evitar
 * cross-package import (tooling/scripts é package isolado no monorepo).
 */
function checkReviewRoutingLint(): CheckResult {
  const matrixPath = 'tooling/scripts/lint-review-routing.ts';
  const matrixFile = '.agents/specs/conventions/review-routing.md';

  if (!existsSync(matrixPath) || !existsSync(matrixFile)) {
    // Sem matriz ou sem lint ainda (repo pré-Task 1.8/1.9) — não falha,
    // mas também não pode reportar que verificou.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `matriz de routing ausente (${matrixPath} ou ${matrixFile})`,
    };
  }

  try {
    execSync('pnpm review:lint', { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, errors: [] };
  } catch (err: any) {
    const stderr = (err.stderr?.toString() ?? '').trim();
    const stdout = (err.stdout?.toString() ?? '').trim();
    const detail = stderr || stdout || err.message;
    return {
      ok: false,
      errors: [`review:lint falhou:\n${detail}`],
    };
  }
}

/**
 * Task 4.1 do plano `guard-classes`. O instrumento que a B11 mediu em 2
 * menções e 0 invocações ganha dono, e o dono é o PREFLIGHT — não o
 * `ci:local`.
 *
 * A escolha não é estética. `ci:local` é `pnpm ci:preflight && …`, então
 * entrar pelo preflight também roda no `ci:local`; o inverso não é verdade.
 * O CI executa `pnpm ci:preflight` (`.github/workflows/ci.yml`) e nunca
 * executa `ci:local` — um gate ligado só ao `ci:local` roda na máquina de
 * quem dá push e em nenhum outro lugar, que é a classe 1 com o nome de
 * "funciona na minha máquina".
 *
 * `file` aponta para o `.sh`, não para um wrapper em TypeScript, e isso é o
 * que faz o `check-harness-owner` enxergar o dono. Um wrapper seria ele
 * mesmo um segundo harness, sem dono — e o check que existe para achar
 * exatamente esse caso passaria calado sobre o wrapper que ele próprio
 * acabou de criar.
 *
 * Custo: ~8,2 s contra um preflight de ~2,6 s. É o preço de um gate que
 * mede contra o turbo real em vez de contra o parser.
 */
function checkTurboRedirectDifferential(): CheckResult {
  const script = '.tooling/scripts/ci/turbo-redirect-differential.sh';
  if (!existsSync(script)) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `harness ausente (${script})`,
    };
  }

  try {
    execSync(`bash ${script}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, errors: [] };
  } catch (err: any) {
    const stderr = (err.stderr?.toString() ?? '').trim();
    const stdout = (err.stdout?.toString() ?? '').trim();
    const detail = stderr || stdout || err.message;
    return {
      ok: false,
      errors: [
        `turbo-redirect-differential: o parser e o turbo REAL divergem.\n${detail}\n` +
          `Um "Could not find task" que o parser não extrai é uma task fantasma ` +
          `que o gate deixa passar.`,
      ],
    };
  }
}

/**
 * Marca de um check que rodou até o fim.
 *
 * `skipped` NAO pode renderizar `✓`: o painel precisa distinguir "verifiquei e
 * passou" de "não havia o que verificar". Sem essa separação, um check que
 * faz early-return por pré-requisito ausente reporta sucesso sem ter
 * verificado nada — o token de sucesso mente, e é o pior tipo de bug de gate
 * porque parece que o gate funcionou.
 */
export function formatMark(r: CheckResult): string {
  if (!r.ok) return '✗';
  if (r.skipped) return `– (skipped: ${r.reason ?? 'sem motivo declarado'})`;
  return '✓';
}

/**
 * A ÚNICA fonte de "isto reprovou".
 *
 * `CheckResult.ok` e `CheckResult.errors` são independentes por contrato, e o
 * painel lia os dois — cada um para uma decisão diferente. MEDIDO 2026-10-08: em
 * `ok: true` + `errors` preenchido a linha saía VERDE, os erros eram contados, e
 * o processo saía 1: o build reprovava com uma linha verde na tela, que é a
 * pior leitura possível porque o token de sucesso é o primeiro que o olho pega.
 *
 * Por que `errors` e não `ok`: `errors` é o que o painel PRINTA. Um veredito
 * que ninguém consegue ler não pode ser o que decide a marca. E `ok: false` sem
 * `errors` continua vermelho por `formatMark` — ver `detalhar`.
 */
function falhou(r: CheckResult): boolean {
  return r.errors.length > 0;
}

/**
 * As linhas de detalhe que o painel imprime DEPOIS da marca, em qualquer ramo.
 *
 * Deliberadamente **sem** a linha de skip que `linhasDoRelato` inclui: o painel
 * já carrega o motivo na própria marca (`– (skipped: …)`, via `formatMark`), e
 * usar as duas listas aqui imprimiria duas vezes. São contratos
 * diferentes — o CLI de um check não tem marca e precisa dizer por que não
 * rodou — e a diferença é essa, não uma divergência acidental.
 *
 * Extraído de `main()` só porque era impossível testar a contagem onde ela
 * estava: o somatório vivia no meio de um `for` com `console.log` entrelaçado,
 * e nada media se uma ressalva inflava o total.
 *
 * MEDIDO 2026-10-06: `check-branch-up-to-date` devolvia a ressalva "medido
 * contra a ref local" dentro de `errors`, e o painel anunciava "❌ 2 erro(s)"
 * para uma branch 1 commit atrás — mandando quem lê procurar um segundo bug
 * inexistente. A ressalva continua impressa; ela só não é mais contada.
 */
export function detalhar(r: CheckResult): { linhas: string[]; erros: number } {
  // A linha do skip entra SÓ no vermelho. No verde a marca já carrega o motivo
  // (`– (skipped: …)`, via `formatMark`) e repetir aqui imprimiria duas vezes;
  // no vermelho a marca é apenas `✗`, e aí a linha é a única coisa que diz que
  // o check NÃO rodou — os `errors` dizem o que ele errou, não por que ele não
  // chegou a medir.
  //
  // MEDIDO 2026-10-07: `ok` e `skipped` são independentes por contrato —
  // `check-package-json-drift.ts` devolve `ok: errors.length === 0` JUNTO com
  // `skipped: true`. No caso "não rodou E errou", o motivo do skip era o dado
  // mais importante da linha e ele não aparecia em lugar nenhum.
  //
  // O gatilho é `falhou`, e não `!r.ok`, pelo mesmo motivo da marca: `ok: true`
  // com erros preenchidos é o estado que produzia a linha verde, e o motivo do
  // skip é justamente o dado que a linha verde estava engolindo.
  const motivo = r.skipped && falhou(r) ? [`(skipped: ${r.reason ?? 'sem motivo declarado'})`] : [];
  // O outro lado da classe: `ok: false` com `errors` VAZIO imprimia `✗` (o
  // `formatMark` lê `ok`), contava 0 e saía 0 — uma linha vermelha em cima de
  // "Todos os checks passaram". MEDIDO 2026-10-08: hoje nenhum gate produz este
  // estado, porque todos derivam `ok` de `errors.length === 0`
  // (`grep -rn "ok: errors.length === 0" .tooling/scripts/ci/*.ts` → 11
  // ocorrências). É um furo latente: o conserto é de 2 linhas, e deixar o furo
  // é esperar o próximo gate que erre a derivação.
  //
  // A recusa sem causa precisa ser CONTADA e DITA. Contada só, ela some — e um
  // erro que não aparece em lugar nenhum é indistinguível de um gate que não
  // rodou.
  const semCausa =
    !r.ok && r.errors.length === 0
      ? ['(o check devolveu `ok: false` sem nenhum `errors` — a recusa não tem causa registrada)']
      : [];
  return {
    linhas: [...r.errors, ...(r.advisories ?? []), ...motivo, ...semCausa],
    erros: Math.max(r.errors.length, r.ok ? 0 : 1),
  };
}

/**
 * Como UM check aparece no painel: a marca, as linhas de detalhe e o que ele
 * soma.
 *
 * Existe para que o ramo VERDE seja testável. O defeito que motivou o split
 * vivia dentro de `main()` — `detalhar` era chamado só em `if (!result.ok)` — e
 * um `advisories` sobre um `ok: true` saía descartado em silêncio. Comportamento
 * que só se vê rodando a preflight inteira (quinze checks, alguns segundos) não
 * tem teste; e sem teste ele volta na próxima refatoração.
 *
 * MEDIDO 2026-10-07: a assimetria era real, e apontava para o caso que mais
 * importa — a ressalva "isto mediu contra uma ref que pode estar velha"
 * qualifica um **verde**, e o verde era justamente o ramo que não a lia.
 */
export function relatarUmCheck(result: CheckResult): {
  mark: string;
  linhas: string[];
  erros: number;
  pulou: boolean;
} {
  const { linhas, erros } = detalhar(result);
  return {
    mark: falhou(result) ? '✗' : formatMark(result),
    linhas,
    erros,
    // `skipped` sozinho, sem o `&& result.ok`: "não rodou" e "rodou e errou"
    // são fatos independentes, e um check pode ser os dois ao mesmo tempo. Com
    // o `&&`, esse terceiro estado não incrementava a contagem de pulados — e
    // o resumo "N check(s) não rodaram" deixava de disparar exatamente quando
    // a leitura parcial importa mais.
    pulou: Boolean(result.skipped),
  };
}

/**
 * O fechamento do painel: o que sai, e com que codigo o processo termina.
 *
 * MEDIDO 2026-10-08: isto nao existia. `main()` tinha tres `console.log`
 * sequenciais guarded por `if (totalErrors > 0) { … process.exit(1) }`, e o
 * `exit` era a PRIMEIRA coisa do ramo de erro. Como um check pulado-com-erro
 * contribui >= 1 erro, `totalErrors > 0` era garantido nesse caso e o resumo
 * "N check(s) nao rodaram" ficava a um `exit` de distância para sempre.
 *
 * `pulou` contava o estado misto corretamente desde o conserto anterior — e a
 * contagem nao tinha para onde ir. Era a metade do defeito que ainda faltava.
 *
 * O tell de que a propria mensagem mentia: o resumo antigo interpolava
 * `${totalErrors}` e so era alcancavel com `totalErrors === 0`. Uma variavel
 * que nao pode variar e a assinatura de um ramo inalcancavel.
 *
 * Por que "erro E skip" e uma linha so, e nao duas: quem falha lê o erro
 * primeiro, e o skip qualifica o painel INTEIRO, nao um check. Por que o codigo
 * continua sendo 1: pular nao é o que reprova — errar é.
 */
export function resumir(
  totalErrors: number,
  totalSkipped: number,
): { linhas: string[]; codigo: 0 | 1 } {
  const linhas: string[] = [];
  if (totalErrors > 0) {
    linhas.push(`❌ ${totalErrors} erro(s) encontrado(s). Corrigir antes de push.`);
  }
  if (totalSkipped > 0) {
    linhas.push(
      `⚠ ${totalErrors} erro(s); ${totalSkipped} check(s) não rodaram (skipped) — ` +
        `parte do painel acima não foi medida.`,
    );
  }
  if (linhas.length === 0) linhas.push('✓ Todos os checks passaram.');
  return { linhas, codigo: totalErrors > 0 ? 1 : 0 };
}

/**
 * O COMO: `id` → função. Fica aqui, e não em `preflight-gates.ts`, porque é o
 * único ponto do sistema que sabe chamar os gates — e porque um módulo com as
 * funções importaria `checkTeethRegistry`, que importa este módulo de volta.
 *
 * As duas metades formam um par fechado, e o par é testado: nenhum `id` de
 * `PREFLIGHT_CHECKS` sem runner, nenhum runner sem `id`. Um gate com `fn`
 * apontando para o vazio é verde até alguém rodar a happy path dele.
 */
export const RUNNERS: Record<string, () => CheckResult | Promise<CheckResult>> = {
  'check-doc-refs': () => checkDocRefs({ docsRoot: '.', docsRoots: ['docs', '.agents/specs'] }),
  'check-tsconfig-drift': () =>
    checkTsconfigDrift({
      tsconfigsRoot: '.',
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    }),
  'check-eslint-drift:apps': () => checkEslintDrift({ appsRoot: 'apps', allowlist: [] }),
  'check-eslint-drift:packages': () => checkEslintDrift({ appsRoot: 'packages', allowlist: [] }),
  'check-turbo-drift': () => checkTurboDrift({ turboPath: 'turbo.json' }),
  'check-package-json-drift': () =>
    checkPackageJsonDrift({ packageJsonPath: 'package.json', projectRoot: '.' }),
  'check-docker-drift': () => checkDockerDrift('.'),
  'lint-review-routing': () => checkReviewRoutingLint(),
  'check-archive-integrity': () => checkArchiveIntegrity('.'),
  'check-memory-dir-concordance': () => checkMemoryDirConcordance({ repoRoot: '.' }),
  'check-agent-memory-drift': () => checkAgentMemoryDrift('.'),
  'check-tooling-typecheck': () => checkToolingTypecheck({ repoRoot: '.' }),
  'check-teeth-registry': () => checkTeethRegistry(),
  'check-self-firing-guard': () => checkSelfFiringGuards(),
  'turbo-redirect-differential': () => checkTurboRedirectDifferential(),
  'check-harness-owner': () => checkHarnessOwner(),
  'check-branch-up-to-date': () => checkBranchUpToDate(),
  'check-e2e-flow-coverage': () => checkE2eFlowCoverage({ repoRoot: '.' }),
  'check-ci-local-e2e': () => checkCiLocalE2e({ repoRoot: '.' }),
};

/**
 * Junta a lista (QUEM, DE ONDE) com os runners (COMO) na ordem do painel.
 *
 * A falha aqui é explícita e nomeia o id: um gate declarado e não rodado
 * some do painel em silêncio, e "parte do painel acima não foi medida" é a
 * forma mais cara de erro silencioso que existe — a linha verde ao lado é
 * indistinguível de um gate que passou.
 */
export function resolverChecks(): Array<{
  name: string;
  file: string;
  fn: () => CheckResult | Promise<CheckResult>;
}> {
  const faltando = idsDeclarados().filter((id) => !(id in RUNNERS));
  if (faltando.length > 0) {
    throw new Error(
      `preflight-gates.ts declara ${faltando.length} gate(s) sem runner em ` +
        `preflight.ts: ${faltando.join(', ')}`,
    );
  }
  return PREFLIGHT_CHECKS.map(({ name, file, id }) => ({
    name,
    file,
    fn: RUNNERS[id] as () => CheckResult | Promise<CheckResult>,
  }));
}

async function main(): Promise<void> {
  console.log('\u{1F50D} Pre-flight CI checks\n');
  const checks = resolverChecks();

  let totalErrors = 0;
  let totalSkipped = 0;
  for (const check of checks) {
    process.stdout.write(`  • ${check.name}... `);
    // As linhas saem nos DOIS ramos, porque é `relatarUmCheck` que decide isso.
    // Um `advisories` sobre um `ok: true` é o caso que mais importa: "verde,
    // mas medido contra uma ref que pode estar velha" é uma ressalva sobre o
    // verde, e um painel que só a lê no ramo vermelho descarta exatamente a
    // afirmação que ela existe para qualificar.
    const relatorio = relatarUmCheck(await check.fn());
    console.log(relatorio.mark);
    for (const linha of relatorio.linhas) {
      console.log(`      ${linha}`);
    }
    if (relatorio.pulou) totalSkipped++;
    totalErrors += relatorio.erros;
  }

  console.log('');
  // O resumo inteiro vem de UM lugar, para que "erro" e "não rodou" possam
  // aparecer juntos. Antes eram duas cadeias `if` e o `process.exit(1)` do
  // primeiro encerrava o processo antes do segundo — ver `resumir`.
  const fechamento = resumir(totalErrors, totalSkipped);
  const [principal, ...resto] = fechamento.linhas;
  console[fechamento.codigo === 1 ? 'error' : 'log'](principal);
  for (const linha of resto) console.log(linha);
  if (fechamento.codigo === 1) process.exit(1);
}

// Gate IIFE: sem isso, importar `formatMark` num teste executa a preflight
// inteira em background — o teste passa, mas o processo paga por uma checagem
// que ele nao pediu. Mesmo padrao de `stack-code-reviewer.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Erro inesperado:', err);
    process.exit(2);
  });
}
