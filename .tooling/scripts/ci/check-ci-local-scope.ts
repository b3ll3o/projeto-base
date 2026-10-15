import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';
import { implementaTask, invocacoesTurboRun } from './check-ci-local-e2e';
import { readWorkspacePackages, type WorkspacePackage } from './check-package-json-drift';

export type { WorkspacePackage };

/**
 * Gate que fecha a classe de G-009: **o escopo do `ci:local` cobre o
 * workspace?**
 *
 * ## O que este gate mede — e o que NÃO mede
 *
 * **Mede:** para cada invocação `turbo run` do `ci:local` que carrega ao menos
 * um `--filter`, que **todo** pacote do workspace que implementa **alguma** das
 * tasks daquela invocação está nomeado por algum filtro. E que o `ci:local`
 * invoca `tooling:test`.
 *
 * **NÃO mede:** que as suítes passem, e que `ci:local` rode o mesmo que o
 * `ci.yml` — a mesma ressalva de `check-ci-local-e2e.ts`, pelo mesmo motivo
 * (parsear YAML de workflow está fora de escopo por decisão registrada).
 *
 * ## Por que `check-package-json-drift` não fechava isto
 *
 * Ele valida a direção oposta: que cada task de `turbo run` esteja
 * implementada por algum pacote **alcançável pelos `--filter`**
 * (`alvoDosFiltros`). Para `ci:local` tudo está implementado e tudo está no
 * escopo → verde. Ele pergunta "a task que você pediu, alguém faz?", e nunca
 * "falta algum pacote que você devia ter pedido?".
 *
 * ## O caso medido que o motivou
 *
 * MEDIDO 2026-10-13 com `turbo run lint typecheck test:unit test:coverage
 * test:integration test:e2e --filter=@projeto/api --filter=@projeto/web
 * --dry=json`: **12 tasks reais**, e `@projeto/shared-types#typecheck` — que
 * existe (`packages/shared-types` declara `typecheck: tsc --noEmit`) — não
 * está entre elas. `pnpm typecheck`, que é o mesmo turbo **sem** filtro, roda.
 * O `ci:local` sai 0 tendo pulado o pacote de tipos.
 *
 * ## Por que a checagem do tooling é uma asserção separada
 *
 * `tooling/scripts` roda `vitest` direto e **não implementa nenhuma task turbo**
 * (medido: `turbo run test:unit --dry=json` lista `@repo/review-router-tooling#
 * test:unit |cmd: <NONEXISTENT>`). A checagem de filtro, por construção, nunca o
 * vê — um pacote sem task não é um pacote que "implementa a task". A direção
 * que fecha essa lacuna é exigir que o comando **contenha** `tooling:test`.
 */
const FILTRO_GLOB = /[*?[\]|!]|\.\.\./;

/** O script que `ci:local` precisa carregar para a suíte do tooling rodar. */
const SCRIPT_DO_TOOLING = 'tooling:test';

export interface EntradaCiLocalScope {
  /** Valor de `scripts['ci:local']` na raiz — `undefined` se ausente. */
  ciLocal: string | undefined;
  /** Pacotes do workspace, com nome e scripts. */
  pacotes: WorkspacePackage[];
}

export interface ResultadoCiLocalScope {
  ok: boolean;
  errors: string[];
  advisories: string[];
  /**
   * O que a reconciliacao mediu, ou `null` quando ela nao chegou a medir nada.
   *
   * `null` e nao `{...: 0}`: um zero aqui seria um numero que nao foi medido, e
   * um numero inventado envelhece sem ninguem perceber.
   */
  medidos: { invocacoes: number; pacotesNoEscopo: number; tarefaDoTooling: boolean } | null;
}

const RESSALVA_LIMITE =
  'medição DECLARATIVA de fiação: este gate lê `package.json` e não roda nenhuma ' +
  'suíte, e NÃO reconcilia com `.github/workflows/ci.yml` — essa classe segue ' +
  'registrada como pendência em ci-defense-in-depth-pendencias.md.';

/**
 * Reconcilia o alcance por `--filter` do `ci:local` contra o que o workspace
 * realmente implementa. Puro: recebe os `package.json` ja lidos.
 */
export function reconciliarEscopoCiLocal(entrada: EntradaCiLocalScope): ResultadoCiLocalScope {
  const errors: string[] = [];
  const advisories: string[] = [];
  const ciLocal = entrada.ciLocal?.trim();

  if (ciLocal === undefined || ciLocal === '') {
    errors.push(
      "script 'ci:local' ausente do package.json raiz — a Camada 1 da convenção " +
        '`ci-defense-in-depth.md` obriga o roda antes do `git push`, e um script ' +
        'inexistente não roda nem o que já rodava.',
    );
    return { ok: false, errors, advisories, medidos: null };
  }

  const invocacoes = invocacoesTurboRun(ciLocal).filter((i) => i.tasks.length > 0);

  // `tarefaDoTooling` é medido sobre o comando INTEIRO, e não sobre uma
  // invocação: `pnpm tooling:test` não é `turbo run` e por isso nunca entra em
  // `invocacoes`. Procurar por `turbo run tooling:test` seria um verde que não
  // mede a coisa alguma.
  const tarefaDoTooling = new RegExp(`(?:^|[|&;\\s])${SCRIPT_DO_TOOLING}(?:\\s|$)`).test(ciLocal);

  for (const invocacao of invocacoes) {
    const globs = invocacao.filtros.filter((f) => FILTRO_GLOB.test(f));
    if (invocacao.filtros.length === 0) {
      // Sem filtro o turbo roda a task em todo pacote — a cobertura é máxima,
      // e é o único formato em que este gate sairia verde sem medir alcance e
      // SEM deixar rastro. O rastro é o ponto.
      advisories.push(
        `a invocação 'turbo run ${invocacao.tasks.join(' ')}' de 'ci:local' não tem ` +
          'nenhum --filter — o alcance fica a cargo do turbo para todos os pacotes, e este ' +
          'gate não mede que todo implementador roda. Nomeie os pacotes para que a ' +
          'asserção valha.',
      );
      continue;
    }
    if (globs.length > 0) {
      advisories.push(
        `'ci:local' filtra por glob (${globs.join(', ')}) — a cobertura de pacotes por ` +
          'filtro é INDETERMINADA, e este gate não afirma que todo implementador é ' +
          'alcançado. Teste com nomes explícitos para que a asserção volte a valer.',
      );
      continue;
    }

    for (const pacote of entrada.pacotes) {
      // `.includes`, e não `startsWith`: `tasks` é lista de nomes exatos, e um
      // prefixo diria que `lint` cobre um pacote que só tem `lint-staged`.
      const tasks = invocacao.tasks.filter((t) => implementaTask(pacote, t));
      if (tasks.length === 0) continue;
      if (invocacao.filtros.includes(pacote.name)) continue;
      errors.push(
        `drift detectado: '${pacote.name}' implementa ${tasks.map((t) => `'${t}'`).join(', ')} ` +
          `mas não está alcançado pelos --filter da invocação 'turbo run ` +
          `${invocacao.tasks.join(' ')}' de 'ci:local' (${invocacao.filtros.join(', ')}) — ` +
          'o turbo sai 0 e a task desse pacote só roda no CI, depois do push.',
      );
    }
  }

  if (!tarefaDoTooling) {
    errors.push(
      `drift detectado: 'ci:local' não invoca '${SCRIPT_DO_TOOLING}' — o tooling roda ` +
        '`vitest` direto e não implementa NENHUMA task turbo, então a checagem de ' +
        '`--filter` acima não consegue enxergá-lo: sem esta linha a suíte do tooling ' +
        'só roda no CI. Acrescente `&& pnpm tooling:test` ao fim do comando.',
    );
  }

  advisories.push(
    `${RESSALVA_LIMITE} Medido agora: ${invocacoes.length} invocação(ões) turbo filtrada(s) ` +
      `em 'ci:local' sobre ${entrada.pacotes.length} pacote(s) do workspace, e ` +
      `'${SCRIPT_DO_TOOLING}' ${tarefaDoTooling ? 'presente' : 'AUSENTE'}.`,
  );

  return {
    ok: errors.length === 0,
    errors,
    advisories,
    medidos: {
      invocacoes: invocacoes.length,
      pacotesNoEscopo: entrada.pacotes.length,
      tarefaDoTooling,
    },
  };
}

/**
 * Casca de I/O. Le o `package.json` raiz e a lista de pacotes do workspace e
 * embrulha o resultado no contrato de `preflight.ts`.
 */
export async function checkCiLocalScope(opts: { repoRoot: string }): Promise<CheckResult> {
  const raiz = resolve(opts.repoRoot);
  const caminhoRaiz = join(raiz, 'package.json');

  let raizLida: { name?: string; scripts?: Record<string, string> };
  try {
    raizLida = JSON.parse(readFileSync(caminhoRaiz, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      errors: [`package.json raiz ilegível em '${caminhoRaiz}': ${err}`],
    };
  }

  const pacotes = await readWorkspacePackages(raiz);
  if (pacotes === null) {
    // A lista vazia e a lista ilegivel nao sao a mesma coisa, e o caller nao tem
    // como distinguir. Sem esta distincao, um workspace ilegivel seria lido
    // como "nenhum pacote implementa task nenhuma" e o gate sairia verde sem ter
    // lido nada.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason:
        'pacotes do workspace não enumeráveis: pnpm-workspace.yaml ausente ou com ' +
        'formato não suportado — o alcance por filtro NÃO foi medido',
    };
  }

  const todos: WorkspacePackage[] = [
    { name: String(raizLida.name ?? ''), dir: '.', scripts: raizLida.scripts ?? {} },
    ...pacotes,
  ];

  const resultado = reconciliarEscopoCiLocal({
    ciLocal: raizLida.scripts?.['ci:local'],
    pacotes: todos,
  });

  return {
    ok: resultado.ok,
    errors: resultado.errors,
    advisories: resultado.advisories,
  };
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-ci-local-scope.ts')) {
  checkCiLocalScope({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
