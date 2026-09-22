---
name: agent-architect-memory
description: Memória acumulada do agent-architect — decisões sobre criação/evolução de agents
---

# Memória: `agent-architect`

> Arquivo de memória do agent `agent-architect`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-21 — Catálogo inicial criado

**Contexto:** Primeiro lançamento do template projeto-base.

**Decisão:** Criar 10 agents genéricos iniciais cobrindo os domínios mais comuns:

- `orchestrator` — meta-agent para decomposição
- `explorer` — read-only mapeamento de código
- `code-reviewer` — qualidade geral (bugs, smells, performance, style)
- `security-auditor` — OWASP Top 10 + supply chain
- `refactorer` — refatoração TDD-driven
- `test-writer` — TDD/BDD/ATDD
- `tdd-enforcer` — gatekeeper do ciclo TDD
- `doc-writer` — documentação
- `task-manager` — backlog

### 2026-09-21 — Specialists de stack adicionados

**Contexto:** projeto-base agora é monorepo base para múltiplos projetos. Stack inicial: NestJS (backend) + Next.js (frontend).

**Decisão:** Criar 3 specialists de stack, alinhados com o monorepo:

- `monorepo-specialist` — workspaces pnpm, Turborepo, Changesets
- `nestjs-specialist` — arquitetura NestJS (Fastify, Prisma, Swagger)
- `nextjs-specialist` — arquitetura Next.js (App Router, RSC, Server Actions)

**Lacunas identificadas (pendentes):**

- `performance-auditor` — N+1, memory leaks, Core Web Vitals
- `db-migrator` — migrations, schema evolution
- `api-designer` — REST/GraphQL/tRPC API design
- `i18n-specialist` — internacionalização, localização
- `a11y-specialist` — acessibilidade WCAG
- `devops-sre` — pipelines CI/CD, observabilidade
- `data-engineer` — modelagem de dados, ETL

**Referências consultadas:**

- OWASP Top 10 (2021)
- Kent Beck, *TDD by Example* (2003)
- Robert C. Martin, *Clean Code* / Clean Coders
- Martin Fowler, *Refactoring* (2nd ed.)
- Brendan Gregg, *Systems Performance*
- Google, *Web Vitals*
- pnpm workspaces & Turborepo docs
- Next.js docs (App Router, RSC, Server Actions)
- NestJS docs (DI, modules, OpenAPI)

### 2026-09-22 — Skill `ci-defense-in-depth` adicionada como habilitador manual

**Contexto:** Plano de robustez do CI (PR #6, 11 commits) implementou defesa em 3 camadas (pre-push local + preflight CI + quality CI gated) com 3 checks estruturais (cross-refs, tsconfig drift, eslint drift). Padrões reutilizáveis identificados: `CheckResult` compartilhado, fixtures herméticas via `fs.mkdtemp`, code-block-aware parsing.

**Decisão:** Criar skill `ci-defense-in-depth` (e convenção companion) em vez de agent dedicado, porque a auditoria de pipeline não exige loop nem memória persistente — é consulta sob demanda. Workflow `release-mode` adicionado como habilitador de bump de versão do template.

**Consequências:**

- Evidência de evolução orgânica via gap real: padrão emergiu de 11 commits de trabalho prático
- Critério de promoção a agent: se > 3 chamadas autônomas/mês forem necessárias (não é o caso hoje)
- Skill `ddd-hexagonal-validation` segue mesmo padrão (skill, não agent) — consistência

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
