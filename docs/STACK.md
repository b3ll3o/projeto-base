# STACK.md — Stack do Monorepo Base

> Documento canônico da stack escolhida para este monorepo base. Descreve **tecnologias, versões e justificativas**.
> Configuração ≠ implementação: a stack está documentada aqui, mas os apps `apps/api` e `apps/web` ainda não foram criados.

---

## §1. Visão Geral

```text
projeto-base (monorepo)
├── apps/
│   ├── api/      # NestJS 11 + Fastify + Prisma 6 + PostgreSQL 16
│   └── web/      # Next.js 15 + React 19 + Tailwind 4
├── packages/
│   ├── shared-types/        # Tipos compartilhados front↔back
│   ├── ui/                  # Componentes UI (shadcn/ui)
│   ├── tsconfig/            # tsconfig.base.json canônico
│   └── eslint-config/       # Configuração ESLint compartilhada
├── tooling/
│   └── scripts/             # Scripts utilitários do monorepo
├── infra/                   # Docker Compose, migrations, seeds
└── docs/                    # Esta documentação
```

## §2. Backend — NestJS (`apps/api`)

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Runtime | Node.js | 20 LTS | Estabilidade, suporte longo, async/await maduro |
| Framework | NestJS | 11.x | Estrutura modular, DI nativo, OpenAPI integrado |
| HTTP Adapter | Fastify | (último) | 2-3× mais rápido que Express; menor footprint |
| ORM | Prisma | 6.x | Type-safe, migrations versionadas, excelente DX |
| Banco de Dados | PostgreSQL | 16 | Maduro, JSONB, extensions, performance |
| Validação | class-validator + class-transformer | latest | Padrão de fato em NestJS, integrado com `ValidationPipe` |
| Documentação API | @nestjs/swagger | latest | OpenAPI 3.0 automático a partir dos decorators |
| Auth | @nestjs/jwt + passport-jwt | latest | Padrão da indústria, refresh tokens manuais |
| Filas | BullMQ + Redis | latest | Jobs assíncronos, retries, scheduling |
| Cache | Redis (ioredis) | latest | Compartilhado com BullMQ |
| Logging | Pino | latest | Estruturado JSON, rápido |
| Observabilidade | OpenTelemetry | latest | Vendor-neutral, traces + metrics + logs |
| Testes | Jest + Supertest + Testcontainers | latest | Unit + e2e com Postgres real |

## §3. Frontend — Next.js (`apps/web`)

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Framework | Next.js | 15.x | App Router estável, RSC, Server Actions |
| React | React | 19.x | Concurrent features, use() hook, ações |
| Linguagem | TypeScript | 5.x estrito | Type safety end-to-end |
| Styling | Tailwind CSS | 4.x | Utility-first, zero runtime, tree-shakeable |
| Componentes | shadcn/ui | latest | Copy-paste (não dependência), base em Radix |
| State (URL) | Next router | nativo | Filtros, paginação, tabs na URL |
| Forms | react-hook-form + zod | latest | Client Component + validação tipada |
| Server Actions | nativo | — | Mutações sem JS extra |
| Auth client | NextAuth.js (Auth.js v5) | latest | JWT em cookie HttpOnly + middleware |
| Testes unit | Vitest + Testing Library | latest | Rápido, compatível com Jest API |
| Testes E2E | Playwright | latest | Multi-browser, fixtures robustas |
| Ícones | lucide-react | latest | Tree-shakeable, design consistente |
| Qualidade | Lighthouse | ≥ 90 | LCP < 2.5s, INP < 200ms, CLS < 0.1 |

## §4. Monorepo

| Camada | Escolha | Versão | Justificativa |
|--------|---------|--------|---------------|
| Gerenciador de pacotes | pnpm | 9.x | Workspaces nativos, eficiente em disco, hoisting seguro |
| Orquestrador de build | Turborepo | 2.x | Pipelines declarativos, cache distribuído |
| Versionamento | Changesets | 2.x | Versionamento semântico + changelog automático |
| Lint | ESLint | 9.x (flat config) | Padrão da indústria, plugins vastos |
| Formatação | Prettier | 3.x | Consistência automática |
| Lint Markdown | markdownlint | latest | Conformidade com `.markdownlint.json` |

## §5. Ferramentas de Desenvolvimento

| Categoria | Ferramenta | Uso |
|-----------|-----------|-----|
| Editor | VS Code | Suporte nativo a TS, ESLint, Prisma |
| Container | Docker + Compose | Banco, Redis, serviços locais |
| Git hooks | Husky + lint-staged | TDD enforcer, lint, format |
| CI | (a definir por projeto) | GitHub Actions / GitLab CI |
| Secrets | (a definir por projeto) | Doppler / Vault / 1Password |

## §6. Quando Adicionar Nova Tecnologia

Adicionar nova lib/framework ao monorepo DEVE:

1. Passar por avaliação via `nestjs-specialist`, `nextjs-specialist` ou `monorepo-specialist`
2. Ser declarada em `package.json` do app/package correto
3. Ter justificativa registrada na memória do specialist
4. Passar por `code-reviewer` + `tdd-enforcer`

**Proibido:**

- ❌ Adicionar dependência sem avaliar alternativas
- ❌ Misturar 2 ORMs no mesmo app
- ❌ Adicionar biblioteca que duplica funcionalidade já presente
- ❌ Dependência sem tipo (`@types/*`) ou com `@ts-ignore`

## §7. Quando Substituir Stack

Substituir uma tecnologia (ex.: trocar Prisma por Drizzle) é decisão arquitetural e DEVE:

1. Ser proposta via ADR em `docs/adr/NNNN-titulo.md`
2. Justificar benefício técnico vs. custo de migração
3. Ter plano de migração incremental (apps em paralelo, gradual)
4. Ser aprovada por revisão (mínimo 1 aprovação)

---

**Mantido por:** projeto-base contributors
**Versão da stack:** 1.1.0
