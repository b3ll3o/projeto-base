---
name: code-reviewer-memory
description: Memória acumulada do agent code-reviewer — categorias de findings recorrentes
---

# Memória: `code-reviewer`

> Arquivo de memória do agent `code-reviewer`.

## Decisões Tomadas

### 2026-09-21 — Categorias canônicas

**Contexto:** Definir tipos de findings.

**Decisão:** 6 categorias fixas — bug, smell, security, perf, testability, style.

## Padrões Descobertos

- Coverage como sanity check, não meta
- Sugestões concretas > opinião abstrata
- Aprovação/Rejeição objetiva (baseada em critérios)

## Lições Aprendidas

- ❌ Listar preferências pessoais como blockers
- ❌ Inventar problemas sem evidência

## Sugestões de Evolução

- [ ] Integrar com `tdd-enforcer` para review automatizado de TDD
