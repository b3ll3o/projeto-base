# B35 — Parser-as-Source-of-Truth v2: Decisão de Regeneração

- **Date:** 2026-09-25
- **Status:** Decision: parser-enriched NÃO regenera agent-workflows; ground-truth permanece hand-authored
- **Batches:** B31 (análise inicial) → B35 (re-análise após B33 enrichment)
- **Arquivos analisados:** 3 workflows representativos

## TL;DR

Re-avaliação pós-B33 enrichment confirma o veredito de B31: o parser-enriched (com `meta.tier/mechanism/subject` + `actorTags` + view overview) **bate topology 100%** com ground-truth, mas tem **gaps significativos em decoration** (subtitle, output, semantic views, phases, groups, lanes, node type, sublabel semântica). Para B36+, recomendar manter ground-truth como source-of-truth para agent-workflows e usar parser para fixtures/derivação.

## 1. Metodologia

3 workflows representativos parser-vs-ground-truth:

```bash
node dev-archify/bin/archify.mjs agent-flow \
  --source .agents/workflows/<x>.md --out /tmp/parser-<x>.json
```

| Workflow | Pipeline | Nodes | Lanes | Ground-truth complexity |
|---|---|---|---|---|
| `flow-backend-feature` | 4 estágios (sequencial) | 4 | 1 (agent) | 2 views, 2 phases, 2 groups |
| `flow-monorepo-change` | 2 estágios (sequencial) | 2 | 1 (agent) | 2 views, 2 phases, 2 groups |
| `flow-specialist-routing` | 4 nós paralelos | 4 | 4 (controller/router/specialists/policy) | 2 views, 3 phases, 4 groups |

Seleção: 1 sequencial curto (monorepo), 1 sequencial médio (backend), 1 paralelo multi-lane (specialist-routing) — cobre variabilidade.

## 2. Diff estrutural

### 2.1. Camadas que MATCH (parser == ground-truth)

| Campo | Backend-feature | Monorepo-change | Specialist-routing |
|---|---|---|---|
| `schema_version` | ✓ (2) | ✓ | ✓ |
| `diagram_type` | ✓ (workflow) | ✓ | ✓ |
| `meta.visual_preset` | ✓ (signal-flow) | ✓ | ✓ |
| `meta.tier` | ✓ (critical) | ✓ | ✓ |
| `meta.mechanism` | ✓ (auto) | ✓ | ✓ |
| `meta.subject` | ✓ | ✓ | ✓ |
| `meta.animation` | ✓ (trace) | ✓ | ✓ |
| `lanes[0].id/label` | ✓ (agent) | ✓ | ✓ (1 lane vs 4 lanes ground-truth — ver §2.2) |
| `nodes[i].id` | ✓ | ✓ | ✓ (topology) |
| `nodes[i].label` | ✓ | ✓ | ✓ |
| `nodes[i].col` | ✓ | ✓ | ✓ |
| `edges[i].from/to/role` | ✓ | ✓ | ✓ |
| `mainPath[]` | ✓ | ✓ | ✓ |

**Topology match 100%** — o pipeline é extraído corretamente do MD code-fence (`NESTJS-SPECIALIST → TEST-WRITER → ...`) ou do ASCII box-art.

### 2.2. Camadas que GAP (parser != ground-truth)

| Campo | Parser | Ground-truth | Categoria |
|---|---|---|---|
| `meta.title` | "backend-feature — Implementar Feature no Backend NestJS" (MD H1) | "Backend Feature — Implementação no NestJS" (editorial) | **decoração editorial** |
| `meta.subtitle` | MISSING | "4 estágios sequenciais: specialist → test-writer → code-reviewer → tdd-enforcer" | **decoração editorial** |
| `meta.output` | MISSING | "flow-backend-feature.workflow.html" | **decoração artefatual** |
| `meta.quality_profile` | "standard" | "showcase" | **configuração visual** |
| `meta.views[]` | 1 view (`sequence-overview`) | 2 views semânticas (`implement`, `gates`) | **semântica narrativa** |
| `nodes[i].type` | "external" | "backend" / "frontend" / "database" / etc. | **tipagem domínio** |
| `nodes[i].sublabel` | "specialist" (papel via tagActor) | "spec + implement" (ação editorial) | **narrativa semântica** |
| `nodes[i].tag` | "scope:backend" | "controller / service / repository" (entregável) | **narrativa semântica** |
| `nodes[i].width` | 160 (default) | 160-180 (varia) | **ajuste visual** |
| `phases[]` | [] (vazio) | 2 phases com labels + variant | **agrupamento temporal** |
| `groups[]` | [] (vazio) | 2-4 groups com labels + variant | **agrupamento semântico** |
| `lanes[]` | 1 lane ("agent") | 1-4 lanes (controller, router, specialists, policy) | **separação de papéis** |
| `cards[]` | [] | Pode ter cards focais | **decoração narrativa** |

### 2.3. Gaps por workflow

| Workflow | Gap principal |
|---|---|
| `flow-backend-feature` | decoration editorial (subtitle/output/title), views (1 vs 2), phases (0 vs 2), groups (0 vs 2), node type (external vs backend), sublabel/tag semântica |
| `flow-monorepo-change` | mesmos gaps + width variation (160 vs 180) |
| `flow-specialist-routing` | TODOS os gaps + **lanes múltiplas** (1 vs 4) — gap crítico; o pipeline paralelo multi-lane é inseparável da narrativa |

## 3. Análise de cada gap

### 3.1. Topology-only ✅
Parser extrai `nodes/edges/mainPath/lanes[0]` corretamente. Decisão segura: parser é **fonte confiável de topology**.

### 3.2. Decoration editorial (subtitle, output, title) ⚠️
Parser poderia inferir:
- `subtitle` a partir de "Composição: sequential (4 estágios)" no MD → "4 estágios sequenciais: ..."
- `output` do `path.basename(outPath)` (previsível)
- `title` já é extraído do H1 (diferença é só editorial)

**Effort:** pequeno. **Valor:** médio. Parser poderia opcionalmente derivar, mas **risco de divergência semântica** se H1 do MD muda.

### 3.3. Semantic views (1 vs 2) ⚠️
Parser produz 1 view genérica. Ground-truth produz 2 views com foco distinto:
- Backend: implement (all) + gates (reviewers only)
- Monorepo: structural (all) + isolation (reviewer only)
- Specialist-routing: happy-path (router+specialists+controller) + gap-blocker (router+controller+architect)

**Effort:** alto. Parser precisaria conhecer as "categorias" de cada flow. **Não generaliza** sem heurística específica por workflow.

### 3.4. Phases/groups ❌
Parser emite arrays vazios. Ground-truth deriva de narrativa do MD (build/review/dispatch/decide).

**Effort:** alto. Requer parsing de "## Estágios" / "## Fases" / "## Decisões" no MD. **Não trivial** — depende de convenções de authoring.

### 3.5. Multi-lane (specialist-routing) ❌
Parser hardcoda 1 lane "agent". Ground-truth separa controller/router/specialists/policy.

**Effort:** alto. Parser precisaria detectar roles do pipeline (router/specialists/controller) e mapear para lanes. **Reescrita significativa**.

### 3.6. Node type (external vs domain) ❌
Parser usa `external` (fallback). Ground-truth usa domain-specific (backend/frontend/database).

**Effort:** pequeno (adicionar type-mapping em tagActor). **Valor:** alto (rendering accuracy).

### 3.7. Sublabel/tag semântica ❌
Parser emite role-based (scope:backend). Ground-truth emite action-based (controller / service / repository).

**Filosofia diferente**: parser = papel do agent; ground-truth = entregável/conhecimento. **Não há ground-truth estável** — varía por workflow.

### 3.8. Width tuning (160 vs 180) ⚠️
Parser usa 160 (default). Ground-truth ajusta a 180 para nodes com sublabel longo.

**Effort:** pequeno. **Valor:** baixo (cosmético).

## 4. Decisão (atualização de B31)

**Veredito:** parser-enriched (B33) **NÃO regenera** agent-workflows ground-truths.

**Razões:**
1. **Topology match** é forte (100% nos 3 casos) — parser é source-of-truth válido para `nodes/edges/mainPath`
2. **Decoration gaps** são grandes e assimétricos (sem view semântica, sem phases/groups, sem multi-lane, sublabel/tag divergentes)
3. **Effort de fechamento dos gaps** é desproporcional ao valor (3-5 sprints vs regenerar 18 agent-workflows)
4. **Risco de regressão visual**: parser regenerando pode quebrar 18 artefatos showcase cuidadosamente ajustados (cada um passou por review visual)

**Recomendação para B36+:**
- Manter agent-workflows hand-authored (B28 catalog) como source-of-truth
- Parser como ferramenta para:
  - **fixtures de teste** (e.g. regression fixtures)
  - **derivação de novos flows** durante authoring (humano revisa + ajusta)
  - **validação de topology** (verificar se um MD tem pipeline que bate com seu JSON)
- Não usar parser como gerador direto de artefatos showcase

**Futuro (B37+):**
- Adicionar opt-in `--strict` que emite phases/groups/lanes heurísticos (com warning "experimental")
- Adicionar `--no-views` (default atual) vs `--semantic-views` (futuro)

## 5. Comparação com B31 original

B31 dizia:
> "topology match confirmado (backend-feature), mas parser era minimalista. Decisão: NÃO sobrescrever ground-truth, parser para regeneração futura."

B35 confirma e reforça: **mesmo com B33 enrichment, a decisão se mantém**. O enrichment fechou os gaps de `meta.tier/mechanism/subject` (B30) e adicionou `actorTags` (B33), mas os gaps restantes (decoration editorial + semantic views + phases/groups + multi-lane) continuam significativos.

## 6. Tasks consumidas em B35

| Task | Status | Branch | Commit |
|---|---|---|---|
| 1. parser-regen-analysis | DONE | (n/a — spec only) | (n/a) |
| 2. viewbox-showcase-bump | DONE | feat/viewbox-showcase-bump | 1 commit |
| 3. flow-auto-enrich | DONE | feat/flow-auto-enrich | 1 commit |

## 7. Próximos passos (B36+)

1. **B36**: regenerar 1 workflow simples (e.g. `flow-monorepo-change`) via parser → comparar visual side-by-side com ground-truth → quantificar gap
2. **B37**: heurística parser para `phases[]`/`groups[]` baseado em convenções MD (e.g. "## Estágios", "## Fases", "## Decisões")
3. **B38**: heurística parser para multi-lane (`lanes[]` adicional quando actor é router/controller)
4. **B39**: avaliar se gaps fechados justificam regeneração

Manter ground-truth como source-of-truth até B39.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Status:** Decisão registrada — parser é topology source-of-truth, não decoration source-of-truth