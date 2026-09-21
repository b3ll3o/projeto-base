# Cadastro de Usuário com Auditoria — Implementation Plan (Índice)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar CRUD de User com auditoria completa (audit fields + soft delete + versionamento + histórico) sob paradigma DDD + Hexagonal obrigatório em todo o monorepo.

**Architecture:** Monorepo pnpm + Turborepo com apps `api` (NestJS 11 + Prisma 6 + Fastify + PostgreSQL 16) e `web` (Next.js 15 + Tailwind 4). Cada entidade de domínio tem 3 tabelas (`X`, `XHistory` com snapshot completo por versão, `XArchive` para lixeira). Auditoria aplicada na camada `application/use-cases` via port `AuditServicePort` (implementação Prisma). Otimistic locking via integer `version` + `If-Match` HTTP. Domain puro (sem imports de framework); infraestrutura implementa ports.

**Tech Stack:**
- Monorepo: pnpm 9.x + Turborepo 2.x + Changesets 2.x
- Backend: NestJS 11 + Fastify + Prisma 6 + PostgreSQL 16 + Testcontainers
- Frontend: Next.js 15 + React 19 + Tailwind 4 + shadcn/ui
- Tests: Jest + Supertest + Testcontainers
- Lint: ESLint 9 (flat config) + custom rule `no-domain-imports-from-infra`
- Hooks: Husky + lint-staged + custom `stack-code-reviewer` + `doc-sync`
- CI: GitHub Actions

**Spec de referência:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-design.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-design.md)

---

## Índice de Fases

Cada fase está dividida em **partes** (≤ 300 linhas cada, conforme convenção do projeto).

| Fase | Foco | Tasks | Esforço | Arquivos |
|------|------|------:|--------:|----------|
| 1 | Foundation monorepo (pnpm, turbo, tsconfig, eslint, shared packages) | 12 | S | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation-part-03.md) · [04](2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation-part-04.md) |
| 2 | Shared audit (domain + port + impl) | 10 | M | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-02-shared-audit-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-02-shared-audit-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-02-shared-audit-part-03.md) |
| 3 | Apps scaffold (api NestJS + web Next.js) | 14 | M | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold-part-03.md) · [04](2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold-part-04.md) |
| 4 | User domain (aggregate + VOs + events + ports) | 15 | M | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain-part-03.md) · [04](2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain-part-04.md) · [05](2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain-part-05.md) |
| 5 | User application (use cases + DTOs) | 14 | M | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application-part-03.md) · [04](2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application-part-04.md) · [05](2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application-part-05.md) |
| 6 | Infrastructure persistence (Prisma + repos + mappers + audit) | 10 | L | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence-part-03.md) · [04](2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence-part-04.md) |
| 7 | Infrastructure HTTP (controllers + RFC 7807) | 8 | M | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-07-user-infra-http-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-07-user-infra-http-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-07-user-infra-http-part-03.md) |
| 8 | Agents automation (stack-code-reviewer + doc-sync) | 8 | M | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-08-stack-code-reviewer-doc-sync-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-08-stack-code-reviewer-doc-sync-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-08-stack-code-reviewer-doc-sync-part-03.md) |
| 9 | Testes E2E ponta-a-ponta | 8 | M | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-09-tests-e2e-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-09-tests-e2e-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-09-tests-e2e-part-03.md) |
| 10 | Docs, ADR, skill, PR | 10 | S | [01](2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing-part-01.md) · [02](2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing-part-02.md) · [03](2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing-part-03.md) · [04](2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing-part-04.md) |

**Total estimado:** ~109 tasks | ~25-40 dias úteis (1 pessoa, TDD disciplinado)

---

## Princípios do Plano

1. **TDD estrito.** Cada task de código é Red → Green → Refactor → Commit.
2. **Frequent commits.** 1 commit por step (não por task).
3. **Ordem topológica.** Domain antes de application antes de infrastructure.
4. **Cobertura por arquivo.** Mínimo: aggregate/VO 100%, use-case ≥95%, repo ≥85%, controller ≥80%.
5. **Commits em inglês, comentários em pt-BR** (convenção do projeto).
6. **Branch única.** Tudo em `feat/cadastro-usuario-com-auditoria`.
7. **PR único ao final.** Squash-merge para `main` após DoD completo.

---

## Convenção de Commits

```text
feat(escopo): descrição em inglês
test(escopo): adicionar testes para X
docs(escopo): atualizar Y
chore(escopo): scaffolding Z
fix(escopo): corrigir W
refactor(escopo): melhorar V
```

Sempre terminar com:

```text
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Critérios de Pronto Globais (DoD)

Cada task é "done" quando:

- [ ] Testes passam (unit + integration + e2e conforme camada)
- [ ] Cobertura atinge mínimo do tipo de arquivo
- [ ] `pnpm lint` + `pnpm typecheck` passam
- [ ] `stack-code-reviewer` aprova (sem blocker)
- [ ] `doc-sync` aprova ou updates aplicados
- [ ] Commit feito com mensagem convencional
- [ ] Branch atualizado com `main`

A feature inteira é "done" quando todos os DoD da Fase 10 estão completos + PR aprovado.

---

## Próximo Passo

Iniciar pela **Fase 1** (foundation):
[fase-01-foundation-part-01](2026-09-21-cadastro-usuario-com-auditoria-fase-01-foundation-part-01.md)
