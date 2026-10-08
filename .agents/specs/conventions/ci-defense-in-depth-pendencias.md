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

- **`PREFLIGHT_GATES` é uma transcrição à mão, e o reconciliador é cego nos
  dois sentidos** (medido 2026-10-06, achado da revisão paralela do PR deste
  branch). `check-teeth-registry.ts` reconcilia o registro contra um **literal**
  seu, não contra o array `checks` que `preflight.ts` de fato executa — o array
  vive dentro de `main()` e não é exportado. Medido: inserido um gate fantasma
  em `preflight.ts`, o preflight imprimiu `✓`, `check-teeth-registry` devolveu
  `EXIT=0` e os 13 testes do spec seguiram verdes. Gate novo no preflight sem
  linha no registro **não é acusado por nada**. É a classe 1 dentro do guard que
  existe para pegar a classe 1, e o comentário que ficava sobre o literal
  afirmava "derivados do array `checks` por importação real" — o oposto do que
  o código fazia. O comentário foi corrigido; a derivação não foi feita.
  **Correção:** extrair `PREFLIGHT_CHECKS` para um módulo próprio
  (`preflight-gates.ts`) importado por `preflight.ts` e por
  `check-teeth-registry.ts`. Importar direto de `preflight.ts` criaria ciclo, e
  na ordem inversa de importação `PREFLIGHT_GATES` cairia em TDZ. Change
  próprio: mexe no runner do preflight, não num dos 5 gates.
- **A tabela de Checks acima é completa** (a task 3.1 do plano
  [`guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md)
  fechou as 3 lacunas que esta seção declarava). O `preflight` executa
  **17 entradas** no preflight para **16 arquivos de gate distintos** — a
  diferença 1 é `check-eslint-drift`, que entra duas vezes (uma por app:
  `apps` e `packages`), não um gate sem registro. Esses 16 são exatamente as
  linhas do [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes), e o
  `check-teeth-registry` é o que reconcilia as duas listas.
  (Reconciliado por `name:`×`file:` em [`preflight.ts`](../../../.tooling/scripts/ci/preflight.ts)
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
- **Só 6 dos 13 gates têm mutação medida** (ver
  [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes)). Os outros 7 provam a lógica com
  `controle negativo` em tmpdir, o que não prova a integração com o sistema
  real. Fechar os 7 restantes é change próprio, um por gate.
- **`check-package-json-drift` só varre o `package.json` raiz.** Task
  turbo fantasma declarada em `apps/*/package.json` escapa do gate, e os
  4 call-sites `pnpm turbo run` do `ci.yml` também não são varridos.
- **`ci:local` não roda nenhuma das duas suítes e2e, e a Camada 1 dizia que
  rodava "tudo que o CI roda"** (medido 2026-10-08, revisão da branch
  `feat/e2e-playwright-frontend`). Comando:
  `node -e "console.log(require('./package.json').scripts['ci:local'])"`
  devolve `pnpm ci:preflight && pnpm turbo run lint typecheck test:unit
  test:coverage --filter=@projeto/api --filter=@projeto/web` — sem
  `test:integration` e sem `test:e2e`, apesar de o `ci.yml` rodar os dois no
  job `quality`. A frase da convenção estava já errada para o e2e da API
  (commit anterior a esta branch); o que a branch acrescenta é a segunda
  violação, e ela é a cara: `apps/web/e2e/global-setup.ts` sobe Postgres +
  API Nest + um `next build` de produção (≈40s, medido pelo próprio repo) —
  colocar isso em todo `git push` é uma decisão de projeto, não um detalhe de
  script. **A convenção foi corrigida para descrever o que `ci:local` faz**, e
  esta pendência registra o buraco em vez de escondê-lo atrás de um ajuste de
  prosa. Fechar isto é change próprio: um `ci:local:e2e` separado, ou uma
  flag.
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

