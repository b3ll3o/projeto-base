---
name: orchestrator-memory
description: Memória acumulada do agent orchestrator — decisões sobre decomposição de tarefas
---

# Memória: `orchestrator`

> Arquivo de memória do agent `orchestrator`.

## Decisões Tomadas

### 2026-09-21 — Catálogo inicial criado

**Contexto:** Primeiro lançamento.

**Decisão:** Sempre começar com `explorer` antes de planejar; sempre terminar com `code-reviewer` (e `tdd-enforcer` quando código de produção envolvido).

### 2026-11-03 — O agent ganha duas skills de passagem e questionamento

**Contexto:** As skills `grilling` (adaptada de `mattpocock/skills`, MIT) e
`handoff` (mesma origem) entraram no repo.

**Decisão:** As duas pertencem ao orchestrator porque são momentos do
**mesmo gesto**: decidir o que fazer e passar o que ficou.

- `grilling` roda **antes** do despacho, na thread principal (é o usuário
  quem responde; subagent não interage com o usuário), e pergunta só o que
  já pode ser perguntado — a árvore de decisão decide a ordem.
- `handoff` roda **depois**, quando a tarefa não termina na sessão. O
  formato é o **canônico do repo** (`agents-coordinate` §2.3:
  `task`/`context`/`expected_output`/`success_criteria`), e o documento vai
  para `.agents/runs/` versionado — o upstream grava em `$TMPDIR` porque
  lá o handoff é efêmero; aqui ele é o artefato datado da execução.

**A distinção que fica:** `agents-coordinate` é o **protocolo** de despacho
(agora, entre agents); `handoff` é o **artefato** de passagem (depois, para
a próxima sessão). Confundir os dois faz o agente reescrever o plano num
documento — e dois planos divergem.
## Padrões Descobertos

- Decomposição até caber em agent único
- Dependencies sempre explícitas
- Paralelizar apenas quando sub-tasks independentes

## Lições Aprendidas

- ❌ Pular explorer leva a planos mal fundamentados
- ❌ Esquecer code-reviewer quebra o gating de qualidade

## Sugestões de Evolução

- [ ] Adicionar heurística automática de roteamento baseado em keywords do input
