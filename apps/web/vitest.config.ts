// apps/web/vitest.config.ts
//
// Regra de cobertura mínima: 80% agregado em todas as quatro métricas
// (lines, functions, branches, statements) — ver
// .agents/specs/conventions/cobertura-testes.md.
//
// STATUS ATUAL (re-medido em 2026-10-08, `npx vitest run --coverage` a
// partir de apps/web): **99,70% statements · 93,54% branches · 100%
// functions · 99,70% lines**, em 10 arquivos / 84 testes. O gate de 80% está
// LIGADO e passa.
//
// Este número é uma FOTOGRAFIA, não uma constante: ele muda a cada teste e a
// cada arquivo novo. Re-meça antes de citá-lo em qualquer lugar.
//
// De onde veio o número (antes era 72,83% com o gate desligado):
//  - os 4 arquivos de telemetria na raiz do app (`instrumentation.ts`,
//    `instrumentation.node.ts`, `instrumentation-client.ts` e o stub
//    `instrumentation.edge.ts`) estavam em 0% — nenhum exercitado;
//  - `src/telemetry/web-vitals-reporter.tsx` contava 72,72% de statements e
//    0% de funções, porque FID e TTFB nunca eram invocados e o NOME do
//    histogram — que é o contrato inteiro do módulo — não era conferido;
//  - `app/**` estava excluído da cobertura, o que tirava do relatório a
//    Server Action `actions.ts` e o `state.ts` (ver a nota do `exclude`).
//
// ⚠️ pt-BR (2026-10-08): o número acima é o MESMO de 2026-10-06 depois de
// passar por uma quebra no meio do caminho. Ao entrar a suíte Playwright, o
// agregado caiu para **38,88%** — o harness (`e2e/global-setup.ts`,
// `e2e/global-teardown.ts` e os cinco arquivos de `e2e/support/`) entrou no
// denominador a 0%, porque nenhum deles é carregado pelo Vitest e nenhum pode
// ser. Sete arquivos de infraestrutura de teste derrubando o gate de produção
// é a classe do "verde/vermelho pelo motivo errado": o número estava
// descrevendo testes, não código. Corrigido com `'e2e/**'` no `exclude`
// (ver a nota dele). O 99,70% voltou — e o fato de voltar ao centésimo é o que
// diz que nada mais se moveu.
//
// Ressalvas honestas sobre o número:
//  - `instrumentation.edge.ts` segue em 0% de statements: é um `export {}`,
//    um stub deliberado para satisfazer o import do shim. Não há comportamento
//    a testar ali, e um teste que afirma `export {}` não faz nada seria teatro.
//  - `app/**/*.tsx` e `app/api/**` continuam fora da cobertura: são páginas
//    RSC e route handlers sem teste unitário — mas que JÁ TÊM e2e de browser,
//    em outro processo. São 5 arquivos de 0% que não entram no agregado; o
//    número com eles dentro é **77,24%** (re-medido 2026-10-08, removendo as
//    duas linhas do `exclude`), com o gate estourando em `lines`, `functions` e
//    `statements`. A decisão de manter a exclusão, e o motivo novo, estão na
//    nota do `exclude`.
//  - `state.ts` está em 50% de branch (linha 45) e `actions.ts` em 91,66%
//    (linhas 81-82). São os dois pontos Known-open mais honestos que restam.
//  - O harness e2e está a 0% e EXCLUÍDO de propósito — ele é exercitado pela
//    suíte `test:e2e`, que é o registro dele.
//
// Por que report-only não é o estado: a regra global exige 80% declarado no
// config raiz, e há um teste no apps/api (`test/config/coverage-floor.spec.ts`)
// que confere o teto. Desligar o número aqui seria o mesmo green-por-ausência
// que a classe 3 descreve — agora com um teto escrito e não medido.
//
// Exclusões canônicas e por quê:
//   - app/**/*.tsx, app/api/** → páginas RSC + route handlers; testadas via
//     E2E em fase posterior (Playwright). Estreitadas a partir de `app/**`
//     inteiro justamente para que `actions.ts` e `state.ts` passem a contar.
//   - next-env.d.ts → gerado pelo Next.js, não editado.
//   - **/*.spec.{ts,tsx} → arquivos de teste não contam como código de
//     produção.
//   - **/.next/** → build output do framework Next.js (ver nota no array).

import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // pt-BR (2026-10-06): a tela de cadastro introduces o PRIMEIRO
    // Client Component com DOM do app, e a primeira Server Action com
    // I/O. O glob anterior só enxergava `components/**/*.spec.ts`, que
    // não casa um spec em `.tsx` (o `.tsx` só aparecia sob `src/`, por
    // causa do glob do web-vitals). Sem estes dois globs, os testes da
    // tela de cadastro seriam silenciosamente NÃO EXECUTADOS — o Vitest
    // não falha por arquivo não coletado, ele apenas roda menos. É o
    // mesmo modo de falha de "gate que casa vazio": o verde sem ter
    // testado nada.
    include: [
      'lib/**/*.spec.ts',
      'components/**/*.spec.ts',
      // pt-BR: spec de Client Component (renderiza DOM, precisa de
      // `// @vitest-environment jsdom` no topo do arquivo).
      'components/**/*.spec.tsx',
      // pt-BR: a Server Action mora em `app/users/novo/actions.ts`. O
      // `app/**` continua excluído da COBERTURA (decisão de diseño
      // acima, inalterada) — aqui é só `include` de descoberta.
      'app/**/*.spec.ts',
      // pt-BR: Task 4.1 (plano telemetria) introduziu o reporter de
      // Web Vitals sob `src/telemetry/`. Client Components ficam fora
      // de `lib/` (utilities puras) e `components/` (UI), então
      // estendemos o glob para cobrir o diretório novo sem precisar
      // renomear caminhos.
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      // pt-BR: os arquivos de convenção do Next.js moram na RAIZ do app
      // (`instrumentation{,.node,.client}.spec.ts`). Sem este glob o spec era
      // escrito, o `vitest run` a partir de apps/web devolvia "No test files
      // found" e o `ci:local` rodava ZERO spec da raiz — medido 2026-10-06
      // comentando só esta linha: 6 arquivos / 59 testes, contra 10 / 84 com
      // ela. (O número envelhece a cada teste novo; o que não envelhece é o
      // par arquivos/testes, que é o que mostra os specs sumindo.) É o
      // green-por-ausência da classe 3, e o lugar onde ele reaparece é
      // SEMPRE um diretório novo sem glob correspondente.
      //
      // `*.spec.ts` casa SÓ a raiz: um subdiretório novo continua precisando
      // de glob. Para isso existe `vitest-include.spec.ts`, que compara os
      // specs em disco com os globs e falha nomeando o órfão. Mutação
      // verificada: um spec em `src2/` (sem glob) faz o guard acusar
      // `src2/orfa.spec.ts` enquanto o vitest sozinho contava 84 testes,
      // os mesmos de antes.
      '*.spec.ts',
      // pt-BR: o harness e2e tem uma parte que é LÓGICA PURA de arquivos, e ela
      // precisa de spec — `abrirSaidaEmArquivo` decide para onde vai o stdout
      // dos processos que a suíte sobe (ver `e2e/support/saida.ts`). O glob é
      // `e2e/support/**` e não `e2e/**` DE PROPÓSITO: os specs `e2e/f*.spec.ts`
      // são coletados pelo Playwright (`testDir`), e trazê-los para o Vitest faria
      // o mesmo arquivo ser executado pelos dois runners.
      //
      // ⚠️ Sem este glob nada acusaria a ausência: o spec simplesmente não roda,
      // e o Vitest não falha por arquivo não coletado — é a classe 3 do
      // `guard-classes.md`. `vitest-include.spec.ts` não cobre o caso porque `e2e`
      // está no `IGNORAR` dele (o motivo está no próprio arquivo).
      'e2e/support/**/*.spec.ts',
    ],
    // pt-BR: matcher do Testing Library (`toBeInTheDocument`, `toHaveValue`…).
    // Carregado só nos specs que declaram ambiente DOM, mas é global —
    // não custa nada nos de `node`.
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // pt-BR (2026-10-06): o gate voltou a 80% nas quatro métricas. Ele
      // havia sido desligado (0) porque o agregado era 72,83% e o número
      // estava sendo escrito à mão em vez de medido. Medido: 99,70 / 93,54 /
      // 100 / 99,70. Religar não é enfeite — é o que impede a cobertura de
      // voltar a cair em silêncio quando alguém abrir um arquivo novo sem
      // teste.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      exclude: [
        // pt-BR: os defaults do Vitest vêm PRIMEIROS — o array do usuário
        // SUBSTITUI a lista default em vez de mesclar (shallow spread em
        // `dist/coverage.js`). Perder o spread remove `**/[.]**`, que é o
        // que segura o `.next/`, e o glob default de test/spec, que é o
        // que segura arquivos `.spec.tsx`.
        //
        // Os três globs deste array se cobrem dois a dois: cada um sozinho
        // já segura o `.next/` e os specs, e o relatório só regride
        // quando o par responsável cai junto. Medido em `apps/web`
        // (2026-10-06, lista final como base; cada linha é "comentar a
        // linha X do `exclude`, rodar `npx vitest run --coverage`, ler
        // `coverage/coverage-summary.json`"):
        //
        //   este config .......................... 10 arquivos / 99.70%
        //   sem `**/.next/**` .................... 10 arquivos / 99.70%
        //   sem o spread ........................ 10 arquivos / 99.70%
        //   sem os dois ......................... ~500 arquivos / ~0.8%
        //
        // E a pior variante, sem o spread mas com o glob antigo
        // `**/*.spec.ts`: o `.spec.tsx` entra como 100% coberto e a
        // cobertura **sobe** para 99.82% (12 arquivos). O número de
        // arquivos é que denuncia: 12 em vez de 10, e a cobertura subiu
        // sem teste novo.
        //
        // **A quarta linha é uma CLASSE, não um número, e não deve ser
        // transcrita.** Ela mede o build output do Next que existe na
        // máquina, e — este é o ponto — **a própria medição escreve dentro
        // do objeto medido**: com as exclusões fora, o `vitest run` grava
        // `*.hot-update.js` e `page_client-reference-manifest.js` em
        // `.next/`, que é exatamente o diretório que entra no relatório.
        // MEDIDO 2026-10-06, uma única rodada: `.next` 1181 → 1184
        // arquivos, e o relatório subiu de 378 para 527 arquivos entre
        // rodadas na mesma sessão. Não há valor corrigível: a tabela só
        // fica estável com `.next` limpo e congelado
        // (`rm -rf apps/web/.next` antes de medir), e é por isso que as
        // três primeiras linhas — que não entram em `.next` — repetem
        // exatamente em qualquer máquina.
        //
        // A tabela anterior (6/47.24%, 73/12.07%, 7/55.92%) deixou de
        // bater sem que nada nesta lista mudasse: os números eram de outra
        // árvore. Cobertura que melhora sem teste novo é config quebrada,
        // não progresso — conferir sempre o número de arquivos, e lembrar
        // que `find apps/web/.next -type f | wc -l` é o que move a
        // quarta linha.
        ...coverageConfigDefaults.exclude,
        // pt-BR: `**/.next/**` é REDUNDANTE dado o spread (medido: sem esta
        // linha o relatório é byte-a-byte idêntico), mas fica aqui de
        // propósito — ao contrário do `**/dist/**` do apps/api, que foi
        // removido por ser redundante. A diferença: lá o default traz
        // `dist/**` literal, óbvio; aqui a proteção vem de `**/[.]**`, um
        // catch-all de dotfiles que ninguém associaria a `.next`. Declarar
        // de forma explícita documenta a intenção em vez de confiar num
        // efeito colateral de glob.
        '**/.next/**',
        // pt-BR (2026-10-06): `app/**` inteiro saía da cobertura — e com
        // ele `app/users/novo/actions.ts`, a Server Action, a 13 testes que
        // rodavam sem que a cobertura deles contasse para nada. Medido ao
        // reverter a exclusão larga: `actions.ts` está em 100% de statements
        // e funções, e `state.ts` em 100%/50% de branch. O que é 0% DE VERDADE
        // em `app/` são as páginas RSC (`layout.tsx`, `page.tsx`,
        // `users/page.tsx`, `users/novo/page.tsx`) e o route handler de
        // health — 5 arquivos que nenhum teste toca.
        //
        // A exclusão foi estreitada para esses 5, e não removida: o agregado
        // medido com `app/**` inteiro dentro é 77.24% (medido 2026-10-06),
        // abaixo do teto de 80%. Não é o número que importa — é que ele
        // contava 5 páginas RSC como 0% e puxava a média junto com o resto.
        //
        // pt-BR (2026-10-08) — a promessa desta linha foi cumprida e a revisão
        // foi feita. Já existe teste de página: a suíte Playwright em `e2e/`,
        // regida por `.agents/specs/conventions/e2e-playwright.md`. Removendo
        // as duas linhas agora, o agregado cai para **77.24% em statements e
        // linhas, 77.27% em functions** — o gate estoura nas três. Os 5
        // arquivos entram como 0%: `layout.tsx`, `app/page.tsx`,
        // `users/page.tsx`, `users/novo/page.tsx` e `api/health/route.ts`.
        //
        // O número reproduz o de 2026-10-06 ao centésimo, e essa coincidência
        // é a informação: prova que o harness e2e (excluído logo abaixo) NÃO
        // desloca o denominador. Medir de novo era o que separava "o aggregate
        // mexeu por causa da suíte nova" de "ele mexeu por causa da exclusão
        // que eu estava avaliando" — e são coisas diferentes.
        //
        // A exclusão fica, e o motivo mudou: não é mais "esperando o teste
        // existir". É que o teste existe e mora em OUTRA CAMADA. O Vitest unit
        // mede o que o unit exercita; as páginas RSC são exercitadas pelo
        // browser, no processo `test:e2e`, cujo denominador é o do Playwright.
        // Deixar a página entrar aqui não seria mais métrica honesta — seria o
        // mesmo arquivo contado duas vezes, uma delas sempre a zero.
        'app/**/*.tsx',
        'app/api/**',
        'next-env.d.ts',
        // pt-BR (2026-10-08): o harness e2e do Playwright é infraestrutura de
        // TESTE, não código de produção — o mesmo papel de `test/` no apps/api,
        // que já é excluído lá por `'**/test/**'`. Sem esta linha o gate do
        // unit fica vermelho por causa dos testes: medido 99,70% → **38,88%**
        // em linhas, com `global-setup.ts`, `global-teardown.ts` e os cinco
        // arquivos de `support/` entrando a 0% (nenhum é carregado pelo Vitest,
        // e nenhum pode ser — sobem processos e containers).
        //
        // O `**/*.spec.{ts,tsx}` abaixo já pegava os specs de dentro de `e2e/`;
        // o que faltava era o resto do diretório. `e2e/**` pega os dois.
        //
        // Isto NÃO é a exclusão do `app/**/*.tsx` acima, que esconde páginas RSC
        // sem cobertura: aqui o arquivo é exercitado de verdade — pela suíte
        // `test:e2e`, que é a outra camada. O denominador do unit mede o que o
        // unit exercita, e ele não exercita o harness.
        'e2e/**',
        'playwright.config.*',
        // pt-BR: `{ts,tsx}` e não só `.ts` — o app tem testes de Client
        // Component (`src/telemetry/web-vitals-reporter.spec.tsx`) e um glob
        // `**/*.spec.ts` não os casa. Com o spread presente a troca é
        // inócua (byte-a-byte idêntica); ela existe para que a lista
        // explícita não dependa do default. Medido 2026-10-06: sem o
        // spread, o glob antigo deixa o relatório em 12 arquivos /
        // 99.82% — dois arquivos a mais e cobertura ACIMA da real, porque
        // o `.spec.tsx` entra como 100% coberto sem nenhum teste seu.
        '**/*.spec.{ts,tsx}',
        // pt-BR: configs Next.js e ferramentas — type declarations, sem
        // lógica de produção a ser exercitada por testes unitários.
        'next.config.*',
        'tailwind.config.*',
        'postcss.config.*',
        '.eslintrc.*',
        'eslint.config.*',
        'vitest.config.ts',
      ],
    },
  },
  // pt-BR (2026-10-06): o tsconfig do app declara `jsx: "preserve"`, que é
  // o correto para o Next — quem compila JSX é o compilador dele. Mas o
  // Vitest usa o esbuild, e com `preserve` ele volta ao transform CLÁSSICO,
  // que exige `React` no escopo de cada arquivo: o sintoma é
  // `ReferenceError: React is not defined` em TODO spec `.tsx`, com o teste
  // morrendo no `render` e não no que ele deveria verificar.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      // pt-BR (2026-10-06): o alias `@/` é o que o Next resolve em runtime
      // (tsconfig `paths`), e todo import dentro de `app/` e `components/`
      // o usa. Sem espelhá-lo aqui, QUALQUER spec que importe um módulo do
      // app morre em "Failed to load url @/lib/..." — e o sintoma é o teste
      // inteiro sumindo, não um erro de import legível. A lista de aliases
      // tem de ser derivada do mesmo `paths` do tsconfig, senão as duas
      // resoluções divergem em silêncio.
      '@': new URL('.', import.meta.url).pathname,
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
});
