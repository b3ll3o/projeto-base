---
state_snapshot: .agents/runs/state-snapshot-20261029T143940Z-melhoria-documentacao-aplicacao.md
demand_slug: melhoria-documentacao-aplicacao
date: 2026-10-29
branch: docs/melhoria-documentacao-aplicacao
base_main_sha: 194d305
---

# Plano — a documentação da aplicação, do jeito que ela merece

> Base: `main` @ `194d305` · Branch: `docs/melhoria-documentacao-aplicacao`
> Origem: auditoria de documentação + auditoria de tooling de 2026-10-29.

## 0. O que está em jogo

O repo tem **364 arquivos `.md`** versionados (64.130 linhas) e uma cultura de
doc fora do comum — ADRs que registram *por que*, runbooks que registram *como
rodar*, flows com IR, convenções que viraram prosa. O problema não é a
quantidade. É que **a documentação não é medida, e por isso ela mente**:

| # | Achado | Gravidade |
|---|---|---|
| B-01 | README diz `Node ≥ 20`; `engines.node` diz `>=22.6.0` | BLOQUEANTE |
| B-02 | README e `apps/api/.env.example` mandam `openssl rand -base64 48`; o runbook **proíbe** (o `/` encerra a credencial da URI) | BLOQUEANTE |
| B-03 | 3 docs + o `doc-sync` dizem que `openapi.json` é gitignored; ele é **versionado** desde o #125 | BLOQUEANTE |
| B-04 | Runbook diz que a imagem prod da API não carrega dependência; o Dockerfile foi corrigido (#104) | BLOQUEANTE |
| B-05 | `fluxo-desenvolvimento.md` diz que o `doc-sync` "NUNCA aborta" — em 3 lugares, contradizindo o §7.2 do **mesmo** arquivo | BLOQUEANTE |
| B-06 | O mesmo doc cita 21 e 29 gates do preflight; existem 37 | BLOQUEANTE |
| B-07 | `docs/MONOREPO.md` documenta `packages/ui/`, que não existe (alias morto no `tsconfig.base.json`) | BLOQUEANTE |
| B-08 | `docs/STACK.md` diz que o hook roda "TDD enforcer"; **nenhum hook o roda** | BLOQUEANTE |
| B-09 | `docs/MONOREPO.md` lista `infra/postgres/` e `infra/docker-compose.yml`; não existem | BLOQUEANTE |
| B-10 | README promete "três modos" de execução; existem dois | BLOQUEANTE |
| I-01 | `docs/api/` documenta **10 das 29** operações da API | IMPORTANTE |
| I-02 | tenancy, RBAC e feature flags: decisões vigentes **sem ADR** | IMPORTANTE |
| I-03/04/05 | README lista 21 de 27 agents, descreve 1 de 6 BCs, e a árvore omite 8 diretórios de doc | IMPORTANTE |
| I-06 | `docs/STACK.md` diz "8 specs" de Playwright; existem 17 | IMPORTANTE |
| I-07 | Versão: `AGENTS.md` 1.13.0 vs 1.12.0 nos outros; `README.md` não está na lista do gate de footers | IMPORTANTE |
| I-09 | As 13 rotas do web não têm doc de referência | IMPORTANTE |
| I-11 | `docs/superpowers/` tem 118 arquivos e **nenhum índice** | IMPORTANTE |
| I-13 | `docs/MONOREPO.md` §7 lista 10 dos 26 scripts | IMPORTANTE |
| I-14 | A tabela de env do runbook cobre 9 das 18 chaves | IMPORTANTE |
| L1/L3 | **Nenhum gate exige doc** para módulo, rota ou package novo; o `doc-sync` mapeia 5 caminhos hardcoded | IMPORTANTE |

> **A assimetria que explica tudo.** `pnpm ci:preflight` roda **verde** e não
> pega **nenhuma** das 10 contradições bloqueantes: elas estão em prosa e em
> contagens, não em paths. O `check-doc-refs` valida que o *link* resolve — não
> que o *conteúdo* seja verdade. Um gate que reporta verde sobre uma
> documentation que mente é a classe 1 de `guard-classes.md`.

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

- **`docs/api/auth.md` e `docs/api/users.md`** — o formato de referência de BC
  já existe e é bom (tabela de endpoints, payloads, armadilhas). Os 4 docs que
  faltam copiam **esse** formato, não inventam outro.
- **A convenção `tamanho-e-revisao.md`** — o teto de 300 linhas e a regra de
  claim verificável já existem; o que falta é quem os aplica.
- **O framework de gates** (`preflight-gates.ts` + `PREFLIGHT_CHECKS` + `RUNNERS`
  + registro de dentes + catálogo humano) — o gate novo entra nesse arcabouço pronto,
  sem inventar mecanismo.
- **O `doc-sync`** — ele cobre o *reativo* (o diff mudou, o doc mudou). O que
  falta é o *proativo* (a unidade de código nova não tem doc).
- **`doc-writer`** — escreve doc genérica sob demanda. Não conhece as stacks
  deste repo e não decide **onde** a verdade mora.

### O que FALTA

1. Um **agent** que conhece as stacks deste monorepo e sabe qual doc é a
   canônica de cada unidade de código.
2. Uma **regra** que diga, sem ambiguidade, que a documentação é parte do
   código — e que um doc que mente é defeito, não esquecimento.
3. Um **gate** que cobre a regra (a regra em prosa é exatamente o defeito que
   este repo existe para eliminar).
4. As **docs que faltam** e as que **mentem**.

## 2. As 5 fases

### Fase 1 — O agent e a skill (o papel)

| # | Entrega | Arquivo |
|---|---|---|
| 1.1 | Agent `documentation-specialist`: as stacks deste repo (o que cada uma exige documentar), a matriz de cobertura, o comportamento, os anti-padrões | `.agents/agents/documentation-specialist.md` |
| 1.2 | Skill `documentation-audit`: o **processo** determinístico (inventário → matriz → drift → freshness → findings) | `.agents/skills/documentation-audit/SKILL.md` |
| 1.3 | Memória do agent (regra: todo agent tem memória desde o nascimento) | `.agents/memory/documentation-specialist.md` |
| 1.4 | Binding Claude Code (wrapper fino, como `review-router` e `specialist-router`) | `.claude/agents/documentation-specialist.md` |

### Fase 2 — A regra e a convenção (o contrato)

| # | Entrega | Arquivo |
|---|---|---|
| 2.1 | **Regra mandatória** no `AGENTS.md`: a documentação é parte do código; doc ausente = lacuna; doc que mente = defeito | `AGENTS.md` |
| 2.2 | Convenção canônica: o fato tem **um** dono, a matriz de cobertura, o frescor, os quadrantes (Diátaxis), as exceções | `.agents/specs/conventions/documentacao.md` |
| 2.3 | Entrada nos **dois** índices de convenção (o `AGENTS.md` §6 **e** o `README.md` das convenções — eles são o mesmo índice) | `AGENTS.md` + `.agents/specs/conventions/README.md` |
| 2.4 | Registro no catálogo de agents (`AGENTS.md` §3) e no `WORKFLOWS.md` | `AGENTS.md`, `.agents/WORKFLOWS.md` |
| 2.5 | Matriz de roteamento (senão o gate `check-agent-routing-coverage` acusa órfão) e matriz de review (senão ninguém revisa doc) | `.agents/specs/conventions/specialist-routing.md`, `review-routing.md` |

### Fase 3 — O gate (a regra com dentes)

| # | Entrega | Arquivo |
|---|---|---|
| 3.1 | `check-doc-coverage`: BC do backend → `docs/api/<bc>.md`; rota do App Router → `docs/web/rotas.md`; package → `packages/<pkg>/README.md` | `.tooling/scripts/ci/check-doc-coverage.ts` |
| 3.2 | Spec companion, com **mutação no repo real** (a árvore sadia exercita só metade do conserto) | `.tooling/scripts/ci/check-doc-coverage.spec.ts` |
| 3.3 | Registro em `PREFLIGHT_CHECKS` + `RUNNERS` | `.tooling/scripts/ci/preflight-gates.ts`, `preflight.ts` |
| 3.4 | Registro de dentes + catálogo humano de checks (as 4 reconciliações do `check-teeth-registry` exigem os dois) | `ci-defense-in-depth-dentes.md`, `ci-defense-in-depth.md` |
| 3.5 | O gate novo na lista do `docs/fluxo-desenvolvimento.md` | `docs/fluxo-desenvolvimento.md` |

### Fase 4 — As docs (o conteúdo)

| # | Entrega | Arquivo |
|---|---|---|
| 4.1 | 4 docs de BC que faltam | `docs/api/{tenancy,profiles,feature-flags,health}.md` |
| 4.2 | Catálogo de rotas do frontend | `docs/web/rotas.md` |
| 4.3 | READMEs dos 3 packages do workspace | `packages/*/README.md` |
| 4.4 | 3 ADRs das decisões vigentes (tenancy, RBAC, feature flags) | `docs/adr/000{4,5,6}-*.md` |
| 4.5 | Índice de `docs/superpowers/` | `docs/superpowers/README.md` |
| 4.6 | Os 10 fatos bloqueantes corrigidos | `README.md`, `docs/STACK.md`, `docs/MONOREPO.md`, `docs/como-rodar.md`, `docs/fluxo-desenvolvimento.md` |
| 4.7 | As lacunas restantes (rotas no README, contagens de env, scripts do monorepo, contagens de agent) | idem |
| 4.8 | Runbook dividido (542 → ≤ 300) com a tabela de env e os comandos `pnpm` **preservados** no arquivo principal | `docs/como-rodar.md` + `docs/runbooks/*.md` |

### Fase 5 — Revisão, fecho, entrega

| # | Entrega |
|---|---|
| 5.1 | Revisão por `code-reviewer` + `stack-code-reviewer` (2 Specialist em paralelo) |
| 5.2 | `pnpm ci:preflight` + `pnpm tooling:test` verdes |
| 5.3 | `pnpm ci:local` (a Camada 1 completa) |
| 5.4 | Footers de versão alinhados em **1.14.0** nos 5 docs que os declaram |
| 5.5 | Commit, push e PR |

## 3. O Definition of Done

- [ ] `pnpm ci:preflight` verde, **com o gate novo rodando** (38 gates).
- [ ] `pnpm tooling:test` verde — a spec do gate novo **cai** quando o gate
      é neutralizado (mutação, não "controle negativo" de tmpdir).
- [ ] Os 4 docs de BC, o catálogo de rotas, os 3 READMEs de package e os 3 ADRs
      existem, em pt-BR, e nenhum passa de 300 linhas.
- [ ] Nenhum dos 10 fatos bloqueantes sobrevive.
- [ ] Nenhum claim numérico sem o comando que o reproduz.
- [ ] Nenhum link relativo quebrado (`check-doc-refs`).
- [ ] A regra está em **dois** lugares: `AGENTS.md` (obrigatória) e a
      convenção (detalhada) — e o gate a executa.

## 4. Fora de escopo (e por quê)

| Item | Por quê |
|---|---|
| **Teto de 300 linhas virando gate** | A regra existe há meses e é honesta; aplicá-la a **todo** `.md` versionado (18 arquivos acima de 300, vários históricos) transformaria um PR de documentação num PR de Surgery. A auditoria mede o tamanho; o gate mede cobertura. Duas classes, dois instrumentos — nenhum afirma o que não faz. |
| **`docs/superpowers/plans/**` e `.agents/runs/**` como alvo de freshness** | São **histórico**: um plano de 2026-09 envelhece por definição. Declarados como exceção na convenção. |
| **Redesenhar a UI** | `docs/STACK.md` registra que o design system deste repo é Tailwind inline, por decisão. Documentar a decisão ≠ mudar a decisão. |
| **`apps/api/.env.example` com `openssl rand -base64 48`** | É o mesmo defeito do B-02, mas o arquivo é de outro escopo (config de runtime). **Reportado**, não corrigido aqui. |
| **Alias morto `@projeto/ui`** | Tira-lo do `tsconfig.base.json` é mudança de código com blast radius (build de 3 workspaces). **Reportado**. |

## 5. O risco que este plano aceita

Um gate de cobertura que nasce **vermelho** treina o descaso com o gate — o
repo já pagou esse custo (`check-harness-owner` nasceu desligado). Por isso a
Fase 4 vem **antes** do gate entrar no preflight: o gate só é registrado quando
a árvore já está coberta, e a spec prova que ele **ainda** fica vermelho
quando uma unidade nova aparece (mutação no repo real, com `try/finally`).
