---
name: doc-sync-memory
description: Memória acumulada do agent doc-sync — sincronização reativa code↔docs via hooks
---

# Memória: `doc-sync`

> Arquivo de memória do agent `doc-sync`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-11-16 — o parecer da semana saiu com 15 cópias em 24 ações

**Contexto:** o artefato do PR #167 (`.agents/runs/weekly-docs-sync-2026-11-16_054502.md`)
tinha 24 ações das quais 15 eram CÓPIAS: 12 linhas de "History/Archive" (uma
por model do `schema.prisma`, todas com o mesmo doc e o mesmo motivo) e 3 de
"Endpoints modificados" (uma por controller, todas idênticas). E o gerador do
relatório vivia FORA do repo (o script do cron), então os defeitos dele não
tinham dono, não tinham teste e não podiam ser corrigidos no ciclo.

**Decisão:**
1. O mapeamento de controller virou **GENÉRICO**: `apps/api/src/modules/<bc>/`
   → `docs/api/<bc>.md`, a regra da matriz da §3 da `documentacao.md` — e não
   mais uma lista de paths hardcoded que só cobria `auth` e `users`.
2. O check de History/Archive só acusa model **AUDITADO** (com `createdAt` +
   `createdBy`) sem par `<Model>History`/`<Model>Archive`. O guard antigo era o
   INVERSO do comentário: saía cedo justamente no caso que a função existe para
   checar.
3. Toda ação carrega `source_file` — o path que a disparou. O `reason` diz O
   QUÊ; o `source_file` diz ONDE.
4. Ações com mesmo tipo + doc + motivo + origem são a MESMA ação (dedupe), e o
   MESMO arquivo repetido na lista não repete ação.
5. O gerador do relatório semanal entrou no repo:
   `tooling/scripts/weekly-docs-sync.ts` (`pnpm weekly:docs-sync`), com janela
   determinística, path vazio filtrado na origem e diretório derivado do path.

**Consequências:** o parecer da semana caiu de 24 ações (15 cópias) para 10
ações distintas e rastreáveis. A COBERTURA de doc ausente continua sendo do
`check-doc-coverage` — o doc-sync não passou a bloquear por doc de BC
faltando, porque essa falta já tem dono.

### 2026-10-15 — report-only era contrato morto; agora só doc ausente reprova

**Contexto:** a decisão de 2026-10-06 se provou por ela mesma: ela dizia "o
script nunca chama `process.exit`" e citava `grep -c 'process.exit'` → `0`.
MEDIDO 2026-10-15: o número era **0**, o `|| exit 1` do pre-commit era código
morto, e `severity: 'major'` não era emitido por NENHUM caminho — os 3 emissores
punham `minor`. `alerts` era estruturalmente 0.

**Decisão:** existe 1 `process.exit(1)`, disparado só por `alerts > 0`, que só
sobe quando um `docFile` mapeado **não existe**. Severidade `minor` não
bloqueia. Artefato **gerado** e gitignored (`apps/api/openapi.json`) entra em
`GENERATED_DOC_FILES`: continua alvo de `review`, sai do `existsSync` — senão
todo PR que toca `auth.controller.ts` reprova em checkout limpo (MEDIDO:
`Alerts: 1 | Health 90/100` e EXIT=1 num `git clone` sem o arquivo).

**Consequências:** a barreira de merge passa a incluir o `sync-docs`, não só o
`quality`. Os docs que afirmavam report-only (`.agents/agents/doc-sync.md`,
`docs/fluxo-desenvolvimento.md`) foram corrigidos no mesmo commit.

### 2026-10-06 — doc-sync virou report-only

**Contexto:** o Passo 4 deixou de bloquear merge.

**Decisão:** report-only por contrato; o script nunca chama `process.exit`.
**Revogada em 2026-10-15** — ver a entrada acima: o "nunca chama" era o motivo
pelo qual o gate não existia.

**Consequências:** a barreira de merge é o check `quality` do ruleset de `main`.

### 2026-09-22 — Estratégia reativa (não proativa)

**Contexto:** sincronização proativa gera churn e conflitos.

**Decisão:** doc-sync é invocado por hooks (pre-commit, push, PR, merge) após mudança de código, detectando drift via mapeamento heurístico code→docs.

**Consequências:** zero overhead quando não há mudança; ativação automática quando há.

### 2026-09-22 — Auto-apply conservador

**Contexto:** aplicação automática de mudanças em docs pode quebrar o build.

**Decisão:** auto-aplica APENAS findings `info` e `minor` (sincronização trivial); para `major` e `blocker`, gera alerta para revisão humana.

**Consequências:** confiança no pipeline + segurança editorial.

### 2026-10-16 — Flow Mermaid entra no mapa code→doc

**Contexto:** os diagramas de `docs/flows/` são DERIVADOS da IR do mesmo diretório, e
`check-flow-mermaid-sync` (novo no preflight) fecha só o elo `IR → flow.md`. Ele NÃO vê
mudança de código: a IR é autoral (`mechanism: hand`) e não tem âncora de código — medido
nas 15 IRs, nenhum campo aponta para o fonte.

**Decisão:** a heurística do Passo 1 ganhou a linha "mudança em código coberto por um flow →
atualizar a IR e rodar `--write`". O gatilho é humano e o agente é quem o executa, porque
o gate não pode.

**Consequências:** o diagrama deixa de ser documento órfão; em troca, o Passo 1 ganhou uma
ação que exige leitura da IR antes de escrever — mais cara que as outras, e o custo disso é
justamente o custo de um diagrama que descreve comportamento.

## Padrões Descobertos

- 4 ações por finding: `review` (padrão), `update` (auto-aplicado se info/minor), `create` (arquivo novo), `alert` (blocker/major → humano).
- Mapeamento code→docs: `apps/api/src/modules/<bc>/` → `docs/api/<bc>.md` (canônico, pela matriz da §3 da `documentacao.md`) + `apps/api/openapi.json`; o ADR e a spec de contrato entram como docs EXTRAS do módulo. `schema.prisma` → a spec de modelo + `docs/STACK.md` + `docs/system-design/dados.md`.
- Idempotência: rodar doc-sync múltiplas vezes produz o mesmo resultado — e o MESMO arquivo repetido na lista não repete ação (o relatório semanal passa a lista de arquivos da semana, e um arquivo tocado em N commits entra N vezes).
- Rastreabilidade: cada ação carrega `source_file` (o path que a disparou) e o `reason`. O campo `evidence` (path:linha + trecho) existe no schema mas NÃO é populado pelo script — o doc-sync não tem diff, ele só sabe o path.

## Lições Aprendidas

- Doc-sync flagou `docs/api/users.md` como faltante antes do commit 79d18e0 — heurística funcionou.
- Cross-ref depth bug (ffb5342) capturado pelo preflight `check-doc-refs` — defesa em profundidade funciona.

## Sugestões de Evolução

- [ ] Adicionar trigger para `release-template.yml`: ao merge em main, preparar entradas de CHANGELOG consumidas pelo workflow de release
- [ ] Adicionar label `release-impact` em tasks que tocam `docs/MONOREPO.md` ou `docs/STACK.md` (versionados)