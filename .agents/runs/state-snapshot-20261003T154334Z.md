---
name: state-snapshot-melhorias-fluxo-desenvolvimento
description: Snapshot de estado da demanda melhorias-fluxo-desenvolvimento (21 tasks / 4 fases) no momento em que a execucao comeca. Registra proceed:true e os 5 gaps que a propria execucao vai fechar.
demand: melhorias-fluxo-desenvolvimento
base_commit: ac3ce7a
branch_base: chore/melhorias-fluxo-desenvolvimento
captured_at: 2026-10-03T15:43:34Z
maintainer: stack-code-reviewer
related:
  - ../../docs/superpowers/plans/2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./state-snapshot-20260923T183938Z.md
---

# State-snapshot — `melhorias-fluxo-desenvolvimento`

> **Camada 0 do pre-planner.** Gerado conforme
> [`state-aware-planning.md`](../specs/conventions/state-aware-planning.md) §3-§4,
> que exige `state-snapshot-<ts>.md` **antes** de planejar e referencia-lo no
> frontmatter do plano. O único snapshot anterior
> ([`20260923T183938Z`](./state-snapshot-20260923T183938Z.md)) é da demanda de
> telemetria — referenciá-lo seria mentira.

## Veredito

```yaml
demand: "melhorias-fluxo-desenvolvimento"
base_commit: "ac3ce7a"
working_tree: clean
preflight_checks: all_passed
proceed: true
gap_blocker: false
```

`proceed: true` porque `pnpm ci:preflight` sai `0` no momento da captura.
Isto **corrige o baseline do plano**, que afirmava `1` (3 erros): o
`ci:preflight` foi medido em `main` @ `5490de6`, antes de os documentos da
auditoria entrarem no índice. Ver §Divergências.

## Estado medido (comando → saída)

| Métrica | Comando | Estado medido em 2026-10-03 |
|---------|---------|------------------------------|
| preflight | `pnpm ci:preflight >/dev/null 2>&1; echo $?` | `0` |
| links quebrados (189 `.md` versionados) | script de baseline do plano | **98 em 34 arquivos** |
| lint do `apps/api` | `cd apps/api && npx eslint . --config ./.eslintrc.js` | `11 problems (7 errors, 4 warnings)` |
| script `lint` do `apps/api` | `grep -c 'lint stub' apps/api/package.json` | `1` |
| links `](../.agents/memory/` | `grep -c '(\.\./\.agents/memory/' AGENTS.md` | `18` |
| marcadores "pendente" | `grep -c 'pendente Fase 3\|pendente Task 9' AGENTS.md` | `2` |
| footer `docs/MONOREPO.md` | `grep -oE '\*\*Versão do documento:\*\* [0-9.]+' …` | `1.5.0` (última tag: `v1.8.0`) |
| checks fantasma em `git-workflow.md` | `grep -cE '(tdd-enforcer\|code-reviewer\|markdown-size-check)' …` | `8` |
| `docs/articles/` "não foram criados" | `grep -c 'não foram criados' README.md` | `1` |
| links `path:linha` no artigo | `grep -cE '\]\([^)]*\.md:[0-9]+\)' …` | `0` |
| `state-snapshot` desta demanda | `ls .agents/runs/state-snapshot-2026*10*02*.md` | `0` (este arquivo é o primeiro) |
| `.agents/runs/archive/` | `ls -d .agents/runs/archive` | inexistente |

## Gaps que a execução desta demanda fecha

| # | Gap | Categoria | Severidade | Arquivo | Fonte |
|---|-----|-----------|------------|---------|-------|
| G-001 | link-checker descarta inline-code por **remoção**, quebrando o offset: link com label 100% inline-code colapsa para `[]()` e nunca casa | tooling | blocker | `.tooling/scripts/ci/check-doc-refs.ts:67` | §F2-T1 |
| G-002 | escopo do link-checker cobre 128 de 204 `.md` versionados; `AGENTS.md` fora | tooling | blocker | `.tooling/scripts/ci/preflight.ts:60-61` | §F2-T2 |
| G-003 | `apps/api` nunca é lintada: script `lint` é `echo … && exit 0`, config flat com nome legado `.eslintrc.js` que o ESLint 9 não carrega, e o check de drift está **allowlisted para pular exatamente esse arquivo** | tooling | blocker | `apps/api/package.json` · `.tooling/scripts/ci/preflight.ts:74` | §F2-T3/T4/T5 |
| G-004 | `doc-sync` apresentado como gate em 5 superfícies, mas `grep -c 'process.exit'` → `0`: nunca bloqueia | docs | major | `tooling/scripts/doc-sync.ts` | §F4-T4 |
| G-005 | release workflow é noop verde: rodapé em `1.5.0`, repo em `v1.8.0` | ci | major | `.github/workflows/release-template.yml` | §F3-T4/T5 |

## Divergências em relação ao plano (medidas, não assumidas)

O plano foi escrito contra `main` @ `5490de6`. Entre a escrita e a execução,
o estado mudou — e o plano erra em dois pontos. Registrado aqui para que a
execução não trate as divergências como surpresa:

| Afirmação do plano | Realidade medida | Efeito na execução |
|--------------------|------------------|--------------------|
| `B0`: `ci:preflight` = `1` (3 erros) | **`0`**, todos os checks verdes | §F1-T0 grava `proceed: true`, não `false`; §F1-T1 não precisa destravar nada |
| `B19`: 6 links `path:linha` em `docs/articles/vetor-grafos-fine-tuning-resumo.md` | **`0`** — a referência é `(linha N)` como prosa **fora** do parêntese | §F1-T1 é **no-op**: o arquivo já está correto e já é versionado |
| `D1`: `docs/articles/` untracked | **versionado** (commit `173eed7`) | Decisão (a) já aplicada |
| `B1`: 189 `.md` versionados | **204** | O gate ampliado cobre 204, não 189 |

O resto do baseline (B2 = 98 em 34, B4 = 1, B5 = 7 erros, B11 = 18, B12 = 2,
B13 = `1.5.0`, B14 = 8, B15 = 1, B18 = 0) foi reconfirmado **idêntico**.

## Regra aprendida nesta captura

> Quando a auditoria accusing um gate de ser parcial, *escreva o verificador
> completo antes de confiar no número do gate*.

O seed da auditoria funcionou: os documentos gerados pelo workflow quebraram o
gate com 7 links `path:linha`, mas o gate reportou só 3 — **o bug-semente
operando sobre os arquivos que o descreveram**. O verificador independente, sem
o `replace` de inline-code, revelou os 4 restantes (e depois, com a máscara,
os 98).

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
