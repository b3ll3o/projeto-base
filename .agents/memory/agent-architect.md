---
name: agent-architect-memory
description: Memória acumulada do agent-architect — decisões sobre criação/evolução de agents
---

# Memória: `agent-architect`

> Arquivo de memória do agent `agent-architect`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-21 — Catálogo inicial criado

**Contexto:** Primeiro lançamento do template projeto-base.

**Decisão:** Criar 9 agents genéricos iniciais cobrindo os domínios mais comuns:

- `orchestrator` — meta-agent para decomposição
- `explorer` — read-only mapeamento de código
- `code-reviewer` — qualidade geral (bugs, smells, performance, style)
- `security-auditor` — OWASP Top 10 + supply chain
- `refactorer` — refatoração TDD-driven
- `test-writer` — TDD/BDD/ATDD
- `tdd-enforcer` — gatekeeper do ciclo TDD
- `doc-writer` — documentação
- `task-manager` — backlog

**Lacunas identificadas (pendentes):**

- `performance-auditor` — N+1, memory leaks, Core Web Vitals
- `db-migrator` — migrations, schema evolution
- `api-designer` — REST/GraphQL/tRPC API design
- `i18n-specialist` — internacionalização, localização
- `a11y-specialist` — acessibilidade WCAG

**Referências consultadas:**

- OWASP Top 10 (2021)
- Kent Beck, *TDD by Example* (2003)
- Robert C. Martin, *Clean Code* / Clean Coders
- Martin Fowler, *Refactoring* (2nd ed.)
- Brendan Gregg, *Systems Performance*
- Google, *Web Vitals*

## Padrões Descobertos

- Agents genéricos funcionam melhor que especialistas ultra-específicos
- Todo agent DEVE ter frontmatter com `name`, `description`, `type`, `tools`
- Limite de 300 linhas força foco e clareza
- Memória por agent permite evolução sem perder contexto

## Lições Aprendidas

- ❌ Criar agent sem pesquisar referências canônicas gera inconsistência
- ❌ Esquecer de atualizar AGENTS.md §3 quebra o catálogo
- ❌ Memory file sem template inicial fica vazio indefinidamente

## Sugestões de Evolução

- [ ] Criar `performance-auditor` (próximo a fazer)
- [ ] Criar template padrão para memory files (evitar esquecimento)
- [ ] Implementar lint automatizado de catálogo (scripts/audit-agents.ts)
- [ ] Adicionar exemplos de dispatch para cada agent
