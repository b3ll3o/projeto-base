---
name: state-snapshot-pr-refresh
demand: pr-refresh
created: 2026-10-06T10:00:00Z
state: active
gap_detected: false
specialist_router: skipped
---

# State Snapshot — gaps de documentação (análise pós PR #50)

> Camada 0 do pre-planner. AS-IS vs TO-BE antes de planejar.
> Ver [`state-aware-planning.md`](../../.agents/specs/conventions/state-aware-planning.md).

## AS-IS — Estado real medido no disco

### Contagens
- **Agents:** 20 (12 genéricos + 2 routers + 5 specialists + 1 sub-dir `agent-architect`)
- **Skills:** 9
- **Workflows:** 10 genéricos + 6 compostos + 3 stack
- **Conventions:** 17
- **Templates:** 3 (spec, business-rules, engineering-loop/{01..06})
- **Memory files:** 21
- **Apps implementados:** `apps/api` (NestJS 11) + `apps/web` (Next.js 15)
- **BCs implementados:** `users` (com auditoria) + `health`
- **Planos superpowers:** ~100
- **Flows diagramáveis catalogados:** 78 (0/78 gerados)

### Footer de versão (data de medição 2026-10-06)
| Doc | Footer | Status |
|-----|--------|--------|
| README.md | 1.9.0 | ✓ Atual |
| AGENTS.md | 1.9.0 | ✓ Atual |
| .agents/WORKFLOWS.md | 1.9.0 | ✓ Atual |
| docs/MONOREPO.md | 1.9.0 | ✓ Atual |
| docs/STACK.md | 1.9.0 | ✓ Atual |
| docs/TEMPLATE_USAGE.md | 1.9.0 | ✓ Atual |
| **docs/fluxo-desenvolvimento.md** | **1.0.0** (2026-10-02) | ❌ **Desatualizado** — foi escrito antes do PR #44 (5 gates sobre as 7 classes de guard, commit `249ad9a`) |
| **docs/superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-plan.md** | sem footer | ⚠️ Plano-base, sem versionamento formal |
| docs/api/users.md | sem footer (data 2026-10-03) | ⚠️ Sem footer mas funcional |
| docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md | sem footer (data 2026-09-21) | ⚠️ ADR não usa footer de versão |

### Discrepâncias detectadas (cruzando docs vs disco)

#### G1. `docs/fluxo-desenvolvimento.md` está em v1.0.0 com data 2026-10-02
O doc lista 14 checks em `pnpm ci:preflight` (medido 2026-10-05), mas o medido **na main atual** (HEAD `af6af0a`, merge de #50) é **14 checks** (mesma contagem). O doc é **factual e estável** — mas precisa de:
- Bumpar para 1.1.0
- Re-medir todos os 14 checks no estado atual
- Adicionar entrada de **re-medição pós PR #44** (que adicionou 5 gates sobre as 7 classes de guard)
- Adicionar referência ao **plano `guard-classes` e seu backlog de 15 itens** (BL1–BL10 + X1–X15)

#### G2. `docs/MONOREPO.md` e `docs/STACK.md` não citam `docs/fluxo-desenvolvimento.md`
Quem chega no MONOREPO/STACK não é levado ao fluxo-doc. Falta link cruzado.

#### G3. `README.md` não menciona `docs/fluxo-desenvolvimento.md`
A seção "Como executar localmente" lista comandos mas não aponta o doc canônico de fluxo.

#### G4. `docs/fluxo-desenvolvimento.md` não foi re-medido pós-#50
Última medição: 2026-10-05 (antes do #44 e do #50). O **estado atual** pós-merge precisa de:
- Rodar `pnpm ci:preflight` e contar checks (medido)
- Rodar `wc -l .agents/WORKFLOWS.md` (deveria ser 163 após #50, não 382)
- Rodar `grep -c 'process.exit' tooling/scripts/doc-sync.ts` (deveria ser 0 — não mudou)
- Verificar `git log --oneline -5 main` para confirmar commits pós-medição

#### G5. `docs/fluxo-desenvolvimento.md` §4 tabela de gates não menciona `turbo-redirect-differential.sh`
Esse é um dos 14 checks atuais (medido), mas a tabela §4 só lista 13. Falta o 14º.

#### G6. `docs/MONOREPO.md` §1 árvore tem contagens desatualizadas pós #50
A §1 diz "19 agents (12 genéricos + 2 routers + 5 specialists de stack)" mas o disco tem 20 (incluindo `agent-architect` separado). Erro de contagem.

#### G7. `docs/fluxo-desenvolvimento.md` §7.2 ainda diz "13 achados → 5 unwired"
Esse era o estado em 2026-10-02. Pós #44 (que **fechou** 5 dos 5 e adicionou 5 novos gates), o número mudou. Precisa de re-medição.

#### G8. `docs/fluxo-desenvolvimento.md` §1 TL;DR diz "stack-code-reviewer (único que aborta)"
Correto na v1.0.0 mas **incorreto pós #44** — agora `ci:preflight` também aborta (via gate DDD), e a tabela §4 mostra que `release-template` também tem lógica abortiva. Re-medir e re-redigir.

#### G9. Falta referência ao **plano `guard-classes` (2026-10-03) e seu backlog-2026-10-02.md**
Esses dois arquivos (`docs/superpowers/plans/2026-10-03-guard-classes.md` e `.agents/runs/backlog-2026-10-02.md`) são **fontes vivas de verdade sobre o estado do CI** mas não são linkados de `fluxo-desenvolvimento.md`.

#### G10. `docs/fluxo-desenvolvimento.md` §5 "Tese honesta" precisa de re-medição
Diz: "nenhum problema medido neste repo pede IA". Isso é verdade — mas o **PR #44** adicionou **5 novos gates baseados em medições contra o turbo real** (não em prosa). Reforça a tese, não muda — mas precisa ser atualizado.

## TO-BE — Plan

### P0 — Re-medir e bumpar `docs/fluxo-desenvolvimento.md` (commit 1)
- Bump versão 1.0.0 → 1.1.0
- Data: 2026-10-06 (pós-#50)
- Re-medir os 14 checks pós-#50
- Adicionar `turbo-redirect-differential.sh` à tabela §4
- Atualizar §7.2: 5 unwired → 5 fechados + N novos (re-medir; baseado em backlog)
- Atualizar §1 TL;DR para refletir que **5 gates têm dentes pós-#44**
- Adicionar link para `backlog-2026-10-02.md` e `guard-classes.md` em §8
- Atualizar §7.1: lista de wired/funcionando pós-#44 (release-template já não é noop, gates de tooling:test, archive:lint, turbo-redirect-differential, etc.)

### P1 — Cross-refs entre docs (commit 2)
- `README.md`: adicionar bullet "Fluxo de desenvolvimento canônico: [docs/fluxo-desenvolvimento.md](../../docs/fluxo-desenvolvimento.md)" na seção "Como executar localmente"
- `docs/MONOREPO.md`: linkar `docs/fluxo-desenvolvimento.md` em §7 (Scripts Canônicos) ou §1
- `docs/STACK.md`: linkar `docs/fluxo-desenvolvimento.md` em §4 (Monorepo) ou §Containerização
- `AGENTS.md`: cross-ref `fluxo-desenvolvimento.md` em §6 (Convenções) ou novo bullet

### P2 — Corrigir contagens (commit 3)
- `docs/MONOREPO.md` §1: 19 → 20 agents
- Validar `workflows/` directory count (deveria ser 14 arquivos: 3+3+3+1+1+1+1+1+1+1)

### P3 — Bump metadata (commit 3)
- `docs/fluxo-desenvolvimento.md` adicionar 1.1.0 ao histórico
- `docs/MONOREPO.md` adicionar 1.9.1 ao histórico (re-medição pós-doc-refresh)
- `docs/STACK.md` adicionar 1.9.1 ao histórico

## Gap detection

`gap_detected: false` — Nenhum specialist novo precisa ser criado. Toda a documentação canônica existe; o que falta é re-medir e re-linkar.

## Plan aggregation

(Preenchido depois pelo specialist-router se gap_detected=true. Aqui é skipped.)
