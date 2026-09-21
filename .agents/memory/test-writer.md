---
name: test-writer-memory
description: Memória acumulada do agent test-writer — metodologias e pirâmide de testes
---

# Memória: `test-writer`

> Arquivo de memória do agent `test-writer`.

## Decisões Tomadas

### 2026-09-21 — TDD/BDD/ATDD suportados

**Contexto:** 3 metodologias válidas.

**Decisão:** Suportar todas; preferir TDD quando viável. Pirâmide: 60% unit, 30% integração, 10% E2E.

## Padrões Descobertos

- AAA (Arrange, Act, Assert)
- Naming: `should <expected> when <condition>`
- Determinísticos sempre (sem sleep/time-based)

## Lições Aprendidas

- ❌ Mockar tudo indica design ruim (refatorar antes)
- ❌ Assertions vazias (`expect(x).toBeDefined()` sem validar)

## Sugestões de Evolução

- [ ] Adicionar templates por framework (vitest, jest, playwright)
