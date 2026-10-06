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
  **16 entradas** no preflight para **15 arquivos de gate distintos** — a
  diferença 1 é `check-eslint-drift`, que entra duas vezes (uma por app:
  `apps` e `packages`), não um gate sem registro. Esses 15 são exatamente as
  linhas do [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes), e o
  `check-teeth-registry` é o que reconcilia as duas listas.
  (Re-medido 2026-10-06: `pnpm ci:preflight | grep -c '^  •'` → 16;
  `check-agent-memory-drift` entrou pela #47 e `check-tooling-typecheck` pela
  #46.)
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
  `gh`. Dentes: `pr-refresh-gate.spec.ts` — **2 de 13** sem o filtro
  `divergente` e **2 de 13** com o marcador valendo no corpo inteiro em vez do
  parágrafo (as duas remedidas em 2026-10-06; o commit do #45 dizia "3 de 13"
  para a segunda e estava errado). O critério é **por parágrafo**
  (`linhasVivas`), não "o corpo tem um marcador": colar o token num parágrafo
  qualquer enquanto as claims seguem sem ele é exatamente o estado silencioso.
- **Só 6 dos 13 gates têm mutação medida** (ver
  [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes)). Os outros 7 provam a lógica com
  `controle negativo` em tmpdir, o que não prova a integração com o sistema
  real. Fechar os 7 restantes é change próprio, um por gate.
- **`check-package-json-drift` só varre o `package.json` raiz.** Task
  turbo fantasma declarada em `apps/*/package.json` escapa do gate, e os
  4 call-sites `pnpm turbo run` do `ci.yml` também não são varridos.
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

