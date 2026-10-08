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
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { CheckResult } from './check-types';

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
 * As linhas de detalhe que o painel imprime DEPOIS da marca, em qualquer ramo.
 *
 * Deliberadamente **sem** a linha de skip que `linhasDoRelato` inclui: o painel
 * já carrega o motivo na própria marca (`– (skipped: …)`, via `formatMark`), e
 * usar as duas listas aqui imprimiria o motivo duas vezes. São contratos
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
  const motivo = r.skipped && !r.ok ? [`(skipped: ${r.reason ?? 'sem motivo declarado'})`] : [];
  return {
    linhas: [...r.errors, ...(r.advisories ?? []), ...motivo],
    erros: r.errors.length,
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
    mark: result.ok ? formatMark(result) : '✗',
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

async function main(): Promise<void> {
  console.log('\u{1F50D} Pre-flight CI checks\n');
  const checks: Array<{
    name: string;
    /**
     * O ARQUIVO que implementa o gate. Não é decoração: a task 3.2 do plano
     * `guard-classes` reconcilia este array contra o registro de dentes, e
     * contra a matriz de roteamento — e não há como casar um nome de
     * exibição ('Cross-refs em .md versionados') com uma entrada de registro
     * ('`check-doc-refs`') sem o path. Sem este campo, a reconciliação seria
     * por semelhança de nome: exatamente a classe 2 — cobre a forma que você
     * conhece e só ela.
     */
    file: string;
    fn: () => CheckResult | Promise<CheckResult>;
  }> = [
    // F2-T2: escopo = todo `.md` versionado (git ls-files), nao só `docs` +
    // `.agents/specs`. Antes, `AGENTS.md` — o indice que todo agent le
    // primeiro para decidir a quem despachar — ficava fora do gate.
    // `docsRoots` é o fallback (walk) caso o git não esteja disponível.
    {
      name: 'Cross-refs em .md versionados',
      file: '.tooling/scripts/ci/check-doc-refs.ts',
      fn: () => checkDocRefs({ docsRoot: '.', docsRoots: ['docs', '.agents/specs'] }),
    },
    {
      name: 'tsconfig drift (strict, noUncheckedIndexedAccess)',
      file: '.tooling/scripts/ci/check-tsconfig-drift.ts',
      fn: () =>
        checkTsconfigDrift({
          tsconfigsRoot: '.',
          consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
        }),
    },
    {
      name: 'ESLint config drift (apps)',
      file: '.tooling/scripts/ci/check-eslint-drift.ts',
      fn: () => checkEslintDrift({ appsRoot: 'apps', allowlist: [] }),
    },
    {
      name: 'ESLint config drift (packages)',
      file: '.tooling/scripts/ci/check-eslint-drift.ts',
      fn: () => checkEslintDrift({ appsRoot: 'packages', allowlist: [] }),
    },
    {
      name: 'turbo.json drift (pipeline canônico)',
      file: '.tooling/scripts/ci/check-turbo-drift.ts',
      fn: () => checkTurboDrift({ turboPath: 'turbo.json' }),
    },
    {
      name: 'package.json drift (scripts canônicos + fantasmas)',
      file: '.tooling/scripts/ci/check-package-json-drift.ts',
      fn: () => checkPackageJsonDrift({ packageJsonPath: 'package.json', projectRoot: '.' }),
    },
    {
      name: 'docker drift (.dockerignore + Dockerfile size/base)',
      file: '.tooling/scripts/ci/check-docker-drift.ts',
      fn: () => checkDockerDrift('.'),
    },
    {
      name: 'review-routing matrix lint (YAML + LOC + reviewer refs)',
      file: 'tooling/scripts/lint-review-routing.ts',
      fn: () => checkReviewRoutingLint(),
    },
    {
      name: 'archive integrity (.agents/runs/archive/*.md frontmatter canônico)',
      file: '.tooling/scripts/ci/check-archive-integrity.ts',
      fn: () => checkArchiveIntegrity('.'),
    },
    {
      // Task 1.3 do plano guard-classes. Fecha a divergência que reinava em
      // silêncio: o destino da retrospectiva já foi declarado 10 vezes, em 7
      // arquivos, em 6 notações — uma delas um `test -f` executável com path
      // de máquina, falso em toda máquina.
      name: 'destino da retrospectiva (fonte única, sem 2ª declaração)',
      file: '.tooling/scripts/ci/check-memory-dir-concordance.ts',
      fn: () => checkMemoryDirConcordance({ repoRoot: '.' }),
    },
    {
      // Issue #47. Fecha a classe 1 que a própria tabela de guard nomeia:
      // `evolucao-agents.md` obriga a atualizar "o agent E sua memória" após
      // mudança de comportamento, e nenhum gate media o par. O caso medido foi
      // o próprio `doc-sync`, que virou report-only com a memória intocada
      // desde 2026-09-22.
      //
      // O gate distingue comportamento de correção de path de propósito: no
      // mesmo commit, `nestjs-specialist` e `stack-code-reviewer` só
      // corrigiram `../../../docs/adr/` → `../../docs/adr/`, delta zero.
      // Acusar os três ensinaria o autor a atualizar memória por ruído.
      name: 'drift agent↔memória (comportamento novo com memória intocada)',
      file: '.tooling/scripts/ci/check-agent-memory-drift.ts',
      fn: () => checkAgentMemoryDrift('.'),
    },
    {
      // Issue #46. `.tooling/` decide se o CI passa, e era a única superfície do
      // repo sem typecheck: `pnpm typecheck` é `turbo run typecheck`, que só
      // alcança workspaces declarados. O gate executa o `tsc` sobre o tsconfig
      // desta própria árvore — que inclui este arquivo.
      name: 'typecheck tooling (.tooling/)',
      file: '.tooling/scripts/ci/check-tooling-typecheck.ts',
      fn: () => checkToolingTypecheck({ repoRoot: '.' }),
    },
    {
      // Task 3.2 do plano guard-classes. Reconcilia o registro de dentes com
      // o preflight E com a matriz de roteamento. Sem ele, o registro
      // envelhece em silêncio e um gate pode morar num diretório que nenhuma
      // `path_glob` alcança — classe 1, condição inalcançável: todo mundo
      // vê verde e nenhuma revisão é despachada.
      name: 'registro de dentes (registro ↔ preflight ↔ roteamento)',
      file: '.tooling/scripts/ci/check-teeth-registry.ts',
      fn: () => checkTeethRegistry(),
    },
    {
      // Task 3.3 do plano guard-classes. Classe 3 — o guard que dispara em
      // si mesmo. Não pergunta se o guard está verde: pergunta se a isenção
      // que o impede de se acusar está pagando pelo trabalho que declara.
      // Um 0 → 0 aqui significa isenção inerte, e a próxima mudança de padrão
      // a transforma num catch que engole o que vier.
      name: 'classe 3 (guard que dispara em si mesmo)',
      file: '.tooling/scripts/ci/check-self-firing-guard.ts',
      fn: () => checkSelfFiringGuards(),
    },
    {
      // Task 4.1 do plano guard-classes. O `turbo-redirect-differential.sh`
      // era o único instrumento do diretório sem dono. Entrou pelo preflight
      // — e não pelo `ci:local` — porque o CI roda `ci:preflight` e nunca
      // roda `ci:local`.
      //
      // O `file` é o `.sh` de propósito: é o próprio harness que ganha dono,
      // e não um wrapper. Ver a nota em `checkTurboRedirectDifferential`.
      name: 'turbo: differential parser × turbo real',
      file: '.tooling/scripts/ci/turbo-redirect-differential.sh',
      fn: () => checkTurboRedirectDifferential(),
    },
    {
      // Task 3.4 do plano guard-classes. Controle desligado: (a) todo
      // harness é invocado por algo, (b) todo destino declarado tem guard
      // ligado. Nasceu VERMELHO em 3.4 — nomeando o differential sem dono —
      // e só entra aqui em 4.1, quando esse dono existe. Registrá-lo antes
      // teria tornado todo push impossível por causa de uma dívida conhecida.
      name: 'controle desligado (harness órfão + destino sem guard)',
      file: '.tooling/scripts/ci/check-harness-owner.ts',
      fn: () => checkHarnessOwner(),
    },
    {
      // Regra de `git-workflow.md`: demanda implementada com a main
      // desatualizada é rebaseada na main atualizada. Entrei pelo preflight e
      // não pelo `ci:local` pelo mesmo motivo do differential acima — o CI
      // roda `ci:preflight`, e uma regra que só roda na máquina de quem a
      // escreveu não é uma regra do repo.
      //
      // `skipped` quando `origin/main` não existe: aí não há o que medir, e
      // um verde aqui afirmaria que a demanda contém a main atual sem ter
      // perguntado a ninguém.
      name: 'demanda rebaseda na main atual (regra de rebase)',
      file: '.tooling/scripts/ci/check-branch-up-to-date.ts',
      fn: () => checkBranchUpToDate(),
    },
  ];

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
  if (totalErrors > 0) {
    console.error(`❌ ${totalErrors} erro(s) encontrado(s). Corrigir antes de push.`);
    process.exit(1);
  }
  // O resumo repete a mesma regra do painel: um check que não rodou não pode
  // ser somado como se tivesse passado.
  if (totalSkipped > 0) {
    console.log(
      `⚠ ${totalErrors} erro(s); ${totalSkipped} check(s) não rodaram (skipped) — ` +
        `ver as marcas acima. "Todos passaram" seria mentira enquanto houver skip.`,
    );
    return;
  }
  console.log('✓ Todos os checks passaram.');
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
