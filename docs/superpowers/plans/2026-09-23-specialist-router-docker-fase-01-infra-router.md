# Fase 1 — Infra do specialist-router

> TDD step-by-step. Cada task = 1 commit + 2-stage review. **Branch:** `feat/dockerize-apps`. **Spec:** `docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md` §5.

---

### Task 1: specialist-router agent + memory

**Files:** Create `.agents/agents/specialist-router.md` (≤ 300 linhas), Create `.agents/memory/specialist-router.md`.

- [ ] **Step 1: Criar agent definition** — Espelhar `monorepo-specialist.md`. Frontmatter:
```yaml
---
name: specialist-router
description: Orquestrador de demanda. Classifica demanda (keywords + paths + scope) via matriz .agents/specs/conventions/specialist-routing.md, despacha specialists em paralelo via Agent tool. Bloqueia planning se gap_detected: true e retorna instrução para criar specialist via agent-architect. Use antes de qualquer planning quando a demanda tem escopo técnico definido.
type: specialist
tools: Read, Glob, Grep, Bash, Agent
---
```
12 seções: Papel (7 bullets), Quando invocar (8), Quando NÃO (4), Inputs (yaml), Comportamento (7 passos conforme spec §5.1), Outputs (yaml com classification/specialists_dispatched/gap_detected/plans_aggregated/next_steps), Coordenação (tabela 9 agents), Princípios (6), Anti-Padrões (6 com ❌), Referências Canônicas.

- [ ] **Step 2: Criar memory inicial** — Copiar de `.agents/memory/_template.md`. Frontmatter: `name: specialist-router`, `type: agent_memory`, description livre. Body: Estado Inicial (data 2026-09-23, paths spec/plan/matriz/classifier/lint) / Learnings (vazio) / Gaps (vazio) / Cross-refs.

- [ ] **Step 3: Verificar + commit**
```bash
wc -l .agents/agents/specialist-router.md .agents/memory/specialist-router.md  # agent ≤ 300, memory ≤ 50
git add .agents/agents/specialist-router.md .agents/memory/specialist-router.md
git commit -m "feat(agents): add specialist-router agent + memory v1.0"
```

---

### Task 2: specialist-routing skill

**Files:** Create `.agents/skills/specialist-routing/SKILL.md` (≤ 200 linhas).

- [ ] **Step 1: Criar SKILL.md** — Espelhar `.agents/skills/review-routing/SKILL.md`. Frontmatter: `name: specialist-routing`, description livre. 6 passos: pre-dispatch checks / dispatch router / interpretar output / triage / se bloqueado: dispatch agent-architect / se OK: integrar com writing-plans. Anti-Padrões (4 ❌). Cross-refs.

- [ ] **Step 2: Commit**
```bash
git add .agents/skills/specialist-routing/SKILL.md
git commit -m "feat(skills): add specialist-routing controller workflow"
```

---

### Task 3: specialist-routing matriz v1.0 + exemplos

**Files:** Create `.agents/specs/conventions/specialist-routing.md` (≤ 300), Create `.agents/specs/conventions/specialist-routing-examples.md` (≤ 200).

- [ ] **Step 1: Criar matriz v1.0** — Frontmatter: `name: specialist-routing`, `version: 1.0`, `updated: 2026-09-23`, `maintainer: specialist-router`, description. 4 seções YAML espelhando review-routing: `path_globs[]`, `demand_keywords[]`, `demand_scopes` (feat/fix/refactor/infra/security/docs/test/perf), `skip_rules[<specialist>]` + `always_on[]`. Tabela §5.3 do spec define 8 specialists (monorepo, nestjs, nextjs, docker, security-auditor, test-writer, doc-writer, refactorer). Seções Markdown: §1 PATH GLOBS / §2 DEMAND KEYWORDS / §3 DEMAND SCOPES / §4 SKIP HEURISTICS / §5 EXEMPLOS / §6 GAPS / §7 HISTÓRICO.

- [ ] **Step 2: Criar apêndice** — 3 cenários (D: docker+monorepo, E: security+test, F: refactor simples).

- [ ] **Step 3: Commit**
```bash
git add .agents/specs/conventions/specialist-routing.md .agents/specs/conventions/specialist-routing-examples.md
git commit -m "feat(agents): add specialist-routing matrix v1.0 + examples"
```

---

### Task 4: Classificador headless TDD

**Files:** Create `tooling/scripts/specialist-router.ts` (≤ 200), Create `tooling/scripts/specialist-router.spec.ts` (≥ 15 testes), Modify `tooling/scripts/package.json`, Modify `package.json` (root).

- [ ] **Step 1: Escrever testes (RED)** — Espelhar `review-router.spec.ts`. Testes:
```ts
describe('matchPathGlobs', () => {
  it('matcha apps/api/** → nestjs-specialist');
  it('matcha **/Dockerfile* → docker-specialist');
  it('retorna [] para path sem match');
  it('deduplica reviewers via Set');
});
describe('matchDemandKeywords', () => {
  it('matcha "dockerizar" → docker-specialist');
  it('matcha "monorepo" → monorepo-specialist');
  it('retorna [] para texto sem keywords');
});
describe('matchDemandScopes', () => {
  it('adiciona security-auditor em scope=security');
  it('adiciona test-writer em scope=test');
});
describe('classify', () => {
  it('integra paths + keywords + scopes');
  it('detecta gap quando nenhum specialist casa', () => {
    const r = classify({demand:'foo bar',paths:[],scope:'unknown'}, {path_globs:[],demand_keywords:[],demand_scopes:{},skip_rules:{},always_on:[]});
    expect(r.gap_detected).toBe(true);
  });
  it('marca blocking=true se path_glob tem blocking');
});
```

- [ ] **Step 2: Rodar testes — deve FALHAR**
```bash
cd tooling/scripts && pnpm test specialist-router.spec.ts
```
Esperado: FAIL (module not found).

- [ ] **Step 3: Implementar classificador (GREEN)** — Espelhar `review-router.ts`. Exports: `classify`, `matchPathGlobs`, `matchDemandKeywords`, `matchDemandScopes`, `loadMatrix`. CLI: `pnpm specialist:route --demand=<file> --paths=<file> --matrix=<file> [--output=<file>]`.

- [ ] **Step 4: Rodar — PASS** (`pnpm test specialist-router.spec.ts` → 15+ PASS).

- [ ] **Step 5: Wire scripts**
- `tooling/scripts/package.json` → `"specialist:route": "tsx specialist-router.ts"`
- `package.json` (root) → `"specialist:route": "cd tooling/scripts && pnpm specialist:route"`

- [ ] **Step 6: Smoke test CLI**
```bash
echo "dockerizar apps/api" > /tmp/demand.txt
echo "apps/api/**" > /tmp/paths.txt
pnpm specialist:route --demand=/tmp/demand.txt --paths=/tmp/paths.txt --matrix=.agents/specs/conventions/specialist-routing.md
```
Esperado: YAML com `specialists: [docker-specialist, monorepo-specialist]`.

- [ ] **Step 7: Commit**
```bash
git add tooling/scripts/specialist-router.ts tooling/scripts/specialist-router.spec.ts tooling/scripts/package.json package.json
git commit -m "feat(tooling): add specialist-router classifier TDD (15+ tests)"
```

---

### Task 5: Lint da matriz TDD

**Files:** Create `tooling/scripts/lint-specialist-routing.ts` (≤ 200), Create `tooling/scripts/lint-specialist-routing.spec.ts` (≥ 8 testes), Modify package.json files.

- [ ] **Step 1: Testes (RED)**
```ts
describe('lintMatrix', () => {
  it('passa para matriz v1.0 válida');
  it('falha se YAML mal-formado');
  it('falha se glob inválido');
  it('falha se regex inválida');
  it('falha se specialist ref não existe em .agents/agents/');
  it('falha se LOC > 300');
  it('falha se version frontmatter ausente');
  it('emite warning blocking-illegible (review-router v1.3)');
});
```

- [ ] **Step 2: Rodar — FAIL** (`pnpm test lint-specialist-routing.spec.ts`).

- [ ] **Step 3: Implementar lint (GREEN)** — Espelhar `lint-review-routing.ts`. `lintMatrix(matrixPath, agentsDir): LintResult`. CLI: `pnpm specialist:lint --matrix=<file> --agents=<dir>`.

- [ ] **Step 4: PASS** (8+ testes).

- [ ] **Step 5: Wire scripts** — `"specialist:lint": "tsx lint-specialist-routing.ts"` em `tooling/scripts/package.json`. Root: `"specialist:lint": "cd tooling/scripts && pnpm specialist:lint --matrix=../../.agents/specs/conventions/specialist-routing.md --agents=../../.agents/agents/"`.

- [ ] **Step 6: Smoke test** (`pnpm specialist:lint` → exit 0).

- [ ] **Step 7: Commit**
```bash
git add tooling/scripts/lint-specialist-routing.ts tooling/scripts/lint-specialist-routing.spec.ts tooling/scripts/package.json package.json
git commit -m "feat(tooling): add specialist-routing matrix linter TDD (8+ tests)"
```

---

### Task 6: Atualizar AGENTS.md §3 + WORKFLOWS.md

**Files:** Modify `AGENTS.md` (§3 catálogo), Modify `.agents/WORKFLOWS.md` (tabela + bloco §specialist-routing).

- [ ] **Step 1: Adicionar 2 linhas em AGENTS.md §3** (tabela de specialists):
```
| `specialist-router` | `.agents/agents/specialist-router.md` | (mem) | Orquestrador de demanda — identifica specialist(s) para planejar/executar. Bloqueia se gap_detected. |
| `docker-specialist` | `.agents/agents/docker-specialist.md` | (mem) | Specialist em containerização (Dockerfile, Compose, hardening, runtime, integração monorepo). |
```

- [ ] **Step 2: WORKFLOWS.md tabela** — Adicionar:
```
| `specialist-routing` | specialist-router | sequential | router → controller (decide planejar ou bloquear) |
```

- [ ] **Step 3: WORKFLOWS.md bloco §specialist-routing** — Espelhar §review-routing existente (Triggers / Responsável / Inputs / Outputs / Cross-refs).

- [ ] **Step 4: Verificar + commit**
```bash
grep -c 'specialist-router\|docker-specialist' AGENTS.md .agents/WORKFLOWS.md  # ≥ 2 cada
git add AGENTS.md .agents/WORKFLOWS.md
git commit -m "docs(agents): register specialist-router + docker-specialist in catalog"
```

---

### Task 7: Atualizar convenção evolucao-agents.md

**Files:** Modify `.agents/specs/conventions/evolucao-agents.md`.

- [ ] **Step 1: Adicionar seção "Regra de Bloqueio por gap_detected"** (após fluxo obrigatório):
```markdown
### Regra de Bloqueio por `gap_detected`

Quando `specialist-router` retorna `gap_detected: true`, controller **DEVE** bloquear planning e despachar `agent-architect` para criar o specialist ausente. **Inegociável** — alinhado com "Never implement manually when an appropriate agent exists".

**Fluxo:** 1) Router retorna gap + suggested_specialist; 2) Controller loga + despacha agent-architect; 3) agent-architect cria agent+memory+atualiza AGENTS.md§3+WORKFLOWS.md; 4) Controller re-despacha router; 5) Prosseguir.
```

- [ ] **Step 2: Commit**
```bash
git add .agents/specs/conventions/evolucao-agents.md
git commit -m "docs(agents): add gap_detected blocking rule to evolucao-agents convention"
```

---

### Task 8: Adicionar "Passo Pré-Planner" aos 6 workflows

**Files:** Modify `.agents/workflows/{monorepo-change,backend-feature,frontend-feature,ci-defense-mode,release-mode,retrospective-mode}.md`.

- [ ] **Step 1: Adicionar bloco idêntico em cada workflow (ANTES do passo 1)**
```markdown
### Passo Pré-Planner: Despachar specialist-router

Antes do passo 1:

1. Validar demanda tem escopo técnico (skill `specialist-routing` Passo 1)
2. Despachar `specialist-router` via Agent tool
3. Aguardar `.agents/runs/<ts>-specialist-<n>.yaml`
4. Se `gap_detected: true` → dispatch `agent-architect` + re-rodar router
5. Prosseguir com planning
```

- [ ] **Step 2: Verificar + commit**
```bash
grep -l 'specialist-router' .agents/workflows/*.md | wc -l  # = 6
git add .agents/workflows/
git commit -m "feat(workflows): add pre-planner specialist-router step to 6 workflows"
```

---

## Done da Fase 1

```bash
pnpm specialist:lint                                                  # exit 0
pnpm specialist:route --demand=/tmp/d.txt --paths=/tmp/p.txt --matrix=.agents/specs/conventions/specialist-routing.md  # exit 0
grep -c 'specialist-router' AGENTS.md .agents/WORKFLOWS.md            # ≥ 2 cada
grep -l 'specialist-router' .agents/workflows/*.md | wc -l             # = 6
```

Avançar para Fase 2.

**Mantido por:** projeto-base contributors