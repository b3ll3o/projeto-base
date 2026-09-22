# Fase 10 — Docs, ADR, PR (Parte 4/4)

> **Continuação** da Fase 10. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing.md)
>
> Esta é a parte 4 de 4 da Fase 10 (final).

---

## Task 10.9: Sincronizar com main + push da branch

- [ ] **Step 1: Garantir branch atual**

```bash
git branch --show-current
```

Expected: `feat/cadastro-usuario-com-auditoria`

- [ ] **Step 2: Atualizar com main**

```bash
git fetch origin main
git rebase origin/main 2>&1 | tail -5
```

Expected: rebase limpo (ou vazio se main não avançou).

- [ ] **Step 3: Push**

```bash
git push -u origin feat/cadastro-usuario-com-auditoria 2>&1 | tail -10
```

Expected: branch enviada ao remote.

- [ ] **Step 4: Confirmar workflows CI rodaram**

```bash
gh pr checks --watch 2>&1 | tail -20 || echo "(PR ainda não aberto)"
```

Expected: 3 checks passam (`ci`, `review-stack`, `sync-docs`).

---

## Task 10.10: Abrir PR final

- [ ] **Step 1: Criar PR**

```bash
gh pr create \
  --base main \
  --head feat/cadastro-usuario-com-auditoria \
  --title "feat: cadastro de usuário com auditoria completa (DDD/Hexagonal)" \
  --body "$(cat <<'EOF'
## Resumo

Implementa cadastro de usuários com **auditoria completa** sob paradigma **DDD + Hexagonal** obrigatório em todo o monorepo.

## Decisões arquiteturais (D1-D12)

- **D1-D5** Auditoria: 3 tabelas por entidade (`X`, `XHistory`, `XArchive`).
- **D6** Snapshot JSONB no histórico.
- **D7** Optimistic locking via `version` + `If-Match` HTTP.
- **D8** DDD + Hexagonal em todos os módulos do monorepo.
- **D9** Prisma 6 como ORM.
- **D10** Tailwind 4 no front.
- **D11** `stack-code-reviewer` automático em pre-commit + CI.
- **D12** `doc-sync` automático em pre-commit + CI.

## Specs

- Design: `docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-design.md`
- ADR: `docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`
- Plan: `docs/superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-plan.md`

## Mudanças

### Backend (`apps/api`)

- NestJS 11 + Fastify + Prisma 6 + Postgres 16.
- 11 endpoints REST com RFC 7807.
- 7 use cases + 2 ports (User, Audit).
- Audit fields em todas as entidades.

### Frontend (`apps/web`)

- Next.js 15 + React 19 + Tailwind 4.
- Página `/users` com listagem Server Component.

### Tooling

- ESLint rule `no-domain-imports-from-infra`.
- Agent `stack-code-reviewer` (4 regras: DDD purity, Prisma audit, NestJS controller, Next.js image).
- Agent `doc-sync` (code→doc mapping automático).
- Husky + lint-staged + pre-commit.
- 3 workflows GitHub Actions.

### Packages

- `@projeto/tsconfig` (base/node/react).
- `@projeto/eslint-config` com rule custom.
- `@projeto/shared-types` (DTOs User/History/Archive).

## Validação (DoD)

- [x] Domain: 100% cobertura.
- [x] Application: ≥ 90% cobertura.
- [x] Infrastructure: ≥ 80% cobertura.
- [x] `pnpm turbo run lint typecheck test` passa.
- [x] `stack-code-reviewer` aprova (0 blocker).
- [x] `doc-sync` aprova (health ≥ 80).
- [x] 6 cenários E2E passam.
- [x] ADR-0001 revisado.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Confirmar PR aberto**

```bash
gh pr view --json number,title,url
```

Expected: PR listado com URL.

- [ ] **Step 3: Aguardar CI**

```bash
gh pr checks --watch 2>&1 | tail -20
```

Expected: 3/3 checks verdes.

- [ ] **Step 4: Marcar como pronto**

```bash
gh pr ready 2>&1
```

Expected: PR sai de draft (se estava).

---

**🎉 Fim da Fase 10 — feature pronta para review humano.**

---

## Resumo Final

| Fase | Tasks | Arquivos | Cobertura |
|------|------:|---------:|----------:|
| 1. Foundation | 12 | ~15 | N/A |
| 2. Shared Audit | 10 | ~12 | 100% |
| 3. Apps Scaffold | 14 | ~18 | N/A |
| 4. User Domain | 15 | ~22 | 100% |
| 5. User Application | 14 | ~25 | ≥ 90% |
| 6. User Infra Persistence | 10 | ~10 | ≥ 80% |
| 7. User Infra HTTP | 8 | ~10 | ≥ 80% |
| 8. Agents Automation | 8 | ~12 | ≥ 90% |
| 9. E2E Tests | 8 | ~10 | ≥ 85% |
| 10. Docs + ADR + PR | 10 | ~8 | N/A |
| **TOTAL** | **~109 tasks** | **~142 files** | ≥ 90% global |
