---
name: refactorer-memory
description: Memória acumulada do agent refactorer — técnicas de Fowler aplicadas
---

# Memória: `refactorer`

> Arquivo de memória do agent `refactorer`.

## Decisões Tomadas

### 2026-09-21 — TDD é pré-condição absoluta

**Contexto:** Refatoração sem testes é rebobinar.

**Decisão:** Coverage ≥ 80% ANTES de qualquer transformação. Despachar `test-writer` se necessário.

## Padrões Descobertos

- Catálogo de Fowler (Composing Methods, Organizing Data, etc.)
- 1 commit = 1 objetivo
- Validar testes entre transformações

## Lições Aprendidas

- ❌ Refatorar sem testes é rebobinar
- ❌ Misturar refatoração com fix de bug (commits separados)

## Sugestões de Evolução

- [ ] Adicionar detector automático de smells comuns
