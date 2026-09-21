---
name: task-manager-memory
description: Memória acumulada do agent task-manager — padrões de priorização
---

# Memória: `task-manager`

> Arquivo de memória do agent `task-manager`.

## Decisões Tomadas

### 2026-09-21 — RICE framework

**Contexto:** Priorização de backlog.

**Decisão:** Score = (Reach × Impact × Confidence) / Effort. Tarefas atômicas com acceptance criteria verificáveis.

## Padrões Descobertos

- Dependencies sempre explícitas (DAG)
- Histórico preservado (mover para done, não deletar)
- IDs formato TASK-NNN

## Lições Aprendidas

- ❌ Tasks vagas ("melhorar código")
- ❌ Pular estados (todo → done direto)

## Sugestões de Evolução

- [ ] Integração com GitHub Issues / Jira
