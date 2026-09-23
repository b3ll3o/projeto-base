# Review-Router — Fase 3: Piloto (agent + memory + skill + monorepo-change)

> **Parent plan:** [2026-09-22-review-router-plan.md](./2026-09-22-review-router-plan.md)
> **Spec:** [2026-09-22-review-router-design.md](../specs/2026-09-22-review-router-design.md)

**Fase 3: Piloto**
**Tasks:** 3.1–3.6 (6 tasks)
**Entrega:** Agent `review-router` + memory + skill + integração em `monorepo-change.md` + 1 task real validada
**Validação:** Router dispatcha reviewers esperados em task real + latency < 90s + consensus detectado (se aplicável)

---

## Fase 3 — Piloto (criar agent + memory + skill + monorepo-change)

### Task 3.1: Criar `.agents/agents/review-router.md`

**Files:**
- Create: `.agents/agents/review-router.md`

- [ ] **Step 1: Criar arquivo (≤ 300 linhas)**

```markdown
---
name: review-router
description: Orquestrador de revisão pós-task. Classifica diff (paths + commit type + diff content), consulta matriz externa (.agents/specs/conventions/review-routing.md), despacha specialists em paralelo via Agent tool, agrega findings com detecção de consensus, retorna YAML ao controller. Use sempre após implementer DONE (substitui decisão ad-hoc).
type: specialist
tools: Read, Glob, Grep, Bash, Agent
---

# Agent: `review-router`

## Papel

Orquestrador de revisão pós-task. Decide **quais reviewers** despachar baseado em classificação de diff, **não** o que eles devem encontrar (isso é responsabilidade de cada reviewer).

## Quando me invocar

- Após qualquer implementer (subagent) reportar DONE
- Antes de dispatchar fix-implementer (se houver BLOCKING/IMPORTANT)
- Em auditoria retroativa de PR (passar `--base` para diff específico)

## Quando NÃO me invocar

- Implementação (use specialist técnico)
- Decisão de avançar/parar (do controller)
- Code review direto (use `code-reviewer` ou specialist)

## Inputs (do controller)

```yaml
task: { scope: "medium", description: "..." }
context:
  branch: { base: "main", head: "feat/audit-fields" }
  pr_number: 42
  implementer_output_path: ".agents/runs/2026-09-22-impl-007.yaml"
```

## Comportamento

### Passo 1: Coletar sinais

```bash
git diff --name-only $BASE..HEAD
git log --pretty=%s $BASE..HEAD
git diff $BASE..HEAD | head -c 51200  # cap 50KB
```

### Passo 2: Ler matriz

```bash
Read: .agents/specs/conventions/review-routing.md
```

### Passo 3: Invocar classificador headless

```bash
pnpm review:route --paths=paths.txt --matrix=.agents/specs/conventions/review-routing.md
# stdin: diff content
# stdout: classification YAML
```

### Passo 4: Resolver domínios → reviewers

Aplicar matriz + skip rules. Aplicar heurística:

- `spec-compliance-reviewer`: skip se `scope=trivial AND files<=1` OR `commit_type=chore AND scope!=large`
- `code-quality-reviewer`: skip se `all_paths endsWith .md/.txt` OR `scope=docs`
- Override (forçar): paths críticos OU breaking change indicator

### Passo 5: Despachar reviewers em paralelo

Para cada reviewer resolvido, chamar Agent tool **na mesma mensagem** (paralelo):

```
Agent(
  prompt="Você é o ${reviewer_id}. Analise o diff em ${branch.base}..${branch.head}
          e retorne CheckResult YAML com findings classificados por severidade.
          Contexto: ${classification_evidence}"
)
```

### Passo 6: Agregar findings + detectar consensus

```yaml
findings:
  - file: x.ts
    line: 42
    severity: major
    consensus: true   # 2+ reviewers concordaram
    reviewers_flagged: [nestjs-specialist, stack-code-reviewer]
```

Consensus = mesmo file:line + severidades compatíveis (mesma ou ±1 nível).

### Passo 7: Retornar ao controller

Output em `.agents/runs/<timestamp>-review-<n>.yaml` (ver Seção 7 do spec).

## Outputs

```yaml
classification:
  scope: medium
  domains_detected: [nestjs, prisma]
  matrix_version: 1

reviewers_dispatched: [...]

findings_aggregated:
  totals: { blocker: 0, major: 2, minor: 4, info: 1 }
  consensus_count: 1

next_steps: [...]
```

## Coordenação com Outros Agents

| Agent | Relação |
|---|---|
| Controller | Sou despachado por ele após implementer DONE |
| code-reviewer | Despachado por mim como "spec-compliance-reviewer" |
| nestjs-specialist, nextjs-specialist, etc. | Despachados conforme classificação |
| stack-code-reviewer | Despachado se match; mantém vida autônoma (pre-commit) |
| doc-sync | Despachado se match; mantém vida autônoma |
| retrospective-capture (skill) | Lê meus outputs para identificar padrões |

## Princípios

1. **Sempre fresh.** Cada invocação é fresh subagent (per `reviewer-must-differ-from-implementer`).
2. **Classificação é determinística.** Mesmo diff + mesma matriz → mesmo output.
3. **Triage NÃO é meu.** Controller decide BLOCKING/IMPORTANT/NICE.
4. **Skip explícito.** Sempre cito `skipped_reason` para auditabilidade.
5. **Idempotente.** Mesmo input + matrix_version → mesmo output.

## Anti-Padrões (NÃO fazer)

- ❌ Triage findings (deixar para controller)
- ❌ Modificar código (sugerir via fix-implementer dispatch)
- ❌ Modificar matriz (sugerir via PR separado)
- ❌ Inventar reviewers não declarados na matriz
- ❌ Rodar sem matriz (fail-fast se arquivo ausente)

## Referências Canônicas

- [`.agents/specs/conventions/review-routing.md`](../specs/conventions/review-routing.md) — matriz
- [`.agents/skills/review-routing/SKILL.md`](../skills/review-routing/SKILL.md) — workflow detalhado (a criar em Task 3.3)
- [`.agents/memory/review-router.md`](../memory/review-router.md) — memória evolutiva
- Spec de design: `docs/superpowers/specs/2026-09-22-review-router-design.md`

---

**Arquivo:** `.agents/agents/review-router.md`
**Tipo:** Review orchestration agent (orquestrador)
```

- [ ] **Step 2: Verificar LOC ≤ 300**

```bash
wc -l .agents/agents/review-router.md
```

Expected: ≤ 300.

- [ ] **Step 3: Validar que router aparece no lint**

```bash
pnpm review:lint
```

Expected: 0 errors (reviewer agora conhecido: `review-router`).

- [ ] **Step 4: Commit**

```bash
git add .agents/agents/review-router.md
git commit -m "feat(agents): review-router agent definition (orquestrador de revisão)"
```

### Task 3.2: Criar `.agents/memory/review-router.md`

**Files:**
- Create: `.agents/memory/review-router.md`

- [ ] **Step 1: Criar memória inicial**

```markdown
---
name: review-router
type: agent_memory
---

# Memória: review-router

> Estado evolutivo do agent. Atualizado após cada run significativo.

## Estado Inicial (2026-09-22)

- Criado em: feat/review-router-agent (Fase 3 do plano)
- Spec: `docs/superpowers/specs/2026-09-22-review-router-design.md`
- Plan: `docs/superpowers/plans/2026-09-22-review-router-plan.md`
- Matriz v1: `.agents/specs/conventions/review-routing.md`
- Classificador: `tooling/scripts/review-router.ts` (TDD, 17 testes)
- Lint: `tooling/scripts/lint-review-routing.ts`

## Learnings (acumular conforme uso)

_(vazio — primeira versão)_

## Gaps Conhecidos

- `performance-auditor` referenciado em Open Question §12 — não existe ainda
- Cache de resultados de reviewer: TTL não definido (Open Question §12.2)
- Notificação entre router e reviewers: dispatch direto (Open Question §12.4)

## Cross-refs

- [`.agents/agents/review-router.md`](../agents/review-router.md) — definition
- [`.agents/skills/review-routing/SKILL.md`](../skills/review-routing/SKILL.md) — workflow
- [`.agents/specs/conventions/review-routing.md`](../specs/conventions/review-routing.md) — matriz
```

- [ ] **Step 2: Commit**

```bash
git add .agents/memory/review-router.md
git commit -m "feat(agents): review-router memory (estado inicial)"
```

### Task 3.3: Criar `.agents/skills/review-routing/SKILL.md`

**Files:**
- Create: `.agents/skills/review-routing/SKILL.md`

- [ ] **Step 1: Criar skill (≤ 300 linhas)**

```markdown
---
name: review-routing
description: Workflow completo para o controller invocar o review-router após implementer DONE. Cobre inputs, dispatch, interpretação do output, fix loop. Use em qualquer task pós-implementer.
---

# Skill: review-routing

> Quando invocar: após qualquer implementer (subagent) reportar DONE.

## Inputs necessários (do controller)

```yaml
task: { scope: "trivial|medium|large", description: "..." }
context:
  branch: { base: "main", head: "<branch>" }
  pr_number: <int>           # opcional
  implementer_output_path: ".agents/runs/<impl>-<n>.yaml"
```

## Passo 1: Pre-dispatch checks (controller)

```bash
# Working tree limpo? (warn se dirty em scope=trivial)
git status --porcelain

# Branch base existe?
git rev-parse --verify $BASE

# Matriz existe?
test -f .agents/specs/conventions/review-routing.md
```

Se qualquer check falhar, abortar antes de chamar router.

## Passo 2: Despachar router

```typescript
Agent(
  agent="review-router",
  prompt={inputs JSON + contexto da task}
)
```

## Passo 3: Interpretar output

Ler `.agents/runs/<timestamp>-review-<n>.yaml`. Validar schema:

- `reviewers_dispatched[]` não-vazio OU todos com `skipped: true` (e reasons documentados)
- `findings_aggregated.totals` presente
- `classification_evidence[]` presente (rastreabilidade)

## Passo 4: Triage (controller)

Para cada finding em `findings_aggregated`:

- `consensus: true` → geralmente IMPORTANT (confiança alta)
- `severity: blocker` → sempre BLOCKING
- `severity: major` → triagem manual
- `severity: minor` ou `info` → geralmente NICE-TO-HAVE

Se houver BLOCKING ou IMPORTANT → dispatch fix-implementer (Task 5: fix loop).

## Passo 5: Fix loop

```yaml
fix_task:
  scope: medium
  description: "Corrigir findings de review #<n>"
  target_findings: [...]    # IDs ou file:line
  review_run_id: <timestamp>-review-<n>
```

Após fix DONE, **re-despachar router** (re-rodar Task 1-5 com branch atualizada).

## Passo 6: Decidir avançar

- Se router retorna 0 BLOCKING/IMPORTANT → controller pode prosseguir
- Se ainda houver após 2 rounds de fix → escalar (humano ou task maior)

## Anti-padrões

- ❌ Pular router e dispatchar reviewers manualmente (perde rastreabilidade)
- ❌ Avançar com BLOCKING não tratado (viola `review-and-fix-after-each-task`)
- ❌ Re-despachar router sem fix (mesmo output esperado)
- ❌ Modificar matriz fora de PR (perde versionamento)

## Cross-refs

- [`.agents/agents/review-router.md`](../../agents/review-router.md)
- [`.agents/specs/conventions/review-routing.md`](../../specs/conventions/review-routing.md)
- Memory: [`two-stage-review-after-each-task`](../../../../home/leo/.claude/projects/-home-leo-Documentos-projetos-base/memory/two-stage-review-after-each-task.md), [`review-and-fix-after-each-task`](../../../../home/leo/.claude/projects/-home-leo-Documentos-projetos-base/memory/review-and-fix-after-each-task.md)
```

- [ ] **Step 2: Validar LOC**

```bash
wc -l .agents/skills/review-routing/SKILL.md
```

Expected: ≤ 300.

- [ ] **Step 3: Commit**

```bash
git add .agents/skills/review-routing/SKILL.md
git commit -m "feat(agents): review-routing skill (workflow para controller)"
```

### Task 3.4: Adicionar passo router ao `monorepo-change.md`

**Files:**
- Modify: `.agents/workflows/monorepo-change.md`

- [ ] **Step 1: Localizar seção "Implementer Done"**

```bash
grep -n "implementer" .agents/workflows/monorepo-change.md
```

- [ ] **Step 2: Adicionar passo "Despachar review-router"**

Após o passo "Implementer DONE", inserir:

```markdown
### Passo X: Despachar review-router

Após implementer reportar DONE:

1. Validar inputs (skill `review-routing` Passo 1)
2. Despachar `review-router` via Agent tool
3. Aguardar output em `.agents/runs/<timestamp>-review-<n>.yaml`
4. Triage conforme skill (Passo 4)
5. Se BLOCKING/IMPORTANT → dispatch fix-implementer (Passo 5)
6. Re-rodar router após fix
7. Avançar quando router retornar 0 BLOCKING/IMPORTANT
```

- [ ] **Step 3: Commit**

```bash
git add .agents/workflows/monorepo-change.md
git commit -m "feat(workflows): adicionar passo review-router em monorepo-change"
```

### Task 3.5: Rodar 1 task piloto via monorepo-change

- [ ] **Step 1: Identificar task piloto**

Escolher uma task real pequena que toque monorepo (ex: bump de versão em `package.json`).

- [ ] **Step 2: Rodar workflow completo**

Seguir `.agents/workflows/monorepo-change.md` incluindo o novo passo de router. Capturar output.

- [ ] **Step 3: Validar métricas**

- Router dispatchou reviewers esperados?
- Latência < 90s?
- Findings classificados corretamente?
- Consensus detectado (se houver)?

- [ ] **Step 4: Documentar resultado no retro file**

Criar `.agents/runs/2026-09-22-pilot-<n>.md` com resultado e aprendizados.

- [ ] **Step 5: Atualizar `.agents/memory/review-router.md` com learnings**

Adicionar learnings da pilot run na seção "Learnings".

### Task 3.6: PR da Fase 3

- [ ] **Step 1: pnpm ci:local**

```bash
pnpm ci:local
```

- [ ] **Step 2: Push + PR**

```bash
git push
gh pr create --base main --title "feat(agents): review-router agent + memory + skill + monorepo-change pilot" --body "Fase 3 do design review-router. Cria agent + memory + skill + integra no workflow monorepo-change. Piloto validado."
```

- [ ] **Step 3: Review + merge**

Após aprovação: `gh pr merge --squash`.

---

