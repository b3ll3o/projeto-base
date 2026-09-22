# 05 — Estratégia de Testes (TDD + Pirâmide)

> Documento: parte do design [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)
> **Exemplos de código:** ver [`05b-exemplos-testes.md`](./2026-09-21-cadastro-usuario-com-auditoria-05b-exemplos-testes.md)

## §1. Regra de Ouro

**TDD é OBRIGATÓRIO** (convenção `tdd.md`). Ciclo: **Red → Green → Refactor**. Bloqueio de merge via `tdd-enforcer`.

## §2. Pirâmide de Testes por Camada (DDD + Hexagonal)

```text
                          ▲
                         ╱ ╲
                        ╱ E2E╲                  Poucos, alto valor
                       ╱──────╲                 - HTTP ponta-a-ponta
                      ╱────────╲                - Fluxos críticos
                     ╱ Integ.   ╲               Médios, integração real
                    ╱────────────╲              - Application + Infra (real)
                   ╱──────────────╲             - Testcontainers (Postgres)
                  ╱   Unitários    ╲            Muitos, rápidos, isolados
                 ╱──────────────────╲           - Domain (puro)
                                                - Application (mocks de ports)
                                                - Use cases
```

## §3. Matriz de Cobertura

| Camada | Tipo | Framework | Cobertura | Velocidade |
|--------|------|-----------|-----------|------------|
| Domain (entidades, VOs, eventos) | Unit puro | Jest | **100%** | < 1s |
| Application (use cases) | Unit com mocks de ports | Jest | **≥ 90%** | < 5s |
| Infrastructure - Persistence | Integration + Testcontainers | Jest + Testcontainers | **≥ 80%** | < 60s |
| Infrastructure - Audit | Integration + Testcontainers | Jest + Testcontainers | **≥ 90%** | < 30s |
| Infrastructure - HTTP | E2E + supertest | Jest + Supertest | **≥ 80%** | < 60s |
| Domain Events handlers | Unit + Integration | Jest | **≥ 80%** | < 30s |

## §4. Cobertura Mínima por Arquivo

| Tipo | Mínimo | Justificativa |
|------|--------|---------------|
| `*.aggregate.ts` | **100%** | Core do negócio |
| `*.vo.ts` | **100%** | Invariantes críticas |
| `*.use-case.ts` | **≥ 95%** | Use cases orquestram fluxos críticos |
| `*.repository.ts` | **≥ 85%** | Branches de erro mapeados |
| `*.controller.ts` | **≥ 80%** | Happy paths + 1 erro por status |
| `*.service.ts` (audit, etc) | **≥ 90%** | Lógica transversal crítica |

## §5. Estratégia por Tipo de Teste (resumo)

Exemplos de código completos em [`05b-exemplos-testes.md`](./2026-09-21-cadastro-usuario-com-auditoria-05b-exemplos-testes.md).

| § | Tipo | Camada | Característica |
|---|------|--------|----------------|
| 5.1 | Unit puro | Domain | Zero deps; testa agregados e invariantes |
| 5.2 | Unit puro | Domain (VOs) | Imutabilidade + validação + normalização |
| 5.3 | Unit com mocks | Application | Use cases orquestram ports mockados |
| 5.4 | Integration | Infrastructure (Prisma) | Testcontainers Postgres 16 real |
| 5.5 | E2E | Infrastructure (HTTP) | Supertest + JwtAuthGuard real |

## §6. Workflow TDD Operacional

```text
1. RED    → Escrever teste que falha (describe/it vazio → failing)
2. GREEN  → Implementar mínimo para passar (nada além do necessário)
3. REFACTOR → Melhorar design mantendo testes verdes

Discipline:
- PR com RED sem GREEN é bloqueado por tdd-enforcer
- Coverage < mínimo é bloqueado por tdd-enforcer
- `pnpm test:unit` roda < 10s (pre-commit hook)
- `pnpm test:e2e` roda com Testcontainers (skip em CI rápido)
```

## §7. CI/CD Pipeline (Turborepo)

```yaml
# apps/api/turbo.json tasks relevantes
"test:unit":         { "cache": true,  "outputs": ["coverage/**"] }
"test:integration":  { "cache": false, "outputs": [] }   # Testcontainers
"test:e2e":          { "cache": false, "outputs": [] }   # Full stack
"tdd:check":         { "dependsOn": ["test:unit"], "outputs": [] }  # bloqueia merge
"stack:review":      { "cache": false, "outputs": ["stack-review-report.json"] }  # D11
"docs:sync":         { "cache": false, "outputs": ["doc-sync-report.json"] }      # D12
"ci:quality":        { "dependsOn": ["tdd:check", "stack:review", "docs:sync"], "outputs": [] }
```

**Pre-commit (Husky) — roda em toda alteração:**

```bash
# .husky/pre-commit (resumido)
changed=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|prisma)$')
[ -n "$changed" ] && pnpm tsx tooling/scripts/stack-code-reviewer.ts --files="$changed"
[ -n "$changed" ] && pnpm tsx tooling/scripts/doc-sync.ts --files="$changed" --auto-apply-minor=true
```

## §8. Definition of Done (DoD) da Feature

A feature `cadastro-usuario-com-auditoria` está pronta quando:

- [ ] Estrutura DDD/Hexagonal validada por `nestjs-specialist` + skill `ddd-hexagonal-validation`.
- [ ] Todos os use cases com testes (unit + integration + e2e).
- [ ] Cobertura por tipo de arquivo atinge mínimo da §4.
- [ ] `pnpm tdd:check` passa.
- [ ] `pnpm lint` + `pnpm typecheck` passam.
- [ ] OpenAPI exportado e commitado em `apps/api/openapi.json`.
- [ ] ADR `0001-arquitetura-ddd-hexagonal.md` revisado.
- [ ] Skill `ddd-hexagonal-validation` implementada e testada.
- [ ] ESLint rule `no-domain-imports-from-infra` ativa e validando.
- [ ] PR aprovado por pelo menos 1 reviewer + `tdd-enforcer`.

---

**Próximo:** [`06-impacto-cross-cutting.md`](./2026-09-21-cadastro-usuario-com-auditoria-06-impacto-cross-cutting.md)
