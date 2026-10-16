---
name: doc-sync-memory
description: Memória acumulada do agent doc-sync — sincronização reativa code↔docs via hooks
---

# Memória: `doc-sync`

> Arquivo de memória do agent `doc-sync`. Atualizado após cada execução significativa.

## Decisões Tomadas

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
- Mapeamento heurístico code→docs: `apps/api/src/modules/<feature>/` → `docs/api/<feature>.md` + `docs/superpowers/specs/.../<feature>-*.md`. Cobertura não exaustiva — gaps viram `alert`.
- Idempotência: rodar doc-sync múltiplas vezes produz mesmo resultado (não duplica linhas, não cria arquivos duplicados).
- Rastreabilidade: cada finding tem `evidence` (path:linha + trecho + razão).

## Lições Aprendidas

- Doc-sync flagou `docs/api/users.md` como faltante antes do commit 79d18e0 — heurística funcionou.
- Cross-ref depth bug (ffb5342) capturado pelo preflight `check-doc-refs` — defesa em profundidade funciona.

## Sugestões de Evolução

- [ ] Adicionar trigger para `release-template.yml`: ao merge em main, preparar entradas de CHANGELOG consumidas pelo workflow de release
- [ ] Adicionar label `release-impact` em tasks que tocam `docs/MONOREPO.md` ou `docs/STACK.md` (versionados)