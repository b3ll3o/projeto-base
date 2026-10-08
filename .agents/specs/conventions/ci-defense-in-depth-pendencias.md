# Pendências conhecidas — CI Defense in Depth

> Companion de [`ci-defense-in-depth.md`](./ci-defense-in-depth.md). Sub-spec
> indexada no [§6 do AGENTS.md](../../../AGENTS.md) e no
> [README das convenções](./README.md). pt-BR prose, English technical
> identifiers.
>
> **Por que este arquivo existe:** a convenção está no teto de
> [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) (300 linhas) e pendência
> cresce a cada gate novo. Deixá-las no corpo do documento da convenção
> significa que registrar um item novo exige podar outro — e o item podado é
> sempre o que ninguém está olhando. Aqui pendência cresce sem custar
> conteúdo.
>
> Um item só entra aqui **medido**: o comando, a data e o número. Pendência
> sem comando é opinião, e opinião envelhece sem aviso.

## Pendências conhecidas

- **FECHADO 2026-10-08 — o painel lia `ok` e `errors` para decisões
  diferentes.** `relatarUmCheck` tirava a **marca** de `result.ok` e a
  **contagem** de `errors.length`; `ok` e `errors` são independentes por
  contrato `CheckResult`. MEDIDO: com `{ ok: true, errors: ['pacote de e2e
  fora dos --filter'] }` a linha saía **VERDE**, os erros eram contados e o
  processo saía 1 — o build reprovava com uma linha verde na tela, que é a
  pior leitura possível porque o token de sucesso é o primeiro que o olho pega.
  O outro lado da classe: `{ ok: false, errors: [] }` imprimia `✗` e saía **0**.
  Hoje **inalcançável** (`grep -rn "ok: errors.length === 0"
  .tooling/scripts/ci/*.ts` → 11 ocorrências; todo gate deriva `ok` de
  `errors.length`), o que é exatamente por que era um furo: nada media se os
  dois concordam. Agora `falhou(r) = r.errors.length > 0` é a **única** fonte
  de "isto reprovou" — a marca, a contagem e o gatilho da linha de skip leem a
  mesma variável, e `ok: false` sem erro algum conta **1** e **diz** que a
  recusa não tem causa registrada. Dentes medidos em
  `npx vitest run --root .tooling/scripts/ci preflight` (denominador **40**):
  marca voltando a derivar de `ok` → **2 de 40** vermelho; `Math.max` voltando a
  `errors.length` → **1 de 40**.
- **Nenhum tooling lê `.github/workflows/ci.yml` — o arquivo que decide o que
  roda é prosa** (medido 2026-10-06, achado da revisão adversarial do PR deste
  branch). Comando: `grep -rn "workflows" tooling/scripts/*.ts
  .tooling/scripts/ci/*.ts | grep -v spec` devolve **3** linhas, e nenhuma
  delas parseia YAML: uma é string dentro de mensagem de erro do
  `pr-refresh-gate`, duas são comentário — uma sobre `.agents/WORKFLOWS.md` e
  outra citando o `ci.yml` como quem roda o preflight.
  Consequência medida: remover a linha `ref:` do checkout do `preflight`
  (commit `d56ce17`, que faz o gate medir a branch e não o merge ref do GitHub)
  deixa a suíte **inteiramente verde**. É a mesma classe da pendência do
  `PREFLIGHT_GATES` acima — reconciliador cego — mas um passo acima na cadeia:
  lá o array é re-declarado à mão em TypeScript, aqui o arquivo inteiro não tem
  leitor nenhum. Como isso é uma defendável decisão de escopo e não um bug
  (um gate de workflow exigiria um parser de YAML e uma política do que é
  "essencial"), fica registrado em vez de corrigido. **Se algum dia alguém
  escrever um gate de workflow, este é o primeiro item que ele deveria pegar.**

- **FECHADO 2026-10-08 — `PREFLIGHT_GATES` deixou de ser transcrição à mão.**
  O item estava aberto desde 2026-10-06: `check-teeth-registry.ts` reconciliava
  o registro contra um **literal** seu, e não contra o array `checks` que
  `preflight.ts` de fato executa (o array vivia dentro de `main()`, sem
  export). Gate novo rodava sem obrigação de entrar no registro; gate removido
  continuava "registrado". O comentário sobre o literal afirmava "derivados do
  array `checks` por importação real" — o oposto do que o código fazia.

  A lista virou `PREFLIGHT_CHECKS` em
  [`preflight-gates.ts`](../../../.tooling/scripts/ci/preflight-gates.ts),
  **só dados** (`id`, `name`, `file`): o módulo que guardasse também a função
  importaria `checkTeethRegistry`, que importa ele de volta. O `COMO` ficou em
  `RUNNERS`, no `preflight.ts`, e `resolverChecks()` casa os dois lados.

  **MEDIDO (dentes do spec novo, denominador 9):**
  `preflightGates()` virando um retrato avaliado no carregamento do módulo →
  **1 de 9 vermelho**; o `throw` de `resolverChecks` trocado por fallback verde
  → **1 de 9 vermelho** (medido duas vezes: a primeira medida deu **8 de 8
  verde**, porque no repo real todo `id` tem runner e o caminho de falha era
  inerte — o gate vigiava um conjunto vazio).

  **A extração quebrou dois guards, e eles estavam certos.** `check-harness-owner`
  lia a posse do campo `file:` em `preflight.ts` → 3 harnesses viraram órfãos
  ("expected [ …(3) ] to deeply equal []"), e `preflight-gates.ts` com
  `#!/usr/bin/env tsx` no topo foi classificado como HARNESS ÓRFÃO — o guard
  classifica como harness o que não começa com `check-`, não termina em
  `.spec.ts` e tem shebang. O conserto foi nos dois: shebang removido do módulo
  importado (que ninguém executa) e `OWNERSHIP_SOURCES` lendo as duas fontes, com
  o rótulo do dono vindo delas (`preflight-gates.ts#PREFLIGHT_CHECKS`) em vez
  de uma constante embutida no guard.

- **A tabela de Checks acima é completa** (a task 3.1 do plano
  [`guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md)
  fechou as 3 lacunas que esta seção declarava). O `preflight` executa
  **19 entradas** no preflight para **18 arquivos de gate distintos** — a
  diferença 1 é `check-eslint-drift`, que entra duas vezes (uma por app:
  `apps` e `packages`), não um gate sem registro. Esses 18 são exatamente as
  linhas do [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes), e o
  `check-teeth-registry` é o que reconcilia as duas listas.
  (Reconciliado por `name:`×`file:` em [`preflight.ts`](../../../.tooling/scripts/ci/preflight.ts)
  — contagens medidas 2026-10-08 com `grep -cE "^\s+name: '"
  .tooling/scripts/ci/preflight.ts` e `grep -oE "file: '[^']+'" | sort -u | wc -l`.
  A checagem anterior (17/16) tinha envelhecido por 2 entradas: o gate novo não
  foi contado quando esta pendência foi escrita.
  — não por contagem de glob. O "15" anterior era um **undercount**: o glob
  `'.tooling/scripts/ci/check-*.ts'` não enxerga
  `tooling/scripts/lint-review-routing.ts`, que mora fora de `.tooling/scripts/ci/`
  e não tem prefixo `check-`. Contar gates por glob é a classe 1 desta própria
  lista.)
- **`tooling/scripts/` tem typecheck que NADA executa, e barra mais frouxa**
  (medido 2026-10-06, issue #46). A #46 dizia que `.tooling/` era "a única
  superfície do repo sem typecheck" — falso para `tooling/`, que tem
  `tooling/scripts/tsconfig.json` com um `tsc` que nenhum script ou job roda.
  Três divergências medidas: **não estende** o base (tem `strict`, não tem
  `noUncheckedIndexedAccess` — e o `check-tsconfig-drift` não consegue acusar:
  sem `extends`, "ausente" e "herda" são indistinguíveis); **exclui**
  `**/*.spec.ts` e limita `include` a `./*.ts` (nem `lib/` entra); e paridade
  plena custaria **37 erros** contra os **18** zerados na #46. Uma fração já é
  coberta por acaso — `check-teeth-registry.ts` importa
  `tooling/scripts/review-router.ts`, que passou a ser verificado pela barra do
  base. Fechar a lacuna inteira é change próprio.
- **O gate do marcador `pr-refresh` é CI, não preflight** (issue #45 item 4),
  então ele **não** entra no [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes): o
  registro reconcilia contra o `PREFLIGHT_GATES`, e uma linha para um gate de CI
  acusaria "entrada do registro que não corresponde a nenhum gate". Ele roda
  como passo do job `preflight` em `.github/workflows/ci.yml`, no `pull_request`
  — sem `permissions` novo, porque o corpo vem do payload do evento, não de
  `gh`. Dentes: `pr-refresh-gate.spec.ts` — **2 de 18** sem o filtro
  `divergente` e **2 de 18** com o marcador valendo no corpo inteiro em vez do
  parágrafo (as duas remedidas em 2026-10-06; o commit do #45 dizia "3 de 13"
  para a segunda e estava errado — e o denominador era 13 porque o spec não
  tinha os 5 testes de CLI que entraram depois: 3 de "não verificado" e 2 do
  caminho verde).
  O critério é **por parágrafo** (`linhasVivas`), não "o corpo tem um
  marcador": colar o token num parágrafo qualquer enquanto as claims seguem sem
  ele é exatamente o estado silencioso.
- **"Não verificado" é vermelho, e o gate mede os dois ramos disso**: quando não
  consegue ler o corpo, ou quando a base não converge com HEAD, ele escreve
  `NÃO VERIFICADO` e sai **1** — não `0`. MEDIDO no PR #53: `fetch-depth`
  default num `pull_request` dá ref de merge sem ancestral comum, e a primeira
  versão do gate subia a exceção crua (vermelho, mas com stack trace e sem
  pista de como corrigir) enquanto o ramo "não verificado" ficava **inalcançável**
  pelo único canal que de fato dispara. Corrigido com `fetch-depth: 0` no
  `ci.yml` + `try/catch` em volta do `varrerTexto`. Dentes: os 3 testes de CLI de "não verificado"
  ficam vermelhos se `naoVerificado` voltar a devolver `0` — que é o
  "pular com verde" que a issue #45 denuncia, só que pelo outro lado.
- **O gate não pode afirmar que mediu o que não existe** (achado da revisão de
  especificação do PR deste branch, MEDIDO 2026-10-06). Com corpo vazio — que
  o GitHub aceita — ou sem nenhuma contagem, a saída era `0 claim(s)
  divergente(s), todas em parágrafo marcado — OK`: zero claims e **zero
  marcadores**, com uma frase afirmando uma marcação inexistente. Sai `0`
  por escolha (o corpo foi lido e varrido; é medição completa com resultado
  zero, não "não consegui medir"), mas a mensagem agora nomeia a limitação:
  o scanner reconhece `TOTAL_PADROES` formatos e um número fora deles é
  **invisível** para o gate. Dentes: remover o ramo dá **2 de 18** vermelhos.
- **Risco não medido — `pull_request.head.sha` em PR de fork**
  (achado da revisão de especificação do PR deste branch, 2026-10-06). O
  `ref:` do checkout do `preflight` aponta para o commit do **fork**, não do
  repo base; com `fetch-depth: 0` o checkout tenta trazer o histórico inteiro
  daquele ref, e algum objeto não servível pelo repo base devolveria histórico
  incompleto — a condição "base sem ancestral comum" que o `fetch-depth: 0`
  existe para eliminar. **Não medido**: exige um PR real de fork, impossível
  localmente, e este repositório é privado. O padrão
  `ref: ${{ github.event.pull_request.head.sha }}` é o documentado e
  amplamente usado, então a hipótese padrão é que funcione — fica escrito
  como hipótese, não como fato. Se algum dia o repo abrir para fork, o teste
  é abrir um PR de fora e ver se o `preflight` acusa `NÃO VERIFICADO`.
- **A cobertura de dentes não fecha a classe: 6 dos 16 gates provam a lógica
  com `controle negativo` em tmpdir** (ver
  [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes)), o que não
  prova a integração com o sistema real. MEDIDO 2026-10-08, contando as linhas
  da tabela por nível: **16** = **9** mutação + **6** controle negativo + **1**
  controle positivo, **0** desconhecidas. A frase anterior ("6 dos 13 … os
  outros 7") tinha as categorias invertidas — o 6 é a contagem de controles
  negativos e o 7 não casa com nenhuma coluna. Fechar os 6 é change próprio, um
  por gate.
- **`check-package-json-drift` só varre o `package.json` raiz.** Task
  turbo fantasma declarada em `apps/*/package.json` escapa do gate, e os
  4 call-sites `pnpm turbo run` do `ci.yml` também não são varridos.
- ✅ **FECHADO 2026-10-08 — `ci:local` roda as duas suítes e2e.** Era esta
  pendência: `ci:local` não rodava `test:integration` nem `test:e2e`, e a
  Camada 1 dizia que rodava "tudo que o CI roda". Comando:
  `node -e "console.log(require('./package.json').scripts['ci:local'])"`
  devolve hoje `pnpm ci:preflight && pnpm turbo run lint typecheck test:unit
  test:coverage test:integration test:e2e --filter=@projeto/api
  --filter=@projeto/web`. **Custo medido de ponta a ponta: 22,6 s → 69,5 s,
  69,6 s e 74,1 s** (`{ time pnpm ci:local; }`, exit 0, n=3, 2026-10-08); o `turbo run`
  isolado e forçado deu 71,50 s — uma invocação com 6 tasks, contra 71,31 s da
  variante de duas invocações encadeadas, e os 0,19 s são ruído, então uma só
  invocação é o que fica. `turbo.json` marca `test:integration` e `test:e2e` com
  `cache: false`, então esse custo não encolhe com o tempo. **O que pagou o custo:** `apps/web` ganhou
  `pretest:e2e: "playwright install chromium"`, sem o qual a suíte levantava
  Postgres + API + `next build` (33,5 s) e só então falhava com
  `Executable doesn't exist` — 43,4 s pelo motivo errado. Provado com cache de
  browser vazio (`PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-cache-prova`):
  `pnpm --filter @projeto/web test:e2e` → **19 passed (54,9s)** em **92,17 s**,
  e o `chromium-1223` apareceu na cache, o que prova que o pnpm disparou o
  `pre`. **O que fecha a regressão é `check-ci-local-e2e`** (registrado nos
  três lugares: array `checks`, `PREFLIGHT_GATES` e Registro de dentes), não o
  ajuste de prosa: ele acusa task ausente, pacote de e2e fora dos `--filter` e
  `test:e2e` com Playwright sem `pretest:e2e` instalando o browser. Dentes
  medidos 2026-10-08, denominador **25** (o spec cresceu na revisão em dois
  estágios, que achou 3 falsos verdes): veredito (`ok: errors.length === 0`)
  neutralizado → **6 de 25** vermelho; alcance por `--filter` → **2 de 25**;
  escopo do filtro por invocação → **1 de 25**. Os três foram corrigidos.
- **`relatarUmCheck` marca ✓ a partir de `ok`, não de `errors.length`**
  (`preflight.ts:199`, `mark: result.ok ? formatMark(result) : '✗'`). Um check
  que devolve `ok: true` **e** `errors` preenchidos imprime **✓** e ainda assim
  conta os erros e sai com 1 — o build falha com uma linha verde na tela.
  MEDIDO 2026-10-08, achado ao implementar `check-ci-local-e2e`, que reporta
  `ok: resultado.ok` com `errors` derivado de `errors.length === 0`: os dois
  caminhos concordam hoje, o que torna o harness seguro **por coincidência**,
  não por construção. Nenhum gate mede se os dois concordam. Fechar isto é
  change próprio: `mark` deve derivar de `errors.length === 0` (ou o contrato
  `CheckResult` deve proibir `ok: true` com `errors` não vazio).
- **`testIgnore` do Playwright é o único asserto de não-dupla-coleta e
  nenhum gate o lê** (medido 2026-10-08, mesma revisão). Comando:
  `grep -rn "testIgnore" --include=*.ts --include=*.mts .tooling tooling apps`
  devolve **2** linhas, ambas dentro do próprio `playwright.config.ts` (o
  comentário e a chave). No mesmo commit, `vitest-include.spec.ts:83` ganhou
  `'e2e'` no `IGNORAR` — o guard que existe para "arquivo escrito, coletado por
  ninguém, verde sem ter testado nada" passou a ignorar exatamente o diretório
  novo, e o espelho do lado do Playwright ficou sem rede. O gate de paridade
  `check-e2e-flow-coverage.ts` também não vê: o `lerSpecs` usa `readdirSync`
  **não-recursivo**, então `e2e/support/` não entra. Sintoma se alguém
  renomear/remover o `testIgnore` ou criar `e2e/support2/`: a suíte INTEIRA
  morre no bootstrap, **depois de pagar os ~40s do `next build`** (medido
  2026-10-08: 2 execuções, as duas `EXIT=1`). Hoje o estado no disco está
  correto — o que falta é o gate.
- **Os Dockerfiles agora `node:22`, e o `engines.node` declara `>=22.6.0`** —
  resolvido pela issue #48. As duas propriedades do guard de base image foram
  separadas (`check-docker-drift.ts`): **distro** (glibc, por causa do engine
  binary do Prisma 6) e **major** (a que casa com `engines.node` e com
  `node-version: 22` do CI). Antes elas viviam numa constante só
  (`REQUIRED_BASE_IMAGE = 'node:20-bookworm-slim'`), o que fazia `node:20-alpine`
  (problema real de glibc) e `node:22-bookworm-slim` (válido) produzirem a
  MESMA mensagem, atribuindo bump de major a problema de distro.
  O selo é o `.npmrc` raiz com `engine-strict=true`, ligado **depois** de subir
  as imagens — na ordem inversa, o `pnpm install --frozen-lockfile` dentro do
  build quebraria com exit 1 em vez de avisar.
  **O que continua aberto:** o CI prova que a imagem **monta**, não que ela
  **roda** — `grep -rnE 'docker run|docker compose up' -- .github` → 0
  ocorrências. Nada executa a imagem de produção, então a regressão "roda em
  major diferente da de build" continua sem verificação de execução.
- **Skill `ci-defense-in-depth`:** publicada em
  [`.agents/skills/ci-defense-in-depth/SKILL.md`](../../skills/ci-defense-in-depth/SKILL.md)
  (v1.4.0). Cobre o template `CheckResult`, fixtures herméticas via
  `fs.mkdtemp` e code-block-aware parsing para novos checks preflight.
- **Drift real que justificou o `check-turbo-drift`** (v1.4.0): `stack:review`
  e `docs:sync` declaravam `outputs` apesar de `cache:false`. Corrigido.

