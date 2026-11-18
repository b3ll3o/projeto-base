# Contribuindo para o projeto-base

> Guia de convivência técnica do repositório. Ele **não substitui** as
> convenções: cada regra tem **um dono**, e este guia **aponta** para ele
> ([`dry.md`](./.agents/specs/conventions/dry.md)). Se uma frase daqui
> divergir da convenção, **a convenção vence** — e a divergência é um defeito
> deste arquivo.

## Antes de começar

O que precisa estar na máquina:

| Ferramenta | Versão | De onde vem a exigência |
|---|---|---|
| Node.js | `>= 22.12.0` | `package.json` → `engines.node` |
| pnpm | `9.12.0` | `package.json` → `packageManager` (`corepack enable && corepack prepare pnpm@9.12.0 --activate`) |
| Docker + Compose v2 | v2 | ambiente Docker ([`docs/como-rodar.md`](./docs/como-rodar.md)) |
| PostgreSQL 16 | — | ambiente local; `grep -nE 'image: postgres' docker-compose.yml` → `postgres:16-alpine`. O compose **não** publica a porta desde o #91 (runbook §1.1) |

Instalação:

```bash
pnpm install --frozen-lockfile
```

O mapa completo por ambiente (dev, Docker, observabilidade, e2e, CI) está em
[`docs/como-rodar.md`](./docs/como-rodar.md) — ele é o **canônico** do "como
rodar"; o [`README.md`](./README.md) é a vitrine e aponta para lá.

## Padrão de commits

Mensagem no formato **Conventional Commits**, em **pt-BR**:

```text
tipo(escopo): descrição em pt-BR
```

- O `tipo` é **um** de: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`,
  `ci`. A lista é do gate
  [`commit-msg-gate.ts`](./tooling/scripts/commit-msg-gate.ts) (`TIPOS`) — o
  hook [`.husky/commit-msg`](./.husky/commit-msg) reprova o que estiver fora.
- O `escopo` é **opcional** e não pode conter espaço nem parênteses.
- A descrição é obrigatória e vai em pt-BR
  ([`idioma.md`](./.agents/specs/conventions/idioma.md)).
- `!` antes do `:` marca breaking change.
- O **assunto** é a única parte convencionada; o corpo é prosa livre.

Exemplos reais do repositório (`git log --oneline -20`):

```text
feat(ci): a revisão de PR vira regra — comentário obrigatório e 2 gates
fix(api): o registro da recusa leva o ESCOPO, e o log do 5xx não leva a query
chore(agents): cinco memórias da execução do plano do histórico entram no ledger
```

O dono da regra completa é
[`git-workflow.md`](./.agents/specs/conventions/git-workflow.md); o do idioma,
[`idioma.md`](./.agents/specs/conventions/idioma.md).

## Fluxo de branches

**Trunk-based.** `main` é o tronco único e sempre integrável. Nenhuma
alteração entra em `main` sem Pull Request.

1. Atualize a base antes de qualquer trabalho:

   ```bash
   git checkout main && git pull --ff-only origin main
   ```

2. Crie a branch **a partir da `main` atualizada** — `git switch -c`, e **não**
   `git branch`, que cria sem trocar de branch:

   ```bash
   git switch -c feature/<nome-descritivo>
   ```

   Prefixos: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`, `hotfix/`.
   O nome descreve **o problema**, não a ferramenta.

3. Antes de **qualquer** commit ou push, confirme em qual branch você está —
   como **último comando**, não como último do raciocínio:

   ```bash
   git branch --show-current
   ```

4. Rebase na `main` atual antes do push se a `main` avançou:

   ```bash
   git fetch origin main && git rebase origin/main
   ```

5. Push da branch e PR para `main`. Merge por squash; branch apagada quando o
   PR sai de `open` (merged **ou** closed).

O dono da regra completa é
[`git-workflow.md`](./.agents/specs/conventions/git-workflow.md), com o
apêndice de casos de branch morta em
[`git-workflow-apendice.md`](./.agents/specs/conventions/git-workflow-apendice.md).
O fluxo inteiro, do primeiro comando ao merge, está em
[`docs/fluxo-desenvolvimento.md`](./docs/fluxo-desenvolvimento.md).

## Code Review

**Todo PR aberto precisa de pelo menos um comentário de revisão antes do
merge.** O check `review-comment` (workflow `pr-review.yml`) reprova o merge
sem ele, e o comentário do processo orquestrado carrega o marcador
`<!-- pr-review -->`.

Quem revisa o quê é decidido pela matriz
[`review-routing.md`](./.agents/specs/conventions/review-routing.md): o diff é
classificado e **um specialist por parte alterada** é despachado, em
paralelo. O processo passo a passo está em
[`pr-review-mode.md`](./.agents/workflows/pr-review-mode.md); a regra, em
[`pr-review.md`](./.agents/specs/conventions/pr-review.md).

Duas regras de conduta:

- O revisor **não** participa da implementação que revisa.
- O comentário consolidado diz também **o que não foi verificado** — um
  relatório que não declara o que ficou de fora lê como "não tinha nada".

## Estilo de código

O estilo **não** é opinião do reviewer: cada família de código tem convenção,
e a convenção é a dona.

| Assunto | Convenção |
|---|---|
| Idioma (pt-BR na prosa, inglês técnico em identificador) | [`idioma.md`](./.agents/specs/conventions/idioma.md) |
| Estrutura de pastas, versionamento, DDD/Hexagonal | [`estrutura-e-versionamento.md`](./.agents/specs/conventions/estrutura-e-versionamento.md) |
| Boundary `domain/application/infrastructure` | [ADR-0001](./docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md) |
| Frontend: tokens, primitivas e o que é proibido numa tela | [`estilizacao.md`](./.agents/specs/conventions/estilizacao.md) |
| Frontend: acessibilidade mínima | [`estilizacao-acessibilidade.md`](./.agents/specs/conventions/estilizacao-acessibilidade.md) |
| Frontend: contraste dos pares de token | [`estilizacao-contraste.md`](./.agents/specs/conventions/estilizacao-contraste.md) |
| Lint da matriz de routing de specialists | [`specialist-routing.md`](./.agents/specs/conventions/specialist-routing.md) |

Regras que valem para todo o código, resumidas:

- A dependência aponta **para dentro**: `domain` não conhece `application`;
  `application` não conhece `infrastructure`.
- Toda unidade de código tem **um** doc canônico
  ([`documentacao.md`](./.agents/specs/conventions/documentacao.md)).
- Doc que **mente** é defeito P0; doc que **falta** é lacuna nomeada.
- Nenhum número em doc sem o **comando que o reproduz**
  ([`tamanho-e-revisao.md`](./.agents/specs/conventions/tamanho-e-revisao.md)).

## Testes: TDD é obrigatório

O ciclo é **Red → Green → Refactor** de Kent Beck, e vale para **toda**
alteração de código de produção — inclusive bug fix (teste de regressão
primeiro) e refatoração (os testes já existem antes).

O dono da regra é [`tdd.md`](./.agents/specs/conventions/tdd.md); a
cobertura mínima (80% agregado, declarado no config raiz) está em
[`cobertura-testes.md`](./.agents/specs/conventions/cobertura-testes.md).

## Rodar os gates localmente

```bash
pnpm ci:preflight   # camada 1 do defense-in-depth: gates rápidos, sem subir a aplicação
pnpm ci:local       # o que o CI roda: preflight + lint + typecheck + testes + boot da aplicação
```

`pnpm ci:local` é **obrigatório antes de todo push**. O `pre-push` roda
`ci:preflight` e `ci:boot`, mas **não** roda lint, typecheck nem a suíte com
coverage — quem confere isso é o `ci:local`.

Comandos isolados, para depurar um gate específico:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:coverage
pnpm test:e2e
```

O `ci:boot` exige o **banco local de pé** (runbook §1.1 de
[`docs/como-rodar.md`](./docs/como-rodar.md)) e falha alto: ele nunca pula.

## Onde a documentação do projeto vive

| Documento | O que é dono dele |
|---|---|
| [`README.md`](./README.md) | a vitrine: o que é, como executar, o mapa da estrutura |
| [`AGENTS.md`](./AGENTS.md) | a spec canônica do padrão de agents |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | este guia: convivência técnica |
| [`GLOSSARY.md`](./GLOSSARY.md) | o vocabulário do domínio |
| [`CHANGELOG.md`](./CHANGELOG.md) | o histórico de versão |
| [`docs/como-rodar.md`](./docs/como-rodar.md) | o **como executar**, por ambiente |
| [`docs/fluxo-desenvolvimento.md`](./docs/fluxo-desenvolvimento.md) | os gates: camada, comando, o que de fato bloqueia |
| [`docs/system-design/`](./docs/system-design/README.md) | o **desenho** do sistema: topologia, dados, segurança, operação, contrato de extensão |
| [`docs/adr/`](./docs/agents/domain.md) | as **decisões** — o índice canônico dos ADRs é [`docs/agents/domain.md`](./docs/agents/domain.md) |
| [`docs/tdr/`](./docs/tdr/README.md) | as decisões com alternativas avaliadas e rollout (TDR) |
| [`docs/prd/`](./docs/prd/README.md) | o problema de produto e as métricas |
| [`docs/runbooks/`](./docs/runbooks/docker.md) | os **procedimentos**, por ambiente |
| [`docs/post-mortems/`](./docs/post-mortems/README.md) | o formato do post-mortem blameless |
| [`docs/api/`](./docs/api/users.md) | o contrato HTTP por bounded context |
| [`docs/flows/`](./docs/flows/README.md) | o caminho de um request |
| [`docs/STACK.md`](./docs/STACK.md) | as versões e a justificativa de cada tecnologia |
| [`docs/MONOREPO.md`](./docs/MONOREPO.md) | as convenções de monorepo |

**O fato tem UM dono.** O segundo lugar **linka**, não copia — regra em
[`dry.md`](./.agents/specs/conventions/dry.md).

## Tamanho dos documentos

Um `.md` versionado tem **no máximo 300 linhas** — o gate
[`check-doc-size`](./.tooling/scripts/ci/check-doc-size.ts) mede. Acima do
teto, o doc é **dividido** em arquivos irmãos com índice e links cruzados. A
regra e as três categorias fora do escopo estão em
[`tamanho-e-revisao.md`](./.agents/specs/conventions/tamanho-e-revisao.md).

A mesma convenção exige uma **etapa explícita de revisão** depois de qualquer
alteração: tamanho, consistência, links, lint de Markdown, idioma, ausência
de duplicação.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.30.0
