# Convenção: CI Defense in Depth — Estratégia de Defesa em Camadas

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Drift estrutural (cross-refs quebradas em docs, tsconfigs divergentes,
regras ESLint legadas, extensões faltando em `tsconfig`) **não é capturado
por testes unitários nem por cobertura**: código compila e passa, mas o
monorepo fica progressivamente inconsistente até quebrar um build aleatório.
A estratégia defense-in-depth ataca o problema em **camadas progressivas** —
quanto mais cedo o drift é detectado, menor o custo do feedback loop e menor a
chance de merge de uma regressão estrutural.

São **3 camadas**: pre-push local (dev), preflight CI job (primeiro gate),
quality CI jobs (lint/typecheck/test/coverage, gated).

## As 3 Camadas

### Camada 1 — Pre-push local

`pnpm ci:local` roda a **Camada 2 mais lint, typecheck, unit, cobertura e as
duas suítes e2e** (API e frontend) antes do `git push`. MEDIDO 2026-10-08 de
ponta a ponta (`{ time pnpm ci:local; }`, exit 0, n=3): **22,6 s → 69,5 s,
69,6 s e 74,1 s**; `turbo.json` marca as duas tasks com `cache: false`, então o custo não
encolhe com o tempo. A deliberação está em
[Pendências conhecidas](./ci-defense-in-depth-pendencias.md); script e demais
detalhes em [git-workflow.md §Pre-Push Quality Gate](./git-workflow.md).

**O que o HOOK roda é menos que o `ci:local`** — e é proposital: o hook é
rápido, o `ci:local` é lento. `.husky/pre-push` roda `pnpm ci:preflight`
(Camada 2) e `pnpm ci:boot`. O `ci:boot` é a etapa que **sobe a aplicação
local** (API em `tsx src/main.ts` + web em `next dev`, em portas livres) e a
derruba no fim; o veredito é do processo que sobe — `/api/v1/health` 200 com
`checks.database: "ok"` e `/api/health` 200 com `status: "ok"`.

⚠️ **O banco local é pré-requisito e a etapa não o sobe**: sem ele o push é
 barrado com o ponteiro para [`docs/como-rodar.md` §1.1](../../../docs/como-rodar.md).
 É a única regra desta camada que depende do estado da máquina — e ela
 **falha alto**, nunca pula. O e2e não cobre esse buraco: ele sobe a API em
 `tsx` e o web no BUILD de produção, que é outro caminho do `pnpm dev`.

### Camada 2 — Preflight CI job

Workflow `.github/workflows/ci.yml`, job `preflight`. **Primeiro job do
pipeline** — os demais (lint, typecheck, test, coverage) declaram
`needs: preflight` e não rodam se ele falhar. São os checks estruturais
registrados em [`preflight-gates.ts`](../../../.tooling/scripts/ci/preflight-gates.ts)
(`preflight.ts` é o runner, não a lista) — a contagem envelhece, então quem
precisar dela roda
`grep -cE "^\s+name: '" .tooling/scripts/ci/preflight-gates.ts`. Todos vivem em
`.tooling/scripts/ci/` exceto o lint da matriz.

### Camada 3 — Quality CI

Lint, typecheck, test, cobertura **e as duas suítes e2e** (API e frontend).
Roda **apenas se preflight passou**. Aplica as regras funcionais (negócio,
tipos, cobertura 80% por
[cobertura-testes.md §CI Defense in Depth](./cobertura-testes.md)).

## Tabela de Checks

Escopo de todos: **todo `.md` versionado** sob a raiz que o preflight passa
(`docs` **e** `.agents/specs`) — o cabeçalho de `preflight.ts:7` diz "docs e
.agents/specs", e foi ele que pegou o link quebrado desta própria tabela.

| Check | Tipo | Detecta |
|---|---|---|
| `check-doc-refs` | cross-refs | paths relativos quebrados em qualquer `.md` versionado do escopo |
| `check-tsconfig-drift` | tsconfig | extensões/extends divergentes entre tsconfigs |
| `check-eslint-drift` | eslint config | regras duplicadas/legadas em configs ESLint |
| `check-turbo-drift` | turbo pipeline | drift em `turbo.json` (`$schema` ausente, nomes inválidos, `cache:false` com `outputs`) |
| `turbo-redirect-differential` | harness | 18 formas de redirect do parser contra o **turbo real** — o instrumento executa o turbo e compara os dois lados, então um parser que casa e um turbo que não roda não passam juntos. O veredito final (`[ "$div" -eq 0 ]`) é coberto pelo spec |
| `check-package-json-drift` | package.json raiz **+ apps** | scripts canônicos ausentes, `tsx <path>` fantasma, ou `turbo run <task>` que o turbo não resolve — nem no `turbo.json`, nem em pacote algum, nem nos pacotes que o `--filter` alcança. `extraPackageJsonPaths` cobre `apps/{web,api}/package.json` com subset próprio (não exige `ci:preflight` em apps) |
| `check-docker-drift` | docker | `.dockerignore` ausente, `Dockerfile` > 100 linhas, base image sem glibc (distro) ou com major ≠ a de `engines.node` (major) — as duas são guardas separados |
| `check-runbook-drift` | runbook | script `pnpm` ou chave de env citados em `docs/como-rodar.md` que **não existem em nenhum** `package.json` do workspace. Runbook ausente → `skipped` COM MOTIVO, nunca verde. **Não** detecta o inverso (script que só existe em `apps/*` citado como se fosse da raiz): `scriptsDoWorkspace()` faz união plana de raiz + `apps/*` + `packages/*` e o teste é `!scripts.has(s)`, então o pacote de origem é descartado. MEDIDO 2026-10-20 |
| `check-archive-integrity` | archive | frontmatter canônico de `.agents/runs/archive/*.md` |
| `check-memory-dir-concordance` | retro | segunda declaração do destino do result file, em 6 notações históricas |
| `check-memory-crystallization` | cristalização | memória do corpus **sem linha nenhuma** no ledger de destinação (fecha o laço DURANTE → DEPOIS); linha do ledger apontando para memória que não existe mais; `citada:` cuja âncora **deixou de estar** no arquivo que ela citava. `pendente:` é **aviso** — dívida declarada, não resolvida. Ledger ausente ou corpus de 0 → **erro**; diretório de memória fora do repo → `skipped` com motivo, nunca verde |
| `check-agent-memory-drift` | agents | agent com **mudança de comportamento** e memória (`.agents/memory/<agent>.md`) intocada no mesmo range |
| `check-tooling-typecheck` | typecheck | erro de tipo em **cada** superfície da lista `SUPERFICIES` — `.tooling/scripts/**` **e** `tooling/scripts/**`, as duas na barra de `tsconfig.base.json`; `tsc` != 0 **sem** diagnóstico também é vermelho (issue #46, amplitude 2026-10-08) |
| `review-routing` matrix lint | roteamento | YAML inválido, reviewer inexistente, pattern duplicado, LOC > 300, `blocking: true` casando 0 arquivos |
| `check-branch-up-to-date` | git workflow | demanda que não contém `origin/main` (regra de rebase de [`git-workflow.md`](./git-workflow.md)); "sem ancestral comum" é motivo **diferente** de "atrasada"; rebase **parado em conflito** é vermelho antes de qualquer contagem; base ausente é `skipped`, nunca verde |
| `check-e2e-flow-coverage` | testes | inventário de fluxos de [`e2e-playwright.md`](./e2e-playwright.md) ⇄ cabeçalhos `// FLUXO:` dos specs: meio-cumprido é vermelho nomeando o fluxo; inventário com 0 linhas e diretório de e2e sem spec são **erro**, nunca verde por conjunto vazio. Mede **paridade declarativa** — que os testes passem é a execução (`test:e2e`), outra camada |
| `check-ci-local-e2e` | ci local | `ci:local` que deixou de rodar `test:integration`/`test:e2e`, pacote de e2e fora dos `--filter`, ou `test:e2e` com Playwright sem `pretest:e2e` instalando o browser. Filtro por glob → **aviso** (alcance indeterminado), não erro; workspace ilegível → `skipped` nomeando `pnpm-workspace.yaml`, nunca verde por lista vazia. Mede **fiação declarativa** — não roda suíte nem reconcilia com `ci.yml` |
| `check-ci-local-scope` | ci local | pacote do workspace que **implementa** uma task da invocação `turbo run` e não está nomeado por nenhum `--filter` dela; e `ci:local` sem `tooling:test` (o tooling não implementa task turbo alguma, então a checagem de filtro não o alcança). Complementa `check-ci-local-e2e` na direção oposta: aquele diz que a task roda, este diz que o escopo cobre. Filtro por glob **ou** ausência de filtro → **aviso**; pacote que só **delega** (`turbo run test`) não é acusado; `ci:local` ausente → `medidos: null`, nunca `{…: 0}` |
| `check-test-set-covered` | testes | todo script `test*` declarado roda no `ci:local` ou é exceção **declarada** numa tabela. Vermelho: script declarado e nunca executado, pacote fora do `--filter`, exceção inaplicável, exceção citando script inexistente, zero script `test*`, e `ci:local` ausente. Alias do mesmo comando não é acusado, mas vira **aviso** |
| `check-tenant-scope-source` | tenancy | o escopo de tenant não vem da rota: `@Param` do mesmo arquivo indo para o escopo, e `request.headers` lido à mão. Corpus **vazio** é vermelho (classe 5), a definição de um helper não conta como chamada, `*.spec.ts` fica fora da contagem, e o resíduo cross-file é contado |
| `check-feature-flag-contract` | feature flags | contrato HTTP do catálogo ⇄ o exemplo do contrato, **nos 2 sentidos**: descrição que mudou no catálogo e não seguiu o contrato, chave que o contrato exemplifica e o catálogo não tem, e a chave que **sai** do catálogo deixando o exemplo para trás — o modo de falha que a primeira direção não pega. Catálogo ou contrato com ZERO chaves é **erro**, não verde |
| `check-feature-flag-portas` | feature flags | as portas declaradas de cada flag (`portas:` na spec da flag) existem no código do controller, **nos 2 sentidos**. `@Post()` sem path casa a rota **raiz** do `@Controller()`, o prefixo do controller vale para rota com path, e cada entrada herda a chave do **seu** bloco — não a do último |
| `check-teeth-count` | dentes | contagem de itens em `PREFLIGHT_CHECKS` (real) vs. matches de `^  - '` no `preflight-gates.ts` (literal) — drift entre o array executado e o array declarado é vermelho nomeando os dois números |
| `check-harness-location` | dentes | todo `check-*.ts` vive em `.tooling/scripts/ci/` (raiz do harness); subdir cria harness órfão e quebra a URL do painel |
| `check-self-firing-guard` | dentes | classe 3 do `guard-classes.md`: o guard cujo único hit é o comentário que o documenta. Para cada guard declarado, o diferencial compara o corpus **com** e **sem** o comentário que o isenta e exige que o `stillFires` caia a zero. Meça com `npx tsx .tooling/scripts/ci/check-self-firing-guard.ts` (saída silenciosa + exit code) — **sem número de achados aqui**: ele envelhece a cada linha nova que cita o termo, e classe 7 é exatamente o claim numérico que ninguém re-mediu |
| `check-harness-owner` | dentes | controle **desligado**: harness sob `.tooling/scripts/ci/` que nenhum runner invoca, e destino declarado sem guard ligado. A lista de destinos é a **união** do que cada guard exporta — não há lista para lembrar de atualizar |
| `check-teeth-registry` | dentes | as reconciliações que impedem o registro de envelhecer em silêncio: registro de dentes ⇄ preflight, registro → artefato existente, registro ⇄ roteamento (gate sem rota = revisão nunca despachada), e preflight ⇄ **esta tabela** |
| `check-flow-mermaid-sync` | docs/flows | diagramas Mermaid ⇄ a IR que documentam: IR mudou e o `flow.md` ficou velho, `flow.md` editado à mão, IR sem `flow.md`, `flow.md` sem IR (órfão), IR fora do layout `dominio/flow/nome.sequence.json`, e zero IR. **Não** detecta "duas IRs no mesmo diretório" como condição própria: `listSequenceIrs` devolve o ARQUIVO, não o diretório, justamente para matar a dupla contagem. MEDIDO 2026-10-20 |
| `check-agent-routing-coverage` | agents | todo `*.md` em `.agents/agents/` precisa ser referenciado pela matriz `specialist-routing.md` em algum `specialists: [X]` (par: órfão = real sem rota, fantasma = citado sem real) |
| `check-engines-consistency` | engines | `engines.node` em `apps/*/package.json` deve ser >= versão da raiz; app declarando major mais antigo é vermelho |
| `check-dockerfile-hardening` | docker | apps/*/Dockerfile: FROM com @sha256:... (ou @${ARG} com ARG default = sha256:...) e stage prod com `USER 1001:1001`. docker-compose.yml: service api com `init: true`, services prod (postgres/api/web) com `read_only: true` + `cap_drop: [ALL]` + `security_opt: [no-new-privileges:true]`, top-level `networks:` + cada service com `networks:` explícito (não usar default). .dockerignore: exclui `.env.production*`. Cobre issues 83, 84, 88, 89, 90, 91, 92 |

> **`check-types.ts` NÃO é um check** e saiu desta tabela: tem um único
> `export interface CheckResult` (`wc -l` = 23) e é importado **só** como
> `import type`. A versão anterior lhe atribuía uma capacidade e um custo que **não
> existem** — a task 3.1 do plano [`guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md)
> mediu e corrigiu; a [SKILL](../../skills/ci-defense-in-depth/SKILL.md) já dizia certo ("— não roda").
>
> **A coluna "Custo" foi removida, não corrigida.** Ela somava **16 s**
> (5+3+3+1+2+2) para um preflight medido em **~2,6 s** — e o preflight não
> imprime tempo por check, então nenhum dos números tinha derivação. Somar
> números inventados numa coluna que ninguém consegue reproduzir é a classe 7
> desta demanda; o que dá para medir hoje é o todo, e o todo mudou quando a
> task 4.1 ligou o differential:
> `time pnpm ci:preflight` → **10,84 / 10,77 / 10,78 s** (medido 2026-10-05,
> n=3, com o array completo de checks). O mesmo comando com os 12 checks de
> antes da 4.1 dava **2,62 / 2,64 / 2,62 s** (n=3), e o
> `turbo-redirect-differential.sh` sozinho mede **8,17 / 8,15 / 8,20 s**
> (n=3) — `2,62 + 8,17 = 10,79`, que bate com os 10,78. É essa aritmética que
> a coluna inventada não tinha: um custo que não fecha com o todo não é um
> custo, é uma história.

Todos os checks seguem o template `CheckResult` compartilhado
extraído em commit `59eb083` (refactor que consolidou fixtures herméticas).

## Registro de dentes

> A tabela de dentes (23 linhas: `mutação` / `diferencial` / `controle
> positivo` por gate), a taxonomia dos níveis de prova e os **nove comandos
> de mutação** vivem em
> [`ci-defense-in-depth-dentes.md`](./ci-defense-in-depth-dentes.md) —
> extraídos em 2026-10-16 porque este arquivo passou do teto de 300 linhas de
> [`tamanho-e-revisao.md`](./tamanho-e-revisao.md). O gate
> `check-teeth-registry` reconcilia a tabela **daquele** arquivo com
> `PREFLIGHT_CHECKS`.


## Comando de Verificação

```bash
pnpm ci:local     # camada 1 inteira — pré-requisito de push (AGENTS.md §6)
pnpm ci:preflight # camada 1 reduzida (~10s) — atalho para iterar em docs/tsconfig
```

## Histórico de drift detectado

Só entram aqui rows em que um check **achou** algo; a introdução de um check é TDD ([tdd.md](./tdd.md)) e vive no git.

| PR / commit | Check | Drift | Correção |
|---|---|---|---|
| `df70f5d` | `check-doc-refs` | falsos positivos em code blocks | preflight pula code blocks |
| `4b3d297` | registro de dentes | 3 claims envelhecidos (gate de `check-types`, coluna "Custo", teste com nome de dente e assertion de verde) | corrigidos; ver [Tabela de Checks](#tabela-de-checks) |

## Pendências conhecidas

Vivem no companion [`ci-defense-in-depth-pendencias.md`](./ci-defense-in-depth-pendencias.md); este documento está no teto de 300 linhas ([`tamanho-e-revisao.md`](./tamanho-e-revisao.md)), então um item novo aqui significa um corte em outro.

## Dívida de controles

Controles que **existem e não rodam** — o oposto da tabela de dentes, que só
lista o que o `preflight` invoca. Declarar a dívida aqui é o que impede a
convenção de publicar uma regra sobre controle desligado enquanto entrega um
controle desligado.

**Nenhuma em aberto (2026-10-05).** A única era o
`turbo-redirect-differential.sh` (B11), fechada na task 4.1. A seção fica, e
vazia de propósito: `check-harness-owner` garante que continue vazia, e um
detector que some junto com a dívida deixa de existir no dia em que ela volta.

## Cross-references

- [git-workflow.md §Pre-Push Quality Gate](./git-workflow.md)
- [cobertura-testes.md §CI Defense in Depth](./cobertura-testes.md)
- [post-merge-release.md](./post-merge-release.md)
- [../../skills/ci-defense-in-depth/SKILL.md](../../skills/ci-defense-in-depth/SKILL.md)
