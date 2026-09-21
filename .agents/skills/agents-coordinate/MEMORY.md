---
name: agents-coordinate-memory
description: Memória acumulada da skill agents-coordinate — decisões sobre o protocolo de handoff e composição
---

# Memória: `agents:coordinate`

> Arquivo de memória da skill `agents:coordinate`. Atualizado após cada evolução relevante do protocolo.

## Decisões Tomadas

### 2026-09-21 — Protocolo v1.0.0 estável

**Contexto:** Lançamento inicial do template projeto-base.

**Decisão:** Estabilizar os campos `dispatch.from`, `dispatch.to`, `task.description`, `expected_output` e `success_criteria` como contrato imutável. Mudanças incompatíveis exigirão major bump.

**Consequências:** Agents podem confiar no schema para parsing. Novas ferramentas de IA integram mais rápido.

### 2026-09-21 — Três modos de composição

**Contexto:** Necessidade de suportar diferentes tipos de coordenação.

**Decisão:** Suportar `sequential`, `parallel` e `hierarchical` como composição canônica. Cada agent DEVE declarar o modo em seu dispatch.

## Padrões Descobertos

- Handoff estruturado (`task/context/expected_output/success_criteria`) elimina ambiguidade entre agents
- `on_failure` deve ser sempre declarado — fallback explícito > retry implícito
- `prior_outputs` permite encadear agents sem perder contexto entre estágios
- `merge_strategy` é essencial em composições paralelas (collect_all, vote, first_success)

## Lições Aprendidas

- ❌ Despachar sem `expected_output` leva a resultados não-parseáveis
- ❌ Pular `success_criteria` permite que agents aprovem trabalho medíocre
- ❌ Misturar composições (sequential + parallel no mesmo pipeline) sem documentar gera bugs sutis

## Sugestões de Evolução

- [ ] Adicionar `cost_estimate` ao schema (tokens esperados por estágio)
- [ ] Suportar `streaming_output` para agents de longa duração
- [ ] Padronizar formato de `prior_outputs` (paths + schemas)
