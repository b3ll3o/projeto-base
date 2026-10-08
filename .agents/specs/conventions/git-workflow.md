# Convenção: Git Workflow — Trunk-Based e Proteção da Branch `main`

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

**Modelo: trunk-based development.** `main` é o tronco único e sempre
integrável. Branches são curtas e descartadas no merge. **Toda alteração começa
de `main` atualizado** e chega ao tronco **via Pull Request** — nunca por commit
ou push direto.

## Regra Inegociável

- ❌ **PROIBIDO** `git commit` em `main` (exceto via PR de hotfix)
- ❌ **PROIBIDO** `git push origin main`
- ❌ **PROIBIDO** `--force-push` em qualquer branch compartilhada
- ❌ **PROIBIDO** iniciar trabalho sem atualizar `main` — branch criada a partir
  de `main` desatualizado carrega rework de merge e diverge do padrão do projeto
- ✅ **OBRIGATÓRIO** `git checkout main && git pull --ff-only origin main`
  antes de criar a branch de trabalho
- ✅ **OBRIGATÓRIO** criar branch `feature/`, `fix/`, `refactor/`, `docs/`, `chore/` ou `hotfix/`
- ✅ **OBRIGATÓRIO** abrir PR com revisão aprovada
- ✅ **OBRIGATÓRIO** checks verdes do [`ci.yml`](../../../.github/workflows/ci.yml): `preflight` e `quality`
- ✅ **OBRIGATÓRIO** Conventional Commits em pt-BR e TDD em toda alteração

## Trunk-Based: o que significa aqui

A coluna **Como é garantido** distingue o que a branch protection do
GitHub **impõe** do que é apenas **convenção** — convenção que depende
de revisão humana, e por isso deve ser cobrada no PR.

| Princípio                        | Aplicação neste repo                                        | Como é garantido |
|----------------------------------|-------------------------------------------------------------|------------------|
| Tronco único e sempre integrável | `main` nunca recebe commit vermelho — o gate de cobertura (§ [cobertura-testes.md](./cobertura-testes.md)) e o CI travam o merge | **Impõe**: `required_status_checks` = `quality` (veja nota) |
| Base sempre atualizada           | `main` é atualizada **antes** de cada branch de trabalho     | **Convenção**: revisão no PR (o hook não valida a base) |
| Branches curtas                  | Ciclo de horas, não semanas | **Convenção**: nada no GitHub detecta duração de branch |
| Commit pequeno e focado           | Um commit = uma mudança coerente; facilita `bisect` e `revert` | **Convenção**: revisão no PR |
| Sem branch permanente            | Nenhuma branch vive além do seu PR (só `main` e tags) | **Convenção**: limpeza pós-merge é manual |

> **Nota — o que o GitHub de fato impõe.** O ruleset `master` (`23853096`) tem
> `deletion`, `non_fast_forward`, `pull_request` **e** `required_status_checks`
> com context `quality` (`strict: false`).
>
> `quality` tem `needs: preflight` no [`ci.yml`](../../../.github/workflows/ci.yml),
> então os dois jobs gateiam o merge — mas a garantia é da **cadeia de
> workflows**: se `quality` deixar de ter `needs: preflight`, `preflight`
> continua opcional sem nenhum aviso. Ainda **não** há
> `required_approving_review_count` (segue `0` — o repositório é de contributor
> único, e exigir aprovação travaria o autor em PR solo).
>
> Como o [`ci.yml`](../../../.github/workflows/ci.yml) só dispara em `push:
> feat/**` e `pull_request: main` (MEDIDO 2026-10-08: `gh run list --branch
> fix/…` volta vazio depois do push), **`main` só é atualizável por PR** — push
> direto não tem check `quality` reportado e é rejeitado. `bypass_actors` é
> vazio: nem administrador contorna. A barreira local (`pre-push`) é a camada
> mais rápida, mas não é mais a única.

## Ponto de Partida Obrigatório

Nenhuma alteração começa de uma branch existente, de uma tag, ou de um
stash. O primeiro comando de qualquer tarefa de código é:

```bash
git checkout main
git pull --ff-only origin main
git switch -c <prefixo>/<nome-descritivo>
```

`--ff-only` é deliberado: sem ele, um `pull` pode criar um merge
commit local em `main`, que é exatamente o que a convenção proíbe.

**`git switch -c`, e não `git branch <nome>`:** `git branch <nome>` **cria** a
branch e **não** troca para ela — o comando termina com exit 0 e você continua
na branch anterior. `git switch -c` faz as duas coisas, e falha se a branch já
existe, o que é a segunda metade da proteção.

MEDIDO 2026-10-06, campanha do PR #59: um commit foi para a branch errada
depois de `git branch --show-current` ter confirmado a branch certa. Não foi
esquecimento de verificar — foi **verificar na posição errada**: o
`--show-current` rodou antes do `git branch X`, e o `git branch X` invalidou a
leitura sem desfazer a checagem.

**Antes de qualquer `git commit` ou `git push`, confirme em qual branch
você está — como último comando, não como último do raciocínio:**

```bash
git branch --show-current
```

Esse passo não é opcional — é a defesa contra commit acidental em `main`, que
só é detectado depois que já aconteceu.

## Rebase Obrigatório: Demanda Implementada com `main` Desatualizada

O ponto de partida acima cobre o **começo** da demanda. Ele não cobre o
**intervalo**: uma demanda entregue ao longo de duas semanas acumula commits
em `main` que ela não contém. Ela continua sendo trabalho válido e abre PR
que parece correto — só que o merge reintroduz no histórico tudo o que a
`main` já resolveu, e o revisor passa a ler um diff que já era verde quando a
demanda foi escrita.

**Regra.** Toda demanda é rebaseada na `main` atualizada antes de push e de
abrir PR. Sem exceção por tamanho: uma demanda de uma linha que ficou três
dias aberta tem o mesmo defeito que uma de três semanas.

```bash
git fetch origin main
git rebase origin/main
```

`rebase`, não `merge`: um merge de `main` na demanda cria o commit que a
convenção proíbe em `main` (§Regra Inegociável), e deixa o histórico da
demanda com um nó de junção que nenhum outro branch tem.

### Depois do rebase: revisão obrigatória

Rebase não é um comando atômico, e o resultado dele não é o mesmo código.

1. **Parou em conflito?** Resolva e rode `git rebase --continue`, ou volte
   ao ponto de partida com `git rebase --abort`. Um rebase no meio é
   vermelho no `preflight` por si — não há histórico pronto para medir.
2. **Revise o resultado.** Conflito resolvido não é código correto: as duas
   metades podem ter sido escritas contra premissas que a `main` nova
   invalidou, e o `git` não tem como saber disso. Depois do rebase, o diff
   da demanda é **novo código do ponto de vista de quem revisa** — despache
   a revisão de novo, por
   [`review-routing.md`](./review-routing.md), com revisor que **não**
   participou da resolução do conflito.
3. **Rode `pnpm ci:local` de novo.** Verde antes do rebase não vale depois:
   os testes rodaram contra a base antiga.
4. **Só então** `git push --force-with-lease`.

O passo 2 é o mais caro de pular: uma demanda rebaseada sem revisão
reintroduz em silêncio a razão pela qual o rebase foi feito.

### Quem cobra

O gate [`check-branch-up-to-date`](./ci-defense-in-depth.md) roda no
`preflight` (local e CI): vermelho quando a demanda não contém `origin/main`,
nomeando **quantos** commits e **qual** base foi medida. "Sem ancestral comum"
é motivo **diferente** de "atrasada" — a história não converge, e rebasedar
em cima dela não resolve. Rebase parado em conflito é vermelho antes de
qualquer contagem, porque não há histórico para medir. Base inexistente é
`skipped`, nunca verde: um clone sem remoto não atesta que a demanda está
atualizada.

**A régua é nomeada porque ela pode estar velha.** O gate mede contra
`origin/main` **local**. Em CI (`fetch-depth: 0`) ela vem do servidor e é a
verdade; localmente pode estar desatualizada, e então o gate **subdeclara** — uma
demanda 5 atrás do remoto passa se o `origin/main` local for antigo. Por isso o
`git fetch` acima não é etapa decorativa.

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
   git switch -c feature/<nome-descritivo>
       │
       ▼
4. Implementar (TDD + revisão contínua)
       │
       ▼
5. Commitar com Conventional Commits em pt-BR
   git branch --show-current   # confirmar branch ANTES do commit, como último comando
   git commit -m "feat(escopo): descrição em pt-BR"
       │
       ▼
6. Rodar o pre-push gate local
   pnpm ci:local
   (inclui o gate da regra de rebase — se a main avançou,
   ele acusa aqui; ver §Rebase Obrigatório)
       │
       ▼
7. Rebasear na main atual, se o gate acusou
   git fetch origin main && git rebase origin/main
   → conflito? revisar e corrigir (§Depois do rebase)
       │
       ▼
8. Push da branch
   git push -u origin feature/<nome>
       │
       ▼
9. Abrir Pull Request para main
       │
       ▼
10. Aguardar checks + revisão
   - `preflight` (pass)
   - `quality` (pass)
       │
       ▼
11. Push novo na branch? → rodar [`pr-refresh`](../../workflows/pr-refresh.md)
   (o corpo do PR envelhece a cada push, e nenhum gate o cobre)
       │
       ▼
12. Merge (squash preferencialmente) e apagar a branch
   (ver §Branch Morta: Apagar Quando o PR Sai de OPEN)
```

## Branch Morta: Apagar Quando o PR Sai de OPEN

> **REGRA:** branch cujo PR saiu de `open` — **merged** ou **closed** — está
> **morta**. Apague-a local e remotamente assim que o PR fechar, não "quando
> der". Branch viva é a que tem PR aberto: alguém ainda pode mergear, revisar ou
> rebasar.

```bash
gh pr list --state all --limit 200 --json number,headRefName,mergedAt  # PR saiu de open?
# --limit é obrigatório: o gh pagina em 30 e o corte é silencioso, sem aviso e
# sem exit code diferente — sem ele, PRs antigos somem da lista sem você ver
# tag SÓ com conteúdo fora de main (exame no apêndice, passo 3): com exame
# vazio a main já tem tudo, e a tag vira ruído que se acumula a cada limpeza
git tag backup/<branch> <branch>      # só se o exame acusou conteúdo
git branch -d <branch> || git branch -D <branch>   # -d recusa se o squash escondeu a ancestralidade
git push origin --delete <branch>
```

### Como decidir

| PR | Pode apagar? |
|---|---|
| `merged` (tem `mergedAt`) | **Sim**, direto — se nenhum arquivo da branch estiver ausente em `main` |
| `closed` sem merge, ou nunca teve PR | **Só após exame de conteúdo** — apêndice §Caso 2 e §Caso 3 |

**O que decide é `mergedAt`, não a recusa do `-d`.** `-d` recusa apagar branch
não mergeada e essa recusa protege — mas o caso comum deste repo é o oposto: com
squash merge o tip deixa de ser ancestral de `main`, então **`-d` recusa branch
mergeada**.

**`closed` sem merge** exige o exame de conteúdo — foi ele que separou as duas
branches fechadas: #35 entregou 1 arquivo, #36 entregou 0. O predicado de "está
tudo em `main`" é o **arquivo**, não o commit: `--not --remotes` mede *"não está
em nenhuma ref remota"* — inerte enquanto `origin/<branch>` existir, e
**não-zero depois** do `push --delete`, que é o passo seguinte do mesmo bloco;
já `--not origin/main` acusa falso positivo com squash. O exame inteiro, e a
tag de recuperação, estão no [apêndice](./git-workflow-apendice.md) §Caso 1.

## Pre-Push Quality Gate

Antes de `git push`, **OBRIGATÓRIO** rodar:

```bash
pnpm ci:local
```

Este comando executa as validações que o CI roda — **69,5 s, 69,6 s e 74,1 s** medido de ponta a ponta em 2026-10-08 (n=3; `turbo.json` marca as duas tasks e2e com `cache: false`, então o custo não encolhe com o tempo), e **22,6 s** eram o total antes de elas entrarem. Se falhar, **NÃO fazer push** antes.

> **O hook não faz isto por você.** `.husky/pre-push` roda apenas
> `pnpm ci:preflight` (camada 1 do defense-in-depth) — é o que o hook promete
> na saída dele. Lint, typecheck e os testes com coverage **não** são cobertos
> pelo hook; para o hook cobrir mais, o ajuste é em `.husky/pre-push`, não
> neste doc.

Exceção: hotfix trivial (typo, doc-only). Mesmo nesses casos,
rodar `pnpm ci:preflight` para validar refs em docs.

## Proteções Recomendadas no GitHub

Configurar em **Settings → Branches → Branch protection rules → `main`**:

- ✅ Require a pull request before merging
- ✅ Require approvals: 1+
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging
  - `preflight`
  - `quality`
- ✅ Require linear history (squash merge)
- ✅ Include administrators (ninguém bypassa)

## Exceções

Nenhuma — hotfixes urgentes também usam PR (label `hotfix` para SLA diferenciado).

## Bloqueio Automático

Os gates que rodam em todo PR são o job `preflight` (executa `pnpm ci:preflight`)
e o job `quality`. **Nenhum agente é despachado automaticamente**: quem invoca o
agente de TDD e o de revisão de código é o operador ou a matriz
[`review-routing.md`](./review-routing.md). O fluxo completo, com o que de fato
bloqueia, está em [`docs/fluxo-desenvolvimento.md`](../../../docs/fluxo-desenvolvimento.md).
