# Fase 10 — Docs, ADR, PR (Parte 3/4)

> **Continuação** da Fase 10. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing.md)
>
> Esta é a parte 3 de 3 da Fase 10. Pule para a próxima parte ao final.

---

- Roda em: pre-commit + CI `sync-docs.yml`
- Detecta: docs afetadas por mudança de código (controllers, schema, VOs)

### Como desligar para um commit específico

```bash
git commit --no-verify -m "wip: ..."
```

(NÃO recomendado — usar `git revert` se for um falso positivo)
```

- [ ] **Step 2: Commit**

```bash
git add docs/MONOREPO.md
git commit -m "docs(monorepo): document automated agents (D11/D12)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10.7: DoD global — rodar todas as validações

- [ ] **Step 1: Validar turbo pipeline completo**

```bash
pnpm turbo run lint typecheck build test:unit test:integration test:e2e 2>&1 | tail -30
```

Expected: tudo passa.

- [ ] **Step 2: Validar stack-code-reviewer no diretório completo**

```bash
changed=$(find apps packages tooling -name "*.ts" -newer docs/superpowers/plans 2>/dev/null | head -50)
pnpm stack:review --files="$changed" --out-file=final-review.json
cat final-review.json | jq '.summary, .approved'
```

Expected: `approved: true` ou 0 blockers.

- [ ] **Step 3: Validar doc-sync**

```bash
pnpm docs:sync --files="$changed" --out-file=final-docs.json
cat final-docs.json | jq '.docs_health_score, .alerts'
```

Expected: score ≥ 80, alerts = 0.

- [ ] **Step 4: Confirmar arquivos chave existem**

```bash
test -f docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md && echo "✓ ADR"
test -f .agents/skills/ddd-hexagonal-validation/SKILL.md && echo "✓ Skill"
test -f apps/api/openapi.json && echo "✓ OpenAPI"
test -f apps/api/prisma/schema.prisma && echo "✓ Schema"
test -f apps/api/prisma/migrations/00000000000000_init_audit_user/migration.sql && echo "✓ Migration"
```

Expected: todos marcados ✓.

- [ ] **Step 5: Confirmar cobertura por camada**

```bash
pnpm --filter @projeto/api test:unit -- --coverage src/modules/users/domain 2>&1 | grep -E "All files" -A 10 | tail -10
pnpm --filter @projeto/api test:unit -- --coverage src/modules/users/application 2>&1 | grep -E "All files" -A 10 | tail -10
pnpm --filter @projeto/api test:e2e -- --coverage 2>&1 | grep -E "All files" -A 10 | tail -10
```

Expected:
- Domain: 100%
- Application: ≥ 90%
- E2E/Infra: ≥ 80%

- [ ] **Step 6: Commit final de validação**

```bash
git status
# Se houve algum ajuste automático:
# git add -A && git commit -m "chore(release): final validation pass for cadastro-usuario-com-auditoria"
```

---

## Task 10.8: CHANGELOG + tag da release

**Files:**
- Modify: `CHANGELOG.md` (se existir) ou criar

- [ ] **Step 1: Criar/atualizar CHANGELOG**

```markdown
# Changelog

Todas as mudanças notáveis neste projeto.

## [Unreleased] — 2026-09-21

### Adicionado

- **Cadastro de usuários com auditoria completa** (D3-D8).
- **Arquitetura DDD + Hexagonal obrigatória** em todo o monorepo (D8).
- **Tabela tripla por entidade** (`X` + `XHistory` + `XArchive`) para audit + soft delete.
- **Optimistic locking** via `version` + header `If-Match` HTTP (D7).
- **Port `AuditServicePort`** transversal com 2 impls (in-memory, Prisma).
- **Eventos de domínio** (`UserCreated/Updated/Deleted/Restored`).
- **RFC 7807 Problem Details** em todas as respostas de erro.
- **Agent `stack-code-reviewer`** (D11) automático via pre-commit + CI.
- **Agent `doc-sync`** (D12) automático via pre-commit + CI.
- **Skill `ddd-hexagonal-validation`** para auditoria manual.
- **ESLint rule custom** `no-domain-imports-from-infra`.
- **Testcontainers** (Postgres 16) para testes integration + e2e.
- **OpenAPI 3** exportado em `apps/api/openapi.json`.
- **ADR-0001** documentando decisão arquitetural.
- **ADR template** para futuras decisões.

### Mudado

- `package.json` raiz agora gerencia 2 apps (`api`, `web`) + 3 packages.
- ESLint 9 com flat config + rule custom.

### Segurança

- Soft delete obrigatório (LGPD-friendly).
- Audit trail completo de quem/quando/porque.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): add Unreleased entry for cadastro-usuario-com-auditoria

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

