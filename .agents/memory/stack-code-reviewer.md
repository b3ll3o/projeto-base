---
name: stack-code-reviewer-memory
description: Memória acumulada do agent stack-code-reviewer — qualidade estrutural por stack (DDD/Hexagonal, NestJS, NextJS, Prisma)
---

# Memória: `stack-code-reviewer`

> Arquivo de memória do agent `stack-code-reviewer`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-22 — Lens DDD/Hexagonal adotada como parte do escopo D11

**Contexto:** ADR-0001 promulgou DDD/Hexagonal como paradigma arquitetural canônico em todo o monorepo.

**Decisão:** stack-code-reviewer incorpora a lens `ddd-domain-purity` / `ddd-application-isolation` / `ddd-infrastructure-conventions` no Passo 1 (auto-detect por path) e aplica 8 regras (3 blockers + 3 majors + 2 minors) documentadas na tabela do agent.

**Consequências:** BC `users` validado end-to-end (HTTP + E2E + 250 testes) com 0 violations; regras executadas em pre-commit (< 5s) + CI.

### 2026-09-22 — Separação `code-reviewer` vs `stack-code-reviewer`

**Contexto:** risco de duplicação entre agents de review.

**Decisão:** stack-code-reviewer é exclusivamente qualidade estrutural por stack (DDD-purity, NestJS, NextJS, Prisma); code-reviewer é qualidade geral (bugs, smells, performance, estilo).

**Consequências:** ambos rodam em paralelo, sem duplicação; cobertura complementar.

### 2026-09-22 — Auto-detect generalizado para `shared/`

**Contexto:** gap conhecido: paths hardcoded cobriam apenas `apps/api/src/modules/**/` mas BCs `shared/audit` (e qualquer futuro `shared/<feature>`) seguem o mesmo padrão `domain/application/infrastructure`.

**Decisão:** generalizar auto-detect para `apps/api/src/{modules,shared}/**/{domain,application,infrastructure}/**` (resolvido em paralelo com esta PR).

**Consequências:** coverage de auditoria DDD/Hexagonal ampliada para shared modules; gap fechado.

## Padrões Descobertos

- Auto-detect por path: `apps/api/src/{modules,shared}/**/domain/**` → `ddd-domain-purity`; `apps/api/src/{modules,shared}/**/application/**` → `ddd-application-isolation`; `apps/api/src/{modules,shared}/**/infrastructure/**` → `ddd-infrastructure-conventions`.
- Regras baseadas em `grep` regex para imports proibidos (`@nestjs/*`, `@prisma/*`, `class-validator`, `class-transformer` em `**/domain/**`) e análise AST para repository / use case / controller.
- Bloqueio proporcional: blocker bloqueia commit; major acumulado > 3 bloqueia PR; minor é warning; info sempre passa.

## Lições Aprendidas

- Velocidade importa — pre-commit < 5s é mandatório; análise pesada só em CI.
- Evidência sempre (linha + trecho + recomendação) — sem isso, findings viram ruído.

## Sugestões de Evolução

- [ ] Adicionar referência canônica ao ADR-0001 no corpo do agent (já parcialmente feita em 2026-09-22 com a skill `ci-defense-in-depth`)
- [ ] Criar variante para Next.js quando o primeiro BC de frontend surgir (Bounded Context → `apps/web/src/features/<bc>/`)