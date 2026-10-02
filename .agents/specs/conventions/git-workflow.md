# Convenção: Git Workflow — Trunk-Based e Proteção da Branch `main`

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

**Modelo: trunk-based development.** `main` é o tronco único e sempre
integrável. Branches são curtas e descartadas no merge. **Toda
alteração começa de `main` atualizado.**

**A branch `main` é PROTEGIDA.** Nenhum commit ou push direto é permitido. Todas as alterações DEVEM chegar a `main` via Pull Request.

## Regra Inegociável

- ❌ **PROIBIDO** `git commit` em `main` (exceto via PR de hotify)
- ❌ **PROIBIDO** `git push origin main`
- ❌ **PROIBIDO** `--force-push` em qualquer branch compartilhada
- ❌ **PROIBIDO** iniciar trabalho sem antes atualizar `main` — branch
  criada a partir de `main` desatualizado carrega rework de merge e
  diverge do padrão do projeto
- ✅ **OBRIGATÓRIO** `git checkout main && git pull --ff-only origin main`
  antes de criar a branch de trabalho
- ✅ **OBRIGATÓRIO** criar branch `feature/`, `fix/`, `refactor/`, `docs/`, `chore/` ou `hotfix/`
- ✅ **OBRIGATÓRIO** abrir PR com revisão aprovada
- ✅ **OBRIGATÓRIO** checks verdes (`tdd-enforcer`, `code-reviewer`, size-check)
- ✅ **OBRIGATÓRIO** Conventional Commits em pt-BR e TDD em toda alteração

## Trunk-Based: o que significa aqui

A coluna **Como é garantido** distingue o que a branch protection do
GitHub **impõe** do que é apenas **convenção** — convenção que depende
de revisão humana, e por isso deve ser cobrada no PR.

| Princípio                        | Aplicação neste repo                                        | Como é garantido |
|----------------------------------|-------------------------------------------------------------|------------------|
| Tronco único e sempre integrável | `main` nunca recebe commit vermelho — o gate de cobertura (§ [cobertura-testes.md](./cobertura-testes.md)) e o CI travam o merge | **Impõe**: branch protection + status checks |
| Base sempre atualizada           | `main` é atualizada **antes** de cada branch de trabalho     | **Convenção**: revisão no PR (o hook não valida a base) |
| Branches curtas                  | Ciclo de horas, não semanas | **Convenção**: nada no GitHub detecta duração de branch |
| Commit pequeno e focado           | Um commit = uma mudança coerente; facilita `bisect` e `revert` | **Convenção**: revisão no PR |
| Sem branch permanente            | Nenhuma branch vive além do seu PR (só `main` e tags) | **Convenção**: limpeza pós-merge é manual |

## Ponto de Partida Obrigatório

Nenhuma alteração começa de uma branch existente, de uma tag, ou de um
stash. O primeiro comando de qualquer tarefa de código é:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b <prefixo>/<nome-descritivo>
```

`--ff-only` é deliberado: sem ele, um `pull` pode criar um merge
commit local em `main`, que é exatamente o que a convenção proíbe.

**Antes de qualquer `git commit` ou `git push`, confirme em qual branch
você está:**

```bash
git branch --show-current
```

Esse passo não é opcional — é a defesa contra commit acidental em
`main`, que só é detectado depois que já aconteceu.

## Padrão de Nomeação de Branches

| Tipo            | Prefixo       | Exemplo                          | Uso                                          |
|-----------------|---------------|----------------------------------|----------------------------------------------|
| Nova feature    | `feature/`    | `feature/add-payment-gateway`    | Implementação de nova funcionalidade         |
| Bug fix         | `fix/`        | `fix/auth-token-expiry`          | Correção de bug                               |
| Refatoração     | `refactor/`   | `refactor/extract-validation`    | Refatoração sem mudança de comportamento     |
| Documentação    | `docs/`       | `docs/update-readme`             | Apenas docs                                   |
| Configuração    | `chore/`      | `chore/bump-deps`                | Build, CI, deps                               |
| Hotfix urgente  | `hotfix/`     | `hotfix/security-patch`          | Correção crítica em produção (via PR)         |

O nome deve descrever **o problema**, não a ferramenta. `fix/coverage-gate-40`
> `fix/update-vitest`.

## Fluxo Obrigatório

```text
1. Receber tarefa
       │
       ▼
2. Atualizar main local
   git checkout main && git pull --ff-only origin main
       │
       ▼
3. Criar branch descritiva a partir de main ATUALIZADA
   git checkout -b feature/<nome-descritivo>
       │
       ▼
4. Implementar (TDD + revisão contínua)
       │
       ▼
5. Commitar com Conventional Commits em pt-BR
   git branch --show-current   # confirmar branch antes de commitar
   git commit -m "feat(escopo): descrição em pt-BR"
       │
       ▼
6. Rodar o pre-push gate local
   pnpm ci:local
       │
       ▼
7. Push da branch
   git push -u origin feature/<nome>
       │
       ▼
8. Abrir Pull Request para main
       │
       ▼
9. Aguardar checks + revisão
   - tdd-enforcer (pass)
   - code-reviewer (approve)
   - markdown-size-check (≤ 300 linhas)
       │
       ▼
10. Merge (squash preferencialmente) e apagar a branch
```

## Pre-Push Quality Gate

Antes de `git push`, **OBRIGATÓRIO** rodar:

```bash
pnpm ci:local
```

Este comando executa as **mesmas validações que o CI roda** em ~30-60s
localmente. Se falhar, **NÃO fazer push** — corrigir primeiro.

> **O hook não faz isto por você.** `.husky/pre-push` roda apenas
> `pnpm ci:preflight` (camada 1 do defense-in-depth: cross-refs,
> drift de tsconfig, drift de ESLint) — é o que o hook promete na saída
> dele. Lint, typecheck e os testes com coverage **não** são cobertos
> pelo hook; é por isso que `ci:local` continua sendo passo manual
> obrigatório no fluxo. Para o hook passar a cobrir mais, o ajuste é em
> `.husky/pre-push`, não neste doc.

Falhas capturadas (vs custo de detecção em CI):

- Docs com cross-refs quebradas → 5s local vs 3min CI
- Drift em tsconfig → 5s local vs 4min CI (typecheck roda)
- ESLint config duplicada → 5s local vs 3min CI (lint roda)
- Cobertura abaixo do threshold → já roda no CI

Exceção: hotfix trivial (typo, doc-only). Mesmo nesses casos,
rodar `pnpm ci:preflight` para validar refs em docs.

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
