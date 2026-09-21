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

## Padrões Descobertos

- Decomposição até caber em agent único
- Dependencies sempre explícitas
- Paralelizar apenas quando sub-tasks independentes

## Lições Aprendidas

- ❌ Pular explorer leva a planos mal fundamentados
- ❌ Esquecer code-reviewer quebra o gating de qualidade

## Sugestões de Evolução

- [ ] Adicionar heurística automática de roteamento baseado em keywords do input
