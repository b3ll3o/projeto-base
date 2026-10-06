---
name: guard-classes-baseline
description: Baseline medido da demanda guard-classes, 19 metricas (B1-B19) com o comando de reproducao ao lado de cada numero, mais as leituras que os dados sustentam. Sub-arquivo de docs/superpowers/plans/2026-10-03-guard-classes.md.
version: 2.2.0
updated: 2026-10-05
maintainer: stack-code-reviewer
related:
  - ./2026-10-03-guard-classes.md
  - ../../../.agents/runs/state-snapshot-20261003T184236Z.md
---

# Baseline medido — `guard-classes`

Sub-arquivo de
[o plano](./2026-10-03-guard-classes.md) (Fase 1 a 4 citam estas linhas pelo id).
Existe porque a tabela tem 18 linhas de comando e o plano-passou-de-300; a
divisão é a que a própria
[`tamanho-e-revisao.md`](../../../.agents/specs/conventions/tamanho-e-revisao.md)
prescreve para arquivo acima do limite.

**Regra desta tabela:** todo número vem com o comando. Sem comando ao lado, o
número não vale. As 5 ressalvas que a validação esconde estão em §Como validar
do plano — em especial a 4, sobre a tabela que casa o próprio registro.

## Medições (2026-10-03)

| # | Métrica | Comando | Saída |
|---|---------|---------|-------|
| B1 | preflight | `pnpm ci:preflight >/dev/null 2>&1; echo $?` | `0` — **mas** o preflight não roda vitest (comentário em `preflight.ts:3`): `0` aqui nunca foi afirmação sobre a suíte de testes |
| B2 | declarações do destino | `git grep -n -e memory-dir -e claude/projects -e 'memory/b<N' -- '.agents/**/*.md' ':!.agents/runs/state-snapshot-*'` | **10 hits, 7 arquivos**; **1** é `test -f` **executável** com path de máquina (fence `bash`, slug real em `demand-archiving/SKILL.md:64`) e 1 é a mesma string em **prosa de checklist** com reticências (`archive-demand.md:30`). Sem a exclusão do snapshot: 15 hits em 8 arquivos |
| B3 | memórias versionadas | `ls -1 .agents/memory/ \| wc -l` | **21** = 19 per-agent + `_template` + `state-aware-planning` |
| B4 | results fora do repo | `ls -1 ~/.claude/…/memory/b*-result.md \| wc -l` | **34** |
| B5 | classes por nome | 5 comandos, um por classe: `git grep -icF '<classe>' -- '*.md' ':!docs/superpowers/plans/' ':!.agents/runs/state-snapshot-*'` | **1 · 0 · 0 · 0 · 0** — o único hit é `backlog-2026-10-02.md:73` (X8), com "nunca dispara" em **minúscula no meio da frase**, descrevendo um guard — não o título da classe. A tese fica mais forte por isso: a classe tem instância com `arquivo:linha`, e mesmo assim **não é nomeada** |
| B6 | checks do preflight | `pnpm ci:preflight \| grep -c '• '` | **9** |
| B7 | `.tooling` no workspace | `grep -A4 'packages:' pnpm-workspace.yaml` | **não** |
| B8 | tsconfig / eslint em `.tooling` | `ls .tooling/tsconfig.json .tooling/eslint.config.*` | ambos inexistentes |
| B9 | regra de condição morta no repo | `git grep -lE 'no-unreachable-condition\|no-constant-condition\|no-self-compare' -- '*eslint*'` | **0 arquivos** |
| B10 | check que *detecta* guard | `git grep -icE 'guard\|alcançav\|unreachable' -- '.tooling/scripts/ci/' 'tooling/scripts/' \| grep -v ':0$'` | 3 arquivos, **todos do PR #43**, nenhum é detector |
| B11 | differential ligado? | `git grep -n 'turbo-redirect-differential' -- package.json '.github' '.tooling' 'tooling' \| grep -v spec.ts` | **2 hits, ambos comentários** (`check-package-json-drift.ts:438` e o próprio script). **0 invocações** |
| B12 | review-routing executa o regex? | `sed -n '196,200p' tooling/scripts/lint-review-routing.ts`; `sed -n '150,158p'` | linha **198** compila e nunca roda contra diff; linhas **150–165** rodam `path_globs` e avisam dead pattern |
| B13 | convenções órfãs do índice | `ls -1 .agents/specs/conventions/*.md \| wc -l`; `grep -oE '\]\(\./[a-z-]+\.md\)' .agents/specs/conventions/README.md \| sort -u \| wc -l`; `comm -23 <(ls -1 .agents/specs/conventions/*.md \| xargs -n1 basename) <(grep -oE '\]\(\./[a-z-]+\.md\)' .agents/specs/conventions/README.md \| tr -d '](' \| sort -u)` | **19 arquivos, 11 linkados, 8 não-linkados** — um deles é o `README.md`, logo **7 órfãs**. A subtração só fecha excluindo o README; `19 − 11 = 8` e dizer "7" sem explicar o README é aritmética que não bate |
| B14 | archive vazio | `find .agents/runs/archive -name '*.md' \| wc -l` | **0** — e o check 9 renderiza `✓`, mas **pelo mecanismo de B19**, não por ler 0 arquivos |
| B15 | `.claude` existe no repo? | `ls -d .claude` | **não** — o `test -f` executável de B2 é falso em **toda** máquina, não só fora; `git check-ignore -v .claude` → 1, ou seja nem está ignorado: o path não existe em disco |
| B16 | check no registro que não roda | `grep -c 'check-types' .tooling/scripts/ci/preflight.ts`; `wc -l .tooling/scripts/ci/check-types.ts` | **1 hit, e é `import type`** — não está no array `checks`, mas consta da Tabela de Checks (`ci-defense-in-depth.md:53`) com custo e propósito. `check-types.ts` tem 23 linhas: só JSDoc + `export interface CheckResult`, **zero código executável** — e `ci-defense-in-depth/SKILL.md:195` já diz que ele "não roda". O repo se contradiz em 3 lugares |
| B17 | roteamento alcança os checks? | `git ls-files \| grep -c '^tooling/scripts/ci/'` / `'^\.tooling/scripts/ci/'` | **0 / 16** — `review-routing.md:84` casa 0 arquivos; e sem `blocking: true`, o detector de dead pattern (que exige `blocking: true`) não roda |
| B19 | o `archive:lint` que o preflight chama resolve para o diretório **errado** | `python3 -c "import json;print(json.load(open('package.json'))['scripts']['archive:lint'])"` → `cd tooling/scripts && pnpm archive:lint`; `sed -n '189p' tooling/scripts/archive-lint.ts` → default `.agents/runs/archive`; `ls -d tooling/scripts/.agents/runs/archive` → **inexistente**; `ls -d .agents/runs/archive` → existe | O default é relativo ao **cwd**, e o script `cd` para `tooling/scripts/`. `checkArchiveIntegrity` valida `join(repoRoot,'.agents/runs/archive')` mas **executa** `execSync('pnpm archive:lint')` sem `--archive-dir` → o `existsSync` do early-return roda no caminho errado. **O archive real nunca é lido.** Prova de direcionalidade: arquivo inválido plantado em `tooling/scripts/.agents/runs/archive/` → `exit 1`; no archive real → invisível |
| B18 | claim numérico falso no backlog | `git grep -n '/home/' -- '*.ts'`; `git grep -n '/home/' -- '*.ts' ':!*.spec.ts'` | `X8` afirma o primeiro → **0**; mede **3**. Verdade na branch de escrita, envelheceu. Os 3 são **todos** de `.tooling/scripts/ci/preflight.spec.ts` (45, 118, 121) — o fixture e o comentário que **documentam a remoção da allowlist**. O recorte de produção (`:!*.spec.ts`) dá **0** |

## Leituras que os dados sustentam

**B7–B10 — três camadas fecham.** Nenhum check pegaria um guard que nunca
dispara, por três razões independentes, todas medidas: nenhum check inspeciona
condição alcançável (B10); a pasta onde os guards vivem não está no workspace
(B7) nem tem tsconfig (B8) nem config de eslint (B8); e a regra que pegaria
condição morta não existe em config nenhum (B9). Não é um buraco único.

**B14 + B19 — a classe deste plano, viva, e por um mecanismo pior que o que eu
escrevi.** A v2.0 deste arquivo explicou o `✓` por "o linter lê 0 arquivos".
**Errado**: `checkArchiveIntegrity` calcula o `archiveDir` certo, confirma que
existe, e então chama `execSync('pnpm archive:lint')` — que faz `cd
tooling/scripts` e resolve o default para um diretório que **não existe** (B19).
O early-return de [`archive-lint.ts:138`](../../../tooling/scripts/archive-lint.ts#L138)
dispara no caminho errado: **o archive real nunca é lido**. Não é "validou zero
arquivos", é "validou um diretório que não existe" — e o próprio
[`check-archive-integrity.ts`](../../../.tooling/scripts/ci/check-archive-integrity.ts)
diz no comentário que *"o `✓` aqui era puro teatro"*. Enquanto
[`preflight.ts:63-71`](../../../.tooling/scripts/ci/preflight.ts#L63-L71) declara
que `skipped` não pode renderizar `✓`, o caminho de dado **ausente** (não de
`skipped`) devolve `ok: true` puro. **Classe 1 dentro dos 9 que ele certifica.**

**B15 + B17 — a regra que não alcança o próprio objeto.** `review-routing.md:84`
declara `tooling/scripts/ci/**`, que casa **0** arquivos tracked; o diretório
real é `.tooling/scripts/ci/`, com **16** (B17). Sem `blocking: true`, o
detector de dead pattern que denunciaria isso está
[escopado fora do caso](../../../tooling/scripts/lint-review-routing.ts#L150):
ele roda só sob `if (rule.blocking === true)`.

**B18 — o claim que envelheceu, e o remédio que seria pior que o disease.** A
regra de verificabilidade de `tamanho-e-revisao.md` exige reexecutar o comando
antes de citar o número. `X8` foi escrito com o comando ao lado e nunca
reexecutado: era `0` na branch de escrita, é **3** agora. Mas os 3 hits são o
**fixture** que o teste usa para provar que o checker rejeita link que foge do
repo, e o **comentário** que registra a remoção da allowlist. Exigir `0` sem
recorte seria exigir **apagar a prova de que o buraco fica fechado** — a classe 3
deste plano, cometida pelo próprio plano na task 2.2 da v2.1. O remedio certo é o
comando estreitado `':!*.spec.ts'` → 0 **com o motivo da exclusão escrito ao
lado**, não a supressão silenciosa que o 3.3 proíbe.

## Revisão

- [x] `wc -l` ≤ 300
- [x] Links cruzados nos dois sentidos (plano ↔ este arquivo)
- [x] Todo claim numérico tem comando ao lado (B1–B19)
- [x] Sem duplicação: as leituras de B14/B19, B17 e B18 ficam só aqui, e o
      plano aponta para cá em vez de repeti-las
