---
name: melhorias-fluxo-fase-4-p2-backlog-part-02
description: Fase 4 (P2) parte 2 — 2 tasks: alinhar o contrato do doc-sync (o script nunca bloqueia, embora o agent prometa "Reportar e Bloquear", e --auto-apply-minor é no-op com o parâmetro morto ainda na assinatura) e registrar o Backlog com 9 itens adiados medidos mais as 3 remissões entregues por outras tasks. Fecha a Fase 4 e o plano.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-<ts>.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-01.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
---

# Fase 4 (P2) — Parte 2: contrato do `doc-sync` + Backlog reconciliado

> **Pré-requisito:** [F4-P01](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-01.md) completa.
> **Agente responsável:** `stack-code-reviewer` · `doc-sync`.
> **Fecha a Fase 4 e o plano** (21 tasks).

---

## F4-T4 — Alinhar o contrato do `doc-sync`: ele **reporta**, não bloqueia

**Arquivos tocados**

- Modify: `.agents/agents/doc-sync.md:160`, `:223`, `:258`
- Modify: `tooling/scripts/doc-sync.ts:12`, `:150`, `:211`, `:226`, `:232`, `:237`
- Modify: `.husky/pre-commit:25` · `tooling/scripts/README.md:11` · `docs/fluxo-desenvolvimento.md:99`

**Contexto verificado — duas afirmações falsas e um parâmetro morto.**

```bash
grep -c 'process.exit' tooling/scripts/doc-sync.ts   # → 0
grep -n 'autoApplyMinor\|auto-apply-minor' tooling/scripts/doc-sync.ts
```

```text
 12://   tsx tooling/scripts/doc-sync.ts --files="a.ts\nb.ts" --mode=incremental --auto-apply-minor=false
150:export function syncDocs(files: string[], _autoApplyMinor = false): DocSyncReport {
211:  autoApplyMinor: boolean;
226:    autoApplyMinor: opts['auto-apply-minor'] === 'true',
```

O `_` em `_autoApplyMinor` é a convenção de TS para **parâmetro
deliberadamente ignorado**. O caminho real da flag é: `:226` monta o valor a
partir de `--auto-apply-minor`, `:211` o declara no tipo de retorno de
`parseArgs()`, `:232` desestrutura **sem** ele
(`const { files, mode, outFile } = parseArgs();`) e `:237` passa `false`
hardcoded para `syncDocs`. Ninguém lê `report.autoApplyMinor` em lugar nenhum
(`git grep -n '\.autoApplyMinor'` → vazio).

**6** arquivos ainda mencionam a flag, e só **4** a passam em linha de comando:
`.husky/pre-commit:25`, `.agents/agents/doc-sync.md:223`,
`tooling/scripts/README.md:11` e `docs/fluxo-desenvolvimento.md:99`. O job
`sync-docs.yml:29` **não** a passa. O 6º é o artefato **gerado**
`docs/flows/ci-cd-and-defenses/pre-commit-hook-stack-review-docsync/…workflow.json:117`
— arquivo de catálogo produzido por tool, não se edita à mão (é o mesmo erro de
*allowlist/edit por prefixo* que o plano combate na §F2-T2); a regeneração é
item de backlog próprio.

E o documento afirma o contrário do código em 2 pontos:

- `:160` — `### Passo 4: Reportar e Bloquear`
- `:258` — `- ❌ Bloquear merge por \`info\` ou \`minor\``

Com `process.exit` = `0`, o script **nunca** bloqueia.

**Passos — escolher um dos dois contratos (decisão de escopo, não de plano):**

**Opção A (default — alinhar o documento).** O comportamento é útil: gerar
`doc-sync-report.json` e imprimir as ações é artefato aproveitável em revisão
humana. Bloquear, não.

1. `:160` — `### Passo 4: Reportar e Bloquear` → `### Passo 4: Reportar`.
2. `:258` — trocar por:
   `⚠️ Não bloquear: \`doc-sync\` é **report-only** por contrato — o script nunca chama \`process.exit\` (\`tooling/scripts/doc-sync.ts\`). A barreira de merge é §F4-T3 / decisão D2.`
3. **Deletar o parâmetro morto** (a correção que a v1.0.0 não tinha): remover
   `_autoApplyMinor = false` de `:150`, o campo `autoApplyMinor` do tipo de
   retorno de `parseArgs()` em `:211` e a expressão de `:226`. O comentário de
   uso de `:12` perde o trecho `--auto-apply-minor=false`.
4. Remover `--auto-apply-minor=true` dos **4** comandos: `.husky/pre-commit:25`,
   `.agents/agents/doc-sync.md:223`, `tooling/scripts/README.md:11` e
   `docs/fluxo-desenvolvimento.md:99`. O `|| exit 1` **permanece** em
   `.husky/pre-commit:25`: o hook ainda deve abortar se o script *crashar*, que
   é erro de infra, não severidade documental.
5. **Comprovação de que a remoção é segura.** Os **14** call sites reais
   (`git grep -c 'syncDocs(\[' tooling/scripts/*.spec.ts` → 9 em
   `doc-sync.spec.ts` + 5 em `doc-sync.resolvePath.spec.ts`) passam **1**
   argumento. Antes de apagar, o RED é a prova de que o parâmetro era
   público: uma chamada `syncDocs([], true)` compila hoje
   (`npx tsc --noEmit -p tooling/scripts` → `EXIT=0`) e passa a dar
   *"Expected 1 arguments, but got 2"* **depois**. Gate de verde:
   `npx tsc --noEmit -p tooling/scripts` e `pnpm tooling:test`
   (`Test Files 10 passed (10)` · `Tests 150 passed (150)`).
6. **Efeito colateral honesto:** o parser de `parseArgs()` aceita qualquer
   `--chave` e ignora as desconhecidas, então `--auto-apply-minor=true`
   passado por um hook legado deixa de ser erro e vira no-op silencioso. Fazer
   o parser rejeitar flag desconhecida é escopo de outro PR.
7. Commit:

   ```bash
   git add .agents/agents/doc-sync.md tooling/scripts/doc-sync.ts \
           tooling/scripts/README.md docs/fluxo-desenvolvimento.md .husky/pre-commit
   git commit -m "fix(doc-sync): contrato documentado era 'reportar e bloquear'; o codigo so reporta

   grep -c 'process.exit' tooling/scripts/doc-sync.ts = 0: o script nunca
   bloqueia. Mesmo assim doc-sync.md:160 dizia 'Passo 4: Reportar e
   Bloquear' e :258 proibia 'Bloquear merge por info ou minor'. Adotado o
   contrato report-only (Opcao A): o artefato e util para revisao humana;
   bloquear sem calibrar docs_health_score trava commits legitimos.

   --auto-apply-minor era no-op de ponta a ponta: parseado em :226,
   declarado em :211, descartado na desestruturacao de :232 e sobrescrito
   por false em :237. O '_' em _autoApplyMinor (:150) marcava o parametro
   como deliberadamente ignorado e ninguem le report.autoApplyMinor no
   repo. Remove o parametro morto, tira a flag dos 4 comandos que a
   passavam e do comentario de uso de :12. Os 14 call sites dos 2 specs
   passam 1 argumento; tsc e tooling:test seguem verdes (150 passed).

   Efeito colateral aceito: o parser ignora flag desconhecida, entao a flag
   legada deixa de ser erro e vira no-op silencioso. Rejeitar flag
   desconhecida e escopo de outro PR.

   Implementar o bloqueio real virou item BL9 do backlog.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Opção B (implementar o bloqueio).** Exige `process.exit(1)` quando
`report.actions` tiver severidade `major`/`blocker`, **mais** specs TDD
novos, **mais** a decisão sobre quais docs `--auto-apply-minor` deveria
reescrever em disco. Custa ~1 dia e pode bloquear commits legítimos enquanto
`report.docs_health_score` não for calibrado. **Não recomendada agora** —
registrada como item **BL9** do backlog da §F4-T5.

**Critério de aceite**

```bash
grep -c 'report-only' .agents/agents/doc-sync.md
grep -c 'autoApplyMinor' tooling/scripts/doc-sync.ts
grep -c 'auto-apply-minor' .husky/pre-commit
out=$(pnpm tooling:test 2>&1); st=$?; printf '%s\n' "$out" | tail -2; echo "EXIT=$st"
```

**Output esperado:** `1`, `0`, `0` e `150 passed (150)` / `EXIT=0`. Hoje os
mesmos comandos dão `0`, `3`, `1` e `150 passed (150)` — o 3º e o 1º são o
que esta task move.

> **Sem número de baseline, e `B17` não é o número certo.** `B17` mede
> `grep -c 'process.exit'` (`0` → `0`): é o **achado** que motivou a task, não a
> métrica que ela move — os 3 valores que mudam são `report-only` no agent
> (`0`→`1`), `autoApplyMinor` no script (`3`→`0`) e a flag no hook (`1`→`0`),
> nenhum deles com linha própria na tabela do índice. Declarados aqui.
> O terceiro comando é `grep -c` e não `grep -rc`: `-c` conta **linhas** e
> imprime escalar; `-rc` imprime `arquivo:N` e quebra a comparação. Mesmo
> cuidado vale para `grep -c 'não foram criados' README.md docs/STACK.md` na
> §F3-T1.

**Gate que valida:** `.husky/pre-commit:25` (executa `doc-sync`) + o job
`sync-docs` do CI (`sync-docs.yml:29`) + `pnpm tooling:test`.

---

## F4-T5 — Versionar o backlog: o que **não** foi planejado, e o que já foi entregue

**Arquivos tocados**

- Create: `.agents/runs/backlog-2026-10-02.md`

**Objetivo.** A parte mais difícil de um plano é o que ele **recusa** por falta
de orçamento — e recusa sem motivo vira dívida disfarçada de escopo. As tabelas
abaixo são a **fonte**; esta task as transcreve para um artefato versionado em
`.agents/runs/` (o mesmo diretório onde vivem o `state-snapshot` da §F1-T0 e o
`pilot-summary` dos routers), acrescentando a coluna **valor na
implementação** — a re-medição que prova que nenhum item envelheceu entre a
escrita do plano e o merge.

**Prefixo `BL*`, não `B*`.** A tabela de *Baseline* do
[índice](./2026-10-02-melhorias-fluxo-desenvolvimento.md) já usa `B0`…`B19` para
"valor medido que a task move". Reusar `B1`…`B11` aqui para "item adiado"
faria `Baseline **B6**` (gate DDD em import relativo, Fase 2) e
`| BL6 | specialist:lint fora do preflight |` significarem coisas diferentes no
mesmo plano — pior ainda, as duas linhas são sobre *gate de lint* e o leitor
troca uma pela outra sem perceber. É o mesmo defeito de *gate que reporta
verde sem verificar*, aplicado à nomenclatura.

**Passos**

1. Criar `.agents/runs/backlog-2026-10-02.md` com frontmatter
   (`name`, `demand`, `created`, `maintainer`, `state`) e as 2 tabelas abaixo,
   mais uma 4ª coluna `| Valor na implementação |` em cada linha de `BL*`.
2. Rodar os **10** comandos da coluna *Medido por* e preencher a 4ª coluna. É
   isto que faz a task ter teeth: se algum valor divergir, o número da tabela
   do plano está velho e precisa ser corrigido **no mesmo commit**.
3. Se algum item já tiver sido resolvido por task anterior (é o caso de `BL8`:
   §F2-T1 fecha a cobertura de `.md` no `preflight`), registrar como
   **remissão** em vez de manter no backlog — com o `§F` que o entregou.
4. Commit:

   ```bash
   git add .agents/runs/backlog-2026-10-02.md
   git commit -m "chore(backlog): versiona o backlog medido do plano de fluxo

   10 itens adiados, cada um com o comando que o reproduz e o porque de nao
   ter entrado — recusa sem motivo vira divida disfarcada de escopo. Acrescenta
   a coluna 'valor na implementacao': e a re-medicao que mostra se algum
   item envelheceu entre a escrita do plano e o merge.

   Prefixo BL* (nao B*) para nao colidir com o namespace B0-B19 de Baseline do
   indice. Mais 3 remissoes: o que a analise de origem marcou como pendencia e
   o plano entregou.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

### Backlog adiado (não planejado) — fonte

| # | Item | Medido por | Por que não entrou |
|---|------|-----------|--------------------|
| **BL1** | `check-version-consistency` — nenhum script valida que o footer de `docs/MONOREPO.md` e a última tag estão alinhados | `ls .tooling/scripts/ci/*.ts \| grep -c version` → `0` (9 checks, nenhum de versão) | §F3-T4 alinha o valor; um gate que previne a regressão é um check novo com spec. O merge de §F3-T4 já é o teste |
| **BL2** | `*.evals.yaml` — a convenção `evals.md` (v1.9.0) define 7 tipos, nenhum arquivo existe | `find . -name '*.evals.yaml' -not -path './node_modules/*' \| wc -l` → `0` | Precisa de fase própria: 7 tipos × template YAML + gate por severidade. Não cabe numa fase sem virar framework sem uso |
| **BL3** | `.agents/WORKFLOWS.md` tem 382 linhas — viola o teto de 300 | `wc -l .agents/WORKFLOWS.md` → `382` | Split em índice + partes é mecânico e sem risco; mistura housekeeping com correção de fundo no mesmo PR |
| **BL4** | `check-readme-freshness` — nenhum check valida o README | `ls .tooling/scripts/ci/*.ts \| grep -ci readme` → `0` | §F3-T2 prefere **remover** contagens a **contá-las**: a prevenção custaria mais que o drift que previne. `docs/MONOREPO.md §1` é a fonte |
| **BL5** | `review:route` e `specialist:route` existem como script, sem consumidor automático | `git grep -ln 'review:route\|specialist:route' -- .husky .github` → **vazio**; os únicos consumidores são `package.json` e `tooling/scripts/package.json`, que só **declaram** o script | Ligá-los ao preflight é decisão de **processo** (todo PR passa por router?), não de código. Ver **D4** no índice |
| **BL6** | `specialist:lint` valida a matriz **specialist-routing** mas está fora do `preflight` — que chama `pnpm review:lint` (matriz **review-routing**), nunca `specialist:lint` | `grep -n 'execSync' .tooling/scripts/ci/preflight.ts` → `pnpm review:lint` (`:44`); `grep -c 'specialist' .tooling/scripts/ci/preflight.ts` → `0`. Duas matrizes, dois scripts, só uma no gate | Ampliar escopo como §F2-T1, mas a matriz `specialist-routing` precisa ser rodada e classificada antes — falso positivo em matriz de routing é caro (mesmo motivo de **D4**) |
| **BL7** | `lint-staged` roda **Prettier**, não ESLint | `package.json:36-41` → `"*.{ts,tsx}": ["prettier --write"]` | Nome enganoso, mas o ESLint entra pelo turbo (§F2-T5). Renomear sem mudar comportamento é churn |
| **BL8** | Hooks só disparam em `\.(ts\|tsx\|json\|yaml\|yml)$` e `\.(ts\|tsx\|prisma)$` — `.md` não passa por gate de pre-commit | `.husky/pre-commit:6` e `:15` | §F2-T1 fecha a cobertura de `.md` no `preflight`, que roda no pre-push. Estender o pre-commit duplicaria o gate sem ganhar alcance |
| **BL9** | Implementar de fato o bloqueio do `doc-sync` (**Opção B** da §F4-T4) | §F4-T4 Opção B; `grep -c 'process.exit' tooling/scripts/doc-sync.ts` → `0` | Exige calibrar `docs_health_score` primeiro, senão bloqueia commits legítimos. ~1 dia de specs TDD — precisa de fase própria |
| **BL10** | `apps/api` `"test"` ainda é stub (`echo 'apps/api test stub…' && exit 0`) — a task `test` do turbo roda o mesmo eco que a `lint` rodava | `grep -c 'test stub' apps/api/package.json` → `1` | §F2-T5 religa a `lint`; a `test` exige recalibrar a task `test` do turbo, porque `vitest.workspace.ts` já define os projetos `unit`/`integration`/`e2e` |

### Remissões — o que este plano **entregou** e foi marcado como pendência (fonte)

Três itens apareceram como pendência na análise de origem e foram resolvidos
por tasks deste plano. Registrados aqui para que não voltem ao backlog.

| # | Pendência original | Situação |
|---|--------------------|----------|
| **R1** | `check-doc-refs` não rodava sobre `.md` versionado — 61 dos 189 arquivos fora do escopo | **entregue por §F2-T1** (máscara de inline-code) **+ §F2-T2** (escopo + limpeza), num único commit porque o gate fica vermelho entre os dois |
| **R2** | 3 ocorrências de `../../../docs/adr/` em convenções/agents, com profundidade relativa errada | **entregue por §F1-T1** — 2 das 3 estão **quebradas** (`nestjs-specialist.md:115`, `stack-code-reviewer.md:260`); a 3ª, `estrutura-e-versionamento.md:68`, está **correta** e não deve ser tocada |
| **R3** | 3 early-returns silenciosos que devolvem `ok: true` sem ter verificado nada | **entregue por §F4-T1** — 1 ativo hoje (`check-archive-integrity.ts:33-36`, o diretório não existe) e 2 latentes; a §F4-T2 elimina a causa do ativo |

**Critério de aceite**

```bash
test -f .agents/runs/backlog-2026-10-02.md; echo "EXIT=$?"
grep -c '^| \*\*BL' .agents/runs/backlog-2026-10-02.md
grep -cE 'entregue por §F[0-9]' .agents/runs/backlog-2026-10-02.md
```

**Output esperado:** `EXIT=0`, `10` e `3`. Hoje: `1`, e os dois `grep` nem
têm arquivo onde ler.

> **Por que o critério aponta para `.agents/runs/`, e não para este arquivo.**
> A tabela acima é escrita pela revisão do plano, **antes** de qualquer task
> rodar. Um check que contasse linhas *deste* arquivo passaria já na
> adoção — verde sem a task, exatamente o defeito que o plano existe para
> eliminar. O artefato versionado é criado por esta task e só existe depois
> dela; é nele que a coluna de drift é medida, e é nele que o check ancora.

**Gate que valida:** revisão do PR — cada linha do backlog precisa responder
*"por que não agora?"* **sem** apelar para "não deu tempo".

---

## Critério de saída da Fase 4 (e do plano)

```bash
out=$(pnpm ci:preflight 2>&1); st=$?; echo "PREFLIGHT_EXIT=$st"
bash docs/superpowers/plans/verify-melhorias-fluxo.sh
```

**Output esperado:** `PREFLIGHT_EXIT=0` e `✓ 21 · ✗ 0 · ⊘ 0 (de 21 checks)` /
`EXIT=0` — as 21 tasks do plano, uma linha `✓` cada. Este é o comando único
que prova o plano inteiro.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
