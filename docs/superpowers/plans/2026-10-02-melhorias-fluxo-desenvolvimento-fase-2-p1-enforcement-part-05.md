---
name: melhorias-fluxo-fase-2-p1-enforcement-part-05
description: Apendice A (consulta, nao task) — inventario arquivo-a-arquivo dos 98 links quebrados medidos com a mascara aplicada, com o comando exato de correcao de cada grupo. Complementa a F2-T2.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-20261003T154334Z.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-2-p1-enforcement-part-01.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
---

# Apêndice A — Inventário dos 98 links quebrados (consulta de §F2-T2)

> **Não é task.** É a tabela de consulta que §F2-T2 consome. Sem ela, a task
> fica sem dono para 76 dos 98 erros.
> Medido em `main` @ `5490de6` com o algoritmo de
> `.tooling/scripts/ci/check-doc-refs.ts` e a **máscara** aplicada sobre os
> 189 `.md` de `git ls-files`. Reproduza com o script do
> [índice §Baseline](./2026-10-02-melhorias-fluxo-desenvolvimento.md).

## G1 — profundidade relativa (66 links, 25 arquivos), alvo **existe**

| Arquivo | n | Correção |
|---------|---|----------|
| `AGENTS.md` | 18 | já aplicado em §F1-T2: `](../.agents/memory/` → `](./.agents/memory/` |
| `.agents/runs/2026-09-22-pilot-001.md` | 6 | `](../../../` → `](../../` |
| `docs/superpowers/plans/2026-09-22-review-router-plan.md` | 6 | `](../../` → `../../../` |
| `.agents/skills/state-aware-planning/SKILL.md` | 3 | `](../workflows/`, `](../memory/` → `../../` |
| `.agents/specs/conventions/state-aware-planning.md` | 3 | `](../skills/`, `](../workflows/`, `](../memory/` → `../../` |
| `docs/superpowers/plans/2026-09-23-telemetria-plan.md` | 3 | `](../../` → `../../../` |
| `docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-design.md` | 3 | `../../../MONOREPO.md` → `../../MONOREPO.md`; `STACK.md` idem; `../../../../AGENTS.md` → `../../../AGENTS.md` |
| `.agents/specs/conventions/demand-archiving.md` | 2 | `](../workflows/`, `](../skills/` → `../../` |
| `.agents/specs/conventions/evolucao-agents.md` | 2 | `](../../../agents/` → `../../agents/` |
| `.agents/agents/nestjs-specialist.md` | 1 | `](../../../docs/adr/` → `](../../docs/adr/`; `](../../../agents/` → `../../agents/` |
| `.agents/agents/stack-code-reviewer.md` | 1 | idem `nestjs-specialist.md` |
| `.agents/WORKFLOWS.md:327` | 1 | `](../memory/specialist-router.md` → `](./memory/specialist-router.md` |
| `.agents/skills/agents-coordinate/exemplos/feature-mode.md:99` | 1 | `](../../../../WORKFLOWS.md` → `../../../WORKFLOWS.md` |
| `.agents/specs/conventions/tdd.md` | 1 | `](../../../agents/tdd-enforcer.md` → `../../agents/tdd-enforcer.md` |
| `docs/superpowers/specs/2026-09-22-review-router-design.md` | 1 | `](../../../WORKFLOWS.md` → `../../../.agents/WORKFLOWS.md` |
| `docs/superpowers/plans/2026-09-22-review-router-fase-03-pilot-part-01.md` | 5 | `](../specs/`, `](../skills/`, `](../memory/` → `../../`; `](../../agents/`, `](../../specs/` → `../../../` (os outros 2 deste arquivo são G4b) |
| `docs/superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-fase-0[1-9]-*-part-*.md` | 9 | índice de fase **nunca existiu** como arquivo (o plano foi dividido em `-part-NN.md`) → apontar para `-part-01.md` |

**Comandos** (rodar a partir da raiz do repo; revisar o diff antes de commitar):

```bash
# 1. Profundidade em .agents/
sed -i 's|](\.\./\.\./\.\./docs/adr/|](../../docs/adr/|g' \
  .agents/agents/nestjs-specialist.md .agents/agents/stack-code-reviewer.md
sed -i 's|](\.\./\.\./\.\./|](../../|g' \
  .agents/agents/nestjs-specialist.md .agents/agents/stack-code-reviewer.md \
  .agents/specs/conventions/evolucao-agents.md .agents/specs/conventions/tdd.md
sed -i 's|](\.\./memory/|](./memory/|g' .agents/WORKFLOWS.md
sed -i 's|](\.\./workflows/|](../../workflows/|g; s|](\.\./memory/|](../../memory/|g; s|](\.\./skills/|](../../skills/|g' \
  .agents/skills/state-aware-planning/SKILL.md .agents/specs/conventions/state-aware-planning.md \
  .agents/specs/conventions/demand-archiving.md
sed -i 's|](\.\./\.\./\.\./|](../../|g' .agents/runs/2026-09-22-pilot-001.md
sed -i 's|(../../../../WORKFLOWS\.md|(../../../WORKFLOWS.md|g' \
  .agents/skills/agents-coordinate/exemplos/feature-mode.md

# 2. Profundidade em docs/
sed -i 's|](\.\./\.\./|](../../../|g' \
  docs/superpowers/plans/2026-09-22-review-router-plan.md \
  docs/superpowers/plans/2026-09-23-telemetria-plan.md
sed -i 's|](\.\./specs/|](../../specs/|g; s|](\.\./skills/|](../../skills/|g; s|](\.\./memory/|](../../memory/|g' \
  docs/superpowers/plans/2026-09-22-review-router-fase-03-pilot-part-01.md
sed -i 's|](\.\./\.\./agents/|](../../../agents/|g; s|](\.\./\.\./specs/|](../../../specs/|g' \
  docs/superpowers/plans/2026-09-22-review-router-fase-03-pilot-part-01.md
sed -i 's|](\.\./\.\./\.\./MONOREPO\.md|](../../MONOREPO.md|g; s|](\.\./\.\./\.\./STACK\.md|](../../STACK.md|g; s|](\.\./\.\./\.\./AGENTS\.md|](../../../AGENTS.md|g' \
  docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-design.md
sed -i 's|](\.\./\.\./\.\./WORKFLOWS\.md|](../../../.agents/WORKFLOWS.md|g' \
  docs/superpowers/specs/2026-09-22-review-router-design.md

# 3. Indice de fase inexistente -> part-01
for f in docs/superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-fase-*-part-*.md; do
  sed -i -E 's|\((\./[^)]*-fase-([0-9]+)-[a-z-]+)\.md\)|\1-part-01.md|g' "$f"
done
```

## G2 — nome stale (3 links, 3 arquivos)

`.agents/specs/conventions/agent-evolution-and-memory.md` **não existe**; o nome
real é `evolucao-agents.md`. A profundidade já está correta nos 3 casos.

```bash
sed -i 's|agent-evolution-and-memory\.md|evolucao-agents.md|g' \
  .agents/skills/retrospective-capture/SKILL.md \
  .agents/specs/conventions/retrospective-capture.md \
  .agents/workflows/retrospective-mode.md
```

## G3 — remover o link, manter o texto (6 links, 2 arquivos)

`find . -name 'vibe-coding-sdd*' -not -path './node_modules/*' | wc -l` → **0**.
Os arquivos não existem **nem untracked** — D1(a) não os cria, porque só
versiona `docs/articles/vetor-grafos-fine-tuning-resumo.md`.

| Arquivo | Linhas | Link |
|---------|--------|------|
| `.agents/specs/conventions/evals.md` | 13, 23, 183, 184 | `../../../docs/articles/vibe-coding-sdd-engineering-loop{,-mapping}.md` |
| `.agents/specs/conventions/engineering-loop.md` | 20, 30, 164, 165 | idem |

Onde o texto era `[\`docs/articles/x.md\`](../../../docs/articles/x.md)`,
deixar só `` `docs/articles/x.md` ``. Se a referência for load-bearing para a
convenção, substituir por "artigo de origem (não versionado)".

## G4 — allowlist e remoções (23 links, 5 arquivos)

Nada aqui é bug corrigível: são **placeholders** (o caminho é o que a spec vai
produzir) ou caminho **fora do repo**.

| Grupo | n | Onde | Regra |
|-------|---|------|-------|
| G4a | 20 | `.agents/specs/templates/spec.md` (11), `.agents/specs/templates/engineering-loop/03-test.md` (8), `.agents/specs/templates/business-rules.md` (1) | `^\.\.?/evals/`, `^\./contracts/`, `^\./(plan\|tasks)\.md$`, `^\.\./\.\./\.\./docs/(domain\|architecture)/` |
| G4b | 2 | `docs/superpowers/plans/2026-09-22-review-router-fase-03-pilot-part-01.md` (`../../../../home/leo/.claude/…`) | `(\.\./)+home/` |
| G4c | 1 | `docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-06-impacto-cross-cutting.md` → `…-07-referencias.md` | **remover o link** (a spec nunca foi criada) |

**Contingência.** Se a §F2-T2 terminar com `n` quebrados residuais, **não
alivie a allowlist**: cada regex nova precisa vir com o alvo medido que a
justifica. Sem justificativa, o item vai para o backlog (§F4-T5) e o critério
da task passa a `errors == n`, nunca `EXIT=0` ajustad[o] ao resultado.

**Contagem de fechamento.**
`98 = 66 (G1) + 3 (G2) + 6 (G3) + 20 (G4a) + 2 (G4b) + 1 (G4c)` — reexecutar o
script de medição e esperar `broken=0 files=0`. Os 76 **corrigíveis** são
`66 + 3 + 6 + 1 (G4c)`; os 22 em allowlist são `20 + 2`.

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
