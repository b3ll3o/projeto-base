---
name: state-snapshot-guard-classes
description: Snapshot de estado da demanda guard-classes (levar as 5 classes de guard dos aprendizados de maquina para dentro do repo) no momento em que o planejamento comeca. Registra proceed:true e os 4 gaps que a demanda fecha - incluindo 1 check quebrado por path de maquina mais a notacao em prosa que o repete, e 1 check que nunca le o diretorio que ele proprio verificou existir e ainda reporta verde.
demand: guard-classes
base_commit: ad0ff70
branch_base: feat/guard-classes
captured_at: 2026-10-03T18:42:36Z
corrected_at: 2026-10-03T19:10:00Z
maintainer: stack-code-reviewer
related:
  - ../../docs/superpowers/plans/2026-10-03-guard-classes.md
  - ./state-snapshot-20261003T154334Z.md
  - ./backlog-2026-10-02.md
  - ../specs/conventions/state-aware-planning.md
  - ../specs/conventions/ci-defense-in-depth.md
---

# State-snapshot — `guard-classes`

> **Camada 0 do pre-planner.** Gerado conforme
> [`state-aware-planning.md`](../specs/conventions/state-aware-planning.md) §3-§4,
> que exige `state-snapshot-<ts>.md` **antes** de planejar e referencia-lo no
> frontmatter do plano. O snapshot anterior
> ([`20261003T154334Z`](./state-snapshot-20261003T154334Z.md)) é da demanda
> `melhorias-fluxo-desenvolvimento`, já mergeada em `ad0ff70` — referenciá-lo
> seria mentira de proveniência.
>
> **Corrigido em 2026-10-03T19:10Z** após auditoria adversarial do plano. As
> correções estão marcadas abaixo com **[corr]**.

## Veredito

```yaml
demand: "guard-classes"
base_commit: "ad0ff70"
working_tree: 1 arquivo modificado, teste RED vivo  # [corr] ver M3
preflight_checks: all_passed
test_suite: 1 failed | 3 passed                   # [corr] ver M3
proceed: true
gap_blocker: false
```

`proceed: true`: `pnpm ci:preflight` sai `0`, nenhum gap é `blocker` — os gaps
desta demanda (G-001 a G-004) são `major`, porque não impedem o build: tornam o
repo silenciosamente menos defensável do que parece.

## Estado medido (comando → saída)

Cada número abaixo é reproduzível. Sem comando ao lado, o número não vale.

| # | Métrica | Comando | Saída em 2026-10-03 |
|---|---------|---------|---------------------|
| M1 | preflight | `pnpm ci:preflight >/dev/null 2>&1; echo $?` | `0` |
| M2 | `main` local | `git log --oneline -1 origin/main` | `ad0ff70` (squash-merge do PR #43) |
| M3 | working tree **[corr]** | `git status --porcelain` | **não estava clean**: `tooling/scripts/doc-sync.resolvePath.spec.ts` modificado, com `REPO_ROOT = join('/caminho/que/nao/existe','..','..')`. `npx vitest run <arquivo>` → **1 failed \| 3 passed** com o preflight em `0` (M1). Restaurado depois: `git restore` → **4 passed** |
| M4 | classes de guard versionadas por nome de arquivo | `git ls-files \| grep -icE 'guard-that\|guard-class\|ambiguous-sentinel\|tool-reports'` | **0** |
| M5 | `"guard que nunca dispara"` | `git grep -icF '<classe>' -- '*.md' ':!docs/superpowers/plans/' ':!.agents/runs/state-snapshot-*'` | **0** |
| M6 | `"forma rara"` | idem | **0** |
| M7 | `"dispara em si mesmo"` | idem | **0** |
| M8 | `"erra o eixo"` | idem | **0** |
| M9 | `"classe ausente do dado"` | idem | **0** |
| M10 | checks do preflight | `pnpm ci:preflight \| grep -c '• '` | **9** |
| M11 | `.tooling` no workspace | `grep -A4 'packages:' pnpm-workspace.yaml` | **não** (só `apps/*`, `packages/*`, `tooling/*`) |
| M12 | tsconfig em `.tooling` | `ls .tooling/tsconfig.json` | inexistente |
| M13 | eslint config em `.tooling` | `ls .tooling/eslint.config.*` | inexistente |
| M14 | regra de condição morta em algum eslint config | `git grep -lE 'no-unreachable-condition\|no-constant-condition\|no-self-compare' -- '*eslint*'` | **0 arquivos** |
| M15 | check que *detecta* guard | `git grep -icE 'guard\|alcançav\|unreachable' -- '.tooling/scripts/ci/' 'tooling/scripts/' \| grep -v ':0$'` | 3 arquivos, **todos do PR #43**; nenhum é detector |
| M16 | convenções existentes | `ls -1 .agents/specs/conventions/*.md \| wc -l` | **19** |
| M17 | convenções linkadas no índice **[corr]** | `grep -oE '\]\(\./[a-z-]+\.md\)' .agents/specs/conventions/README.md \| sort -u \| wc -l` | **19 arquivos · 11 linkados · 7 órfãs** (o `12` de linhas de tabela inclui uma linha sem link) |
| M18 | tag mais recente | `git tag --sort=-creatordate \| head -1` | `v1.9.0` |
| M19 | declarações do destino **[corr]** | `git grep -n -e memory-dir -e claude/projects -e 'memory/b<N' -- '.agents/**/*.md' ':!.agents/runs/state-snapshot-*'` | **10 hits · 7 arquivos · 6 notações**; **1** é `test -f` **executável** com path de máquina (`demand-archiving/SKILL.md:64`, fence `bash`), 1 é a mesma string em prosa de checklist (`archive-demand.md:30`) |
| M20 | archive vazio **[corr]** | `find .agents/runs/archive -name '*.md' \| wc -l` | **0** — e o check 9 renderiza `✓` |

**Leitura de M5–M9.** As classes não existem no repo **pelos nomes**. Mas a
moldura "só existem fora do repo" é falsa: `backlog-2026-10-02.md` documenta
`X8`/`X10`–`X12` (`git grep -oE 'X1[0-2]' .agents/runs/backlog-2026-10-02.md |
sort -u` → 4 distintas), com comando de reprodução. **O repo tem os dentes
marcados e nenhuma regra que os leia.** É essa a formulação correta do gap.

**Leitura de M10–M15.** Nenhum dos 9 checks pegaria "alguém escreveu um guard que
não pode disparar", por três razões independentes, todas medidas: nenhum check
inspeciona condição alcançável (M15); a pasta onde os guards vivem (`.tooling`)
não está no workspace (M11) nem tem tsconfig (M12) nem config de eslint (M13);
e a regra que pegaria condição morta não existe em nenhum config do repo (M14).
Não é um buraco único — são três camadas que fecham.

**Leitura de M3 [corr].** O preflight (M1 = `0`) e a suíte de testes discordavam,
e o preflight estava certo sobre o seu escopo: `preflight.ts:3` diz que ele roda
*antes* de `turbo run lint typecheck test` — ele não roda testes. `B1 = 0` nunca
foi afirmação sobre a suíte. Registrado porque o plano v1.0Citou "working tree
clean" e "preflight verde" como se cobrisse a árvore inteira.

**Leitura de M19 [corr].** Esta é a medida que reclassifica a causa raiz. A
hipótese original era "um símbolo indefinido" (`<memory-dir>`, 1 hit, 0
definições). A medição completa mostra **10 declarações em 7 arquivos, 6
notações diferentes, sem fonte única e sem nenhum check que exija concordância**
— e uma delas é um comando executável com `-home-leo-` hardcoded dentro de um
fence `bash`. Definir `<memory-dir>` arruma 1 de 10.

**Leitura de M19 [corr-2].** A primeira correção deste texto dizia "**duas** são
comandos executáveis" e apontava `archive-demand.md:30` como o segundo. Reexame
a linha: é um item de checklist com `...` no lugar do slug, fora de qualquer
fence — **não é executável nem é path de máquina**. O `0` de
`git check-ignore -v .claude` mostra que `.claude` nem está ignorado: o path não
existe em disco, então o `test -f` é falso em toda máquina, não "verde aqui,
vermelho fora". **1 check quebrado, 1 notação a normalizar.**

**Leitura de M20 [corr-3].** A primeira leitura dizia que o `✓` vinha de o linter ler
zero arquivos num diretório com só `.gitkeep`. **O mecanismo é outro, e pior.**
`check-archive-integrity.ts` calcula o `archiveDir` **certo**, `existsSync` → `true`, e
mesmo assim chama `execSync('pnpm archive:lint')` **sem `--archive-dir`**; esse script é
`"cd tooling/scripts && …"` e seu default é relativo ao cwd, então o early-return de
`archive-lint.ts:138` dispara em `tooling/scripts/.agents/runs/`, que não existe. **O
archive real nunca é lido** — não é "validou zero", é "validou um diretório inexistente".
Prova de direcionalidade: arquivo inválido plantado no dir errado → `exit 1`; no archive
real → invisível. Enquanto `preflight.ts:63-71` diz que `skipped` não pode renderizar `✓`,
o caminho de **dado ausente** devolve `ok: true` puro. Medido em 2026-10-05 (B19).

## Gaps que a demanda fecha

| id | Gap | Categoria | Severidade | Arquivo | Rationale |
|----|-----|-----------|------------|---------|-----------|
| G-001 | As classes de guard não têm regra no repo: quem copia o template (`cp -r`) herda os 9 checks e não o diagnóstico das falhas que eles já deram | conhecimento | `major` | (a ausência é o gap) | 0 hits pelos nomes (M5–M9); instâncias X8/X10–X12 versionadas mas sem regra que as cite |
| G-002 | 7 convenções existem e **não** estão linkadas no índice do diretório | descoberta | `nice` | `.agents/specs/conventions/README.md` | M17 |
| G-003 | **1 check executável usa path de máquina hardcoded**, e uma 2ª declaração repete a string em prosa | correção | `major` | `demand-archiving/SKILL.md:64` (executável), `archive-demand.md:30` (prosa) | M19 [corr-2]: `test -f .claude/projects/-home-leo-…/memory/<retro>.md`; `.claude` não existe em disco, então o teste é falso **em toda máquina** |
| G-004 | O check de archive **nunca lê o diretório que ele mesmo verificou existir**, e renderiza `✓` **[corr-3]** | correção | `major` | `.tooling/scripts/ci/check-archive-integrity.ts` | M20 + B19: ele calcula `join(repoRoot,'.agents/runs/archive')`, confirma que existe, e executa `execSync('pnpm archive:lint')` — que faz `cd tooling/scripts` e resolve o default para `tooling/scripts/.agents/runs/`, **que não existe**; o early-return de `archive-lint.ts:138` dispara no caminho errado. Invariante oposto declarado em `preflight.ts:63-71` |

**Por que `major` e não `blocker`:** o repo builda, os gates passam, nada
quebra. O custo é diferido — um template novo nasce com 9 checks e sem o
conhecimento das 5 falhas que esses checks já acumularam. G-003 e G-004 são
`major` e não `blocker` pelo mesmo motivo: não quebram nada hoje, porque os
arquivos afetados não estão no caminho de nenhum gate — o `test -f` de G-003 é
falso em **toda** máquina, e mesmo assim ninguém o executa, porque vive num
`SKILL.md` que o preflight não lê.

## Referência de proveniência

Os 6 arquivos-fonte das classes estão em
`~/.claude/projects/-home-leo-Documentos-projetos-base/memory/` — memória por
máquina, fora do repo, que **não** é copiada por `cp -r`. A audibilidade da
pendência depende de cite-los no plano, porque o próximo agent que for
planejar isto não vai tê-los.
