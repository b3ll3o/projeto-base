# Fase 10 — Docs, ADR, Skill e PR Final

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-06-impacto-cross-cutting.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-06-impacto-cross-cutting.md)
> **Foco:** Criar ADR documentando a decisão, skill de validação DDD/Hexagonal, atualizar docs de impacto, validar DoD global e abrir PR.
> **Pré-requisitos:** Fases 1-9.

---

## Task 10.1: ADR-0001 — Arquitetura DDD + Hexagonal + Auditoria completa

**Files:**
- Create: `docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`

- [ ] **Step 1: Criar ADR**

```markdown
# ADR-0001: Arquitetura DDD + Hexagonal + Auditoria completa

- **Status:** Aceito
- **Data:** 2026-09-21
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-design.md`](../superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-design.md)

## Contexto

Implementação do cadastro de usuários no monorepo `projeto-base` exige:

1. **Audit fields obrigatórios** em todas as entidades (`createdAt/By`, `updatedAt/By`, `version`).
2. **Soft delete + restore** com rastreabilidade de quem deletou e por quê.
3. **Histórico completo** de todas as versões anteriores.
4. **Concorrência segura** (dois clients editando o mesmo recurso).
5. **Camadas bem definidas** que possibilitem trocar ORM, framework, transporte.

A solução precisa funcionar em NestJS (backend) e ser compatível com a evolução do front (Next.js).

## Decisão

Adotamos **DDD + Hexagonal (Ports & Adapters)** como paradigma obrigatório em todo o monorepo, com:

### Estrutura obrigatória

```text
apps/api/src/modules/<feature>/
  domain/         # TypeScript puro, zero framework
  application/    # Use cases, depende só de ports
  infrastructure/ # http/, persistence/
```

### Auditoria via 3 tabelas por entidade

```text
users          # estado atual (1 linha por entidade)
users_history  # 1 linha por versão (snapshot JSONB)
users_archive  # lixeira viva (soft delete)
```

Convenção obrigatória: ao criar `X`, criar também `XHistory` e `XArchive`.

### Optimistic locking

- Campo `version: Int` em toda entidade.
- HTTP usa header `If-Match: W/"v<N>"` para PATCH/DELETE/restore.
- Resposta de sucesso retorna header `ETag: W/"vN"`.
- Conflito → `412 Precondition Failed` com code `CONCURRENCY_CONFLICT`.

### Ports & Adapters

- `AuditServicePort` (interface) — implementações `InMemoryAuditService` (tests) e `PrismaAuditService` (prod).
- `UserRepositoryPort` (interface) — implementações `InMemoryUserRepository` (tests) e `PrismaUserRepository` (prod).
- Use cases só conhecem ports; DI wire em `UsersModule`.

### Auditoria transversal

- `AuditContext` (VO) propagado via `AsyncLocalStorage` no escopo da request.
- Use cases gravam `record()` (history) e `archive()` (archive) via port.
- Eventos de domínio (`UserCreated`, `UserUpdated`, `UserDeleted`, `UserRestored`) são emitidos pelo aggregate.

## Consequências

### Positivas

- **Testabilidade.** Domain puro (100% coverage) + use cases com mocks.
- **Troca fácil de ORM.** `PrismaUserRepository` pode ser substituído por TypeORM/Sequelize.
- **Evolução de stack.** Front em qualquer framework consome API HTTP.
- **Auditoria pronta.** Qualquer entidade segue o mesmo padrão.
- **Agents automáticos.** `stack-code-reviewer` valida pureza do domain via ESLint custom rule.

### Negativas

- **Mais código boilerplate.** Mapper, port, impl real, impl in-memory.
- **Onboarding mais lento.** Time precisa entender DDD + Hexagonal.
- **Decisões explícitas.** Onde colocar uma classe? Domain vs application? (skill de validação resolve)

### Trade-offs aceitos

- 3 tabelas por entidade (vs 1 com JSON histórico): escolhida para queries simples + soft delete rápido.
- AsyncLocalStorage para AuditContext (vs param explícito): escolhida para manter use cases limpos.

## Validação contínua

1. **ESLint rule** `ddd-hexagonal/no-domain-imports-from-infra` bloqueia imports proibidos em `domain/`.
2. **Skill** `ddd-hexagonal-validation` valida boundaries em auditoria manual.
3. **Agent** `stack-code-reviewer` aplica checks automáticos em pre-commit + CI.
4. **Coverage mínima** por camada: 100% domain, ≥90% application, ≥80% infrastructure.

## Alternativas consideradas

### A1: CRUD tradicional com NestJS services

- ❌ Mistura regra de negócio com ORM.
- ❌ Auditoria manual repetida em cada endpoint.
- ❌ Não escala para múltiplas entidades.

### A2: Event sourcing puro

- ❌ Complexidade alta para o caso de uso.
- ❌ Necessário reprojetar queries.
- ❌ Reconstruir estado a cada leitura é caro.

### A3: 1 tabela com JSON column de histórico

- ❌ Soft delete + restore mais complexo.
- ❌ Queries paginadas do histórico custosas.
- ❌ Single source of truth = single point of failure.

## Notas de migração

Para cada entidade existente adicionar:

1. Colunas `createdAt/By`, `updatedAt/By`, `version` (default 1).
2. Tabela `<entity>_history` com snapshot JSONB.
3. Tabela `<entity>_archive` para soft delete.
4. Aggregate + port `UserRepositoryPort`-like.
5. Use cases CRUD + `Restore<entity>`.
6. Endpoints HTTP com If-Match.

## Referências

- Vaughn Vernon — Implementing Domain-Driven Design
- Eric Evans — Domain-Driven Design
- Alistair Cockburn — Hexagonal Architecture
- Prisma docs — [prisma.io](https://www.prisma.io)
- RFC 7807 — Problem Details for HTTP APIs
- RFC 7232 — HTTP Conditional Requests (If-Match / ETag)
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md
git commit -m "docs(adr): add ADR-0001 DDD+Hexagonal+Audit architecture decision

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10.2: Skill `ddd-hexagonal-validation`

**Files:**
- Create: `.agents/skills/ddd-hexagonal-validation/SKILL.md`

- [ ] **Step 1: Criar skill**

```markdown
---
name: ddd-hexagonal-validation
description: Use when validating that a module follows the DDD + Hexagonal architecture mandated by the project. Audits folder structure, imports, dependency direction, and layer responsibilities. Triggers on requests like "validar DDD/Hexagonal", "auditar módulo", "verificar boundaries", "revisar arquitetura do módulo", "is this layer clean?"
type: specialist
tools: Read, Glob, Grep, Bash
---

# Skill: `ddd-hexagonal-validation`

## Quando usar

- Antes de finalizar uma feature que toca `apps/api/src/modules/<feature>/`.
- Em code review focado em arquitetura (não em bugs/segurança/performance).
- Em auditoria periódica de módulos para garantir conformidade.
- Quando suspeitar de mistura de camadas.

## Quando NÃO usar

- Para revisar código genérico (use `code-reviewer`).
- Para auditoria de segurança (use `security-auditor`).
- Para auditoria de testes isoladamente (use `analista-qualidade`).

## Inputs

```yaml
module_path: "apps/api/src/modules/users"
```

## Estrutura obrigatória

```text
<module_path>/
  domain/         # TypeScript puro, zero framework
    *.aggregate.ts
    value-objects/*.vo.ts
    events/*.event.ts
    ports/*.port.ts
    exceptions/*.exceptions.ts
  application/    # Orquestra fluxos via ports
    use-cases/*.use-case.ts
    dto/*.dto.ts
    mappers/*.mapper.ts
  infrastructure/ # Implementa ports (ORM, HTTP)
    http/*.controller.ts
    persistence/*.repository.ts
```

## Validações por camada

### `domain/`

- ✅ Pode importar: outros arquivos do mesmo domain, `shared/domain/*`.
- ❌ NÃO pode importar: `@nestjs/*`, `@prisma/*`, `class-validator`, `class-transformer`, `rxjs`, arquivos em `infrastructure/`.
- ✅ Aggregates expõem factory method estático (`User.criar()`).
- ✅ Value Objects são imutáveis (`Object.isFrozen(vo) === true`).
- ✅ Ports são apenas `interface` (não classes).
- ✅ Exceptions são classes puras (sem decorators NestJS).

### `application/`

- ✅ Pode importar: `domain/*`, `shared/*`.
- ❌ NÃO pode importar: `infrastructure/*`.
- ✅ Use cases recebem ports via constructor (DI).
- ✅ Use cases retornam DTOs (não entidades) para a camada HTTP.
- ❌ Use cases NÃO contêm `try/catch` — deixa exceptions subirem.

### `infrastructure/`

- ✅ Pode importar: `domain/*`, `application/*`, `shared/*`, frameworks.
- ✅ Repositories implementam ports do domain.
- ✅ Repositories usam `Mapper` para converter row ↔ aggregate.
- ✅ Mappers são funções puras (sem side effects).
- ✅ Controllers delegam 100% para use cases.
- ✅ Controllers têm decorators Swagger.

## Checklist de auditoria

```markdown
- [ ] Estrutura de pastas correta (domain/application/infrastructure)
- [ ] Domain não importa frameworks (rodar `stack-code-reviewer`)
- [ ] Application não importa infrastructure
- [ ] Cada aggregate tem port correspondente
- [ ] Implementações de port usam Mappers
- [ ] Value Objects são imutáveis
- [ ] Exceptions de domínio não dependem de framework
- [ ] Use cases não têm try/catch
- [ ] Controllers são < 100 linhas por método
- [ ] Cobertura por camada atinge mínimo (100% / 90% / 80%)
```

## Comportamento

### Passo 1: Inspecionar estrutura

```bash
find <module_path> -type f -name "*.ts" | sort
```

### Passo 2: Checar imports proibidos

```bash
grep -rE "^import .* from ['\"](@nestjs|@prisma|class-validator|class-transformer)" <module_path>/domain/
```

Deve retornar vazio.

### Passo 3: Greps estruturais

```bash
# Application não importa infrastructure
grep -rE "from .*infrastructure" <module_path>/application/
# Deve retornar vazio

# Aggregates têm factory estático
grep -rE "static criar\(" <module_path>/domain/
# Deve retornar pelo menos 1

# Ports são interfaces
grep -rE "export interface \w+Port" <module_path>/domain/ports/
# Deve listar todos os ports
```

### Passo 4: Rodar `stack-code-reviewer`

```bash
pnpm stack:review --files="$(find <module_path> -name '*.ts' | tr '\n' ',')"
```

Esperado: 0 blockers.

### Passo 5: Validar cobertura

```bash
pnpm --filter @projeto/api test:unit -- --coverage <module_path>
```
