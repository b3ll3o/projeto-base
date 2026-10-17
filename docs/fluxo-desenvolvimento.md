---
name: fluxo-desenvolvimento
description: Documento canonico do fluxo de desenvolvimento do repositorio, do primeiro comando ao merge — das 3 camadas (hooks locais, CI remoto, processo de agents) aos gates que cada uma dispara, com o estado real (wired / unwired) de cada mecanismo.
version: 1.2.0
updated: 2026-10-16
maintainer: stack-code-reviewer
---

# FLUXO DE DESENVOLVIMENTO — do primeiro comando ao merge

> Documento canônico do **fluxo**. Para *o que* o repo faz, veja [`MONOREPO.md`](./MONOREPO.md) e [`STACK.md`](./STACK.md).
> Para *por que* existem 3 camadas, veja [`ci-defense-in-depth.md`](../.agents/specs/conventions/ci-defense-in-depth.md).
> Este documento é **factual**: onde um gate não existe ou não bloqueia, está escrito que não existe.

---

## §1. TL;DR

1. **Antes de qualquer coisa**: `pnpm install` e, se for planejar, gerar um *state-snapshot* (camada de agents).
2. **Commit** dispara `pre-commit`: `lint-staged` (só Prettier) + `stack-code-reviewer` (único que aborta em pre-commit) + `doc-sync` (roda mas nunca aborta — ver §7.2).
3. **Push** dispara `pre-push`: `pnpm ci:preflight` — os gates estruturais declarados em
   [`preflight.ts`](../.tooling/scripts/ci/preflight.ts); aborta com exit 1 se algum falhar.
4. **PR para `main`** dispara 3 jobs de CI (`preflight`, `quality`, `docker-build-prod`) + `stack-code-review` + `docs-sync`. **Pós-#44** os jobs `preflight` e `quality` rodam a suíte do tooling, que valida os próprios dentes dele — contagem por `pnpm tooling:test` (dois roots).
5. **Merge em `main`** só dispara `release-template` (auto-tag) **se** o commit tocar `docs/MONOREPO.md`.

> **Ressalva crítica:** nenhum check de CI é *required_status_check* (apenas `quality` em `main` é *required* via ruleset — ver §7.2). A garantia real é a cadeia do workflow (`preflight` bloqueia `quality` via `needs:`), não o check isolado.

---

## §2. As 3 camadas

```text
        git checkout main
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ (C) PROCESSO DE AGENTS — antes de codar                      │
│     state-aware-planning → state-snapshot-<ts>.md            │
│     specialist-router  → classifica demanda                  │
│     specialist         → implementa (DDD/Hexagonal)          │
│     review-router      → emite N reviewers em YAML           │
│     retrospective-mode → captura aprendizados                │
│  ⚠ MEDIDO 2026-10-16: 25 dos 27 agents sem executor.         │
│  Só 2 rodam por hook (stack-code-reviewer, doc-sync); os     │
│  2 routers têm CLI, mas emitem despacho que ninguém consome. │
│  Só 2 estão registrados como subagent — ver §3.4.            │
└──────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ (A) ENFORCEMENT LOCAL — antes de qualquer push               │
│     pre-commit ─ lint-staged      → prettier --write         │
│                  stack-code-reviewer → exit 1 se blocker     │
│                  doc-sync          → NUNCA aborta (§7)       │
│     pre-push   ─ ci:preflight     → exit 1 se falhar       │
│   ✅ IMPOSTO localmente, burlável com --no-verify            │
└──────────────────────────────────────────────────────────────┘
               │
               ▼  git push / PR
┌──────────────────────────────────────────────────────────────┐
│ (B) CI/CD REMOTO — .github/workflows/                        │
│     ci.yml: preflight → quality (needs: preflight)           │
│            └ quality = db:generate, lint, typecheck,         │
│                        test:coverage, test:unit,             │
│                        integration, e2e                      │
│            └ docker-build-prod (paralelo, sem needs)         │
│     review-stack.yml  → stack-code-reviewer --mode=ci        │
│     sync-docs.yml     → doc-sync --mode=full                 │
│     release-template  → tag annotated no merge em main       │
│   ⚠ NENHUM é required_status_check (§7)                     │
└──────────────────────────────────────────────────────────────┘
```

**Ordem de encadeamento dentro do CI:** `preflight` → (`quality` | `docker-build-prod`). Só o `quality` declara `needs: preflight`; o `docker-build-prod` roda em paralelo e tem `if: github.event_name == 'pull_request'`.

---

## §3. Fluxo detalhado, passo a passo

| # | Passo | Comando | Gate que dispara |
|---|-------|---------|------------------|
| 1 | Sincronizar a base | `git pull --ff-only origin main` | nenhum — [git-workflow.md](../.agents/specs/conventions/git-workflow.md) classifica a base atualizada como **convenção**, não hook |
| 2 | Criar branch | `git checkout -b feat/<slug>` | nenhum |
| 3 | Instalar / validar deps | `pnpm install` | nenhum |
| 4 | (Camada C) Snapshot de estado | ver §5 | nenhum — prosa em [`state-aware-planning.md`](../.agents/workflows/state-aware-planning.md) |
| 5 | Codar com o specialist | ver `.agents/agents/<specialist>.md` | nenhum — prosa |
| 6 | Commit | `git add -A && git commit -m "…"` | **pre-commit**: lint-staged, stack-code-reviewer, doc-sync |
| 7 | Verificação completa local | `pnpm ci:local` | **nenhum** — `ci:local` não está em nenhum hook (§7) |
| 8 | Push | `git push -u origin <branch>` | **pre-push**: `pnpm ci:preflight` |
| 9 | Abrir PR | `gh pr create` | — |
| 10 | CI do PR | automático em `pull_request` | `preflight` → `quality`; `docker-build-prod` em paralelo; `stack-code-review` e `docs-sync` em workflows separados |
| 11 | Revisão / fix loop | `gh pr merge` só após CI verde | **NENHUM** — sem `required_status_checks`, o botão decide (§7) |
| 12 | Release | automático | `release-template` roda **só** em push para `main` que toque `docs/MONOREPO.md` |

### 3.1 Detalhe do pre-commit

O hook filtra por extensão. São dois blocos independentes:

```sh
# Bloco 1 — se houver staged casando com \.(ts|tsx|json|yaml|yml)$
pnpm exec lint-staged || exit 1

# Bloco 2 — se houver staged casando com \.(ts|tsx|prisma)$
pnpm tsx tooling/scripts/stack-code-reviewer.ts --files="$changed" --mode=pre-commit || exit 1
pnpm tsx tooling/scripts/doc-sync.ts --files="$changed" --mode=incremental || exit 1
```

**Consequência prática:** um commit que mexa só em `.md` ou `Dockerfile` **não passa por nenhum dos dois** (`.yml`/`.yaml` passam pelo Bloco 1, mas só como `prettier --write`). O gate que poderia ver esses arquivos (`checkDocRefs`) não roda no `pre-commit`: roda no `pre-push` e no job `preflight` do CI, e desde a correção do escopo (§F2-T2) ele cobre **todo `.md` versionado** (`git ls-files '*.md'`), não só `docs/` e `.agents/specs/`.

### 3.2 Detalhe do pre-push

`.husky/pre-push` roda **exclusivamente** `pnpm ci:preflight`. Ele **não** roda lint, typecheck nem teste — apesar de [`git-workflow.md`](../.agents/specs/conventions/git-workflow.md) recomendar `pnpm ci:local` como "Pre-Push Quality Gate".

Os gates registrados são os `name:` de
[`preflight-gates.ts`](../.tooling/scripts/ci/preflight-gates.ts) — **essa lista
é a fonte de verdade, não este doc**. Uma cópia enumerada aqui envelhece a cada
gate novo sem aviso nenhum; o veredito sai de `pnpm ci:preflight`, que separa `✓`
/ `✗` / `skipped`. Para quantos são agora:

```bash
grep -cE "^\s+name: '" .tooling/scripts/ci/preflight-gates.ts
```

> MEDIDO 2026-10-15: o comando apontava para `preflight.ts`, que só importa o
> registro e não tem nenhum literal `name:` — devolvia **0** com exit 1, e o
> documento publicava um 0 como se fosse a contagem. `preflight-gates.ts` devolve
> **21**. O sintoma (contagem que não se move) é indistinguível de "não mudou
> nada desde a última vez".

### 3.4 Fan-out por fase — onde paralelizar dá ganho, e onde dá conflito

O pedido "mais agents" esbarra num fato medido: **o despacho já é emitido e nunca executado.**
`review-router.ts` emite 8 reviewers para um diff de 87 arquivos e termina em `console.log`
(`review-router.ts:414-419`). MEDIDO: `git diff --name-only a6eaae7^ a6eaae7` = 87 arquivos. `grep -rn 'review:route|specialist:route' .github/workflows/ .husky/ .tooling/scripts/ci/preflight-gates.ts`
→ **só as linhas do `package.json`**. A instrução de paralelo existe como prosa em
`review-router.md:70` ("chamar Agent tool **na mesma mensagem**"), num arquivo que nenhum hook lê.

| Fase | Fan-out | Por que |
|------|---------|---------|
| Análise / pesquisa | N agentes **read-only**, domínios disjuntos por `path_glob` | sem escrita, sem colisão; a matriz já separa `nestjs` de `nextjs` |
| Auditoria | N reviewers em paralelo, todos read-only | o roteador já resolve quem; falta o executor |
| `.agents/memory/*.md` | 1 agente por arquivo | 29 arquivos, convenção 1:1 verificável |
| Implementação | **1 por vez no mesmo codebase** | ver paredes abaixo |
| Gates do preflight | 29 gates em `Promise.all` | hoje serial (`preflight.ts:390`), nenhum escreve |

**Paredes — aqui paralelizar não é ganho, é conflito garantido:**

- **`apps/api/prisma/schema.prisma`** — fonte única, e `db:generate` é `cache: false`
  (`turbo.json:8`, não o `package.json` — o cache é do turbo). Dois agents no schema não dão
  conflito de merge: dão **veredito sobre dado stale**, porque o typecheck de um roda contra o
  client gerado do schema que o outro ainda edita. O falso positivo multiplica o custo.
- **`pnpm-lock.yaml`** — já tem `permissionDecision: "deny"` no PreToolUse
  (`.claude/hooks/pretooluse-block-pnpm-lock.mjs`). Um `pnpm add` paralelo destrói o guard.
- **`package.json` raiz, `turbo.json`, `pnpm-workspace.yaml`** — `check-package-json-drift` mede
  exatamente esses arquivos; a matriz marca os dois últimos `blocking: true`.
- **`specialist-routing.md`** — fonte da verdade de **todo** o roteamento. Dois `agent-architect`
  colidem no arquivo que decide quem é chamado.
- **Branches paralelas** — `check-branch-up-to-date` bloqueia contra `origin/main`. A segunda
  branch nasce desatualizada por construção quando a primeira faz push. O histórico já escolheu o
  lado oposto: PR #81 (167 arquivos), #95 (10 issues), #80 (9 issues).

**Não converta gate determinístico em prompt.** Os 29 gates são regex + TypeScript com spec
própria; §5 já registra que a camada "agentic" é *"regra determinística com prosa em volta"*.
Reescrever um como LLM é a classe 6 de `guard-classes.md` — spec verde, sistema inerte.

**As 3 peças que faltam** — nenhuma delas é "mais agents":

1. **Executor** — `Agent` × N em paralelo sobre a saída do `review-router`. Menor diff e maior
   retorno: o roteamento, a matriz e os testes já existem.
2. **Registro** — 25 dos 27 agents não estão em `.claude/agents/`, logo o orquestrador não tem
   handle. Agent não registrado não é invocado nem por LLM.
3. **Relógio** — `grep -rn 'Date.now()' tooling/ .tooling/` devolve **1** ocorrência, num spec
   unitário (`review-router.spec.ts:426`), nenhuma em código de produção. Sem
   cronômetro, "mais agents é mais rápido" é raciocínio — e claim sem medida ao lado já
   enveleceu neste repo mais de uma vez.

---

## §4. Tabela de gates

| Gate | Comando | Camada | O que bloqueia | Buraco coberto pelo CI? |
|------|---------|--------|----------------|------------------------|
| `lint-staged` | `pnpm exec lint-staged` | A (pre-commit) | Nada semântico: as 2 entradas são `prettier --write` | Sim — `format:check` roda no `ci.yml` |
| `stack-code-reviewer` | `pnpm tsx tooling/scripts/stack-code-reviewer.ts` | A (pre-commit) | `blocker` > 0 ou `major` > 3 (`exit 1`) | Sim — `review-stack.yml` chama o mesmo script |
| `doc-sync` | `pnpm tsx tooling/scripts/doc-sync.ts` | A (pre-commit) | **Nada** — `grep -c 'process.exit' tooling/scripts/doc-sync.ts` = 0 | Não — e o job de CI também nunca falha |
| `ci:preflight` | `pnpm ci:preflight` | A (pre-push) + B | os checks estruturais | Sim — `ci.yml` roda o mesmo script |
| `format:check` | `pnpm format:check` | B (preflight job) | Arquivo não formatado | — |
| `test:coverage` | `pnpm turbo run test:coverage` | B (quality job) | Cobertura de `apps/api` < 80% (`COVERAGE_FLOOR`, só quando `isCoverageEnforced`) | — |
| `test:integration` / `test:e2e` | `pnpm turbo run test:integration test:e2e --filter=@projeto/api` | B (quality job) | Teste falhando (exige Docker) | — |
| `playwright install` | `pnpm --filter @projeto/web exec playwright install --with-deps chromium` | B (quality job) | Nada por si — é o que dá binário ao passo seguinte. ⚠️ o `--filter` é o que impede o pior modo de falha de CI: na raiz, `pnpm exec playwright` não resolve e sai **0 sem instalar nada** | — |
| `test:e2e` (frontend) | `pnpm turbo run test:e2e --filter=@projeto/web` | A (via `ci:local`) + B (quality job) | Spec Playwright falhando. Sobe Postgres + API + `next build` (~40s) + Next standalone por conta própria (`apps/web/e2e/global-setup.ts`) — **não** reaproveita o container do passo de API | Sim — `ci:local` roda desde 2026-10-08, e `check-ci-local-e2e` impede a regressão (task ausente, pacote fora dos `--filter`, ou `test:e2e` sem `pretest:e2e` instalando o browser) |
| `stack-code-review` (job) | `pnpm stack:review --files=… --mode=ci` | B (PR job) | Mesmo `blocker`/`major` do local | — |
| `docker-build-prod` | `docker buildx build … --target prod` | B (só PR) | Dockerfile quebrado | Não — não roda em push |
| `release-template` | automático | B (merge em main) | Nada — e o noop foi desfeito: o footer pede `1.9.0`, tag `v1.9.0` não existe, então a criação sairia. O que falta é o check que amarra footer↔tag (**BL1**) | — |
| `specialist:lint` | `pnpm specialist:lint` | **NENHUMA** | Nada — script existe, 12 testes verdes, fora do preflight | Não |
| `review:lint` | `pnpm review:lint` | A+B (via preflight #8) | YAML inválido, LOC, regex, reviewer inexistente | Sim |
| `archive:lint` | `pnpm archive:lint` | A+B (via preflight #9) | Frontmatter canônico; com o diretório vazio (só `.gitkeep`) o check se declara `skipped` em vez de verde | Sim |
| `tooling:test` | `pnpm tooling:test` | B (job `preflight` do `ci.yml`) | Spec vermelho da própria camada de tooling | Sim |
| `check-flow-mermaid-sync` | `pnpm ci:preflight` | A+B (via preflight #27) | Diagrama Mermaid de `docs/flows/` que não é o que a IR do mesmo diretório gera — **o `flow.md` editado à mão ou a IR mudada sem `--write`**. O conserto vem no erro: `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`. Não alcança `código → IR` (a IR é autoral e não tem âncora de código); essa direção é humana, documentada em [`docs/flows/README.md`](./flows/README.md) | Sim |
| `check-test-set-covered` | `pnpm ci:preflight` | A+B (via preflight #28) | Script `test*` declarado num pacote do workspace que nenhuma invocação `turbo run` do `ci:local` executa (task pedida **e** pacote alcançado por `--filter`), e exceção declarada em [`tdd.md`](../.agents/specs/conventions/tdd.md) que deixou de valer. **Mede o conjunto, não a execução**: suíte instável continua "verde" para quem olha uma execução só | Sim |
| `turbo-redirect-differential` | `.tooling/scripts/ci/turbo-redirect-differential.sh` | A+B (via preflight #13) | Forma de `pnpm turbo run …` que o parser extrai diferente do turbo real — **classe 6** (especificação local diverge do sistema real) | Sim (se Node ≥ 22.6) |

---

## §5. Estratégias de fluxo e classificação de problemas

Derivado do framework de Rojas (*vetorial = similaridade, grafo = relação multi-hop, fine-tuning = comportamento, e às vezes a resposta é software convencional*).

| Tipo de regra | Onde vive | Como falha | Exemplos neste repo |
|---------------|-----------|------------|---------------------|
| **Determinística** (regra fixa, verificável) | `.tooling/scripts/ci/*.ts`, `.husky/*`, `tooling/scripts/*.ts` | Erra **alto e nomeado**: exit 1, arquivo, linha, regra | `stack-code-reviewer` (DDD imports bloqueados), `checkTsconfigDrift`, `checkPackageJsonDrift` |
| **Agente / roteamento** (YAML + regex executado por TS — *não* é IA) | `.agents/specs/conventions/{review,specialist}-routing.md` + `tooling/scripts/*-router.ts` | Erra **baixo e anônimo**: classifica para o reviewer errado, sem sinal | `review-router.ts` (30 testes), `specialist-router.ts` (39 testes) |
| **Memória / prosa** | `.agents/memory/*.md`, `.agents/runs/*.md` | **Evapora** — não existe evento detectável quando envelhece | 29 memórias versionadas; as retrospectivas `b<N>-result.md` gravam **fora** do repo |

> **Tese honesta:** nenhum problema medido neste repo pede IA. `grep -rniE 'embedding\|openai\|langchain\|pgvector\|neo4j' apps/*/package.json packages/*/package.json` retorna zero. A camada "agentic" é regex em YAML executado por TypeScript — é **regra determinística com prosa em volta**. O custo do rótulo errado já apareceu: `review:lint` está dentro do preflight, `specialist:lint` (mesma família, 12 testes verdes) está fora.

**Regra de bolso:** se a pergunta é "esse valor é igual ao esperado?" ou "esse import é proibido?", a resposta é regra determinística. Se o dado expira com o tempo (contagem de agents, versão de um footer, existência de um arquivo), ele pertence a um **check de drift**, não a um `.md` versionado.

---

## §6. Referência rápida de comandos

| Comando | O que faz | Camada |
|---------|-----------|--------|
| `pnpm ci:preflight` | checks estruturais de drift; aborta com exit 1 | A + B |
| `pnpm ci:local` | `ci:preflight` + `turbo run lint typecheck test:unit test:coverage test:integration test:e2e --filter=@projeto/api --filter=@projeto/web --filter=@projeto/shared-types` + `pnpm tooling:test` — o tempo **envelhece**: re-meça, não cite (n=3 em 2026-10-08, antes do 3º filtro e do tooling, deu 69,5 s / 69,6 s / 74,1 s) | manual (não está em hook) |
| `pnpm format:check` | Prettier em modo check sobre ts/tsx/json/yaml/yml | B |
| `pnpm stack:review` | `stack-code-reviewer` standalone (mesmo gate do pre-commit e do CI) | A + B |
| `pnpm docs:sync` | `doc-sync` standalone — **só relatório** | A + B |
| `pnpm review:lint` | Valida a matriz `review-routing.md` (YAML, LOC, reviewer refs) | A + B |
| `pnpm specialist:lint` | Idem para a matriz `specialist-routing.md` — **fora do preflight** | nenhuma |
| `pnpm archive:lint` | Valida frontmatter de `.agents/runs/archive/*.md` — ainda **sem arquivo** no repo | nenhuma |
| `pnpm tooling:test` | Suíte de testes do próprio tooling, em **dois roots** — a contagem total é `pnpm tooling:test \| grep -E 'Test Files\|Tests '`, e ela **envelhece**: re-meça, não cite | nenhuma |
| `pnpm review:route` / `pnpm specialist:route` | Roteamento headless: emite YAML de despacho | nenhuma |
| `pnpm test:unit` / `test:coverage` / `test:integration` / `test:e2e` | Suítes via turbo | B |
| `pnpm lint` | `turbo run lint` — real nos dois apps (`eslint .`, ESLint 9.39.5 medido em 2026-10-13). **A versão anterior desta linha dizia que o `apps/api` era um stub `echo … && exit 0`** — o stub foi trocado pelo lint real e a linha envelheceu sem ninguém re-medir | B |
| `pnpm typecheck` | `turbo run typecheck` — real em `apps/api` (`tsc --noEmit`) | B |

---

## §7. Estado atual (AS-IS)

### 7.1 Wired e funcionando

- `pre-commit` / `pre-push` instalados e executando.
- `stack-code-reviewer` — gate com dentes reais em pre-commit: `process.exit(1)` em blocker.
- `ci:preflight` — registrado e executando. **O veredito não é um número fixo:**
  rode `pnpm ci:preflight` e leia a linha final — ela separa `✓` / `✗` /
  `skipped`, e "todos passaram" é mentira enquanto houver skip. (2026-10-06 neste
  working tree: 15 ✓, 0 ✗, 2 skipped — os dois skips são por **ausência de
  alvo**, um deles porque `.agents/runs/archive/` está vazio.)
- Job `quality` do CI — encadeado por `needs: preflight`, roda cobertura 80% de `apps/api#unit` (gate era inerte até #40/#41).
- Job `preflight` do CI — **pós-#44** roda a suíte `pnpm tooling:test`, que valida os próprios dentes do tooling (dois roots; a contagem por `grep -E 'Test Files|Tests '` envelhece a cada spec nova).
- `docker-build-prod` — build real dos 2 Dockerfiles `prod` em toda PR.
- `release-template` — syntaticamente correto (idempotência via `git rev-parse --verify`, `concurrency`, `contents: write`) e **já não é noop**: quando a tag existe ele emite `::warning::` em vez de encerrar em silêncio. O que falta: check que amarra footer↔tag (**BL1**).
- Boundary DDD/Hexagonal **existe de fato** em `apps/api/src/modules/users/{domain,application,infrastructure}`.
- **Pós-#44**: 5 gates novos sobre as 7 classes de guard, incluindo o `turbo-redirect-differential` (classe 6 — spec local diverge do sistema real) e o `check-self-firing-guard` (classe 3 — guard que dispara em si mesmo). Detalhes em [`docs/superpowers/plans/2026-10-03-guard-classes.md`](./superpowers/plans/2026-10-03-guard-classes.md) e [`docs/superpowers/plans/2026-10-03-guard-classes-decisoes.md`](./superpowers/plans/2026-10-03-guard-classes-decisoes.md).

### 7.2 Unwired / aspiracional

> **Re-medido em 2026-10-06 pós-#44 (`249ad9a`) e pós-#50 (`af6af0a`).** Os 5 itens residuais da auditoria original caíram para **2** que permanecem unwired (sem mudança de fato). Os fechados estão em [`backlog-2026-10-02.md`](../.agents/runs/backlog-2026-10-02.md) §Remissões + §Achados durante a execução, e o que segue adiado está em `BL1`–`BL10` + `X1`–`X15`. Toda linha abaixo foi **re-medida** no merge — não copiada da auditoria.

| Item | Evidência de que não funciona |
|------|------------------------------|
| **Nenhum check bloqueia merge** *(parcialmente corrigido)* | O ruleset `master` (id 23853096) tem `required_status_checks: [{context: "quality"}]` e `main` só é atualizável por PR. O que sobra: `required_approving_review_count = 0` e `required_reviewers = []` (contribuidor único). Só **1 dos 3** contexts é exigido — a garantia real é a cadeia do workflow (`preflight` bloqueia `quality` via `needs:`), não o check isolado. |
| `lint-staged` não é linter | `node -e "console.log(Object.values(require('./package.json')['lint-staged']).join(' \| '))"` → `prettier --write \| prettier --write`. Nenhum eslint, tsc ou vitest. O ESLint entra pelo turbo. |
| `doc-sync` **agora** aborta, mas só por doc ausente | MEDIDO 2026-10-15: `grep -c 'process.exit' tooling/scripts/doc-sync.ts` → **1** (era **0** até 2026-10-06, e o `\|\| exit 1` do hook era código morto). O `exit(1)` só dispara com `alerts > 0`, e `alerts` só sobe no `checkMissingDoc` — doc de referência mapeado e ausente. Severidade `minor` não bloqueia, e `docs_health_score` sozinho não reprova. Doc **gerado** (`apps/api/openapi.json`, gitignored) fica de fora do `existsSync` via `GENERATED_DOC_FILES`, ou todo PR que toca controller reprovaria em checkout limpo. |
| `specialist:lint` fora do preflight | `grep -c specialist .tooling/scripts/ci/preflight.ts` → **1**, e o hit é um **comentário** que cita `nestjs-specialist` — não uma invocação. É classe 3: o sweep dispara em si mesmo. `review:lint` roda no preflight, `specialist:lint` não: duas matrizes de routing, dois scripts, um só no gate. |
| Limite de 300 linhas não é imposto | `wc -l .agents/WORKFLOWS.md` → **189** (re-meça; a régua é do repo, não deste arquivo). **Mas** a regra `tamanho-e-revisao.md` segue sem gate mecânico: `grep -rln 'MAX_LOC' tooling/scripts/ .tooling/scripts/ \| grep -v spec` devolve **um** arquivo, `tooling/scripts/lint-review-routing.ts`, e ele mede `review-routing.md` apenas. **Cuidado com o path**: procurar por `.tooling/scripts/ci/*.ts` devolve **0** e leva à conclusão errada de que não existe limite nenhum. |

### 7.3 Regra que resume a camada

> **Gate não ligado não é gate fraco — é pior que ausência, porque consome confiança.**
> E o token de sucesso não pode ser o mesmo para "verifiquei e passou" e "não havia nada para verificar": todo check que faz short-circuit por ausência do alvo precisa de um terceiro estado (`skipped`) com motivo.

---

## §8. Referências

- [`ci-defense-in-depth.md`](../.agents/specs/conventions/ci-defense-in-depth.md) — a estratégia de 3 camadas
- [`git-workflow.md`](../.agents/specs/conventions/git-workflow.md) — regras de branch/PR/merge
- [`cobertura-testes.md`](../.agents/specs/conventions/cobertura-testes.md) — o piso de 80% e suas exceções
- [`tamanho-e-revisao.md`](../.agents/specs/conventions/tamanho-e-revisao.md) — limite de 300 linhas
- [`guard-classes.md`](../.agents/specs/conventions/guard-classes.md) — as 7 classes pelas quais um controle falha reportando verde
- [`MONOREPO.md`](./MONOREPO.md) · [`STACK.md`](./STACK.md) · [`TEMPLATE_USAGE.md`](./TEMPLATE_USAGE.md)

### Planos e backlog ativos

- [`docs/superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-plan.md`](./superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-plan.md) — plano de fundação do BC `users`
- [`docs/superpowers/plans/2026-10-02-melhorias-fluxo-desenvolvimento.md`](./superpowers/plans/2026-10-02-melhorias-fluxo-desenvolvimento.md) — plano de melhorias que produziu o #43 e #44
- [`docs/superpowers/plans/2026-10-03-guard-classes.md`](./superpowers/plans/2026-10-03-guard-classes.md) — plano das 7 classes de guard (gates do #44)
- [`docs/superpowers/plans/2026-10-16-multi-tenant-plan.md`](./superpowers/plans/2026-10-16-multi-tenant-plan.md) — plano da demanda multi-tenant (perfil por empresa)
- [`.agents/runs/backlog-2026-10-02.md`](../.agents/runs/backlog-2026-10-02.md) — backlog vivo de itens adiados + achados durante a execução (BL1–BL10 + X1–X15)

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.2.0
**Última atualização:** 2026-10-16
