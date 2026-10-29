# Ledger de cristalização — memória → repo

> **O que este arquivo é.** Uma linha por memória do diretório de memória da
> máquina, com a destinação que alguém decidiu para ela. É o que impede uma
> captura DURANTE de evaporar sem deixar rastro.
>
> **Lido por** [`check-memory-crystallization`](../../.tooling/scripts/ci/check-memory-crystallization.ts),
> nas **duas** direções: memória no disco sem linha aqui é erro, e linha aqui
> apontando para memória que não existe é erro.

## As cinco destinações

| disposição | quer dizer |
|---|---|
| `citada` | a regra **já está escrita** num arquivo versionado. A coluna `âncora` é um trecho **verbatim** que continua existindo lá. |
| `gate` | a regra é mecânica e determinística, e um gate versionado a mede. |
| `recusada` | não é regra reutilizável — é registro de estado, resultado ou progresso de campanha. A memória fica, sem virar convenção. |
| `removida` | tombstone: a regra foi absorvida por outra e **hoje seria enganosa mantê-la**. Permite ao corpus encolher. |
| `pendente` | regra reutilizável que **ninguém escreveu ainda**. Dívida declarada — o gate reporta como ressalva, não como erro. |

## Como esta tabela foi montada

Cada linha saiu de `git grep -lF "<slug>" -- '*.md'` seguido de busca pela
**regra** (não pelo slug) em cada arquivo versionado. As duas etapas estão nos
relatórios de triagem; a âncora é o trecho que a segunda etapa casou — **verbatim
e dentro de uma única linha**, porque um trecho que atravessa a quebra da linha
sempre falha, e um gate que falha por isso treina quem escreve a citar a linha
inteira em vez do trecho.

A linha tem **exatamente 4 células**, e um `|` dentro da âncora se escreve `\|`.
MEDIDO 2026-10-14: o gate usava `split('|')`, que cortava a âncora no primeiro
`|` e jogava a 5ª célula fora **em silêncio** — um `✓` com metade da âncora
inventada. A crase não protege `|` em tabela markdown; o backslash é que
protege.

Uma linha que não tem 4 células é erro de forma, e não uma linha ignorada — mas
só depois do **cabeçalho**. A 1ª correção decidia "isto é linha de triagem?"
perguntando se a 2ª célula era uma disposição VÁLIDA, e a janela era a própria
pergunta: quando a disposição é a célula que sumiu ou que tem typo — o caso que
mais precisa de acusação — a guarda deixava de reconhecer a linha. MEDIDO
2026-10-14, 6 formas de linha quebrada: 3 acusavam, **3 fugiam caladas**, e o
transbordo de âncora para a 5ª célula voltava a ser silencioso desde que o autor
também errasse a disposição. O cabeçalho `| memória | disposição |` nomeia as
colunas e ninguém o escreve por engano.

### Por que o corpus é menor que os arquivos do diretório

O gate isenta três categorias antes de formar o corpus: `MEMORY.md`,
`*-result.md` (resultado de campanha) e `type: reference`. Com `<memdir>` = o
diretório de memória da máquina, a contagem que fecha é esta:

```bash
ls -1 <memdir>/*.md | grep -v '/MEMORY.md$' | grep -v 'result\.md$' \
  | xargs grep -L '^  type: reference$' | wc -l
```

**Listar** os isentos aqui seria linha órfã garantida — a isenção é do gate,
não uma omissão da triagem. O gate imprime esse total em `medido: N memória(s)
no corpus`; se a contagem do ledger divergir dele, é a do ledger que erra. O
número fica no comando porque um literal aqui envelhece sem gate que aponte.

### A dívida que a isenção dos 39 `*-result.md` esconde

A isenção é correta — resultado de campanha é narrativa, não regra — mas o
motivo que o gate declarava era **falso**: ele dizia "já tem gate próprio
(`check-archive-integrity`)", e esse gate mede `.agents/runs/archive/`, que é
outro conjunto e tem **0** arquivos. MEDIDO 2026-10-14:
`grep -c "memory|\.claude/projects" .tooling/scripts/ci/check-archive-integrity.ts`
→ **0**. Nenhum gate mede os 39.

E pelo menos 2 dos 39 guardam regra reutilizável que **não chegou a nenhum `.md`
versionado**. As duas frases estão **quebradas em duas linhas** no result file de
origem, então um `grep` de linha única devolveria 0 mesmo na origem — 0 por motivo
errado, que é o pior tipo de 0. A medição que discrimina remove o `>` de
blockquote antes de dobrar as linhas (MEDIDO 2026-10-15):

```bash
fold() { sed 's/^[[:space:]]*[>|][[:space:]]*//' | tr '\n' ' ' | sed 's/  */ /g'; }
sed -n '92,93p' <memdir>/b41-*.md | fold | grep -cF "<a frase>"            #  1  existe
sed -n '36,37p' <memdir>/b40-*.md | fold | grep -cF "<a frase>"            #  1  existe
git grep -lF "<a frase>" -- '*.md' | grep -v memory-triage.md | wc -l     #  0  fora do ledger
```

O `grep -v memory-triage.md` não é cortesia: este arquivo cita as duas frases ao
dizer que elas não chegaram a lugar nenhum, então sem a exclusão ele é o único
hit — o guard disparando em si mesmo, na frase que documenta o guard.

- `b41`: "anti-pattern precisa de gate ou de um passo no checklist, não de uma nota"
- `b40`: "a frase tem um comando que a reproduz, ou a frase vai embora"

Isto é a dívida que o gate existe para expor, escondida pelo nome do arquivo. É
**declarada, não resolvida**: triar 39 result files é escopo de outro tamanho, e
fazê-lo às cegas seria fabricar 39 linhas `citada` sem âncora verificada.

## Tabela

### ⚠️ Por que este ledger só pode ser satisfeito onde o corpus existe

A medição do corpus é **por ambiente**, e o gate `check-memory-crystallization`
mede `$MEMORY_DIR` da máquina em que roda. Isso não é um detalhe: é a razão de
este arquivo ter sido corrigido duas vezes em 2026-10-18.

**O que aconteceu:** uma versão anterior converteu 78 linhas para `removida:`
tombstone com a medição "o corpus tem 2 arquivos". A medição era verdadeira
naquela máquina — e falsa na de quem maintaina o repositório, onde o mesmo
`$MEMORY_DIR` tem **126 arquivos** e **todas** as 78 declaradas `removida`
existem. Um tombstone afirma "essa memória foi removida"; aqui se apagou o
rastro de 78 regras que continuam vivas, e a próxima pessoa a maintainer o
ledger teria descartado trabalho real.

**A correção:** as 78 linhas voltaram à disposição original (`citada`,
`pendente`, `recusada`), preservando alvo e âncora verbatim. E a regra que
falta: **quem satisfaz este gate mede o corpus no ambiente onde o gate roda, e
declara qual ambiente foi.** Um gate que dá verde num ambiente e vermelho no
outro não está medindo a mesma coisa duas vezes — está medindo duas coisas.

⚠️ **A razão do vermelho local é outra, e vale registrar.** O commit anterior
disse que o gate "volta a reprovar AQUI, porque aqui as memórias não existem".
Medido contra o diretório **real** (127 arquivos), o gate reprova por
`uncovered: 2` — duas memórias criadas **depois** do commit, não corpus
ausente. `PHANTOM: 0`, `STALE ANCHORS: 0`, `MISSING TARGETS: 0`.

A inversão das 78 estava certa. O erro foi a **explicação**: um gate de
cristalização que reprova por memória nova é trabalho de triagem pendente, e
dizer "o corpus sumiu" apontava para um incidente que não aconteceu.

### O que a tombstone `removida` continua significando

Permite ao corpus ENCOLHER, preservando a procedência. Quando uma memória for
realmente removida, a linha vira `removida:` **com o alvo e a âncora que ela
tinha** — o que se guarda não é a memória, é a decisão. É isso que a diferença
entre "somei do disco" e "decidi que ela vai embora" precisa registrar.


| memória | disposição | alvo | âncora |
|---|---|---|---|
| `t7-rbac-feature-flag` | `removida` | memória ausente do corpus local; a âncora `listAllPermissions` existe em `apps/api/src/shared/auth/permissions-catalog.ts` | — |
| `absent-tool-reads-as-approval` | `citada` | `.agents/runs/2026-10-05-guard-classes-autoauditoria.md` | `não há sintoma nenhum` |
| `a-detector-that-fabricates-its-finding` | `pendente` | — | — |
| `a-ordem-dos-fatos-no-cenario-decide-se-a-mutacao-e-observavel` | `pendente` | — | — |
| `agent-evolution-and-memory` | `citada` | `.agents/specs/conventions/evolucao-agents.md` | `Agents e skills são entidades VIVAS` |
| `api-response-substitui-o-default-do-post` | `pendente` | — | — |
| `artefato-publicado-nao-nomeia-o-segredo` | `pendente` | — | — |
| `assertion-is-not-a-wait` | `pendente` | — | — |
| `ambiguous-sentinel-silently-skips` | `citada` | `.agents/specs/conventions/guard-classes.md` | `devolvia` |
| `b24-telemetry-progress` | `recusada` | registro de campanha; o plano de telemetria que ele resume já é versionado | — |
| `b31-parser-vs-ground-truth-analysis` | `citada` | `docs/superpowers/specs/2026-09-25-b35-parser-regen-analysis.md` | `confirma o veredito de B31` |
| `check-verifies-path-then-delegates-elsewhere` | `pendente` | — | — |
| `class-7-needs-a-commit-not-a-month` | `citada` | `.agents/specs/conventions/guard-classes.md` | `re-meça pelo comando de` |
| `classify-by-executability-not-count` | `pendente` | — | — |
| `commit-message-via-file-not-heredoc` | `pendente` | — | — |
| `conteudo-exclusivo-de-branch-defeito-ja-corrigido` | `pendente` | — | — |
| `correction-of-one-instance-closes-the-class` | `pendente` | — | — |
| `cost-must-reconcile-with-the-whole` | `citada` | `.agents/specs/conventions/ci-defense-in-depth.md` | `é uma história` |
| `cross-artifact-subtraction-borrows-the-other-clock` | `pendente` | — | — |
| `criterion-inert-on-empty-set` | `citada` | `.agents/specs/conventions/retrospective-capture.md` | `um critério escrito como` |
| `e2e-web-exige-clean-antes` | `citada` | `apps/web/e2e/global-setup.ts` | `o build da suíte começa de um diretório limpo` |
| `failed-commit-leaks-staged-files-into-next-commit` | `pendente` | — | — |
| `fase-7-http-state` | `recusada` | checkpoint de campanha de 2026-09-22; envelheceu e não é instrução | — |
| `fixture-i-escolhi-nao-proibe-a-forma-do-arquivo-real` | `pendente` | — | — |
| `gate-blind-to-uncommitted-work` | `citada` | `.agents/workflows/pr-refresh.md` | `não existe` |
| `gate-compares-against-its-own-filter` | `pendente` | — | — |
| `gate-must-not-depend-on-machine-ambient-state` | `pendente` | — | — |
| `gate-that-prescribes-the-wrong-remedy` | `pendente` | — | — |
| `gate-without-cli-block-runs-as-noop` | `pendente` | — | — |
| `gauge-measures-a-different-object` | `pendente` | — | — |
| `gh-api-F-vs-f-for-file-body` | `citada` | `.agents/workflows/pr-refresh.md` | `conteúdo como valor literal` |
| `git-cherry-blind-to-squash-merge` | `removida` | absorvida por `git-workflow-apendice.md` §Caso 1; a metade que a memória manda seguir está **proibida por nome** lá | — |
| `git-commit-amend-danger` | `pendente` | — | — |
| `git-fixture-that-collapses-into-one-object` | `pendente` | — | — |
| `git-log-is-a-stack-not-a-queue` | `pendente` | — | — |
| `glob-in-block-comment-closes-it` | `pendente` | — | — |
| `green-local-red-ci-is-ambient-config` | `citada` | `.agents/runs/state-snapshot-20261014T003513Z.md` | `vermelho no CI = os dois mediram objetos diferentes` |
| `guard-class-absent-from-data` | `citada` | `.agents/specs/conventions/guard-classes.md` | `Classe ausente do dado` |
| `guard-must-cover-common-form-not-rare` | `citada` | `.agents/specs/conventions/guard-classes.md` | `a forma comum esquecida tem de vir do` |
| `guard-that-can-never-fire` | `citada` | `.agents/specs/conventions/guard-classes.md` | `condição inalcançável` |
| `guard-that-fires-on-itself` | `citada` | `.agents/specs/conventions/guard-classes.md` | `Dispara em si mesmo` |
| `healthy-tree-exercises-only-half-the-fix` | `pendente` | — | — |
| `infra-de-teste-contamina-o-gate-de-cobertura` | `pendente` | — | — |
| `main-branch-protection-pr-only` | `citada` | `.agents/specs/conventions/git-workflow.md` | `Regra Inegociável` |
| `mandatory-tdd-rule` | `citada` | `.agents/specs/conventions/tdd.md` | `DEVEM seguir o ciclo TDD canônico` |
| `md-file-size-and-revision-rules` | `citada` | `.agents/specs/conventions/tamanho-e-revisao.md` | `300 linhas` |
| `measured-live-claim-requires-command` | `citada` | `.agents/specs/conventions/guard-classes.md` | `do que o número afirma` |
| `minha-prosa-pt-br-vaza-caractere-cjk` | `citada` | `.agents/specs/conventions/idioma.md` | `Varrer antes de commitar` |
| `mirror-tree-tests-a-script-that-has-no-seam` | `pendente` | — | — |
| `mutation-can-fail-for-the-wrong-reason` | `pendente` | — | — |
| `mutation-that-doesnt-land-looks-green` | `pendente` | — | — |
| `non-fast-forward-is-not-divergent-work` | `pendente` | — | — |
| `nome-quase-igual-cria-arquivo-paralelo` | `pendente` | — | — |
| `origin-session-id-nested-under-metadata` | `citada` | `.tooling/scripts/ci/check-memory-crystallization.ts` | `devolve 0 SEM AVISO (exit 1)` |
| `passar-no-gate-nao-e-o-que-o-hook-faz` | `citada` | `.github/PULL_REQUEST_TEMPLATE.md` | `mesmo evento visto de dois lados` |
| `patch-medido-so-no-caminho-do-defeito` | `pendente` | — | — |
| `pipe-maska-o-exit-code-do-comando` | `pendente` | — | — |
| `pipe-stdout-dies-when-spawner-exits` | `pendente` | — | — |
| `positive-test-must-assert-skip-state` | `citada` | `docs/fluxo-desenvolvimento.md` | `não havia nada para verificar` |
| `post-task-retrospective-plan` | `removida` | os 3 artefatos que ela planejava já existem; mantê-la os lista como "a criar" | — |
| `pr-body-edit-cancels-inflight-ci-run` | `pendente` | — | — |
| `pr-body-gate-only-fires-at-push-time` | `citada` | `.github/workflows/ci.yml` | `um RE-RUN entrega o corpo` |
| `pr-body-has-no-base-directory` | `pendente` | — | — |
| `prefer-agents-directory` | `citada` | `AGENTS.md` | `Modelo-agnóstico` |
| `prefer-parallel-subagents-when-possible` | `citada` | `.agents/agents/specialist-router.md` | `paralelizar sempre que possível` |
| `prettier-check-must-run-in-place` | `pendente` | — | — |
| `pr-refresh-scan-is-context-blind` | `pendente` | — | — |
| `pt-br-default-language` | `citada` | `.agents/specs/conventions/idioma.md` | `idioma padrão e obrigatório` |
| `rebase-ages-the-commit-message-too` | `pendente` | — | — |
| `rebase-skip-descarta-o-commit-inteiro` | `pendente` | — | — |
| `red-gate-hides-the-queue` | `pendente` | — | — |
| `renomear-valor-gravado-e-o-furo-da-coluna` | `citada` | `.agents/specs/conventions/migracao-de-dados.md` | `Renome de VALOR gravado` |
| `reserva-que-cria-nao-pode-ser-a-reserva-da-falha` | `citada` | `apps/web/app/login/actions.ts` | `o destino de exceção de uma LEITURA tem de ser um caminho que NÃO ESCREVE` |
| `rota-protegida-sem-bearer-sai-publica-no-documento` | `citada` | `apps/api/src/modules/users/infrastructure/http/users.controller.ts` | `pública é a ÚNICA que não declara `security` — e `@ApiBearerAuth()` é o` |
| `review-and-fix-after-each-task` | `citada` | `.agents/skills/review-routing/SKILL.md` | `Avançar com BLOCKING não tratado` |
| `reviewer-must-differ-from-implementer` | `citada` | `.agents/agents/review-router.md` | `Sempre fresh` |
| `reviewer-que-mede-reverte-o-worktree` | `pendente` | — | — |
| `reviewer-reads-shape-not-system-semantics` | `pendente` | — | — |
| `review-router-rollout-state` | `recusada` | progresso de campanha encerrada (13 PRs merged, métricas de 2026-09-22) | — |
| `spec-que-so-verifica-render-nao-tem-dente` | `citada` | `.agents/specs/conventions/e2e-playwright.md` | `verde por construção` |
| `spec-verde-com-tsc-vermelho` | `pendente` | — | — |
| `stale-clone-hides-the-resolving-merge` | `pendente` | — | — |
| `state-that-lives-outside-the-repo-has-no-gate` | `citada` | `.agents/workflows/pr-refresh.md` | `verde por omissão` |
| `subagent-driven-development-always` | `citada` | `AGENTS.md` | `Coordenação obrigatória` |
| `one-boolean-state-is-two-states` | `pendente` | — | — |
| `subagent-write-truncation-limit` | `pendente` | — | — |
| `uniform-validator-beats-self-reports` | `pendente` | — | — |
| `tabela-de-mutacoes-envelhece-com-a-spec` | `pendente` | — | — |
| `test-the-field-the-eye-reads-not-the-field-it-parses` | `pendente` | — | — |
| `test-com-dado-somente-no-ci` | `citada` | `tooling/scripts/compose-observability-profile.spec.ts` | A sonda precisa estar NO RENDER antes da máscara, senão o teste mede o |
| `tool-reports-success-while-corrupting` | `citada` | `.agents/specs/conventions/guard-classes.md` | `Ferramenta reporta sucesso corrompendo` |
| `trocar-de-identidade-limpa-o-estado-da-identidade-velha` | `citada` | `apps/web/lib/sessao.ts` | `É o mesmo motivo de `limparSessao` apagar a empresa, sem o resto.` |
| `tsx-esbuild-does-not-emit-di-metadata` | `citada` | `.agents/memory/nestjs-specialist.md` | `design:paramtypes` |
| `two-stage-review-after-each-task` | `citada` | `.agents/skills/review-routing/SKILL.md` | `Avançar com BLOCKING não tratado` |
| `verify-before-the-action-that-invalidates-it` | `citada` | `.agents/specs/conventions/git-workflow.md` | `verificar na posição errada` |
| `verify-branch-before-commit` | `citada` | `.agents/specs/conventions/git-workflow.md` | `git branch --show-current` |
| `verify-check-against-reconstructed-state` | `citada` | `.agents/specs/conventions/ci-defense-in-depth-dentes.md` | `Verde não é prova` |
| `spec-that-rederives-expected-from-implementation` | `pendente` | — | — |
| `vi-mock-factory-cache-frozen-counter` | `pendente` | — | — |
| `vitest-workspace-thresholds-and-dist-remap` | `citada` | `.agents/specs/conventions/cobertura-testes.md` | `config raiz` |
| `zero-survived-is-not-zero-found` | `pendente` | — | — |
| `suite-de-integracao-nao-ve-defeito-de-banco` | `pendente` | — | — |

## O que a tabela diz

As contagens vivem no gate, que é a fonte — o painel de `ci:preflight` imprime
`medido: N memória(s) no corpus, N linha(s) no ledger` e
`N memória(s) com destinação \`pendente\``. Para re-derivar por linha, use o
**parser do gate** — ele é a fonte, e sabe ancorar na tabela:

```bash
npx tsx .tooling/scripts/ci/check-memory-crystallization.ts
```

**Não re-derive com `awk`.** MEDIDO 2026-10-16: o `awk` que este arquivo usava
(`/^\| `[a-z0-9][a-z0-9-]*` \|/ {print $3}`) errava nos dois sentidos ao mesmo
tempo. Casa as **tabelas de prosa** do arquivo — as definições de `citada`,
`gate`, `recusada`, `removida` e `pendente` — e enumera 10 linhas de lixo
(`registro de campanha, não é regra`, …), inflando a contagem para **87 linhas
onde a tabela tem 78**. E a classe `[a-z0-9-]` **não cobre maiúscula**, então
`gh-api-F-vs-f-for-file-body` (linha 126) ficava de fora: o `citada` contava
**35** onde o gate conta **36**. Um erro que esconde e outro que inventa — o
`awk` contornava o parser e perdia nos dois casos onde o parser acerta
(`splitCells` + guarda de cabeçalho, em `check-memory-crystallization.ts`).

**A coluna `n` foi removida de propósito.** MEDIDO 2026-10-15: ela publicava
`35 / 33 / 3 / 2` e `total 73`, que fechavam entre si, mas o gate já imprimia
`74`. A divergência era real e apontava para uma linha faltando — reconciliar os
dois números à mão era o preço de publicar o número. Hoje os dois fecham em
`78 / 78`, e publicá-los de novo reabriria a mesma contagem que envelhece a cada
memória e a cada linha novas; publicar o comando não. É a mesma razão que tirou
o par de números de `check-memory-crystallization.ts` e de `learning-observation/`.

| disposição | o que significa |
|---|---|
| `citada` | a regra já está escrita; a âncora é o que a mantém presa ao arquivo |
| `pendente` | regra reutilizável que **ninguém escreveu** — é a maior fatia do corpus |
| `recusada` | registro de campanha, não é regra |
| `removida` | tombstone; o corpus pode encolher por aqui |
| `gate` | **0** — nenhuma memória do corpus é mecânica o bastante para um gate determinístico |

**O `0` em `gate` é o achado, não uma omissão.** As candidatas naturais
(`glob-in-block-comment-closes-it`, `gate-without-cli-block-runs-as-noop`) são
mecânicas, mas o gate que as mediria não existe — e inventar `gate:` para uma
regra sem gate é a mesma *documentation-only prevention* que a
[prevenção hierárquica de `task-observer`](https://github.com/iamneilroberts/claude-skills/blob/main/skills/task-observer/SKILL.md)
classifica como a mais fraca. `gate:` aqui significa *existe um `.ts` no repo que
mede isto*, e hoje não existe para nenhuma.

**`pendente` não é o mesmo que regras ignoradas.** Várias são
**praticadas e nunca enunciadas**: a tabela de dentes usa "o par" em **15** das
**23** linhas, e a notação "N de M vermelho" em **20**, sem nunca dizer por quê.
MEDIDO 2026-10-16. Para essas, o que falta não é comportamento, é enunciado.

```bash
f=.agents/specs/conventions/ci-defense-in-depth-dentes.md
awk -F'|' '/^\| `check-/ {n++} END {print n}' $f   # 23
awk -F'|' '/^\| `check-/ && /o par/ {n++} END {print n}' $f   # 15
awk -F'|' '/^\| `check-/ && /[0-9]+ de [0-9]+/ {n++} END {print n}' $f   # 20
```

> Apontar para `ci-defense-in-depth.md` aqui devolve **20** — a outra tabela do
> arquivo pai (a "Tabela de Checks"), porque o regex `^\| \`check-` casa as
> duas. Só `ci-defense-in-depth-dentes.md` tem a tabela de dentes e nada mais
> que comece com `| \`check-`. Foi exatamente esse deslize que deixou estes
> números irreproduzíveis na primeira redação deles: o próprio PR que corrigiu
> um `awk` mal ancorado reescreveu outro sem reancorar.

## Longevidade

Este arquivo é **só de acréscimo por padrão**, e é por isso que `removida:`
existe. Sem tombstone, apagar uma memória do disco vira linha órfã e o gate
acusa — o corpus só cresceria, nunca encurtaria.

Trimestral, revisar: as `pendente` que viraram `citada` saem desta lista quando
a convenção que as absorveu for escrita.
