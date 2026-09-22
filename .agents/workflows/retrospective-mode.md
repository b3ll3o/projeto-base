# Workflow: `retrospective-mode` — Captura de Aprendizados Pós-Atividade

> Workflow reutilizável para capturar aprendizados ao final de uma
> grande atividade (implementação, bugfix, adoção de padrão). Detalhes
> completos em [`.agents/specs/conventions/retrospective-capture.md`](../specs/conventions/retrospective-capture.md)
> e skill [`.agents/skills/retrospective-capture/SKILL.md`](../skills/retrospective-capture/SKILL.md).

---

## Trigger

- "capturar aprendizados"
- "retrospectiva"
- "post-mortem da task X"
- Ao final de plano multi-task (auto, via `review-and-fix-after-each-task`)

## Quando usar

| Trigger type | Critério |
|--------------|----------|
| **T1. Implementação grande** | Plano multi-task (≥ 3 tasks) ou feature com skill/agent novo |
| **T2. Bugfix não-trivial** | Bug que exigiu > 30min OU > 2 rounds de review |
| **T3. Adoção de padrão** | Primeiro uso de skill nova (marcado em memory do agent) |

**Não dispara** para: typo fix, dep bump, merge conflict resolution,
patch de doc-only sem decisão arquitetural.

## Composição

Sequential 3 estágios:

```text
EXPLORER (coleta)  →  RETROSPECTIVE-CAPTURE (analisa)  →  DOC-WRITER (escreve)
```

Em paralelo ao estágio final, [TASK-MANAGER] prepara backlog das
proposals filtradas (confidence ≥ 70).

## Handoffs

```yaml
explorer → retrospective-capture (skill):
  task: "Coletar evidência: diff, conversation, memory state"
  context:
    - "git diff <baseline>..HEAD --stat e full diff"
    - "conversation log do orquestrador"
    - "estado atual dos memory files dos agents envolvidos"
  expected_output: { raw_evidence: {...} }
  success_criteria: "Diff + memories + 3 decisões/patterns mínimos"

retrospective-capture (skill) → doc-writer:
  task: "Escrever result file + filtrar proposals por confidence"
  context: ["raw_evidence do explorer", "threshold = 70"]
  expected_output:
    result_file: "memory/b<N>+1-result.md"
    proposals:
      - artifact: "skill|convention|memory|adr|backlog"
        target: "<path>"
        confidence: 0..100
        content: "<yaml>"
  success_criteria: "0 proposals com confidence < 70; result file ≤ 300 linhas"

doc-writer + task-manager (parallel):
  task: "Codificar proposals filtradas em artefatos duráveis"
  context: ["proposals filtradas pela skill retrospective-capture"]
  expected_output:
    - "Memories atualizadas: git diff visível em <agent>.md"
    - "PR opcional (feat(retrospective)) com skills/conventions novos"
  success_criteria: "Cada proposal com confidence ≥ 70 virou: (memory update) OR (PR) OR (item de backlog)"
```

### Passo Pós-Implementer: Despachar review-router

Após implementer reportar DONE:

1. Validar inputs (skill `review-routing` Passo 1)
2. Despachar `review-router` via Agent tool
3. Aguardar output em `.agents/runs/<timestamp>-review-<n>.yaml`
4. Triage conforme skill (Passo 4)
5. Se BLOCKING/IMPORTANT → dispatch fix-implementer (Passo 5)
6. Re-rodar router após fix
7. Avançar quando router retornar 0 BLOCKING/IMPORTANT

## Quando NÃO usar

- Atividades triviais (typo, dep bump) — overhead puro
- Quando o plano ainda está em curso (executar retrospectiva quando
  pelo menos o ciclo review+fix já foi aprovado)
- Como substituto para `task-mode` (gestão de backlog sem retrospectiva)

## Critérios de Done

- [ ] Result file escrito em `memory/b<N>+1-result.md` com frontmatter
      + linked memories
- [ ] 0 proposals com confidence < 70 (abaixo disso vira comentário no result)
- [ ] Memory files dos agents envolvidos atualizados (git diff verificável)
- [ ] PR opcional aberto se proposals de harness (skills/conventions)
- [ ] `MEMORY.md` index atualizado com apontador para o result
- [ ] `pnpm ci:preflight` passa (cross-refs em `memory/`, agents, skills
      — exceto memory dir que fica fora do repo)

## Cross-references

- [`.agents/specs/conventions/retrospective-capture.md`](../specs/conventions/retrospective-capture.md)
- [`.agents/skills/retrospective-capture/SKILL.md`](../skills/retrospective-capture/SKILL.md)
- [`.agents/specs/conventions/agent-evolution-and-memory.md`](../specs/conventions/agent-evolution-and-memory.md) (convenção relacionada — como memories são mantidas)
- [`.agents/specs/conventions/tamanho-e-revisao.md`](../specs/conventions/tamanho-e-revisao.md) (limite 300 linhas para memory files)
- [`.agents/WORKFLOWS.md`](../WORKFLOWS.md) (este workflow aparece na tabela de Genéricos)
