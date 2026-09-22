# Convenção: Git Workflow — Proteção da Branch `main`

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

**A branch `main` é PROTEGIDA.** Nenhum commit ou push direto é permitido. Todas as alterações DEVEM chegar a `main` via Pull Request.

## Regra Inegociável

- ❌ **PROIBIDO** `git commit` em `main` (exceto via PR de hotify)
- ❌ **PROIBIDO** `git push origin main`
- ❌ **PROIBIDO** `--force-push` em qualquer branch compartilhada
- ✅ **OBRIGATÓRIO** criar branch `feature/`, `fix/`, `refactor/`, `docs/`, `chore/` ou `hotfix/`
- ✅ **OBRIGATÓRIO** abrir PR com revisão aprovada
- ✅ **OBRIGATÓRIO** checks verdes (`tdd-enforcer`, `code-reviewer`, size-check)

## Padrão de Nomeação de Branches

| Tipo            | Prefixo       | Exemplo                          | Uso                                          |
|-----------------|---------------|----------------------------------|----------------------------------------------|
| Nova feature    | `feature/`    | `feature/add-payment-gateway`    | Implementação de nova funcionalidade         |
| Bug fix         | `fix/`        | `fix/auth-token-expiry`          | Correção de bug                               |
| Refatoração     | `refactor/`   | `refactor/extract-validation`    | Refatoração sem mudança de comportamento     |
| Documentação    | `docs/`       | `docs/update-readme`             | Apenas docs                                   |
| Configuração    | `chore/`      | `chore/bump-deps`                | Build, CI, deps                               |
| Hotfix urgente  | `hotfix/`     | `hotfix/security-patch`          | Correção crítica em produção (via PR)         |

## Fluxo Obrigatório

```text
1. Receber tarefa
       │
       ▼
2. Atualizar main local
   git checkout main && git pull origin main
       │
       ▼
3. Criar branch descritiva
   git checkout -b feature/<nome-descritivo>
       │
       ▼
4. Implementar (TDD + revisão contínua)
       │
       ▼
5. Commitar com Conventional Commits em pt-BR
   git commit -m "feat(escopo): descrição em pt-BR"
       │
       ▼
6. Push da branch
   git push -u origin feature/<nome>
       │
       ▼
7. Abrir Pull Request para main
       │
       ▼
8. Aguardar checks + revisão
   - tdd-enforcer (pass)
   - code-reviewer (approve)
   - markdown-size-check (≤ 300 linhas)
       │
       ▼
9. Merge (squash preferencialmente)
```

## Proteções Recomendadas no GitHub

Configurar em **Settings → Branches → Branch protection rules → `main`**:

- ✅ Require a pull request before merging
- ✅ Require approvals: 1+
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging
  - `tdd-enforcer`
  - `code-reviewer`
  - `markdown-size-check`
- ✅ Require linear history (squash merge)
- ✅ Include administrators (ninguém bypassa)

## Exceções

Nenhuma. Hotfixes urgentes também usam PR (com label `hotfix` para SLA diferenciado).

## Bloqueio Automático

`tdd-enforcer` é despachado em todo PR. Em breve, `git-workflow-enforcer` validará
se o PR está abrindo para `main` a partir de branch válida.
