# 06 — Impacto Cross-Cutting + Mudanças Globais

> Documento: parte do design [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)

## §1. Novos Artefatos a Criar

| Tipo | Localização | Propósito |
|------|-------------|-----------|
| ADR | `docs/adr/0001-arquitetura-ddd-hexagonal.md` | Justificar decisão arquitetural DDD/Hexagonal |
| Skill | `.agents/skills/ddd-hexagonal-validation/SKILL.md` | Checklist automatizado de validação |
| Skill | `.agents/skills/audit-fields-convention/SKILL.md` | Convenções de audit fields (helper) |
| Agent | `.agents/agents/stack-code-reviewer.md` | **D11** — revisão automática por stack em toda alteração |
| Agent | `.agents/agents/doc-sync.md` | **D12** — sincronização automática de docs em toda alteração |
| ESLint rule | `tooling/eslint-config/rules/no-domain-imports-from-infra.js` | Bloquear imports proibidos em `**/domain/**` |
| Husky hook | `.husky/pre-commit` | Dispara `stack-code-reviewer` + `doc-sync` automaticamente |
| CI workflow | `.github/workflows/review-stack.yml` | CI: `stack-code-reviewer` em PR |
| CI workflow | `.github/workflows/sync-docs.yml` | CI: `doc-sync` em PR + auto-commit updates |
| Shared module | `apps/api/src/shared/audit/` | Módulo de auditoria reutilizável (domain + application + infrastructure) |
| Shared module | `apps/api/src/shared/domain/` | VOs base (`EntityId`, `Version`, `AuditMetadata`) |
| OpenAPI | `apps/api/openapi.json` | Contrato HTTP exportado |

## §2. Artefatos a Atualizar

| Arquivo | Mudança |
|---------|---------|
| `docs/MONOREPO.md` | §11 — Estrutura obrigatória por app (DDD/Hexagonal) |
| `docs/STACK.md` | Nota de paradigma DDD/Hexagonal obrigatório |
| `docs/TEMPLATE_USAGE.md` | Mencionar DDD/Hexagonal como default |
| `AGENTS.md` §3.2 | Atualizar lens dos specialists |
| `.agents/specs/conventions/estrutura-e-versionamento.md` | Regra canônica DDD/Hexagonal |
| `.agents/agents/nestjs-specialist.md` | Adicionar lens "DDD/Hexagonal" |
| `.agents/agents/monorepo-specialist.md` | Validar estrutura de módulos |
| `apps/api/prisma/schema.prisma` | Adicionar models `User`, `UserHistory`, `UserArchive`, enum `AuditOperation` |
| `pnpm-workspace.yaml` | (já cobre; revisar globs) |
| `turbo.json` | Adicionar tasks `tdd:check`, `test:integration`, `test:e2e` |
| `tsconfig.base.json` | Path alias para `shared/*`, `modules/*` |

## §3. Novos Apps a Scaffolar

Como pré-requisito da feature, o monorepo precisa ter os apps inicializados:

### §3.1 `apps/api` (NestJS 11)

```text
apps/api/
├── package.json
├── tsconfig.json (extends ../../tsconfig.base.json)
├── nest-cli.json
├── prisma/
│   └── schema.prisma
├── src/
│   ├── main.ts                    # Bootstrap (Fastify adapter)
│   ├── app.module.ts              # Root module
│   ├── modules/                   # DDD modules
│   │   └── users/
│   ├── shared/
│   │   ├── audit/
│   │   └── domain/
│   ├── infrastructure/
│   │   ├── http/
│   │   │   └── filters/          # Exception filter global (RFC 7807)
│   │   ├── persistence/
│   │   │   └── prisma.service.ts
│   │   └── auth/
│   │       └── jwt-auth.guard.ts
│   └── config/
│       └── env.schema.ts         # Zod validation de env vars
├── test/
│   ├── jest-e2e.json
│   └── users.e2e-spec.ts
└── Dockerfile
```

### §3.2 `apps/web` (Next.js 15 + Tailwind 4)

```text
apps/web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── app/
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Home
│   ├── globals.css                # Tailwind directives
│   └── users/
│       ├── page.tsx               # Listagem
│       ├── [id]/page.tsx          # Detalhe
│       └── [id]/history/page.tsx  # Histórico
├── components/
│   ├── ui/                        # shadcn/ui
│   └── user-card.tsx
└── lib/
    └── api-client.ts              # fetch wrapper com auth
```

### §3.3 Pacotes Compartilhados

```text
packages/
├── shared-types/        # Tipos de contrato (UserDto, etc) — front↔back
├── tsconfig/            # tsconfig.base.json
├── eslint-config/       # ESLint flat config + rules custom
└── ui/                  # Componentes shadcn/ui compartilhados
```

## §4. Coordenação de Agents

### §4.1 Workflow Recomendado

```text
orchestrator → monorepo-specialist (scaffold monorepo + apps)
            → nestjs-specialist (design + implementar módulo users)
            → test-writer (TDD)
            → stack-code-reviewer (D11 — lens de stack automático)
            → code-reviewer (revisão geral)
            → doc-sync (D12 — sincroniza docs após code change)
            → tdd-enforcer (bloqueio se coverage < mínimo ou RED sem GREEN)
```

**Diferença:** `stack-code-reviewer` e `doc-sync` rodam **automaticamente** em pre-commit + CI em **toda alteração de código** (D11 + D12), não apenas no workflow manual.

### §4.2 Agents Atualizados

- **`orchestrator`**: detecta tarefas multi-stack e despacha specialists em ordem.
- **`monorepo-specialist`**: valida estrutura `domain/application/infrastructure`; audita isolamento de apps.
- **`nestjs-specialist`**: ganha lens DDD/Hexagonal — audita limites de camada em PRs.
- **`nextjs-specialist`**: implementa `apps/web` consumindo `packages/shared-types`.
- **`stack-code-reviewer`** (D11 — NOVO): roda automaticamente em toda alteração; detecta violações de padrão de stack (NestJS, NextJS, Prisma, DDD/Hexagonal). Substitui parte do trabalho que era do `code-reviewer` mas com lente específica da stack.
- **`doc-sync`** (D12 — NOVO): roda automaticamente após code change; revisa/atualiza/cria docs afetadas. Complementa `doc-writer` (que escreve sob demanda) com sincronização contínua.
- **`tdd-enforcer`**: bloqueia merge se coverage < mínimo ou TDD não respeitado.
- **`code-reviewer`**: agora foca em qualidade geral (não duplica lens de stack — isso é do `stack-code-reviewer`).

### §4.3 Skill Nova: `ddd-hexagonal-validation`

Checklist automatizado:

- [ ] Todo módulo tem `domain/application/infrastructure`?
- [ ] `domain/` importa apenas de `typescript` (sem `@nestjs/*`, `@prisma/*`)?
- [ ] `application/` não importa de `infrastructure/`?
- [ ] Repositórios retornam entidades (não models Prisma)?
- [ ] Existe mapper Prisma → domínio?
- [ ] Use cases têm testes unitários com mocks de ports?
- [ ] `application/ports/*.ts` define interfaces?
- [ ] `infrastructure/` implementa os ports?

## §5. Estimativa de Esforço (ordem de grandeza)

| Fase | Esforço | Tipo |
|------|---------|------|
| ADR + Skill + ESLint rule | S (~1-2 dias) | Setup |
| Scaffold `apps/api` (NestJS + Prisma + módulo vazio) | M (~3-5 dias) | Setup |
| Scaffold `apps/web` (Next.js + Tailwind) | S (~1-2 dias) | Setup |
| Shared types, tsconfig, eslint-config packages | S (~2 dias) | Setup |
| Domain (User aggregate + VOs + events) | M (~3-5 dias) | TDD |
| Application (use cases + ports) | M (~3-5 dias) | TDD |
| Infrastructure (Prisma repos + mappers + controllers) | L (~5-7 dias) | TDD |
| Shared audit module (cross-cutting) | M (~3-5 dias) | TDD |
| Tests e2e + integration | M (~3 dias) | TDD |
| Docs + ADR + PR review | S (~1-2 dias) | Finalização |

**Total estimado:** ~25-40 dias úteis (1 pessoa, com TDD disciplinado).

## §6. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| TDD discipline quebrar sob pressão | Qualidade | Skill `tdd-enforcer` + hook pre-commit + CI |
| Domain acumular dependências de framework | Arquitetura | ESLint rule + skill `ddd-hexagonal-validation` |
| Snapshot JSONB crescer demais | Performance | Política de retenção (v2): compactar snapshots após 1 ano |
| Optimistic locking causar conflitos excessivos | UX | ETag em todas as respostas; cliente trata 409 com retry |
| Restore parcial deixar estado inconsistente | Integridade | Transação Prisma + `previousVersion` validado |
| Auditoria em massa (bulk operations) | Performance | Audit em batch com `prisma.createMany` (v2) |

## §7. Próximos Passos Operacionais

1. ✅ Aprovar este design (user review).
2. → Invocar skill `superpowers:writing-plans` para gerar plano de implementação.
3. → Implementar em ciclos TDD Red→Green→Refactor.
4. → PR para `main` após DoD completo.

---

**Próximo:** [`07-referencias.md`](./2026-09-21-cadastro-usuario-com-auditoria-07-referencias.md) (não necessário; referências estão no índice)

**Voltar ao índice:** [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)
