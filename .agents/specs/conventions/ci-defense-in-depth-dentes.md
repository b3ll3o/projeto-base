# Registro de dentes — CI Defense in Depth

> Sub-spec irmã de [`ci-defense-in-depth.md`](./ci-defense-in-depth.md), extraída em
> 2026-10-16 porque o arquivo-mãe passou do teto de 300 linhas de
> [`tamanho-e-revisao.md`](./tamanho-e-revisao.md). O gate
> `check-teeth-registry` reconcilia a tabela abaixo com `PREFLIGHT_CHECKS`.
> pt-BR prose, English technical identifiers.

## Registro de dentes

> **Verde não é prova.** Um gate que roda sobre uma árvore já verde é
> indistinguível de um gate que não faz nada. Por isso cada gate declara
> **como se prova que tem dentes** — e a prova é sempre um **vermelho**.

| Nível | O que é | Vale como prova? |
|---|---|---|
| **mutação** | o teste quebra o **sistema real** e afirma vermelho | **sim** — a única que prova |
| **diferencial** | roda o gate contra o **repo real** e afirma vermelho ao reverter o hardening nele | **sim** — quando não há como mutar sem reverter a árvore |
| **controle negativo** | alimenta entrada errada (tmpdir) e afirma vermelho | parcial — prova a lógica, não a integração |
| **controle positivo** | neutraliza-se o controle e o check tem de **ficar verde** | parcial — prova que o vermelho anterior vinha da dívida, não de outra coisa |
| **desconhecida** | só afirma verde | **não** |

O nível **controle positivo** entrou em 2026-10-08: `check-harness-owner` usava essa
prova desde 2026-10-05, arquivada por engano como `mutação` — gate que prova o
contrário ("neutralizado, continua verde") arquivado como mutação faz o leitor contar
dentes que não são dentes. O nível **diferencial** entrou em 2026-10-16 pelo mesmo
motivo: `check-dockerfile-hardening` provava os dentes **revertendo o hardening no
repo real** (e é `mutação` que não cabe — mexer no `Dockerfile` versionado para
ver o gate ficar vermelho não é mutação de teste), e estava arquivado com um
rótulo que a legenda não definia. MEDIDO na tabela: **23** linhas = **21** mutação
+ **1** diferencial + **0** controle negativo + **1** controle positivo + **0**
desconhecidas. Viradas de
2026-10-08: `check-tooling-typecheck`, `check-tsconfig-drift`, `check-eslint-drift`,
`check-turbo-drift` e `check-doc-refs` — prova só em tmpdir não prova a integração.

| Gate | Onde o dente está | Nível | Comando da prova | Arquivo |
|---|---|---|---|---|
| `check-archive-integrity` | `check-archive-integrity.spec.ts` — `arquivo INVÁLIDO no archive REAL` + `arquivo inválido no diretório ERRADO` (o par) | **mutação** | comando 1 → **3 de 9 vermelho** (denominador re-medido 2026-10-16; o 3 exige reexecutar a mutação) | `.tooling/scripts/ci/check-archive-integrity.ts` |
| `check-memory-dir-concordance` | `check-memory-dir-concordance.spec.ts` — `a derivação canônica resolve para um diretório que existe de verdade` | **mutação** | comando 2 → **3 de 28 vermelho** (denominador re-medido 2026-10-16; o 3 exige reexecutar a mutação) | `.tooling/scripts/ci/check-memory-dir-concordance.ts` |
| `check-agent-memory-drift` | `check-agent-memory-drift.spec.ts` — o par `APENAS path corrigido NÃO é delta` / `prosa NOVA É delta` + `findDriftedAgents` com memória tocada | **mutação** | `npx vitest run --root .tooling/scripts/ci check-agent-memory-drift` → **5 de 12** com `hasBehaviorDelta` sempre true, **3 de 12** com `findDriftedAgents` sempre vazio (medido 2026-10-06) | `.tooling/scripts/ci/check-agent-memory-drift.ts` |
| `check-tooling-typecheck` | `check-tooling-typecheck.spec.ts` — `NÃO reporta verde quando o tsc falha sem imprimir diagnóstico` / `…sem saída nenhuma` (o par), mais `typecheca TODAS as superfícies, não só a primeira` e `VERMELHO quando só uma das superfícies tem tsconfig` (o par da amplitude) | **mutação** | `npx vitest run --root .tooling/scripts/ci check-tooling-typecheck` (denominador **12**) → **4 de 12** com `parseTscDiagnostics` sempre `[]`, **2 de 12** com o `status !== 0` neutralizado, **2 de 12** com o `for` correndo só a 1ª superfície, **2 de 12** com só a 1ª ausência contada. **E o diferencial contra o repo real**: plantar um arquivo de prova sob tooling/scripts com um `noUncheckedIndexedAccess` → **EXIT=1** prefixando o tsconfig da própria superfície; sem o arquivo → EXIT=0 (medido 2026-10-08; as duas primeiras medições são de 2026-10-06, denominador 11) | `.tooling/scripts/ci/check-tooling-typecheck.ts` |
| `check-turbo-drift` | `check-turbo-drift.spec.ts` — `deve falhar se o $schema NÃO for o do turbo.build, mesmo sendo uma URL` (ramo que era **inerte**: neutralizado, a suíte ficava 6 de 6 verde), mais `task com nome inválido` e `cache:false com outputs` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-turbo-drift` (denominador **7**) → **1 de 7** com o `TASK_NAME_RE` neutralizado, **1 de 7** com o par `cache:false`+`outputs` neutralizado, **1 de 7** com a checagem de `$schema` ausente neutralizada, **1 de 7** com a de prefixo errado neutralizada (esta última era **0 de 6** antes do teste novo). **Diferencial contra o repo real**: task `Build` (maiúscula) plantada no `turbo.json` → preflight **vermelho nomeando a task**; restaurado → ✓ (medido 2026-10-08) | `.tooling/scripts/ci/check-turbo-drift.ts` |
| `check-package-json-drift` | `check-package-json-drift.spec.ts` — 30 testes: o RED do `--filter` + seu contrafactual positivo (o par), mais `extractTurboRunFilters` em unidade | **mutação** | `npx vitest run --root .tooling/scripts/ci check-package-json-drift` → **1 de 30** com `alvoDosFiltros` neutralizado (`filtros.length === 0` → `>= 0`); e o **diferencial contra o repo real**, que é onde ele era inerte: plantar "e2e:web": "turbo run test:e2e --filter=@projeto/web" no `package.json` raiz → **EXIT=1** nomeando o filtro, sem o defeito → EXIT=0 (medido 2026-10-08) | `.tooling/scripts/ci/check-package-json-drift.ts` |
| `check-docker-drift` | `check-docker-drift.spec.ts` — o par `alpine é VERMELHA por glibc` / `base image na major ATUALIZADA é VERDE`, mais `as duas são motivos DIFERENTES` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-docker-drift` → **2 de 8** com o guarda de distro neutralizado, **2 de 8** com o de major (medido 2026-10-06, issue #48) | `.tooling/scripts/ci/check-docker-drift.ts` |
| `check-eslint-drift` | `check-eslint-drift.spec.ts` — `NÃO deixa o flat config vizinho mascarar a config legada`, mais `deve ignorar arquivos .eslintrc.js que estão na allowlist` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-eslint-drift` (denominador **5**) → **2 de 5** com `LEGACY_NAMES.includes` neutralizado, **2 de 5** com a allowlist ignorando tudo; e o controle: excluir mais um diretório (`.next`) → **0 de 5**, que é o que uma mudança que não mexe em comportamento tem de produzir. **Diferencial contra o repo real**: um .eslintrc.js plantado sob apps/api → **vermelho nomeando o arquivo**; sem ele → verde em `apps` e `packages` (medido 2026-10-08) | `.tooling/scripts/ci/check-eslint-drift.ts` |
| `check-doc-refs` | `preflight.spec.ts` → `describe('checkDocRefs')` — **o spec não é `check-doc-refs.spec.ts`**, é o do runner | **mutação** | `npx vitest run --root .tooling/scripts/ci preflight.spec` (denominador **40**) → **5 de 40** com a allowlist sempre `true`, **5 de 40** com o `errors.push` de link quebrado neutralizado. **E os dois controles, medidos**: allowlist sempre `false` → **0 de 40** nas specs, mas **VERMELHO no repo real** com 4 links de template quebrados (`.agents/specs/templates/**`) — a spec não cobre a allowlist, o repo real prova que ela carrega peso; `collectVersioned` devolvendo `null` → **0 de 40**, porque as fixtures em `/tmp` **já** caem no fallback do `walk` (é controle positivo, não buraco) (medido 2026-10-08) | `.tooling/scripts/ci/check-doc-refs.ts` |
| `review-routing` matrix lint | `tooling/scripts/lint-review-routing.spec.ts` — **diretório diferente** (veja a armadilha abaixo) — mais os 7 testes do bloco `não é um mapa` | **mutação** | `npx vitest run --root tooling/scripts lint-review-routing` (denominador **20**) → **2 de 20** com o LOC neutralizado e **1 de 20** em cada uma das outras 6 (pattern duplicado, regex inválida, matriz vazia, bloco não-mapa registrado, `path_globs` fora de lista, `commit_types` fora de mapa). **Diferencial contra o repo real**: prosa no 2º bloco `yaml` da matriz → **EXIT=1** nomeando `bloco yaml #2 não é um mapa`; restaurado → EXIT=0. **Antes era EXIT=0** (medido 2026-10-08) | `tooling/scripts/lint-review-routing.ts` |
| `check-tsconfig-drift` | `check-tsconfig-drift.spec.ts` — `NÃO fica em silêncio quando a chave é declarada por MENOS de dois configs` + seu contrafactual (`NÃO emite advisory quando a chave é declarada por TODOS`) + `no repo REAL a chave é declarada por 1 de 7 — e o gate diz essa` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-tsconfig-drift` (denominador **5**) → **2 de 5** com a `advisory` neutralizada, **1 de 5** com a detecção de drift neutralizada (medido 2026-10-08) | `.tooling/scripts/ci/check-tsconfig-drift.ts` |
| `check-teeth-registry` | `check-teeth-registry.spec.ts` — 14 testes | **mutação** | comando 3 → **vermelho nomeando o gate** (medido 2026-10-05) | `.tooling/scripts/ci/check-teeth-registry.ts` |
| `check-self-firing-guard` | `check-self-firing-guard.spec.ts` — 10 testes | **mutação** | comando 5 → **diferencial 0 → 8 achados** (medido 2026-10-05) | `.tooling/scripts/ci/check-self-firing-guard.ts` |
| `turbo-redirect-differential` | o próprio script — 18 formas de redirect contra o turbo REAL; e o comando 7. **O veredito** (`[ "$div" -eq 0 ]`) é coberto por `turbo-redirect-differential.spec.ts` — 2 de 3 | **mutação** | comando 7 → **1 e 3 de 18 divergentes**; e o veredito `-eq 0` → `-ge 0` → **2 de 3 vermelho** (medido 2026-10-05) | `.tooling/scripts/ci/turbo-redirect-differential.sh` |
| `check-harness-owner` | `check-harness-owner.spec.ts` — 19 testes, incluindo o segundo órfão | **controle positivo** | comando 6 → **exit 0** — a prova é invertida por desenho (medido 2026-10-05) | `.tooling/scripts/ci/check-harness-owner.ts` |
| `check-branch-up-to-date` | `check-branch-up-to-date.spec.ts` — `VERMELHO numa demanda implementada com a main desatualizada` / `após o rebase, a mesma demanda fica verde` (o par, contra **git de verdade**), mais `NÃO confunde "sem ancestral comum" com "atrasada"` e `VERMELHO, e nomeando o estado, com um rebase PARADO em conflito` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-branch-up-to-date` → **2 de 11** com a detecção de "atrasada" neutralizada, **1 de 11** com `128` fundido em "atrasada", **2 de 11** com o `skipped` removido, **1 de 11** com o rebase-em-andamento neutralizado, **1 de 11** com a junção do caminho ao `repoRoot` removida (medido 2026-10-06) | `.tooling/scripts/ci/check-branch-up-to-date.ts` |
| `check-e2e-flow-coverage` | `check-e2e-flow-coverage.spec.ts` — `acusa spec que declara fluxo fora do inventário, nomeando os dois lados` / `acusa o meio-cumprido: spec novo sem linha no inventário` (o par), sobre **fixtures em tmpdir** | **mutação** | `npx vitest run --root .tooling/scripts/ci check-e2e-flow-coverage` → **2 de 15** com `if (!porId.has(id))` neutralizado, **5 de 15** com o VEREDITO (`ok: errors.length === 0`) neutralizado (medido 2026-10-08) | `.tooling/scripts/ci/check-e2e-flow-coverage.ts` |
| `check-ci-local-e2e` | `check-ci-local-e2e.spec.ts` — `acusa pacote de e2e fora dos --filter — o gate que passaria verde com um app novo` e `o filtro de uma invocação que NÃO roda e2e não alcança ninguém para o e2e` (o par), sobre **fixtures em tmpdir**, mais o caso do repo real | **mutação** | `npx vitest run --root .tooling/scripts/ci check-ci-local-e2e` → **6 de 25** com o VEREDITO neutralizado, **2 de 25** só com o alcance por `--filter`, **1 de 25** tirando o escopo por invocação (medido 2026-10-08) | `.tooling/scripts/ci/check-ci-local-e2e.ts` |
| `check-ci-local-scope` | `check-ci-local-scope.spec.ts` — `acusa o pacote que implementa a task e nao esta no filtro — e nomeia qual task` e `acusa ci:local que nao roda a suite do tooling` (o par), sobre **fixtures**, mais `mede e devolve o que olhou` e o `ci:local` ausente devolvendo `medidos: null` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-ci-local-scope` → **2 de 10** com o VEREDITO neutralizado, **1 de 10** só com o alcance por `--filter`, **1 de 10** só com a checagem de `tooling:test` (medido 2026-10-13; restaurado byte-exato) | `.tooling/scripts/ci/check-ci-local-scope.ts` |
| `check-memory-crystallization` | `check-memory-crystallization.spec.ts` — 33 testes: o par nas DUAS direções (`a evaporação` = memória sem destino, `a âncora que deixou de estar`), a **forma** da linha (`1, 3 ou 5 células` = linha quebrada, nunca linha ignorada em silêncio), a **âncora da acusação** (`falta o \| final` = uma linha que começa com `\|` continua sendo tentativa de linha de tabela, e não desarma a mesa), a não-regressão das outras tabelas do ledger, que têm 2 e 3 colunas, e o advisory das `pendente` — dívida que o gate NOMEIA em vez de cobrar, mais `a evaporação` contra a derivação REAL, não só em fixture | **mutação** | `npx vitest run --root .tooling/scripts/ci check-memory-crystallization` (denominador **33**) → **7 de 33** com o `emTabelaTriagem` nunca ligando (é ele que decide "isto é linha de triagem?", e decide pelo cabeçalho — a versão anterior perguntava à 2ª célula e fugia de 3 das 6 formas de linha quebrada), **3 de 33** com o veredito neutralizado, **3 de 33** com o `findStaleAnchors` vazio, **2 de 33** com o `findUncovered` vazio, **2 de 33** com a guarda de forma voltando a `< 4`, **2 de 33** com o `findMissingTargets` vazio, **1 de 33** com o `findPhantomRows` vazio, **1 de 33** com o filtro das `pendente` vazio, **1 de 33** com a guarda do pipe final removida, **1 de 33** com o ramo `citada` do `findMissingTargets` virando `gate`-only (medido 2026-10-15). A variante `row.split('\\|')` **cru** derruba **17 de 33** — por isso a mutação nomeia o ramo removido e não "o split". ⚠️ **Camada 1 local por construção**: o corpus vive em `$HOME`, então no CI ele reporta `skipped` com o motivo — nunca verde | `.tooling/scripts/ci/check-memory-crystallization.ts` |
| `check-teeth-count` | `check-teeth-count.spec.ts` — **6 testes**, nomes literais do spec: `verde quando name count === array length, e file count < name count` / `vermelho quando o grep acha MENOS \`name:\` do que o array tem (entry sem nome)` (grep vs array) / `vermelho quando o par name/file quebra (file count === name count)` (paridade `fileCount >= nameCount`, defeito DIFERENTE do anterior) / `vermelho quando preflight-gates.ts não existe` / `o bloco de CLI roda de verdade: imprime algo na árvore real` (fecha a classe "gate sem bloco CLI roda como no-op" — o comando de remedição era mudo no verde) / `o CLI sai DIFERENTE de zero quando a paridade está quebrada` (o exit code é a OUTRA metade do mesmo defeito, e MEDIDO 2026-10-18 estava sem dente: trocar `process.exit(r.ok ? 0 : 1)` por `process.exit(0)` deixava os 5 testes anteriores verdes, porque nenhum rodava o CLI contra uma árvore quebrada) | **mutação** | `npx vitest run --root .tooling/scripts/ci check-teeth-count` (denominador **6**, base 6/6 verde, gate restaurado byte-a-byte `sha256 83ac14832d0c`) → **3 de 6** com `realCount` forçado para `0`, **3 de 6** com `nameCount` forçado para `0`, **2 de 6** com o `if (nameCount !== realCount)` neutralizado, **1 de 6** com o `if (fileCount > 0 && …)` neutralizado, **2 de 6** com o bloco de CLI desligado (`if (false)`) e **1 de 6** com `process.exit(0)` no lugar do veredito. As duas primeiras derrubam só os testes de FUNÇÃO: o teste de CLI é **ortogonal** a elas — o bloco continua rodando e imprimindo, então passar ali é o resultado certo, e foi por isso que ele exige *saída* e não `status === 0` + `/OK/` (a versão anterior exigia as duas, e as duas caíam juntas quando alguém adiciona um gate ao `PREFLIGHT_CHECKS` sem `file:` — falso vermelho que não é "o bloco parou", medido 2026-10-18). Só o `vermelho quando preflight-gates.ts não existe` sobrevive às duas primeiras, porque sai no `require` antes da comparação. Os dois últimos são **ortogonais entre si**: desligar o bloco tira os 2 testes que o executam, e forçar `exit(0)` tira só o que olha o status — o outro continua verde porque a impressão não mudou, que é a separação certa. **Diferencial contra o repo real**: adicionar uma entrada em `PREFLIGHT_CHECKS` sem a linha `name:` correspondente (a armadilha original que motivou este gate) → preflight **vermelho** com `contagem DIVERGE: PREFLIGHT_CHECKS tem X entradas, mas o grep achou Y linhas`; restaurado → verde (medido 2026-10-16) | `.tooling/scripts/ci/check-teeth-count.ts` |
| `check-harness-location` | `check-harness-location.spec.ts` — 13 testes: `arquivo em subdir → vermelho` / `todos os check-*.ts na raiz → verde` (o par), o `.spec.ts` em subdir NÃO acusado, arquivo que não é `check-*` NÃO acusado, e `gate untracked (sem git add) → vermelho` — este último porque `git ls-files` sem `--others` só vê o que está TRACKED, e um gate novo nasce untracked até o primeiro commit dele; mais `acusa check-*.ts em tooling/scripts/`, que é a regra (1) e era a ÚNICA das quatro sem teste, e o trio `git indisponível`: `skipped` nomeando as varreduras que não rodaram, `skipped` que NÃO engole o erro de (3) — que não depende de git —, e o motivo trazendo a CAUSA que o `git` escreve em `stderr` e não o `Command failed:` que repetia o pathspec | **mutação** | `npx vitest run --root .tooling/scripts/ci check-harness-location` (denominador **13**, base 13/13 verde) → **4 de 13** tirando o filtro `path.dirname(arq) === '.tooling/scripts/ci'` (o `continue` que separa "na raiz" de "sombreado"), **3 de 13** com `if (false)` na checagem de `file:` válido, **3 de 13** com o `skipped` desligado (`if (false && semGit.length > 0)`) — a mutação que mede o defeito corrigido nesta branch, e ela não tinha o que desligar antes: os três `catch {}` vazios devolviam `ok:true` sem medir nada —, **2 de 13** com `if (false)` no push do sub-check (4), e **1 de 13** para cada uma destas duas: o laço da regra (1) esvaziado, e a leitura da causa em `err.stderr`. **Diferencial contra o repo real**: mesma árvore e mesmo argv, só o `git` trocado por um stub que sai com 1 → `skipped:true` nomeando `3 varredura(s) por git ls-files NÃO rodaram`; com o `git` respondendo → `skipped` ausente (medido 2026-10-19). Plantar um `check-fantasma.ts` em `sub-dif/` sob o diretório de gates → preflight **vermelho** nomeando o path; restaurado → verde (medido 2026-10-16). Sobre o path plantado: ele pode ser real. `registryGateFiles` só trata como declaração a célula que é **inteiramente** um token entre crases, então citar um path na prosa da própria linha não vira gate — antes desta PR, citar o path do gate na linha dele travava o gate com "entrada que não corresponde a nenhum gate" e nenhuma reformulação da frase contornava (medido 2026-10-16) | `.tooling/scripts/ci/check-harness-location.ts` |
| `check-agent-routing-coverage` | `check-agent-routing-coverage.spec.ts` — `verde quando todos os agents estão referidos` / `vermelho quando há agent órfão` / `vermelho quando há agent fantasma` (o par) | **mutação** | `npx vitest run --root .tooling/scripts/ci check-agent-routing-coverage` → **2 de 14** com `diffAgents` neutralizado para `{orphans: [], ghosts: []}`, **1 de 14** com a regex de matriz quebrada. **Diferencial contra o repo real**: com este gate **desligado**, a árvore de #94 tinha **11 agents órfãos** (agent-architect, code-reviewer, doc-sync, explorer, orchestrator, otelcol-infra-specialist, review-router, specialist-router, stack-code-reviewer, task-manager, tdd-enforcer) — em disco, sem entrada em `specialist-routing.md`, e **todos passavam em silêncio**. `d3bbdf8` (#94) completou a matriz e o gate fechou em `0 órfãos / 0 fantasmas` (remedição medida em 2026-10-16; reverificar com `checkAgentRoutingCoverage()` — o arquivo não tem bloco CLI, então `tsx check-agent-routing-coverage.ts` carrega o módulo e sai `0` sem varrer nada) | `.tooling/scripts/ci/check-agent-routing-coverage.ts` |
| `check-engines-consistency` | `check-engines-consistency.spec.ts` — `parseMinEngine` em unidade (3 casos) + `rootSatisfiesApp` em unidade (6 casos) + `checkEnginesConsistency` (6 casos: raiz OK, app bate, app mais antigo, app mais novo, raiz sem engines, sem apps) | **mutação** | `npx vitest run --root .tooling/scripts/ci check-engines-consistency` → **3 de 15** com `rootSatisfiesApp` neutralizado para `true`, **2 de 15** com a regex de parse neutra, **2 de 15** com o `skipped` removido. **Diferencial contra o repo real**: declarar `engines.node: ">=18"` em `apps/web/package.json` → preflight **vermelho** nomeando o path; restaurado → verde (medido 2026-10-16) | `.tooling/scripts/ci/check-engines-consistency.ts` |
| `check-runbook-drift` | `check-runbook-drift.spec.ts` — 18 testes: `extrairScriptsPnpm` em unidade (8 casos: extrai de bloco, ignora prosa, ignora `pnpm exec`/`--filter`/`turbo run`, deduplica) + `extrairChavesEnv` (2) + `checkRunbookDrift` (8: verde, script fantasma, script de app do workspace, chave de env sumida, chave só no exemplo do app, runbook ausente → skipped COM MOTIVO, sem .env.example, wired no repo real) | **mutação** | `npx vitest run --root .tooling/scripts/ci check-runbook-drift` → **2 de 18** com `if (!scripts.has(s))` neutralizado, **1 de 18** com `if (!envExamples.has(k))` neutralizado (medido 2026-10-16). **Diferencial contra o repo real**: `pnpm comando-que-nao-existe` appendado no `docs/como-rodar.md` → gate **vermelho** nomeando o script; restaurado → `ok=true`. MEDIDO na 1ª versão: varrer o doc inteiro (sem exigir bloco de código) acusou **5 falsos positivos** ("pnpm nativo", "pnpm responde", "workspace pnpm as deps", `pnpm prune`, `pnpm deploy`) — por isso a regra só lê blocos cercados | `.tooling/scripts/ci/check-runbook-drift.ts` |
| `check-dockerfile-hardening` | `check-dockerfile-hardening.spec.ts` — 13 casos: verde base, sem @sha256:, sem USER 1001:1001 no stage prod, sem init: true, sem read_only, sem top-level networks, sem `networks:` no serviço `api`, sem `networks:` em serviço **novo** (a lista virou enumeração do bloco `services:`), enumeração vazia → erro, sem .env.production* no .dockerignore, e 2 do contrato ARG (aceita com sha256, rejeita com default não-sha256), e formas alternativas de .dockerignore | **diferencial** | `pnpm --config.engine-strict=false exec vitest run --root .tooling/scripts/ci check-dockerfile-hardening` (denominador **13**) → **4 de 13** com `listComposeServices` neutralizada para `[]`, e 13/13 no repo real (issue 83, 84, 88, 89, 90, 91, 92 fechadas). MEDIDO 2026-10-16: `api` não era checado, e a lista de nomes que o corrigiu deixava passar serviço NOVO — os dois caíram **2 de 13** antes das correções | `.tooling/scripts/ci/check-dockerfile-hardening.ts` |
| `check-flow-mermaid-sync` | `check-flow-mermaid-sync.spec.ts` — **10 testes**: `IR mudou e o flow.md ficou velho → vermelho`, `flow.md editado à mão → vermelho`, `IR sem flow.md → vermelho`, `zero IR → vermelho` (critério inerte sobre conjunto vazio), `IR fora do layout → vermelho`, `flow.md sem IR → vermelho` (órfão), `duas IRs no mesmo diretório → 1 erro só`, `IR ilegível → vermelho sem derrubar o painel`, + `todos os diagramas batem com a IR deles` **contra o repo real**. Os 4 do meio foram achados da revisão adversarial de 2026-10-16, não features: a enumeração andava por posição fixa e devolvia o DIRETÓRIO, então uma IR mal posicionada nunca entrava na lista (verde), um `flow.md` sem IR ninguém notava (verde), e 2 IRs no mesmo diretório produziam o mesmo erro 2× mandando rodar `--write` — que regravava pela outra IR, vermelho sem caminho de conserto | **mutação** | `npx vitest run --root .tooling/scripts/ci check-flow-mermaid-sync` (denominador **10**) → **3 de 10** com a comparação `!==` neutralizada, **1 de 10** com o erro de conjunto vazio, **1 de 10** com a conferência de layout, **1 de 10** com a enumeração de docs órfãos (medido 2026-10-16). O teste de layout passou por 3 mutações com a asserção antiga (`toContain('fora-do-layout')`, que também casa no erro de "diagrama ausente") — corrigido para a mensagem específica; é o motivo de o denominador de cada mutação ser conferido contra o nome do teste que cai, não só contra a contagem. Estado real no mesmo dia: **15 IRs, 15 casando, 0 drift** — o gate nasce verde, e nasce verde porque ninguém editou IR sem regenerar, não porque ele não olha | `.tooling/scripts/ci/check-flow-mermaid-sync.ts` |
| `check-test-set-covered` | `check-test-set-covered.spec.ts` — **13 testes**: `todo test* roda → verde`, `script declarado e nunca executado → vermelho`, `pacote fora dos --filter → vermelho`, `exceção declarada inaplicável → vermelho` (a promessa não cumprida), `exceção citando script inexistente → vermelho`, `zero script test* → vermelho` (conjunto vazio), `ci:local ausente → vermelho`, `alias do mesmo comando NÃO acusado mas visível em advisory`, `alias com comando diferente → ainda vermelho`, `filtro test* não casa lint-staged`, `tabela de exceções lida pelo NOME da coluna`, `reordenar colunas não quebra o parse`, `tabela ausente → vazio` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-test-set-covered` (denominador **13**) → **6 de 13** com o veredito neutralizado, **2 de 13** com a exceção envelhecida ignorada, **1 de 13** com a regra do alias removida, **1 de 13** com 0 script aceito (medido 2026-10-16). Estado real: **12 script(s) `test*` em 6 pacote(s), 2 alias, 3 exceção(ões)** — e o alias existe porque `@projeto/api#test` e `@projeto/web#test` são byte-idênticos a `test:unit`, que entra; acusá-los seria pedir exceção para suíte que já executa. A exceção NÃO é inferida do conteúdo do script (`echo … && exit 0`), porque aí qualquer `echo` novo vira "sem testes" e a regra perde o dono | `.tooling/scripts/ci/check-test-set-covered.ts` |
| `check-tenant-scope-source` | `check-tenant-scope-source.spec.ts` — **16 testes**: `🔴 @Param do mesmo arquivo indo para o escopo → vermelho` (nomeia arquivo:linha e o argumento), `🔴 request.headers lido na mão → vermelho`, `corpus real → verde`, `🔴 corpus VAZIO → vermelho` (`ZERO call sites`), `*.spec.ts` fora da contagem`, `🔴 comentário que documenta o furo não vira defeito E a linha não desloca`, `definição dos helpers não conta como chamada`, `aninhamento conta as DUAS chamadas`, `🔴 abrirEscopo lê o 2º argumento`, `valor de DOMÍNIO não é valor de rota` (9 casos), `comentário de linha não engole a linha seguinte`, `o resíduo cross-file é CONTADO e não vira nem acusação nem silêncio`, `🔴 // dentro de string NÃO come o call site do fim da linha`, `🔴 vírgula dentro de string NÃO parte o argumento de escopo`, `🔴 parêntese dentro de string NÃO rouba o fim da chamada`, `o // de um comentário NÃO abre uma string que engole o arquivo` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-tenant-scope-source` (denominador **16**, base **16/16 verde**, gate restaurado byte-a-byte `sha256 befcdda6708a`; as **DEZ** mutações medidas na MESMA rodada de 2026-10-18, porque a correção do fixture mudou os números das antigas) → **2 de 16** com `FONTE_DE_ROTA` sem casar nada, **1 de 16** com `nomesPresosNaRota` devolvendo conjunto vazio, **3 de 16** com a **branch de string** de `semRuido` neutra (`if (false)`), **2 de 16** com o split por vírgula de `argumentosDaChamada` neutralizado, **2 de 16** com o pulo de DEFINIÇÃO em `achamChamadasDeEscopo` neutralizado, **2 de 16** com a anti-vacuuidade (`total === 0`) removida, **5 de 16** com `*.spec.ts` entrando no corpus, **9 de 16** com `achamChamadasDeEscopo` devolvendo `[]`, **2 de 16** com o dedupe por linha removido e **5 de 16** com `semRuido` devolvendo o input cru. A da branch de string é a que separa o teste do `//` dentro de string dos outros dois de parser. **Duas remediações, porque a primeira medição era falsa:** (a) saiu 3/2/9/3/3/6 com a base em 15/16 — um teste já vermelho na base contava como falha de TODA mutação, inflando cada número em +1; (b) o teste do `//` dentro de string tinha um `\n` entre a string e o call site, então a cauda comida era VAZIA e ele passava com a branch neutra — agora o call site é DA MESMA LINHA. Duas lições, uma só: mutação que não cai não é «mutação fraca», é medida feita com o instrumento errado — e número de mutação medido antes da última correção do SPEC envelhece tão rápido quanto o resto). **Diferencial contra o repo real**: arquivo com `@Param('id') tenantId` + `escopoDoTenant(tenantId)` plantado em `apps/api/src/modules/tenancy/infrastructure/persistence/PLANT-prova.ts` → gate **vermelho** em `PLANT-prova.ts:4`; arquivo removido → EXIT=0. Estado real: **66 call site(s)**, 0 accusations — **e 66 SEM PROVA de origem**, número que sai em `advisories` justamente porque texto não prova o salto cross-file (controller → repositório). ⚠️ **nenhum gate compara esse número com o do run anterior**: um 67º call site cross-file deixa o gate verde, com o advisory maior. Ler e comparar é ato humano — ver o aviso no cabeçalho de `check-tenant-scope-source.ts` | `.tooling/scripts/ci/check-tenant-scope-source.ts` |
| `check-feature-flag-contract` | `check-feature-flag-contract.spec.ts` — **14 testes**: `alinhado: verde` / `DIREÇÃO 1 — descrição que mudou no catálogo e não seguiu o contrato é ERRO` / `DIREÇÃO 2 — chave que o contrato exemplifica e o catálogo não tem é ERRO` / `a chave que SAI do catálogo e deixa o exemplo para trás é ERRO, não silêncio` (o quarto é o modo de falha que a direção 1 **não** pega: a descrição some junto, então o contrato continua bem formado descrevendo recurso inexistente), `catálogo com ZERO chaves é ERRO, não verde` / `contrato com ZERO chaves é ERRO` (o par anti-vacuuidade: classe 5 de `guard-classes.md` aplicada ao próprio gate), `chave do catálogo SEM descricao é ERRO — não é uma chave a menos em silêncio` / `descricao a mais que chave também é ERRO, pelo mesmo motivo` (o par do desalinhamento: o `Math.min` do pareamento por POSIÇÃO truncava no menor dos dois arrays, a chave excedente não gerava erro nem contagem, e o advisory — a saída que nomeia a contagem — afirmava "1 chave conferida" num catálogo com 2), `descrição VAZIA no catálogo é ERRO` / `descrição que só é SUBSTRING do contrato é ERRO` (o par do `includes`: `''.includes('')` é sempre verdadeiro e varrer o documento não pergunta "é a descrição DESTE exemplo", então a direção 1 comparava por TEXTO e não por VALOR), `o MESMO par repetido no contrato não vira "chave sem descricao"` (o `Map` colapsa duplicata — contar por `pares.size` acusava no arquivo REAL, onde o par aparece na listagem e no PUT), `a descrição atravessada por quebra de linha no catálogo ainda casa` (senão o prettier reformatar o catálogo e o gate virasse alarme falso), e 2 contra os **arquivos reais** — o `o gate leu pelo menos UMA chave`, que é o positivo com dente: uma função que devolvesse `ok: true` sem ler nada passaria no outro | **mutação** | `npx vitest run --root .tooling/scripts/ci check-feature-flag-contract` (denominador **14**, base **14/14 verde**) → **8 de 14** com o VEREDITO `ok: erros.length === 0` neutralizado para `ok: true`, **3 de 14** com a contagem do pareamento de volta em `pares.size` em vez de `n` (a duplicata do arquivo real), **2 de 14** para cada uma destas três: a direção 1 por VALOR (`noContrato !== descricao`), e as duas metades do desalinhamento (`semPareamento: []` e o laço que a transforma em erro); e **1 de 14** para cada uma destas **seis**: a direção 2 (`!catalogo.pares.has(chave)`), anti-vacuuidade do catálogo, anti-vacuuidade do contrato, `descricaoSolta` neutra, rejeição da `descricao` vazia, e o `ZERO` do contrato. O **8 de 14** do veredito é menor que 14 porque só 8 dos 14 testes afirmam o veredito por `ok` — a anti-vacuuidade afirma por `errors[0]`, que continua vermelho com `ok: true` porque `erros` não passou pelo veredito. Trocar o `break` do laço de pareamento por `continue` deixa **14 de 14 verde**: é semanticamente equivalente — nos dois casos a chave excedente não entra no mapa e sobra em `semPareamento` — então essa mutação não prova nada e ficou fora da lista (medido 2026-10-19). **Diferencial contra o repo real**: (a) `descricao` do catálogo reescrita sem o contrato seguir → **EXIT=1**; (b) a chave trocada por `tenancy.outros` no catálogo, com os dois exemplos do contrato intactos → **EXIT=1**; restaurado → **EXIT=0** (medido 2026-10-19). | `.tooling/scripts/ci/check-feature-flag-contract.ts` |
| `check-feature-flag-portas` | `check-feature-flag-portas.spec.ts` — **23 testes**: 5 de `parsearPortas` (inclui `a descrição em prosa ("três portas") NÃO abre o bloco` — MEDIDO: com `indexOf('portas:')` solto, a palavra dentro da `descricao` de §4 era o primeiro casamento e o gate devolvia ZERO portas com a lista perfeitamente escrita), 3 de `rotasDoController` (incluindo `comentário com @Post(...) não vira rota` e `@Post() sem path casa a rota RAIZ do @Controller()`), 2 de `chavesUsadasNoController` (o par `a chave em PROSA não conta` fecha o gate contra o comentário), 4 de `rotaTrancaComAChave` (incluindo `a janela NÃO contamina: o decorator da rota anterior não vale para esta` e `a chave errada na janela é false`), 7 do gate (dos quais `contrato com ZERO portas é ERRO, não verde` e `porta ABERTA no código e ausente da lista é erro — a quarta porta`), e 2 **contra os arquivos do repo** (o contrato real declara as três portas, e o gate real está verde com `3 porta(s)` no advisory — o teste que a #110 exige, "spec que roda contra os arquivos reais, não só fixtures") | **mutação** | contra os ARQUIVOS REAIS, `tsx tmp-g.ts` → `checkFeatureFlagPortas()`: (a) **4ª porta aberta e não declarada** (`@Post('tenants/:id/invitations/bulk')` + `@RequireFeatureFlag`) → **EXIT=1**, nomeando a rota; (b) **porta DECLARADA perde o `@RequireFeatureFlag`** (linha removida) → **EXIT=1**, `"a rota está ABERTA com a flag desligada"`; (c) **porta inline perde a `chaveDesligada`** → **EXIT=1**, "não USA a chave". As três estão em spec. ⚠️ **Furos que a implementação teve e que os dentes pegaram** (medido 2026-10-19): (i) comparar por ARQUIVO em vez de por ROTA — (a) passava verde, porque o controller já declara duas portas da mesma chave; (ii) a mesma comparação no sentido 1 — (b) passava verde, porque `chavesUsadasDoController` via a chave na OUTRA porta; (iii) `rotaTrancaComAChave` com a premissa "`@RequireFeatureFlag` fica ACIMA do `@Post`" — no arquivo real ele é DEPOIS (linha 92 depois da 81), e a janela olhava para o lado errado; (iv) `@POST` em vez de `@Post` no regex, e `POST /tenants/…` contra `POST tenants/…` sem a barra — a função devolvia `false` para TODA rota e o gate ficava verde com a quarta porta aberta. Nenhum dos quatro sobreviveu ao spec. | `.tooling/scripts/ci/check-feature-flag-portas.ts` |

> A coluna **Arquivo** é a chave de reconciliação: o `check-teeth-registry` casa o
> registro com o `preflight.ts` por ela. Sem a coluna o gate é identificado pelo
> **nome de exibição** — e aí `'Cross-refs em .md versionados'` casa com
> `` check-doc-refs `` por coincidência, `check-eslint-drift` (2 entradas) contaria
> como dois gates, e qualquer gate novo entraria no preflight sem aviso.
>
> ⚠️ **A regra de leitura é "qualquer path versionado em backtick, na linha"**, por
> decisão (`check-teeth-drift.spec.ts`: *"um parse posicional só funciona enquanto
> ninguém reordenar a tabela"*). Duas consequências medidas em 2026-10-08: **(1)**
> citar um path de prova entre backticks numa célula registra um gate que não existe
> → ao descrever uma medição, deixe o path **sem backtick**; **(2)** **três crases**
> numa célula deixa o total ímpar, o emparelhamento desloca e o gate **da própria
> linha** deixa de ser lido (foi assim que `lint-review-routing.ts` acusou órfão).

Os **onze comandos de mutação** — 1 a 7 medidos 2026-10-05, 8 e 9 em 2026-10-08, 10 e 11 em 2026-10-16.
Cada um reverte o arquivo ao final, e o `git diff` depois deles tem de estar vazio:

```bash
# 1) check-archive-integrity — reintroduz o B19: sem --archive-dir, o linter
#    resolve relativo ao SEU cwd (tooling/scripts) e nunca lê o archive real.
sed -i "s|\`--archive-dir=\${archiveDir}\`||" .tooling/scripts/ci/check-archive-integrity.ts
npx vitest run --root .tooling/scripts/ci check-archive-integrity   # -> 3 de 7 vermelho
git checkout -- .tooling/scripts/ci/check-archive-integrity.ts

# 2) check-memory-dir-concordance — a derivação canônica passa a apontar para
#    um path que ninguém cria. O path é neutro de propósito: um caminho real
#    aqui seria uma 2ª declaração do destino, que é o defeito que o check caça.
sed -i 's|^MEMORY_DIR=.*|MEMORY_DIR="$HOME/caminho-que-nao-existe/memory"|' \
  .agents/specs/conventions/retrospective-capture.md
npx vitest run --root .tooling/scripts/ci check-memory-dir-concordance  # -> 3 de 27 vermelho
git checkout -- .agents/specs/conventions/retrospective-capture.md

# 3) check-teeth-registry (reconciliação) — some uma linha da tabela de dentes.
#    O gate continua RODANDO; é a documentação que ficou órfã. Vermelho
#    nomeando o arquivo, não um "registro divergente" genérico.
cp .agents/specs/conventions/ci-defense-in-depth-dentes.md /tmp/dentes.bak
sed -i '/^| `check-docker-drift` |/d' .agents/specs/conventions/ci-defense-in-depth-dentes.md
npx tsx .tooling/scripts/ci/check-teeth-registry.ts   # -> 1 erro, nomeando check-docker-drift.ts
cp /tmp/dentes.bak .agents/specs/conventions/ci-defense-in-depth-dentes.md   # restaurado byte-exato
# NOTA (2026-10-16): os mutadores perls acima foram reexecutados como escritos, e
# 2 dos 4 NÃO casavam — `\)$` no fim do padrão não casa com uma linha que termina
# em `;`, e o de "alias" reescrevia 3 linhas por 1 e quebrava o arquivo (transform
# error, "Tests no tests": o denominador some). Mutador que não casa reporta
# "verde" e parece dente. Um número do registro mudou com a correção: o veredito
# do gate de testes é 6 de 13, não 8.
#
# NOTA: o `cp` de backup é obrigatório aqui, e não um cuidado de overkill — o
# `sed -i` destrói a tabela in-place, então a linha de restauração sem backup
# apaga o arquivo inteiro. Encontrado pela revisão adversarial de 2026-10-16,
# num PR que justamente EDITAVA este arquivo.

# 4) check-teeth-registry (roteamento) — o prefixo de "." some da path_glob.
#    A rota continua existindo e o lint da matrix continua verde (a regra não é
#    blocking): só que ela casa 0 arquivos. 12 dos 13 gates ficam sem rota —
#    classe 1, "condição inalcançável". Este é o RED que a task 3.2 achou.
sed -i 's|- pattern: "\.tooling/scripts/ci/\*\*"|- pattern: "tooling/scripts/ci/**"|' \
  .agents/specs/conventions/review-routing.md
npx tsx .tooling/scripts/ci/check-teeth-registry.ts   # -> 12 erros "não alcançado por nenhuma path_glob"
sed -i 's|- pattern: "tooling/scripts/ci/\*\*"|- pattern: ".tooling/scripts/ci/**"|' \
  .agents/specs/conventions/review-routing.md       # restaurado byte-exato

# 5) check-self-firing-guard (classe 3) — a isenção mecânica é neutralizada.
#    O guard NÃO fica vermelho: a linha que cita o nome dele casa o símbolo
#    que é parte do próprio nome, e a seção canônica o absorve. É por isso
#    que este check é um DIFERENCIAL (0 → 8) e não uma asserção de verde —
#    sem o `N`, "verde" e "isenção inerte" são o mesmo resultado.
perl -0pi -e "s|return line\.replaceAll\(SELF_NAME, ''\);|return line;|" \
  .tooling/scripts/ci/check-memory-dir-concordance.ts
npx tsx .tooling/scripts/ci/check-self-firing-guard.ts   # -> 8 erros "dispara em si mesmo"
perl -0pi -e "s|^function stripSelfName\(line: string\): string \{\n  return line;\n\}|function stripSelfName(line: string): string {\n  return line.replaceAll(SELF_NAME, '');\n}|m" \
  .tooling/scripts/ci/check-memory-dir-concordance.ts   # restaurado byte-exato (conferido com diff)

# 6) check-harness-owner (controle desligado) — a prova de dente é INVERTIDA:
#    neutraliza-se a resolução de dono, e o check tem de FICAR VERDE. Se ele
#    continuar vermelho, o vermelho não vinha da dívida — vinha de outra coisa.
perl -i -pe "s/^  const owners: string\[\] = \[\];\$/  const owners: string[] = ['preflight.ts#checks']; return owners;/" \
  .tooling/scripts/ci/check-harness-owner.ts
npx tsx .tooling/scripts/ci/check-harness-owner.ts   # -> exit 0
perl -i -pe "s/^  const owners: string\[\] = \['preflight.ts#checks'\]; return owners;\$/  const owners: string[] = [];/" \
  .tooling/scripts/ci/check-harness-owner.ts   # restaurado byte-exato (conferido com diff)

# 7) turbo-redirect-differential — o parser volta a errar a forma que o
#    turbo real trata como task. Duas mutações medidas: perder o `>&` deixa
#    1 de 18 divergente, perder a proteção de aspas deixa 3 de 18.
perl -0pi -e 's|\.replace\(/>&/g, `>\$\{BOTH_STREAMS\}`\);|.replace(/x-NEVER/g, `x`);|' \
  .tooling/scripts/ci/check-package-json-drift.ts
bash .tooling/scripts/ci/turbo-redirect-differential.sh   # -> exit 1, "1 divergentes"
cp /tmp/cpjd.bak .tooling/scripts/ci/check-package-json-drift.ts   # restaurado byte-exato

# 8) check-e2e-flow-coverage — a reconciliação É o gate inteiro; o resto é I/O.
#    Duas mutações medidas. A segunda é a que interessa: neutralizar o VEREDITO
#    (`ok: errors.length === 0`) tira 5 de 15, e os 5 caem pelo motivo certo —
#    conferido pelo nome, não só pela contagem. `acusa inventário vazio`
#    continua VERDE por retornar antes da linha neutralizada: é o certo dele.
cp .tooling/scripts/ci/check-e2e-flow-coverage.ts /tmp/e2eflow.bak
perl -0pi -e 's/    if \(!porId\.has\(id\)\) \{/    if (false) {/' \
  .tooling/scripts/ci/check-e2e-flow-coverage.ts
npx vitest run --root .tooling/scripts/ci check-e2e-flow-coverage  # -> 2 de 15 vermelho
cp /tmp/e2eflow.bak .tooling/scripts/ci/check-e2e-flow-coverage.ts   # restaurado byte-exato

# 9) check-ci-local-e2e — TRÊS mutações medidas, denominador 25. O VEREDITO
#    (`ok: errors.length === 0`) neutralizado tira 6; as duas de alcance, 2 e 1.
cp .tooling/scripts/ci/check-ci-local-e2e.ts /tmp/cil2e.bak
perl -0pi -e 's/  \} else \{\n/  } else if (false) {\n/' \
  .tooling/scripts/ci/check-ci-local-e2e.ts
npx vitest run --root .tooling/scripts/ci check-ci-local-e2e  # -> 2 de 25 vermelho
perl -0pi -e 's/\.filter\(\(i\) => TASKS_E2E\.some\(\(t\) => i\.tasks\.includes\(t\)\)\)//' \
  .tooling/scripts/ci/check-ci-local-e2e.ts
npx vitest run --root .tooling/scripts/ci check-ci-local-e2e  # -> 1 de 25 vermelho
cp /tmp/cil2e.bak .tooling/scripts/ci/check-ci-local-e2e.ts   # restaurado byte-exato

# 10) check-flow-mermaid-sync — o comparador entre o que está em disco e o que
#     o conversor produziria, mais as DUAS conferências que a revisão adversarial
#     de 2026-10-16 mostrou que faltavam. QUATRO mutações medidas, denominador 10.
cp .tooling/scripts/ci/check-flow-mermaid-sync.ts /tmp/cfms.bak
perl -0pi -e "s/if \(readFileSync\(docPath, 'utf-8'\) !== esperado\)/if (false)/" \
  .tooling/scripts/ci/check-flow-mermaid-sync.ts
npx vitest run --root .tooling/scripts/ci check-flow-mermaid-sync  # -> 3 de 10 vermelho
cp /tmp/cfms.bak .tooling/scripts/ci/check-flow-mermaid-sync.ts
perl -0pi -e 's/  if \(irs\.length === 0\) \{/  if (false) {/' \
  .tooling/scripts/ci/check-flow-mermaid-sync.ts
npx vitest run --root .tooling/scripts/ci check-flow-mermaid-sync  # -> 1 de 10 vermelho
cp /tmp/cfms.bak .tooling/scripts/ci/check-flow-mermaid-sync.ts
perl -0pi -e 's/if \(noLayoutEsperado\(irPath, flowsRoot\)\) \{/if (false) {/' \
  .tooling/scripts/ci/check-flow-mermaid-sync.ts
npx vitest run --root .tooling/scripts/ci check-flow-mermaid-sync  # -> 1 de 10 vermelho
cp /tmp/cfms.bak .tooling/scripts/ci/check-flow-mermaid-sync.ts
perl -pi -e 's/^    if \(doc\.endsWith.*$/    if (false) { dirsComDoc.add(dirname(doc)); }/' \
  .tooling/scripts/ci/check-flow-mermaid-sync.ts
npx vitest run --root .tooling/scripts/ci check-flow-mermaid-sync  # -> 1 de 10 vermelho
cp /tmp/cfms.bak .tooling/scripts/ci/check-flow-mermaid-sync.ts   # restaurado byte-exato

# 11) check-test-set-covered — o que dá dentes a "todos os testes devem estar
#     passando" (tdd.md). QUATRO mutações medidas, denominador 13. A de
#     conjunto vazio é a que importa: sem ela, um workspace que perdeu todos
#     os scripts test* deixaria a regra passar por vacuidade.
cp .tooling/scripts/ci/check-test-set-covered.ts /tmp/ctsc.bak
perl -0pi -e 's/ok: errors\.length === 0,/ok: true,/' \
  .tooling/scripts/ci/check-test-set-covered.ts
npx vitest run --root .tooling/scripts/ci check-test-set-covered  # -> 6 de 13 vermelho
cp /tmp/ctsc.bak .tooling/scripts/ci/check-test-set-covered.ts
perl -0pi -e 's/  if \(declaradosQueValem\.has\(chave\)\) continue;/  if (true) continue;/' \
  .tooling/scripts/ci/check-test-set-covered.ts
npx vitest run --root .tooling/scripts/ci check-test-set-covered  # -> 2 de 13 vermelho
cp /tmp/ctsc.bak .tooling/scripts/ci/check-test-set-covered.ts
perl -pi -e 's/^      if \(rodandoNoPacote.*$/      if (false) {/' \
  .tooling/scripts/ci/check-test-set-covered.ts
npx vitest run --root .tooling/scripts/ci check-test-set-covered  # -> 1 de 13 vermelho
cp /tmp/ctsc.bak .tooling/scripts/ci/check-test-set-covered.ts
perl -pi -e 's/^  if \(medidos === 0\) \{/  if (false) {/' \
  .tooling/scripts/ci/check-test-set-covered.ts
npx vitest run --root .tooling/scripts/ci check-test-set-covered  # -> 1 de 13 vermelho
cp /tmp/ctsc.bak .tooling/scripts/ci/check-test-set-covered.ts   # restaurado byte-exato
```

> **A cobertura do comando 7 tem um limite, nomeado porque um leitor que tropeça nele
> vai concluir que o gate é inerte.** Remover o `nextIsRedirectTarget = false` de
> dentro do `if` — o bug da 3ª versão do parser — **deixa o differential VERDE**:
> nas 18 formas do corpus esse `reset` só muda o resultado com um operador *nu*
> seguido de *duas* tasks, e o corpus nunca tem `build > ALVO build2`. Não é dente
> fraco: é **cobertura** — a mesma distinção da coluna Nível.

Os números deste registro são medidos e trazem o `n` ao lado: o comando 7 diverge
em **1 e 3 de 18** formas (n=2 mutações), a classe 3 em **8** erros (n=1) — citar só um seria o erro do `3+` que já envelheceu, classe 7. Um segundo acerto: a redação anterior citava o símbolo que o guard procura, e o guard a acusou **enquanto eu a escrevia** — um guard que pega o autor da própria documentação está funcionando; o conserto é no texto, nunca no guard.

> Comandos 3 a 5 **não** usam `git checkout --` como 1 e 2 (reverteriam trabalho não commitado de quem está no meio da task): a restauração é o `sed`/perl inverso, conferida com `diff` contra um backup.

**A armadilha de ler este registro por nome de arquivo.** `tooling/` e `.tooling/`
são **dois diretórios distintos**, ambos versionados e rodados pelo mesmo
`pnpm tooling:test`: os `check-*` vivem em `.tooling/scripts/ci/`, o
`lint-review-routing` e o `archive-lint` em `tooling/scripts/`, e o spec do
`check-doc-refs` dentro do `preflight.spec.ts` — indexar por `ls check-*.spec.ts`
conclui, errado, que dois deles não têm spec.

**Três claims da tabela já tinham envelhecido**, corrigidas ao montá-la: (a)
`check-types` nunca foi check (nota no
[arquivo-pai](./ci-defense-in-depth.md#tabela-de-checks)); (b) a coluna "Custo" saiu (motivo na
[Tabela de Checks](./ci-defense-in-depth.md#tabela-de-checks)); (c) `a derivação canônica resolve…` tinha **o nome de um dente e a assertion de um verde** — a classe 7 em forma de spec.
