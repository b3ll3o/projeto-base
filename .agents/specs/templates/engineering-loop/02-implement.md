---
name: engineering-loop-02-implement
version: 1.0
updated: 2026-09-30
description: "Fase 2 do Engineering Loop — Implement. Registra diff resumido, commits atômicos, conformidade com BR/AC e lens DDD/Hexagonal aplicada."
phase: 02-implement
gate: true (review bloqueia merge se vazio)
owner: nestjs-specialist | nextjs-specialist | monorepo-specialist (stack-specific)
related:
  - ../../../conventions/engineering-loop.md
  - ../../../conventions/evals.md
  - ../../../conventions/estrutura-e-versionamento.md
  - ./01-understand.md
usage: |
  Copie para specs/<NNN>-<feature>/engineering-loop/02-implement.md
  Preencha durante/após implementação (antes de abrir PR).
---

# Fase 02 — Implement

> **Propósito:** documentar **o que** foi implementado, **em que ordem** (commits atômicos), e **como** respeita as decisões da fase 01 (lens DDD/Hexagonal, Bounded Contexts, invariantes).

## 1. Spec origem

- [`../spec.md`](../spec.md)
- [`./01-understand.md`](./01-understand.md) (deve estar preenchido)

## 2. Commits atômicos (ordem cronológica)

<!-- Liste os commits na ordem em que foram feitos. Cada commit deve ter escopo atômico. -->

| # | SHA curto | Conventional commit                              | Arquivos principais                          |
|---|-----------|--------------------------------------------------|----------------------------------------------|
| 1 | `<abc123>`| `feat(<bc>): create <entity> entity (RED)`       | `apps/api/src/<bc>/domain/<entity>.entity.ts` |
| 2 | `<def456>`| `feat(<bc>): <use-case> with happy path (GREEN)` | `apps/api/src/<bc>/application/use-cases/`   |
| 3 | `<ghi789>`| `feat(<bc>): prisma repository for <entity>`     | `apps/api/src/<bc>/infrastructure/prisma/`   |
| 4 | `<jkl012>`| `feat(<bc>): <controller> with validation`       | `apps/api/src/<bc>/infrastructure/http/`     |
| 5 | `<mno345>`| `refactor(<bc>): extract <helper>`               | `apps/api/src/<bc>/`                         |

## 3. Conformidade com BR/AC

<!-- Cada BR/AC da spec.md deve ser endereçada. -->

| BR/AC   | Endereçado em (arquivo)                       | Conformidade       |
|---------|-----------------------------------------------|--------------------|
| BR-001  | `apps/api/src/<bc>/domain/<entity>.entity.ts` | ✅ respeitada      |
| BR-002  | `apps/api/src/<bc>/application/use-cases/`    | ✅ respeitada      |
| AC-001  | `apps/api/src/<bc>/infrastructure/http/<controller>.ts` | ✅ respeitada |

## 4. Lens DDD/Hexagonal aplicada

<!-- Apenas se aplicável (nestjs-specialist, nextjs-specialist). -->

- [ ] **Domain layer** não importa nada de `infrastructure/` ou `application/`
- [ ] **Application layer** depende apenas de `domain/` (ports)
- [ ] **Infrastructure layer** implementa ports de `application/`
- [ ] **Bounded Context boundary** respeitada (sem imports cross-context)
- [ ] **Audit fields** (`createdAt`, `updatedAt`, `createdBy`, `updatedAt`) presentes em entities

## 5. Pontos de extensão deixados

<!-- Onde o próximo agent pode estender sem refatorar. -->

- `<ex: novo campo em <entity> via migration + update repository>`
- `<ex: novo endpoint em <controller> via decorator + dto>`

## 6. Diff resumido

```bash
# Comando para reproduzir
git log --oneline <baseline>..<head> | wc -l   # N commits
git diff --stat <baseline>..<head>              # stats resumidas
```

- **N commits:** `<ex: 7>`
- **Linhas adicionadas:** `<ex: +412>`
- **Linhas removidas:** `<ex: -87>`
- **Arquivos criados:** `<ex: 5>`
- **Arquivos modificados:** `<ex: 3>`

## 7. Saída esperada (handoff para fase 03)

- [ ] Tabela §2 completa com SHA real
- [ ] Tabela §3 sem linhas "não-endereçado"
- [ ] §4 100% verde (lens DDD/Hexagonal)
- [ ] §6 diff stats consistente com `git diff`

---

**Próxima fase:** [`03-test.md`](./03-test.md)
