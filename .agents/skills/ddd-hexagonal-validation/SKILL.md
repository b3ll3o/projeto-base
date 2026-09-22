---
name: ddd-hexagonal-validation
description: Use when validating that a module follows the DDD + Hexagonal architecture mandated by the project. Audits folder structure, imports, dependency direction, and layer responsibilities. Triggers on requests like "validar DDD/Hexagonal", "auditar módulo", "verificar boundaries", "revisar arquitetura do módulo", "is this layer clean?"
---

# Skill: `ddd-hexagonal-validation`

## Quando usar

- Antes de finalizar uma feature que toca `apps/api/src/modules/<feature>/`.
- Em code review focado em arquitetura (não em bugs/segurança/performance).
- Em auditoria periódica de módulos para garantir conformidade.
- Quando suspeitar de mistura de camadas.

## Quando NÃO usar

- Para revisar código genérico em busca de bugs (use `feature-dev:code-reviewer` subagent — revisão geral de qualidade).
- Para auditoria de segurança / SAST / threat-model (use `analista-dev-sec-ops` subagent).
- Para auditoria de testes isoladamente (use `analista-qualidade` subagent).

## Inputs

```yaml
module_path: "apps/api/src/modules/users"
```

## Estrutura obrigatória

Convenção efetiva no projeto (validada contra `apps/api/src/modules/users/`):

```text
<module_path>/
  domain/                         # TypeScript puro, zero framework
    <entity>.aggregate.ts          # ex.: user.aggregate.ts
    <entity>.aggregate.spec.ts
    value-objects/*.vo.ts          # ex.: email.vo.ts, user-name.vo.ts
    events/*.event.ts              # ex.: user-created.event.ts
    ports/*.port.ts                # ex.: user-repository.port.ts
    exceptions/                    # ApplicationConflictException, etc
  application/                    # Orquestra fluxos via ports
    <entity>-use-cases.ts          # ex.: user-use-cases.ts (entrypoint único)
    <entity>-use-cases.spec.ts     # testes unitários do use cases
    <entity>-use-cases.integration.spec.ts  # testes de integração
    dto/                           # Input/output types do use case
    exceptions/                    # exceções próprias da camada application
  infrastructure/                 # Implementa ports (ORM, HTTP)
    http/<entity>.controller.ts    # ex.: users.controller.ts
    http/<entity>.schemas.ts       # Zod validation schemas
    persistence/<impl>-<entity>.repository.ts  # ex.: prisma-user.repository.ts
    persistence/<impl>-persistence.module.ts   # módulo DI NestJS da impl
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
- [ ] Cobertura atinge mínimo global (80% por vitest project — ver `.agents/specs/conventions/cobertura-testes.md`)
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
# Application (código de produção) não importa infrastructure.
# Arquivos *.spec.ts e *.integration.spec.ts ficam de fora — eles
# MONTAM a fiação com InMemory/Prisma para o use case sob teste.
grep -rE "from .*infrastructure" <module_path>/application/ \
  --include="*.ts" --exclude="*.spec.ts" --exclude="*.integration.spec.ts"
# Deve retornar vazio

# Aggregates têm factory estático
grep -rE "static criar\(" <module_path>/domain/
# Deve retornar pelo menos 1

# Ports são interfaces
grep -rE "export interface \w+Port" <module_path>/domain/ports/
# Deve listar todos os ports
```

### Passo 4: Rodar `stack-code-reviewer`

`tooling/scripts/stack-code-reviewer.ts` parseia `--files` por `\n`, não por
vírgula. Use newline como separador (preservado pela command substitution
do bash dentro de aspas duplas):

```bash
files=$(find <module_path> -name '*.ts')
pnpm stack:review --files="$files"
```

Esperado: 0 blockers. Se houver >0, o relatório aponta violação concreta
(arquivo + linha + categoria) — use como base para o item Saída esperada.

### Passo 5: Validar cobertura

Vitest agrega cobertura por `project` (não por módulo). Para validar que o
módulo não derruba o threshold do project:

```bash
pnpm --filter @projeto/api test:unit -- --coverage <module_path>
```

Em `apps/api/vitest.workspace.ts` o project `unit` tem threshold 80% nas
4 métricas (lines/functions/branches/statements). Se a cobertura do
project cair abaixo do threshold após mudanças no módulo, refatore até
voltar. Não há regra por camada — a cobertura é agregada do project
inteiro; a boundary é garantida pelo Passo 2 + `stack-code-reviewer`.

## Saída esperada

Ao final da auditoria, retorne um relatório com:

1. **Verdict**: ✅ aprovado | ⚠️ aprovado com ressalvas | ❌ reprovado.
2. **Findings por camada** (`domain` / `application` / `infrastructure`) — liste violações concretas com path + linha.
3. **Ações corretivas** sugeridas em bullet points ordenados por impacto.
4. **Links** para a ADR-0001 (`docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`) ao justificar qualquer rejeição.
