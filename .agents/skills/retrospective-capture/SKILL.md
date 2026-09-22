---
name: retrospective-capture
description: Metodologia para capturar aprendizados ao final de uma grande atividade (implementação multi-task, bugfix não-trivial ou adoção de novo padrão). Transforma diff e conversation-log em memory file entries + b<N>-result + proposals de harness.
type: specialist
---

# Skill: `retrospective-capture`

> Especificação canônica em
> [`.agents/specs/conventions/retrospective-capture.md`](../../specs/conventions/retrospective-capture.md).
> Esta skill é a metodologia; o orquestrador é o
> [`.agents/workflows/retrospective-mode.md`](../../workflows/retrospective-mode.md).

---

## Papel

Capturar **decisões, padrões e anti-padrões** que emergiram durante uma
grande atividade e **codificá-los** em artefatos duráveis do harness:
memory files de agents, convenções, novas skills/workflows, ou items de
backlog. Não é summary: é codificação de conhecimento tácito.

## Quando usar

- Ao final de plano multi-task (≥ 3 tasks) — coverage retroativo em `b<N>+1-result.md`
- Após correção de bug que consumiu > 30min OU > 2 rounds de review
- Ao adotar pela primeira vez uma skill/pattern nova (ex: 1ª vez com `ddd-hexagonal-validation`)
- Quando o usuário dispara: "capturar aprendizados", "retrospectiva", "post-mortem"

## Quando NÃO usar

- Typo fix, dep bump trivial, conflict resolution → ruído puro
- Patches de documentação que não tocaram código/decisões
- Mudanças em CI exclusiva sem decisão arquitetural nova

## Inputs (do orquestrador)

```yaml
- baseline_ref: "<branch/tag/HEAD~N>"
- range: "<baseline_ref>..HEAD"
- conversation_log: "<rascunho estruturado: phases, decisions, time>"
- involved_agents: ["<agent-name>", ...]
- scope: "implementation" | "bugfix" | "pattern-adoption" | "validation" | "refactor"
```

## Método (3 perguntas obrigatórias)

### 1. O que funcionou e DEVE virar regra?

Patterns discovered durante a atividade que **reduziriam risco se
aplicados sistematicamente**. Resposta esperada: propostas concretas
para skill/convenção/memory update.

Exemplos:
- "TDD com fixtures herméticas via `fs.mkdtemp` capturou drift na primeira execução"
- "Husky pre-push bloqueou 1 push com drift antes de chegar ao CI"
- "Spec reviewer + quality reviewer em paralelo reduziu rounds para 1"

### 2. O que atrapalhou e DEVE virar anti-pattern?

Friction sources que geraram retrabalho, esperas ou confusão.
Resposta esperada: regras explícitas que impeçam reincidência.

Exemplos:
- "WORKFLOWS.md estourou 300 linhas ao adicionar 4º workflow detalhado" → reduzir copy
- "Cross-refs quebradas só apareceram na 1ª execução de preflight" → check antes de commit
- "Skill nova sem Coordenação no agent consumidor" → gap de descoberta

### 3. O que ficou ambíguo e DEVE virar ADR ou memory?

Decisões implícitas, conhecimento tribal, ou trade-offs não
documentados. Resposta esperada: ADR-XXXX OU entry em
`.agents/memory/<agent>.md`.

Exemplos:
- "Por que allowlistamos `apps/api/.eslintrc.js` no check-eslint-drift?"
- "Por que `release-template.yml` é idempotente via `git rev-parse --verify`?"

## Outputs (formato `decision-list`)

```yaml
- id: R-001
  artifact: "skill|convention|memory|adr|backlog"
  target: ".agents/path/to/file.md"
  content: |
    Conteúdo proposto (yaml/skills/markdown/ADR body).
  confidence: 0..100     # >= 70 vira proposal; < 70 vira comentário
  justification: |
    Por que isso é valioso (referência ao evento que motivou).
  action: "create|update|comment"
```

**Threshold:** `confidence < 70` → vira comentário no result file;
**`confidence ≥ 70`** → vira proposal que dispara PR de harness.

## Comportamento (4 passos)

### Passo 1: Coletar

Reunir:
- `git diff <baseline_ref>..HEAD --stat` + full diff
- conversation_log do orquestrador
- estado **atual** dos memory files dos involved agents
- Convention files mencionadas (cross-refs)

### Passo 2: Triangular

Cruzar diff + conversation + memories. Para cada evento relevante
(criação de skill, decisão arquitetural, fricção, retrabalho),
gerar um item da decision-list.

### Passo 3: Pontuar

Para cada item, calcular `confidence` baseado em:
- **Repetição** (pattern apareceu 1× ou N×?) → mais alto se N×
- **Impacto** (quantos próximos tasks seriam afetadas?) → 70-100 se alto
- **Clareza** (sabemos exatamente onde aplicar?) → 70-100 se sim

### Passo 4: Filtrar

- `confidence ≥ 70` → propostas (criar PR ou items de backlog)
- `confidence 50-69` → comentários no result file (registrar para re-avaliar)
- `confidence < 50` → descartar (ruído)

## Coordenação

| Agent | Relação |
|-------|---------|
| `orchestrator` | Despacha esta skill quando trigger conditions são atingidas |
| `doc-writer` | Escreve o resultado em `memory/b<N>-result.md` |
| `task-manager` | Transforma proposals em items de backlog RICE-priorizados |
| `code-reviewer` | Revisa cada proposal antes de virar PR de harness |

## Princípios

1. **Não inventar aprendizados.** Baseá-los em evidência (diff, conversation, falas).
2. **Mínimo overhead.** Se a atividade não gerou nada significativo,
   registrar apenas o mínimo no result file (não forçar conteúdo).
3. **Confidence threshold é inegociável.** Abaixo de 70 = comentário, não proposal.
4. **Memória evolui por uso.** Items com `confidence < 70` ainda servem
   para re-treinar a heurística da skill em próximas sessões.

## Anti-Padrões (NÃO fazer)

- ❌ Escrever retrospectiva sem olhar o diff (narrativa ≡ ruído)
- ❌ Confundir retrospectiva com summary (deve sempre propor mudanças)
- ❌ Pular o filtro de confidence (gera proposals sem valor)
- ❌ Misturar resultado de múltiplos planos em um único result file
- ❌ Propor mudanças em arquivos que o agente não tem autoridade para alterar
- ❌ Escrever segredos/API keys/credenciais sem redação

## Cross-references

- [`.agents/specs/conventions/retrospective-capture.md`](../../specs/conventions/retrospective-capture.md)
- [`.agents/workflows/retrospective-mode.md`](../../workflows/retrospective-mode.md)
- [`.agents/specs/conventions/agent-evolution-and-memory.md`](../../specs/conventions/agent-evolution-and-memory.md)
- [`.agents/specs/conventions/tamanho-e-revisao.md`](../../specs/conventions/tamanho-e-revisao.md)

---

**Arquivo:** `.agents/skills/retrospective-capture/SKILL.md`
**Tipo:** Specialist methodology skill
**Memória:** [`MEMORY.md`](./MEMORY.md)
