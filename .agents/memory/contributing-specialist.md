---
name: contributing-specialist-memory
description: Memória acumulada do agent contributing-specialist — o CONTRIBUTING é a cara visível da convenção de git, e o repo impõe menos do que o guia precisa prometer
---

# Memória: `contributing-specialist`

> Arquivo de memória do agent `contributing-specialist`.

## Decisões Tomadas

### 2026-11-18 — O guia traduz a convenção; a convenção é a fonte

**Contexto:** as 4 âncoras do item 2 (`## Padrão de commits`, `## Fluxo de
branches`, `## Code Review`, `## Estilo de código`) cobrem 4 convenções
distintas: `git-workflow.md`, `review-routing.md` + `pr-review.md`, e
`tdd.md` + `idioma.md` + `estrutura-e-versionamento.md`. A `git-workflow.md`
sozinha já tem ~300 linhas.

**Decisão:** o `CONTRIBUTING.md` **não copia** nenhuma delas — ele linka a
seção e resume só o que o contribuidor faz **antes** e **depois** do PR. O
guia tem ≤ 300 linhas e **junto** com as outras 3 seções; a convenção
continua sendo o arquivo que se lê inteiro quando a dúvida é sobre a regra.

**Consequências:** uma mudança na convenção não obriga a reescrever o
guia — só obriga a conferir se o resumo ainda é verdade. E o guia não
envelhece por cópia: ele envelhece por resumo desatualizado, que é
detectável.

### 2026-11-18 — O guia não promete o que o GitHub não impõe

**Contexto:** o `git-workflow.md` §Nota registra que o ruleset `master`
(`23853096`) tem `required_status_checks` = `quality`, e que
**`required_approving_review_count` segue `0`** — o repositório é de
contribuidor único. O `ci.yml` só dispara em `push: feat/**` e
`pull_request: main`.

**Decisão:** a seção `## Code Review` diz o que **o repo pratica** (o
comentário de revisão obrigatório por PR, o `review-router`, o
`stack-code-reviewer` no pre-commit) e **não** promete "1 aprovação
obrigatória". Um guia que promete o que o branch protection não exige
é um doc que mente — e o leitor perde tempo esperando por ela.

**Consequências:** o guia cita a barreira real (`quality` + `preflight`) e
o ponto em que a revisão é **convenção** (revisão humana), não barreira
automática.

### 2026-11-18 — O exemplo de commit passa no gate antes de entrar no guia

**Contexto:** o commit-msg gate é o instrumento que cobra o padrão; o bot de
commit do repo escreve no mesmo formato. Os commits reais do trunk usam
subject no formato `tipo(escopo): descrição em pt-BR`, com o `tipo` em
inglês (conventional commits) e a descrição em pt-BR — por exemplo
`docs(api): o registro da recusa leva o escopo, e o log do 5xx não leva a
query`.

**Decisão:** o exemplo do `CONTRIBUTING.md` é **o subject real**, e ele é
passado no gate de commit-msg antes de virar prosa do guia. Um exemplo
inventado no guia envelhece no primeiro PR que usa o bot.

**Consequências:** o guia e o bot escrevem a mesma linha, e a linha do guia
é prova viva de que o padrão é aceito.

## Padrões Descobertos

- O passo de criação de branch é `git switch -c <prefixo>/<nome>` — **não**
  `git branch <nome>`. O `git branch` cria e **não** troca: sai com exit 0 e
  o contribuidor continua na branch anterior (incidente medido no PR #59).
- Prefixos de branch aceitos: `feature/`, `fix/`, `refactor/`, `docs/`,
  `chore/`, `hotfix/`. O nome descreve o **problema**, não a ferramenta.
- **Branch morta**: branch cujo PR saiu de `open` — merged **ou** closed —
  está morta e deve ser apagada. O `git branch -d` recusa com squash merge
  (o tip deixa de ser ancestral), e a recusa é proteção, não erro.
- O **pre-push** obrigatório é `pnpm ci:local`; o hook `.husky/pre-push`
  roda `pnpm ci:preflight` + `pnpm ci:boot` — e o `ci:boot` exige o banco
  local de pé.
- A revisão é **orquestrada**: `review-router` classifica o diff e dispara
  1 specialist por parte alterada; todo PR aberto precisa de **≥ 1
  comentário de revisão** com o marcador `<!-- pr-review -->`.
- `CONTRIBUTING.md` **não existe** na raiz (medido em 2026-11-18) — o item 2
  do kit é lacuna nomeada, e as 4 convenções que ele deveria resumir já
  existem e já são medidas.

## Lições Aprendidas

- ❌ **Regra que o gate não mede é conselho.** Cada regra do guia aponta o
  instrumento que a cobra; regra sem instrumento não entra como "obrigatória".
- ❌ **Copiar a convenção para dentro do guia.** A convenção muda; a cópia
  envelhece em silêncio, e ninguém sabe qual das duas está certa.
- ❌ **"1 aprovação obrigatória".** O repo tem
  `required_approving_review_count` = 0 — a aprovação é convenção, não
  barreira.
- ❌ **`git branch <nome>` como passo 2 do fluxo.** Cria e não troca.

## Sugestões de Evolução

- [ ] Criar o `CONTRIBUTING.md` a partir da `git-workflow.md` (que já tem as
      12 etapas do §Fluxo Obrigatório) + `review-routing.md` (a matriz de
      quem revisa o quê) + `tdd.md`.
- [ ] Um gate que cheque se o `CONTRIBUTING.md` cita as convenções que
      existem — o `check-doc-kit` só mede a âncora, não a convenção citada.
