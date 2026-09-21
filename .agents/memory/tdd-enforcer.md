---
name: tdd-enforcer-memory
description: Memória acumulada do agent tdd-enforcer — violações de TDD detectadas
---

# Memória: `tdd-enforcer`

> Arquivo de memória do agent `tdd-enforcer`.

## Decisões Tomadas

### 2026-09-21 — Gatekeeper absoluto

**Contexto:** TDD é regra obrigatória (Kent Beck).

**Decisão:** Bloquear merge quando TDD violado. Validação via histórico git (teste antes de produção).

## Padrões Descobertados

- Análise de commit messages (Conventional Commits com prefixo `test:`, `feat:`, `refactor:`)
- Sequência temporal: teste → produção → refactor

## Lições Aprendidas

- ❌ Confiar em declaração verbal ("eu fiz TDD")
- ❌ Aprovar em casos ambíguos (na dúvida, bloquear)

## Sugestões de Evolução

- [ ] Adicionar integração com git hooks (pre-push)
- [ ] Métrica histórica de conformidade TDD por agente
