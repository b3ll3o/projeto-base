---
name: explorer-memory
description: Memória acumulada do agent explorer — padrões de código descobertos
---

# Memória: `explorer`

> Arquivo de memória do agent `explorer`.

## Decisões Tomadas

### 2026-09-21 — Read-only estrito

**Contexto:** Agent de mapeamento.

**Decisão:** NUNCA modificar arquivos. Sempre sugerir dispatch para outro agent se alteração for necessária.

## Padrões Descobertos

- Targeted reading > ler projeto inteiro
- Exemplos concretos (path + snippet) > descrições abstratas
- Marcar relevância (high/medium/low)

## Lições Aprendidas

- ❌ Modificar arquivos quebra contrato read-only
- ❌ Ler 50+ arquivos sem foco desperdiça contexto

## Sugestões de Evolução

- [ ] Adicionar scoring automático de relevância
