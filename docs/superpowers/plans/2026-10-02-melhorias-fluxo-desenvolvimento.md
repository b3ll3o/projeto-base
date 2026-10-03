---
name: melhorias-fluxo-desenvolvimento
description: Plano de implementação dos pontos de melhoria do fluxo de desenvolvimento — corrige gates que reportam verde sem verificar, desembrulha o lint do apps/api, e alinha a documentação com o estado real do repo. 21 tasks em 4 fases, P0→P2.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-<ts>.md
related:
  - ../../fluxo-desenvolvimento.md
  - ../../estrategias-desenvolvimento-comparacao.md
  - ../../../.agents/specs/conventions/ci-defense-in-depth.md
  - ../../../.agents/specs/conventions/git-workflow.md
  - ../../../.agents/specs/conventions/tdd.md
---

# Plano — Melhorias do fluxo de desenvolvimento

> **Origem:** [fluxo-desenvolvimento.md](../../fluxo-desenvolvimento.md) §7.2
> e [estrategias-desenvolvimento-comparacao.md](../../estrategias-desenvolvimento-comparacao.md).
> **Branch:** `chore/melhorias-fluxo-desenvolvimento` (base `main` @ `5490de6`)
> **Agentes:** `stack-code-reviewer` (review de cada task) · `doc-sync` (pós-alteração)
> **Revisão:** v1.1.0 aplica as correções da revisão da demanda. As rejeições e
> os gaps catalogados não têm contagem fechada aqui — nenhum relatório
> versionado os registra. O que mudou está em [§Changelog](#changelog-v11).

## TL;DR

1. **`pnpm ci:preflight` está VERMELHO hoje** (exit 1, **3** erros) — não verde. Destrava primeiro. A §F1-T0 vem antes porque `state-aware-planning.md` §3 Passo 3 proíbe criar plano com `proceed: false`, e a §4 exige que todo plano referencie o `state-snapshot` da demanda — hoje inexistente (B18).
2. **`check-doc-refs.ts:67` descarta inline-code por remoção**, quebrando o offset: link com label 100% inline-code colapsa para `[]()` e nunca casa. Troca por máscara de 1 linha.
3. **A máscara é a correção causal e não pode ser revertida — mas derruba o gate**: hoje o gate acusa **3** links quebrados; com a máscara, o mesmo gate acusa **73** (medido, **B2b**). Por isso §F2-T1 e §F2-T2 são **2 tasks e 1 commit**.
4. **Ampliar o escopo para os 189 `.md` versionados expõe 98 links quebrados em 34 arquivos** (medido, **B2**) — não os "124 em 43" que a v1.0.0 afirmava. §F2-T2 traz a limpeza dos **76 corrigíveis** (sed mecânico) e a allowlist dos **22** que nunca serão path (placeholders de template e caminhos fora do repo).
5. **`apps/api` nunca é lintada** — script stub `exit 0` + config flat com nome legado `.eslintrc.js` que o ESLint 9 não carrega. **7 erros em 6 arquivos** esperando.
6. **Documento canônico mente**: `README.md:259` e `docs/STACK.md:4` dizem que `apps/api` e `apps/web` não existem. Existem, com 41 specs (`find apps -name '*.spec.ts*' -not -path '*/node_modules/*' \| wc -l`).
7. **Nenhum gate bloqueia merge** (ruleset sem `required_status_checks`) — decisão do owner (D2), não do implementador.

## Contexto

O diagnóstico veio de dois documentos novos (untracked, criados 2026-10-02):

- [`docs/fluxo-desenvolvimento.md`](../../fluxo-desenvolvimento.md) — mapeia o
  fluxo do primeiro comando ao merge e classifica cada mecanismo como *wired* ou
  *unwired*. O §7.2 lista 13 itens unwired, todos com evidência de comando.
- [`docs/estrategias-desenvolvimento-comparacao.md`](../../estrategias-desenvolvimento-comparacao.md)
  — compara 4 estratégias (determinística, agentic, memória, híbrida) em 9
  dimensões e conclui que **nenhum dos problemas medidos pede IA**: a camada
  "agentic" é regex em YAML executado por TypeScript.

O achado que organiza tudo é uma regra de bolso das duas análises:

> **Gate não ligado não é gate fraco — é pior que ausência, porque consome
> confiança.** E o token de sucesso não pode ser o mesmo para "verifiquei e
> passou" e "não havia nada para verificar".

Este plano implementa as correções. **Não** implementa nenhuma capacidade nova.

## Índice das fases

| Fase | Escopo | Tasks | Partes |
|------|--------|-------|--------|
| 1 | **P0** — destrava o repo (snapshot da demanda, os 6 links `path:linha`, catálogo do `AGENTS.md`) | 3 | [P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-1-p0-part-01.md) · [P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-1-p0-part-02.md) |
| 2 | **P1 enforcement** — máscara + escopo do checker (com a limpeza que os dois exigem), lint do `apps/api`, gate DDD, `turbo.json`, specs órfãs | 8 | [P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-01.md) · [P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-02.md) · [P03](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-03.md) · [P04](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-04.md) · [A](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-05.md) *(Apêndice A — consulta, não task)* |
| 3 | **P1 docs** — `README`/`STACK`, `git-workflow.md`, footers de release | 5 | [P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-3-p1-docs-part-01.md) · [P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-3-p1-docs-part-02.md) |
| 4 | **P2 + Backlog** — estado `skipped`, archive integrity, ruleset, contrato do `doc-sync`, backlog versionado | 5 | [P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-01.md) · [P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-02.md) |

## Baseline verificável

Todos os números abaixo saem de comando executável a partir de `main` @ `5490de6`.
A coluna "Depois" é o estado que a fase correspondente produz. O namespace `B*` é
reservado a **baseline**; o backlog de itens adiados usa `BL*` (§F4-T5).

```bash
# Reproduz o algoritmo de .tooling/scripts/ci/check-doc-refs.ts sobre git ls-files '*.md'
npx tsx -e "
const{execFileSync}=require('child_process'),fs=require('fs'),p=require('path');
const F=execFileSync('git',['ls-files','*.md'],{encoding:'utf8'}).split('\n').filter(Boolean);
let b=0,S=new Set();
for(const f of F){const L=fs.readFileSync(f,'utf8').split('\n');const o=[];let g=false,m='';
for(const l of L){const t=l.trimStart();
 if(!g){if(/^(\`\`\`|~~~)/.test(t)){g=true;m=t.slice(0,3);continue}}
 else{if(t.startsWith(m)&&t.replace(/[\`~]/g,'')===''){g=false;m='';continue}continue}
 if(/^( {4,}|\t)/.test(l))continue;o.push(l)}
let c=o.join('\n').replace(/\`[^\`\n]+\`/g,s=>' '.repeat(s.length));let n=0;
for(const x of c.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)){const t=x[2];if(/^https?:|^#/.test(t))continue;
 const fp=t.split('#')[0];if(fp&&!fs.existsSync(p.resolve(p.dirname(f),fp)))n++}
if(n){b+=n;S.add(f)}}
console.log('broken='+b,'files='+S.size);"
```

| # | Métrica | Comando | Hoje | Depois | Fase |
|---|---------|---------|------|--------|------|
| B0 | `ci:preflight` exit | `pnpm ci:preflight >/dev/null 2>&1; echo $?` | **`1`** (3 erros) | `0` | 1 → 2 |
| B1 | Cobertura do link-checker | `find docs -name '*.md' \| wc -l` + `find .agents/specs -name '*.md' \| wc -l` vs `git ls-files '*.md' \| wc -l` | `102 + 27` = **`129` em disco** de `189` versionados (60 fora) | `189` | 2 |
| B2 | Links quebrados com a máscara aplicada | script acima (`files=34`) | **`98` em 34 arquivos** | `0` | 2 |
| B2b | Links quebrados com a máscara, **dentro do escopo de hoje** (`docs` + `.agents/specs`, em disco) | mesmo script com `docs` e `.agents/specs` | **`73` em 28 arquivos** (em disco) / `65` em `25` se restringido ao versionado | `0` | 2 |
| B3 | Link com label inline-code | spec `preflight.spec.ts` (F2-T1) | `errors.length = 1` | `errors.length = 2` | 2 |
| B4 | Lint do `apps/api` | `grep -c 'lint stub' apps/api/package.json` | `1` (`echo … && exit 0`) | `0` (`eslint .`) | 2 |
| B5 | Erros de lint do backend | `cd apps/api && npx eslint . --config ./.eslintrc.js` | `11 problems (7 errors)` em **6 arquivos** | `0 problems` | 2 |
| B6 | Gate DDD em import relativo | spec `stack-code-reviewer.spec.ts` (F2-T6) | `0 blocker` | `1 blocker` | 2 |
| B7 | `tooling:test` | `pnpm tooling:test` | `10 files / 150 tests` | `16 files / 185 tests` | 2 |
| B8 | Specs `.tooling` | `npx vitest run --root .tooling/scripts/ci` | `1 failed \| 5 passed (6)` · `3 failed \| 26 passed (29)` | `6 passed (6)` · `32 passed (32)` | 2 |
| B9 | `tdd:check` | `pnpm tdd:check` | `2 cached, FULL TURBO` | `Missing tasks in project` | 2 |
| B10 | `.agents/runs/archive` | `ls -d .agents/runs/archive` | `inexistente` | `.gitkeep` versionado | 4 |
| B11 | Links `](../.agents/memory/` | `grep -c '(\.\./\.agents/memory/' AGENTS.md` | `18` | `0` | 1 |
| B12 | Marcadores "pendente" | `grep -c 'pendente Fase 3\|pendente Task 9' AGENTS.md` | `2` | `0` | 1 |
| B13 | Footer `MONOREPO.md` | `grep -oE '\*\*Versão do documento:\*\* [0-9.]+' docs/MONOREPO.md \| grep -oE '[0-9.]+' \| tail -1` | `1.5.0` (última tag: `v1.8.0`) | `1.9.0` | 3 |
| B14 | Checks fantasma em `git-workflow.md` | `grep -cE '(tdd-enforcer\|code-reviewer\|markdown-size-check)' .agents/specs/conventions/git-workflow.md` | **`8` linhas** — o nome **nu**, não o cercado | `0` | 3 |
| B15 | README declara apps ausentes | `grep -c 'não foram criados' README.md` | `1` | `0` | 3 |
| B16 | Contagem de agents no README | `grep -c '19 agents' README.md` | `0` | `1` | 3 |
| B17 | `doc-sync` bloqueia? | `grep -c 'process.exit' tooling/scripts/doc-sync.ts` | `0` (nunca bloqueia) | `0` (contrato **report-only** declarado) | 4 |
| B18 | `state-snapshot` desta demanda | `ls .agents/runs/state-snapshot-2026*10*02*.md 2>/dev/null \| wc -l` | `0` (o único existente é `20260923T183938Z`, da demanda de telemetria) | `1` | 1 |
| B19 | Links `path:linha` em `docs/articles/` | `grep -cE '\]\([^)]*\.md:[0-9]+\)' docs/articles/vetor-grafos-fine-tuning-resumo.md` | `6` (linhas 21, 23, 152, 158, 210, 221) | `0` | 1 |

> **B14 em 3 palavras.** A métrica casa o **nome nu** porque `:112-114` de
> `git-workflow.md` não usam backtick. Um padrão ancorado no cercado (o
> `grep -cE` da v1.0.0, com os nomes entre acentos graves) contaria `5` e
> deixaria **3** das 8 linhas sem dono — o `chk F3-T3` do verificador usava essa
> forma curta e o critério fecharia errado em `3` em vez de `0`.

## Sequenciamento e dependências

```text
   FASE 1 (P0)  ──►  FASE 2 (P1 enforcement)  ──►  FASE 3 (P1 docs)  ──►  FASE 4 (P2)
   F1-T0 snapshot   F2-T1 máscara (1 commit     F3-T1 README/STACK   F4-T1 skipped
   F1-T1 path:linha          ├─ com F2-T2)       F3-T2 árvore+contagens  F4-T2 archive/.gitkeep
   F1-T2 AGENTS.md    F2-T3 eslint.config.mjs    F3-T3 git-workflow   F4-T3 ruleset (D2)
     + verificador    F2-T4 7 erros de lint      F3-T4 footers 1.9.0  F4-T4 doc-sync report-only
                      F2-T5 lint script real     F3-T5 release warn.  F4-T5 backlog versionado
                      F2-T6 gate DDD infra/
                      F2-T7 turbo.json órfãs
                      F2-T8 specs .tooling órfãs
```

**Bloqueios duros (não paralelizar):**

| Depende de | Por quê | Como verificar |
|---|---|---|
| F1-T0 antes de F1-T1 | O snapshot registra `proceed: false` (preflight vermelho) e só vira `true` quando §F1-T1 derruba o blocker G-001 | `grep 'proceed:' .agents/runs/state-snapshot-*.md` |
| **F2-T1 e F2-T2 no mesmo commit** | A máscara leva o gate de **3** para **73** erros (**B2b**). Como `.husky/pre-push` roda `pnpm ci:preflight` com `exit 1`, um commit intermediário seria **impushável** | `git show --stat <sha>` deve listar os dois arquivos de `check-doc-refs.ts` de uma vez |
| F2-T2 antes de F2-T4 | §F2-T2 toca `.tooling/scripts/ci/preflight.ts`; §F2-T3/F2-T4 também. Commits separados, ordem obrigatória | ordem dos commits |
| F2-T3 antes de F2-T5 | Sem o rename para `eslint.config.mjs`, `eslint .` falha com *"couldn't find an eslint.config.\*"* | `ls apps/api/eslint.config*` |
| F2-T3 antes de remover a allowlist | Remover `api/.eslintrc.js` da allowlist com o arquivo ainda em `.eslintrc.js` quebra o `preflight` | F2-T3 remove os dois no mesmo commit |
| F2-T4 antes de F2-T5 | Ligar `eslint .` com os 7 erros presentes quebraria o job `quality` | `cd apps/api && npx eslint . --config ./.eslintrc.js` deve sair `0` antes de F2-T5 |
| F2-T5 antes de F3 | `ci:local` roda `turbo run lint`; com lint real, doc desatualizado quebra o push | `pnpm ci:local` |
| **F4-T1 antes de F4-T2** | §F4-T2 cria `.agents/runs/archive/`, o que torna inalcançável o ramo `skipped` de `check-archive-integrity.ts:33-36` — o único dos 3 que ainda dispara neste repo | `ls -d .agents/runs/archive` deve falhar quando §F4-T1 for verificado |
| F3-T4 antes de F3-T5 | Bump do footer é o que faz o merge disparar o release; o `::warning::` só tem o que avisar depois | ordem natural na parte 2 |

**Paralelizáveis** (códigos distintos, sem arquivo compartilhado):

- F2-T6, F2-T7, F2-T8 (`tooling/scripts/`, `turbo.json` + `package.json`, `.tooling/scripts/ci/preflight.spec.ts`)

> **Retirado da lista:** F1-T1 e F2-T2. A v1.0.0 os declarava paralelizáveis; ambos
> editam arquivos que o gate lê no **mesmo** push, e F1-T1 depende da decisão D1
> (o dono decide `docs/articles/` antes de a task poder existir).

## Riscos

| Risco | Prob. | Mitigação |
|-------|-------|-----------|
| A allowlist de §F2-T2 ficar larga demais e mascarar bug novo | **Média** | Allowlist por **substring de target**, nunca por arquivo: um link quebrado novo no mesmo arquivo continua sendo pego. Cada regex nova entra com o alvo medido que a justifica (tabela em §F2-T2) |
| Escopo ampliado (`git ls-files`) não fechar em um commit | **Média** — 98 quebrados, dos quais 76 são `sed` mecânico e 22 allowlist | §F2-T2 traz a tabela arquivo-a-arquivo com o comando de cada grupo (Apêndice A). Se sobrar item, ele entra no **backlog** (§F4-T5) e o critério passa a `errors == <n> restante`, nunca `EXIT=0` mentido |
| Máscara de inline-code gera falso-positivo novo (link com label misto passa a ser avaliado) | **Alta** — o gate passa de 3 para 73 no escopo atual | Os testes existentes em `preflight.spec.ts` + o novo de §F2-T1 rodam **antes** do GREEN; se subirem acima do esperado, mascarar por placeholder em vez de espaço |
| Lint real do `apps/api` expõe violações DDD hoje invisíveis | **Baixa** — medido: `0` violações `ddd-hexagonal` nos 7 erros | Se aparecer, é achado legítimo: corrigir, não silenciar |
| `strict: true` no ruleset trava merges em branch desatualizado | **Média** | §F4-T3 (D2) usa só `contexts: ['quality']`, sem `strict` |
| Plano estoura 300 linhas por fase | **Média** | Índice + 11 partes irmãs; cada uma ≤ 300 linhas (verificado com `wc -l`) |

## Decisões do usuário

Quatro pontos **não** foram decididos aqui. Cada um abre com o default recomendado.

| # | Decisão | Opções | Default recomendado |
|---|---------|--------|----------------------|
| D1 | `docs/articles/` (untracked, 1 arquivo) entra no repo ou não? | (a) versionar · (b) deletar · (c) mover | **(a)** — é insumo do `docs/estrategias-…`. **Atenção:** D1(a) **não** resolve os 6 links `../../../docs/articles/vibe-coding-sdd-*` das convenções — os arquivos-alvo **não existem** em lugar nenhum do repo (`find . -name 'vibe-coding-sdd*'` → vazio). Esses 6 são resolvidos por §F2-T2 (remover a referência), não por D1 |
| D2 | `required_status_checks` no ruleset 23853096? | (a) `contexts: ['quality']`, sem `strict` · (b) idem + `strict: true` · (c) `required_approving_review_count: 1` · (d) não configurar | **(a)** — `quality` tem `needs: preflight`, então gateia os dois. **(c) está fora** (maintainer único trava o próprio autor). Sob (d), o check `F4-T3` do verificador reporta `0` e continua vermelho por desenho — é a **única** exceção declarada |
| D3 | Escopo do link-checker: versionados via `git ls-files` ou raízes literais? | (a) `git ls-files` com fallback **explícito** · (b) array de dirs versionados | **(a)** — deriva do repo. O fallback **deve imprimir aviso**: um gate cujo escopo encolhe em silêncio é a classe de falha que este plano existe para eliminar |
| D4 | `review:route` / `specialist:route` entram no `preflight`? | (a) sim, ambos · (b) só `specialist:route` · (c) não | **(c) — não**, por ora: a matriz `specialist-routing` nunca rodou, e falso positivo em matriz de routing é caro. Backlog **BL5** e **BL6** |

## Como validar o plano inteiro

Um comando único que prova que as 21 tasks estão feitas:

```bash
bash docs/superpowers/plans/verify-melhorias-fluxo.sh
```

O script roda **21 checks, um por task**, mapeados 1:1 para os IDs
`F1-T0`…`F4-T5`, imprime `✓ ID` / `✗ ID` / `⊘ ID` por linha e sai com `1` se
qualquer um falhar. Ele **não** é entregue pronto: a §F1-T2 o escreve.

Regras do verificador, deliberadas:

- `⊘` (não avaliado) **não** conta como falha — é o estado do check `F4-T3`
  sem rede/token. Todo outro check é hermético.
- Cada check ancora em **propriedade verificável do artefato** que mudou com a
  task (o arquivo tem a linha, o comando sai 0), nunca em contagem que já seja
  verdadeira antes dela. Consequência a observar quando §F1-T2 rodar o script
  pela primeira vez: um verificador que **já passa** na adoção é um gate que não
  pode falhar — a mesma classe de defeito que este plano corrige. O script ainda
  não existe no repo, então este plano **não afirma** um dry-run `✓/✗/⊘`: ele
  será medido quando a task rodar.
- `F4-T3` é o único cujo valor esperado é decidido pelo **owner** (D2). Com a
  opção (a) o esperado é `1`; se for (d), o implementador troca para `0` no
  script e justifica no PR.
- `F4-T5` ancora em `.agents/runs/backlog-2026-10-02.md`, **não** nas tabelas
  deste plano: elas são escritas pela revisão, antes de qualquer task rodar, e
  um check que as contasse passaria já na adoção.
- Guarda explícita: resultado **vazio** é falha, nunca aprovação. Sem ela, `''`
  casaria com qualquer lista de esperados e o check viraria no-op.

Saída esperada ao fim do plano:

```text
✓ 21 · ✗ 0 · ⊘ 0  (de 21 checks)
✓ todas as tasks verificadas (EXIT=0)
```

Verificação manual mínima, sem o script:

```bash
pnpm ci:preflight && pnpm tooling:test && pnpm turbo run lint typecheck && pnpm ci:local
```

## Fora de escopo

Não serão feitas neste plano (com o porquê). Itens com detalhamento e comando
estão no **Backlog** de §F4-T5.

- **Nada de IA/RAG/vetor/grafo** — `grep -rniE 'embedding|openai|langchain|pgvector|neo4j' apps/*/package.json packages/*/package.json` retorna 0. A análise de estratégias é o argumento, não a tarefa.
- **Não implementa `tdd:check` de verdade** (inspeção de `git log`) — o histórico é squash-merge (`git show --stat 5490de6` = 1 commit com spec + impl), então RED e GREEN vivem no mesmo commit por construção. TDD é garantido pelo agent `tdd-enforcer`, não por gate de git.
- **Não religa a `test` do `apps/api`** (também stub) — exigiria recalibrar a task `test` do turbo, porque `vitest.workspace.ts` já define os projetos `unit`/`integration`/`e2e`. Backlog **BL10**.
- **Não adiciona `required_approving_review_count`** — maintainer único trava o próprio fluxo sem ganho (D2, opção (c)).
- **Não cria `check-version-consistency`** — §F3-T4 alinha o valor; o prevention seria um check novo com spec. Backlog **BL1**.
- **Não converte `doc-sync` em bloqueante** — §F4-T4 adota o contrato *report-only* que o código já implementa e **deleta o parâmetro morto** que só fingia honourar a flag. A Opção B (bloqueio real) é **BL9**, porque exige calibrar `docs_health_score` antes.
- **Não instancia `*.evals.yaml`** — `find . -name '*.evals.yaml' -not -path './node_modules/*' | wc -l` = 0 e a convenção já admite o gap. Backlog **BL2**.
- **Não reescreve o conteúdo dos planos de 2026-09 congelados** — só conserta a *profundidade relativa* dos links, que é bug mecânico de 1 `../` (grupo G1 de §F2-T2). Não os allowlist: allowlist por prefixo de arquivo instala falso negativo permanente, que é a classe de falha que este plano existe para eliminar.
- **Não versiona `docs/articles/vibe-coding-sdd-*`** — §F2-T2 remove as 6 referências porque `find . -name 'vibe-coding-sdd*'` retorna **0**: os arquivos não existem em lugar nenhum do repo, nem untracked.
- **Não edita artefato gerado à mão** — `docs/flows/**/…workflow.json` cita `--auto-apply-minor`; é saída de tool, e editar à mão é a mesma armadilha de *allowlist por prefixo*.

## Changelog v1.1

Aplicadas as correções da revisão da demanda. Resumo do que mudou e por quê:

| Correção | Onde | Motivo |
|---|---|---|
| §F1-T2 (máscara) saiu da Fase 1 → §F2-T1 | reindexação | Com a máscara, o gate passa de 3 para **73** erros **dentro do escopo atual**; a Fase 1 exige `EXIT=0`. Reindexadas as 21 tasks para que nenhum ID aponte para fase diferente |
| §F1-T1 corrigia 2 de 6 links `path:linha` | F1-P01 | 4 deles são invisíveis hoje por causa do bug que §F2-T1 corrige — voltariam vermelhos depois |
| §F2-T1 + §F2-T2 = 1 commit | F2-P01 | `.husky/pre-push` bloqueia o push com o gate vermelho; um commit intermediário seria impushável |
| B2: `124 em 43` → **`98` em 34** (e **B2b** = `73` em 28 em disco / `65` em 25 no versionado) | Baseline | `124` não era reproduzível por nenhuma variante; a medição fiel ao algoritmo do gate dá 98 |
| Allowlist corrigida (`^\.?\./evals/`, prefixo de plano antigo, prefixo de arquivo congelado) + tabela dos 76 links corrigíveis | §F2-T2 | A v1.0.0 cobria 6 dos 98; sobraram 92 sem dono. A allowlist fecha nos 22 restantes (placeholders de template e caminhos fora do repo) |
| 7º erro de lint (`user-use-cases.spec.ts:14`) e `export-openapi.ts` adicionados | §F2-T4 | A v1.0.0 listava 5 arquivos/6 erros; são 6 arquivos/7 erros. Sem isso o `eslint .` emite 1 erro e o job `quality` quebra |
| `argsIgnorePattern` não cobre `context` → remover do import | §F2-T4 | O nome não tem prefixo `_`; o padrão não casa e o erro permaneceria |
| `cmd \| tail; echo $?` → capturar status antes do pipe | todas | Em pipeline, `$?` é o status do `tail`, não do comando — o critério não media o que dizia medir |
| `grep -c` e não `grep -rc` | §F3-T1, §F4-T4 | `-rc` imprime `arquivo:N`, que não é comparável com um escalar |
| Spec do §F2-T6 reescrito com a API real (`reviewFiles([file])` → `report.findings`) | F2-P03 | A v1.0.0 passava `[{path, content}]` e tratava o retorno como array — não compila |
| `chk F2-T6` ancorado em `../infrastructure` (hoje `0`) | verificador | `grep -c 'infrastructure'` já dá `1` hoje (a recommendation da `:73`) — gate verde antes da task |
| §F3-T3 reescreve a linha 169 inteira | F3-P02 | Remover só a 2ª frase deixava o token `` `tdd-enforcer` `` e o `grep -cE` dava 1, não 0 |
| **B14: `5` → `8` linhas** | Baseline + F3-P02 + verificador | A métrica e o `chk F3-T3` usavam o padrão **ancorado no cercado**, que não casa `:112-114` (sem backtick) e deixava 3 das 8 linhas sem dono. Passaram a casar o **nome nu** |
| `doc-sync.ts:237` (não `:234`) + passo que **deleta** `_autoApplyMinor` | §F4-T4 | `:234` é o `console.log`; e `grep -c 'autoApplyMinor'` dá **3** hoje (`:150`, `:211`, `:226`) — o critério exigia `0` sem nenhum passo que editasse o arquivo. A v1.0.0 só trocava a flag de 4 lugares e listava 3, não 4 |
| §F4-T1 **antes** de §F4-T2 + critérios no fonte | F4-P01 | §F4-T2 (criar `archive/`) tornava inalcançável o único ramo `skipped` que ainda dispara |
| **§F4-T5 passa a produzir `.agents/runs/backlog-2026-10-02.md`** | F4-P02 | O `chk F4-T5` anterior contava linhas *do próprio plano* — que a revisão escreve antes de qualquer task — e por isso passaria **vacuo**. O artefato versionado só existe depois da task |
| **Backlog `B1…B11` → `BL1…BL10`** | F4-P02 + F2-P03 + F3-P01 | Colidia com o namespace de **Baseline** `B0…B19` do índice: *Baseline B6* (gate DDD, Fase 2) e *BL6* (specialist:lint fora do preflight, Fase 4) significavam coisas diferentes — e as duas linhas são sobre gate de lint, então o leitor troca uma pela outra sem perceber. Prefixo **`BL`** = backlog |
| **Baseline `B10` e `B11` removidos da F4-P01** | F4-P01 | As 2 tasks citavam métricas de **outras** tasks (`B10` é o diretório da F4-T2; `B11` são os links de memória da Fase 1). A métrica da F4-T1 e a da F4-T3 não têm linha própria na tabela do índice — declaradas inline |
| **`entregue por §F[0-9]` com classe de dígito** | F4-P02 + verificador | Sem a classe, o padrão casa **com a própria linha do comando** e o critério conta a si mesmo (`4` em vez de `3`) |
| `chk F1-T1` exige os 6 links **e** preflight verde | verificador | Ancorava só em `ci:preflight` verde, que §F2-T1/§F2-T2 também entregam — passaria com a F1-T1 pulada |
| Contagem do backlog reconciliada com a tabela (10 itens, `BL1…BL10`) + rodapé duplicado removido; BL6 aponta para **D4** | F4-P02, F2-P03 | Contagem contradizia a tabela; remissão apontava para uma decisão que não trata do assunto |
| §F4-T3 aceita `0` se D2 for (d) | verificador | A v1.0.0 exigia `1` incondicionalmente enquanto o índice listava (d) como legítima; e o check dependia de rede. **v1.1.0 fixou `1`**, com instrução de trocar para `0` se D2 for (d) — assim o check falha hoje em vez de passar vacuosamente |
| Probes em `/tmp` substituídos por spec vitest | F1-P01, F2-P03 | `/tmp/cdrtest` e `/tmp/dddtest` não são criados por nenhum passo e somem no reboot |
| `turbo.json` **é** JSON puro | F2-P04 | A v1.0.0 afirmava trailing comma e que `JSON.parse` falharia. **Falso** — `python3 -c "import json;json.load(open('turbo.json'))"` passa hoje, e `check-turbo-drift.ts:55` faz `JSON.parse` sem reclamar |

**Rejeições** (correções dos revisores que **não** foram aplicadas) estão em
[§F4-T5 Backlog](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-02.md).

## Footer

- **21 tasks**, 4 fases, P0 → P2 + backlog versionado
- **TDD obrigatório** em qualquer mudança em `.tooling/scripts/ci/` e `tooling/scripts/`
- **main atualizada antes da branch**; todo merge via PR
- Partes: [índice](./2026-10-02-melhorias-fluxo-desenvolvimento.md) ·
  [F1 P0 · 2 partes](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-1-p0-part-01.md) ·
  [F2 P1 enforcement · 4 partes + apêndice](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-01.md) ·
  [F3 P1 docs · 2 partes](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-3-p1-docs-part-01.md) ·
  [F4 P2+backlog · 2 partes](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-01.md)

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.1.0
**Última atualização:** 2026-10-02
