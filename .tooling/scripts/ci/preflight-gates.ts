/**
 * SEM shebang, de propósito. `check-harness-owner.ts` classifica como harness
 * qualquer arquivo de `.tooling/scripts/ci/` que não comece com `check-`, não
 * termine em `.spec.ts` e tenha shebang — e este módulo não é executado por
 * ninguém: ele é importado pelo `preflight.ts` e pelo `check-teeth-registry.ts`.
 * MEDIDO 2026-10-08: com `#!/usr/bin/env tsx` no topo, `check-harness-owner`
 * acusou este arquivo de HARNESS ÓRFÃO. O guard estava certo — a linha estava
 * errada.
 */
/**
 * A lista de gates do preflight — FONTE ÚNICA, e só dados.
 *
 * Este array vivia dentro de `main()` em `preflight.ts`, não era exportado, e o
 * `check-teeth-registry.ts` reconciliava o registro de dentes contra um LITERAL
 * seu (`PREFLIGHT_GATES`), transcrito à mão. MEDIDO 2026-10-06: inserido um
 * gate fantasma em `preflight.ts`, o preflight imprimiu `✓` e o reconciliador
 * devolveu `EXIT=0` — gate novo rodava sem obrigação nenhuma de entrar no
 * registro, e gate removido de `checks` continuava "registrado".
 *
 * Extrair o array fecha essa direção. A outra fica verificável em vez de
 * herdada: `PREFLIGHT_GATES` abaixo é DERIVADO desta lista, e o
 * `preflight-gates.spec.ts` mede isso mutando a lista — um literal passa em
 * qualquer teste de igualdade e falha nesse.
 *
 * **Por que só dados, e por que este módulo não importa gate nenhum.** O
 * `preflight.ts` e o `check-teeth-registry.ts` precisam da mesma informação, e
 * um módulo que guardasse também a FUNÇÃO criaria um ciclo entre os dois
 * (`preflight-gates` → `check-teeth-registry` → `preflight-gates`). A divisão
 * é: aqui mora QUEM roda e DE ONDE (`id`, `name`, `file`); no `preflight.ts`
 * mora COMO (`RUNNERS`, o mapa `id` → função, com os argumentos de cada
 * chamada). O par é fechado por `idsDeclarados()`, testado no spec.
 */

/** Um gate do preflight: identidade e origem, nunca a função. */
export interface CheckSpec {
  /** Identificador estável da entrada. Chave do mapa `RUNNERS`. */
  id: string;
  /**
   * Nome de exibição, para o olho humano. NÃO é a chave de reconciliação:
   * `tsconfig drift (strict, noUncheckedIndexedAccess)` no painel não casa
   * com `` `check-tsconfig-drift` `` no registro, e casar por semelhança
   * seria a classe 2 do `guard-classes.md`.
   */
  name: string;
  /**
   * Path repo-relative do arquivo que implementa o gate. ESTA é a chave da
   * reconciliação — `check-eslint-drift` entra duas vezes (uma por app) e o
   * que distingue as duas entradas é o par (`name`, `file`), não o `file`
   * sozinho.
   */
  file: string;
}

/** Um gate como o reconciliador o consome. */
export interface GateRef {
  name: string;
  file: string;
}

export const PREFLIGHT_CHECKS: CheckSpec[] = [
  // F2-T2: escopo = todo `.md` versionado (git ls-files), nao só `docs` +
  // `.agents/specs`. Antes, `AGENTS.md` — o indice que todo agent le
  // primeiro para decidir a quem despachar — ficava fora do gate.
  // `docsRoots` é o fallback (walk) caso o git não esteja disponível.
  {
    name: 'Cross-refs em .md versionados',
    file: '.tooling/scripts/ci/check-doc-refs.ts',
    id: 'check-doc-refs',
  },
  {
    name: 'tsconfig drift (strict, noUncheckedIndexedAccess)',
    file: '.tooling/scripts/ci/check-tsconfig-drift.ts',
    id: 'check-tsconfig-drift',
  },
  {
    name: 'ESLint config drift (apps)',
    file: '.tooling/scripts/ci/check-eslint-drift.ts',
    id: 'check-eslint-drift:apps',
  },
  {
    name: 'ESLint config drift (packages)',
    file: '.tooling/scripts/ci/check-eslint-drift.ts',
    id: 'check-eslint-drift:packages',
  },
  {
    name: 'turbo.json drift (pipeline canônico)',
    file: '.tooling/scripts/ci/check-turbo-drift.ts',
    id: 'check-turbo-drift',
  },
  {
    name: 'package.json drift (scripts canônicos + fantasmas)',
    file: '.tooling/scripts/ci/check-package-json-drift.ts',
    id: 'check-package-json-drift',
  },
  {
    name: 'docker drift (.dockerignore + Dockerfile size/base)',
    file: '.tooling/scripts/ci/check-docker-drift.ts',
    id: 'check-docker-drift',
  },
  {
    name: 'review-routing matrix lint (YAML + LOC + reviewer refs)',
    file: 'tooling/scripts/lint-review-routing.ts',
    id: 'lint-review-routing',
  },
  {
    name: 'archive integrity (.agents/runs/archive/*.md frontmatter canônico)',
    file: '.tooling/scripts/ci/check-archive-integrity.ts',
    id: 'check-archive-integrity',
  },
  {
    // Task 1.3 do plano guard-classes. Fecha a divergência que reinava em
    // silêncio: o destino da retrospectiva já foi declarado 10 vezes, em 7
    // arquivos, em 6 notações — uma delas um `test -f` executável com path
    // de máquina, falso em toda máquina.
    name: 'destino da retrospectiva (fonte única, sem 2ª declaração)',
    file: '.tooling/scripts/ci/check-memory-dir-concordance.ts',
    id: 'check-memory-dir-concordance',
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
    id: 'check-agent-memory-drift',
  },
  {
    // Issue #46. `.tooling/` decide se o CI passa, e era a única superfície do
    // repo sem typecheck: `pnpm typecheck` é `turbo run typecheck`, que só
    // alcança workspaces declarados. O gate executa o `tsc` sobre o tsconfig
    // desta própria árvore — que inclui este arquivo.
    name: 'typecheck tooling (.tooling/)',
    file: '.tooling/scripts/ci/check-tooling-typecheck.ts',
    id: 'check-tooling-typecheck',
  },
  {
    // Task 3.2 do plano guard-classes. Reconcilia o registro de dentes com
    // o preflight E com a matriz de roteamento. Sem ele, o registro
    // envelhece em silêncio e um gate pode morar num diretório que nenhuma
    // `path_glob` alcança — classe 1, condição inalcançável: todo mundo
    // vê verde e nenhuma revisão é despachada.
    name: 'registro de dentes (registro ↔ preflight ↔ roteamento)',
    file: '.tooling/scripts/ci/check-teeth-registry.ts',
    id: 'check-teeth-registry',
  },
  {
    // Task 3.3 do plano guard-classes. Classe 3 — o guard que dispara em
    // si mesmo. Não pergunta se o guard está verde: pergunta se a isenção
    // que o impede de se acusar está pagando pelo trabalho que declara.
    // Um 0 → 0 aqui significa isenção inerte, e a próxima mudança de padrão
    // a transforma num catch que engole o que vier.
    name: 'classe 3 (guard que dispara em si mesmo)',
    file: '.tooling/scripts/ci/check-self-firing-guard.ts',
    id: 'check-self-firing-guard',
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
    id: 'turbo-redirect-differential',
  },
  {
    // Task 3.4 do plano guard-classes. Controle desligado: (a) todo
    // harness é invocado por algo, (b) todo destino declarado tem guard
    // ligado. Nasceu VERMELHO em 3.4 — nomeando o differential sem dono —
    // e só entra aqui em 4.1, quando esse dono existe. Registrá-lo antes
    // teria tornado todo push impossível por causa de uma dívida conhecida.
    name: 'controle desligado (harness órfão + destino sem guard)',
    file: '.tooling/scripts/ci/check-harness-owner.ts',
    id: 'check-harness-owner',
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
    id: 'check-branch-up-to-date',
  },
  {
    // Regra de `e2e-playwright.md`: todo fluxo mapeado tem spec e todo spec
    // pertence a um fluxo mapeado. Entra pelo preflight — e não pelo
    // `ci:local` — pelo mesmo motivo do rebase: o CI roda `ci:preflight`.
    //
    // O que ele mede é PARIDADE DECLARATIVA entre o inventário da convenção e
    // os cabeçalhos `// FLUXO:` dos specs. Que os testes PASSEM é outra
    // camada (`test:e2e` no job `quality`), e confundir as duas é como um
    // gate passa a afirmar verde sobre algo que não mediu.
    name: 'inventário de fluxos ⇄ specs e2e (regra de cobertura e2e)',
    file: '.tooling/scripts/ci/check-e2e-flow-coverage.ts',
    id: 'check-e2e-flow-coverage',
  },
  {
    // A Camada 1 da convenção promete que `ci:local` roda as suítes e2e antes
    // do push, e o script é a única coisa que decide se cumpre. O gate entra
    // pelo preflight, e não pelo `ci:local`, pelo mesmo motivo do gate de e2e:
    // o CI roda `ci:preflight`.
    name: 'ci:local roda as suítes e2e (regra da Camada 1)',
    file: '.tooling/scripts/ci/check-ci-local-e2e.ts',
    id: 'check-ci-local-e2e',
  },
];

/**
 * A mesma lista, na forma que o reconciliador consome — derivada, nunca escrita
 * à mão: um literal aqui reabriria exatamente o furo que este módulo existe
 * para fechar.
 *
 * **Função, e não constante, e isso não é estilo.** MEDIDO 2026-10-08:
 * exportar `const PREFLIGHT_GATES = PREFLIGHT_CHECKS.map(...)` faz o
 * `preflight-gates.spec.ts` ficar VERMELHO com "expected 17 to be 18" — o
 * derivado foi avaliado uma vez, no carregamento do módulo, e a lista mudou
 * depois. O teste existe para mutar a lista; com constante ele mede um retrato.
 * Isso é a mesma armadilha do factory de `vi.mock` avaliado uma vez por
 * arquivo: o cache é a coisa, e ele é invisível.
 */
export function preflightGates(): GateRef[] {
  return PREFLIGHT_CHECKS.map(({ name, file }) => ({ name, file }));
}

/**
 * Os `id` declarados, para o `preflight.ts` fechar o par com `RUNNERS`.
 *
 * Função, e não constante exportada, pelo mesmo motivo de `preflightGates()`:
 * um array derivado que qualquer importador pode mutar é um array que alguém
 * muta.
 */
export function idsDeclarados(): string[] {
  return PREFLIGHT_CHECKS.map((c) => c.id);
}
