---
name: melhorias-fluxo-fase-4-p2-backlog-part-01
description: Fase 4 (P2) parte 1 — 3 tasks de baixo impacto: distinguir "verificado" de "não havia o que verificar" no painel do preflight, versionar .agents/runs/archive/.gitkeep para tornar o ✓ honesto, e fechar a barreira de merge no ruleset (Decisão D2, owner). Fecha a Fase 4.
version: 1.1.0
updated: 2026-10-02
maintainer: stack-code-reviewer
state_snapshot: .agents/runs/state-snapshot-20261003T154334Z.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-02.md
---

# Fase 4 (P2) — Parte 1: gates que reportam verde sem verificar

> **Pré-requisito:** Fases 1 a 3 completas. Nada aqui bloqueia as fases
> anteriores — por isso é P2, não P1.
> **Próxima parte:** [F4-P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-02.md)
> **Agente responsável:** `stack-code-reviewer` · `security-auditor` (D2).
> **O padrão desta fase:** *gate que imprime ✓ sem ter verificado nada*.
> **⚠️ Ordem obrigatória: §F4-T1 → §F4-T2.** Ao contrário do que parece
> natural, criar o diretório **antes** tornaria a §F4-T1 inaplicável: com
> `.agents/runs/archive/` versionado, o `checkArchiveIntegrity` deixa de
> entrar no early-return, e o critério da §F4-T1 (`grep -c 'skipped:'` no
> painel ≥ `1`) passaria a ser **inverificável** — o `– (skipped: …)` nunca
> apareceria. Na ordem certa, a §F4-T1 **expõe** o skip e a §F4-T2 **elimina
> sua causa**.

---

## F4-T1 — Distinguir "verificado e passou" de "não havia o que verificar"

**Arquivos tocados**

- Modify: `.tooling/scripts/ci/check-types.ts:8-11`
- Modify: `.tooling/scripts/ci/check-archive-integrity.ts:33-36`
- Modify: `.tooling/scripts/ci/check-tsconfig-drift.ts:67-69` (mesmo padrão)
- Modify: `.tooling/scripts/ci/preflight.ts:38-41` (mesmo padrão) + render do painel
- Modify: `.tooling/scripts/ci/preflight.spec.ts` (1 teste RED)

**Contexto verificado.** O tipo de retorno é binário — `check-types.ts:8-11`:

```ts
export interface CheckResult { ok: boolean; errors: string[]; }
```

O painel não tem como separar `errors: []` de *"nada encontrado"* de *"nada
procurado"*. Três sites têm o early-return silencioso, mas **só um está ativo
hoje**:

| Site | Early-return | Ativo hoje? |
|---|---|---|
| `check-archive-integrity.ts:33-36` | `if (!existsSync(archiveDir)) return { ok: true, errors: [] }` | **SIM** — `ls -a .agents/runs` → sem `archive/` |
| `check-tsconfig-drift.ts:67-69` | `if (files.length === 0) return { ok: true, errors: [] }` | **NÃO** — `tsconfigsRoot: '.'` e há **6** tsconfigs |
| `preflight.ts:38-41` | `if (!existsSync(matrixPath) \|\| !existsSync(matrixFile)) …` | **NÃO** — a matriz e o script `review:lint` (`package.json:26`) existem |

> **Correção sobre a v1.0.0:** ela afirmava que "dois checks caem no segundo
> caso hoje" e depois listava **três** — o que, somado à linha órfã que ficou
> no texto, é a mesma confusão. A distinção honesta é **1 ativo / 2 latentes**.
> Os 3 entram no patch porque o custo é o mesmo e um early-return silencioso
> que pode despertar é um `✓` que pode voltar a mentir.

Hoje os 3 imprimem `✓` (`pnpm ci:preflight` → `tsconfig drift… ✓`,
`review-routing matrix lint… ✓`, `archive integrity… ✓`).

**Passos**

1. **RED** — em `preflight.spec.ts`, 1 teste: um check que retorna
   `skipped: true` **não** é renderizado como `✓`.

2. **GREEN (1)** — `check-types.ts`:

   ```ts
   export interface CheckResult {
     ok: boolean;
     errors: string[];
     /** Verdadeiro quando o check não pôde rodar (pré-requisito ausente). */
     skipped?: boolean;
     /** Motivo do skip, exibido no painel. */
     reason?: string;
   }
   ```

3. **GREEN (2)** — `check-archive-integrity.ts:33-36`, trocar o early-return
   silencioso por um skip **declarado** (e o mesmo padrão em
   `check-tsconfig-drift.ts:67-69` e `preflight.ts:38-41`):

   ```ts
   if (!existsSync(archiveDir)) {
     return { ok: true, errors: [], skipped: true, reason: 'diretório .agents/runs/archive não existe' };
   }
   ```

4. **GREEN (3)** — no painel de `preflight.ts`, trocar a marca:

   ```ts
   const marca = r.skipped ? `– (skipped: ${r.reason})` : r.ok ? '✓' : '✗';
   ```

5. **Verificar:**

   ```bash
   out=$(pnpm ci:preflight 2>&1); st=$?
   printf '%s\n' "$out" | grep -c 'skipped:'; echo "EXIT=$st"
   ```

   **Output esperado:** `1` e `EXIT=0` — hoje `0`. O `archive integrity` passa
   de `✓` para `– (skipped: diretório .agents/runs/archive não existe)`.

6. Commit:

   ```bash
   git add .tooling/scripts/ci/check-types.ts .tooling/scripts/ci/check-archive-integrity.ts \
           .tooling/scripts/ci/check-tsconfig-drift.ts .tooling/scripts/ci/preflight.ts \
           .tooling/scripts/ci/preflight.spec.ts
   git commit -m "feat(ci): CheckResult distingue 'verificado' de 'nao havia o que verificar'

   { ok, errors[] } e binario: o painel nao separa 'nada encontrado' de
   'nada procurado'. Acrescenta skipped?/reason? e renderiza
   '– (skipped: <motivo>)' no lugar do ✓.

   Aplica em check-archive-integrity.ts:33-36 (ATIVO: o diretorio nao
   existe, entao o ✓ era puro teatro), check-tsconfig-drift.ts:67-69 e
   preflight.ts:38-41 (latentes: ha 6 tsconfigs e a matriz + review:lint
   existem, mas o early-return silencioso pode despertar). Regra: o token
   de sucesso nao pode ser o mesmo para 'verifiquei e passou' e 'nao havia
   nada para verificar'.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c 'skipped' .tooling/scripts/ci/check-types.ts
out=$(pnpm ci:preflight 2>&1); st=$?; printf '%s\n' "$out" | grep -c 'skipped:'; echo "EXIT=$st"
```

**Output esperado:** `1`, `1` e `EXIT=0`. Hoje os mesmos comandos dão `0`, `0`.

> **Sem número de baseline.** `B10` é a métrica da §F4-T2 (o diretório
> `.agents/runs/archive/`), não desta: o valor que a §F4-T1 move é a contagem de
> `skipped:` no painel, que **não** tem linha própria na tabela do índice. Citar
> `B10` aqui faria o leitor procurar uma métrica de diretório num gate de
> estado.

**Gate que valida:** `preflight.spec.ts` (ligado por **§F2-T8**, não §F2-T7) +
o job `preflight` do CI.

---

## F4-T2 — Versionar `.agents/runs/archive/.gitkeep` para tornar o `✓` honesto

**Arquivos tocados**

- Create: `.agents/runs/archive/.gitkeep`

**Contexto verificado.** Aplicada a §F4-T1, o painel mostra honestamente que o
`archive integrity` está `skipped`. A causa é simples: o diretório não existe
(`ls -a .agents/runs` → 4 arquivos, sem `archive/`) e
`tooling/scripts/archive-lint.ts` **existe** — não há onde exercitá-lo.

1. Criar o diretório versionado:

   ```bash
   mkdir -p .agents/runs/archive && touch .agents/runs/archive/.gitkeep
   ```

2. **Verificar que o check passou a rodar de verdade** — o `– (skipped: …)` da
   §F4-T1 deve sumir e virar `✓`:

   ```bash
   out=$(pnpm ci:preflight 2>&1); st=$?
   printf '%s\n' "$out" | grep -i 'archive integrity'
   printf '%s\n' "$out" | grep -c 'skipped:'
   echo "EXIT=$st"
   ```

   **Output esperado:** `✓ archive integrity …`, `0` e `EXIT=0`. Antes desta
   task: `– (skipped: …)` e `1`.

3. Commit:

   ```bash
   git add .agents/runs/archive/.gitkeep
   git commit -m "chore(runs): versiona .agents/runs/archive/.gitkeep

   Ferramenta archive-lint.ts existe, mas nao havia diretorio onde
   exercita-la. Com a §F4-T1 o painel passou a mostrar o skip honestamente;
   esta task elimina a causa dele, e o ✓ volta a sermerecido.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
test -f .agents/runs/archive/.gitkeep; echo "EXIT=$?"
```

**Output esperado:** `EXIT=0` (hoje `1`).

**Gate que valida:** o próprio `checkArchiveIntegrity` dentro do `preflight`
(`.husky/pre-push:9` + job `preflight` do CI).

---

## F4-T3 — Fechar a barreira de merge no ruleset **(Decisão D2 — owner)**

**Arquivos tocados**

- Modify: ruleset `b3ll3o/projeto-base/rulesets/23853096` (UI do GitHub)

**Estado medido (read-only).**

```bash
gh api repos/b3ll3o/projeto-base/rulesets/23853096 --jq '{enforcement, rules: [.rules[].type]}'
gh api repos/b3ll3o/projeto-base/rulesets/23853096 \
  --jq '.rules[] | select(.type=="pull_request") | .parameters.required_approving_review_count'
```

```text
{ "enforcement": "active", "rules": ["deletion", "non_fast_forward", "pull_request"] }
0
```

As condições são `{"ref_name": {"include": ["refs/heads/main"], "exclude": []}}`.
Ou seja: as 3 camadas descritas em `ci-defense-in-depth.md` são **pre-push
local (burlável com `--no-verify`)** + **revisão de PR por convenção** + **CI
que ninguém é obrigado a esperar**. §F3-T3 alinha o documento; esta task decide
se ele passa a descrever a realidade ou se a realidade é que muda.

> **Não decidir aqui.** É configuração de barreira do repositório. O owner
> escolhe entre as opções abaixo; o default recomendado é o mais conservador
> que ainda fecha o caso concreto que motivou o plano — *verde por gate
> inerte*.

### Decisão D2 — `required_status_checks` no ruleset 23853096

| Opção | O que muda | Custo | Risco |
|---|---|---|---|
| **(a) `contexts: ['quality']`, sem `strict`** — *default recomendado* | `quality` passa a ser obrigatório em `main`. Como `quality` tem `needs: preflight` (`ci.yml:34`), os dois gateiam transitivamente. | Baixo | Push direto em `main` passa a ser bloqueado — que é o objetivo |
| (b) `contexts: ['quality'], strict: true` | Idem + exige PR **up-to-date** com `main` | Médio | Exige rebase/re-run a cada merge; friction alto no fluxo atual |
| (c) `required_approving_review_count: 1` | Human review obrigatório | Alto | Repo com contributor único → **trava o próprio autor** em PR solo |
| (d) Nada | O documento reflete telemetria, não barreira | Zero | `main` volta a aceitar commit vermelho se um gate inerte reaparecer |

**Default recomendado: (a).** Cobre exatamente a classe de falha deste plano
(*gate inerte reportando verde*) sem introduzir friction de revisão humana.
**(c) está fora** — o histórico é de auto-merge por contributor único.

**Se o owner escolher (a):**

1. UI: `Settings → Rules → Rulesets → master → Edit → Rules → Require status
   checks to pass`; contexts = `quality`; **leave `strict` unchecked**.
2. Verificar:

   ```bash
   gh api repos/b3ll3o/projeto-base/rulesets/23853096 \
     --jq '.rules[] | select(.type=="required_status_checks")'
   ```

3. Commit: **nenhum** — o ruleset não é versionado. Registrar a decisão em
   `.agents/specs/conventions/git-workflow.md:34` (mesma edição de §F3-T3) e
   no corpo do PR, para que o próximo a ler o documento encontre barreira e
   verdade na mesma frase.

**Critério de aceite**

```bash
gh api repos/b3ll3o/projeto-base/rulesets/23853096 \
  --jq '.rules[].type' | grep -c required_status_checks
```

**Output esperado:** `1` sob a opção (a); `0` sob (d). Hoje: `0`.

> **Sem número de baseline, de novo.** `B11` é a métrica dos 18 links
> `](../.agents/memory/` do `AGENTS.md` (Fase 1) — sem relação com o ruleset.
> A métrica da D2 é evidentada pela própria tabela de decisão acima, que já
> mostra as 3 regras atuais (`deletion`, `non_fast_forward`, `pull_request`)
> medidas por `gh api`.

**Gate que valida:** o próprio GitHub — a tentativa de merge sem o check verde.

---

## Vitória das 3 tasks desta parte

```bash
out=$(pnpm ci:preflight 2>&1); st=$?; echo "PREFLIGHT_EXIT=$st"
bash docs/superpowers/plans/verify-melhorias-fluxo.sh | grep -cE '^✓ F4-T[123]'
```

**Output esperado:** `PREFLIGHT_EXIT=0` e `3` — F4-T1, F4-T2 e F4-T3, uma
linha `✓` cada. **O critério de saída da Fase 4 inteira é o da
[F4-P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-4-p2-backlog-part-02.md),
que fecha o plano.**

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
