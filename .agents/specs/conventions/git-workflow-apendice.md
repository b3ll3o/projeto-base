# Apêndice: Apagar Branch Mergeada com `-D`

> Apêndice de [git-workflow.md](./git-workflow.md) §Branch Morta: Apagar Depois
> do Merge. Leia **antes** do primeiro `git branch -D`.

`-d` recusa apagar branch não mergeada. Isso protege. Mas existem dois casos em
que só `-D` funciona — e é aí que a limpeza vira perda de trabalho.

## Caso 1 — PR merged por squash

O squash reescreve os commits: o SHA que estava na branch não é ancestral de
`main`, então `-d` recusa mesmo com o PR mergeado.

### O que já está em `main` sob outro SHA

Medido neste repo: das 6 branches apagadas com commits locais não publicados,
**5** tinham o conteúdo já presente em `main` (o squash o havia reescrito com
outro SHA). O footer `1.5.1` de `estrutura-e-versionamento.md` cita literalmente
os SHAs `e4c0971` e `f496b05` de commits que o git ainda classificava como
"não mergeados" — prova direta de que o squash os carregou.

**1 em 6 não estava.** A branch tinha conteúdo que *nada* em main reproduzia.
É esse o risco que a média esconde.

## Como decidir com segurança

```bash
# 1. O PR foi merged?
gh pr list --state merged --json number,headRefName

# 2. A branch tem commits fora de main?
git log <branch> --not origin/main --oneline
#    NÃO é discriminante: com squash merge todo commit muda de SHA, então
#    branch merged também volta "cheio". Use para localizar, não para decidir.

# 3. Quais arquivos existem na branch e NÃO existem em main?
comm -23 \
  <(git ls-tree -r --name-only <branch> | sort) \
  <(git ls-tree -r --name-only origin/main  | sort)
#    vazio  => nenhum arquivo exclusivo -> vá ao passo 4
#    cheio => arquivo exclusivo é forte indício de conteúdo perdido -> passo 4 nele

# 4. Dos arquivos que existem nos dois, sobrou linha que só a branch tem?
```

> ⚠️ **Não use `git log <branch> --not --remotes` como predicado.** Ele é
> **inerte**: `--remotes` inclui `origin/<branch>`, logo toda branch publicada
> devolve vazio — inclusive as que têm conteúdo real ausente de `main`.
> Medido: as 3 branches remotas deste repo devolveram `0`, e `origin/main`
> também. Quatro zeros que significam a mesma coisa, um deles com 3 arquivos
> exclusivos. A inércia vale para branch **publicada** — só work inedito e
> local (nunca publicado) escapa dela, porque não tem `origin/<branch>`.
>
> O discriminante é o **passo 3** (arquivos exclusivos), não o passo 2.

Para cada arquivo divergente, veja se sobrou linha que só a branch tem:

```bash
comm -23 \
  <(git show <branch>:<arquivo> | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort -u) \
  <(git show main:<arquivo>     | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort -u)
```

Saída vazia ⇒ main é igual ou mais novo ⇒ `-D` é seguro.
Saída com linha real ⇒ **não apague.** Reabra o PR ou extraia o commit.

> Não confie só no contador. Este contador acusou 230 "linhas perdidas" em
> `feat/guard-classes` e 326 em `chore/melhorias-fluxo-desenvolvimento` — todas
> eram versões antigas de arquivos que main já havia reescrito. A contagem mede
> *divergência de texto*, não *perda*. Por isso a inspeção linha a linha.

## Caso 2 — branch sem PR

Branch nunca aberta como PR e nunca mergeada. Ela não está "morta" — está
**abandonada** ou **em trabalho**. Apagar é decisão de conteúdo, não de higiene.

Medido: de 30 branches deste repo, 3 estavam nesse caso e **nenhuma** era
descartável — uma tinha 2 artigos inteiros ausentes em `main`.

Para essas, o caminho é PR ou backup, nunca `-D` no escuro.

## Caso 3 — PR closed sem merge

O PR fechou mas o código **não** entrou em `main`. É o caso que mais exige
exame, porque a branch tem conteúdo real que **ninguém mais tem**.

```bash
gh pr list --state all --head <branch> --json number,state,mergedAt
```

`state: CLOSED` com `mergedAt: null` = conteúdo não está no tronco. Não apague
no escuro — rode o exame de conteúdo dos dois casos acima.

Medido neste repo (2026-10-06, 3 branches remotas): as 2 branches com PR fechado
foram preservadas, e a verificação pagou — `docs/articles-transcription-vibe-coding-sdd`
(PR #35) tem **3 arquivos exclusivos** que `main` não reproduz: os 2 artigos
(49 + 285 linhas órfãs) e `apps/api/.eslintrc.js`.
`feat/evals-convention-and-spec-template` (PR #36) tem 1 arquivo exclusivo — o
mesmo `.eslintrc.js`, substituído em `main` por `eslint.config.mjs`. Suas
divergências nos arquivos que existem nos dois lados, todas resolvidas por
`main` ser mais novo:

| Arquivo | Órfãs | Composição |
|---|--:|---|
| `AGENTS.md` | 21 | 18 com `../.agents/` (main usa `./.agents/`), 2 marcadores `_(pendente …)_`, 2 linhas de tabela reescritas por `main` (`Cobertura de Testes`, `Git Workflow`) |
| `evals.md` | 3 | as 3 refs aos artigos da PR #35 — main já as tem, só o destino não |
| `spec.md` | 0 | — |

> **Sinal correlato que o exame não acharia:** `evals.md` **em `main`** cita os
> 2 artigos da PR #35 em 4 lugares — frontmatter `related` (path solto, sem
> backtick), §0 e `§10. Cross-references` (3 em backtick) — e nenhum dos dois
> existe em `main`. O gate `check-doc-refs` passa verde porque o gate só
> reconhece link markdown `[texto](path)`; nenhuma das 4 tem essa forma.
> Confirmado por counterfactual: convertendo-as em link markdown, o gate acusa
> as 3 quebradas. Referência quebrada é, portanto, um indício de branch
> preservada — e um ponto cego do gate.

Duas saídas legítimas:

- **conteúdo está em `main`** (o PR fechou porque outra via entregou) → apague
- **conteúdo não está** → **não apague**: reabra o PR, ou salve com
  `git tag backup/<branch> <branch>` e só então apague

"PR fechado" não é sinônimo de "trabalho preservado". O PR fecha quando alguém
decide; o conteúdo pode ter sido descartado nessa decisão, e é justamente por
isso que ele ainda está na branch.

## A tag de recuperação

Apagar é irreversível para quem não conhece o SHA. Antes de cada `-D`:

```bash
git tag backup/<branch> <branch>
```

Recuperar:

```bash
git branch <branch> backup/<branch>
```

> O nome da tag **pode** conter `/` (ex.: `backup/feat/guard-classes`) e o git
> trata isso como hierarquia de ref, não como erro. Testado: recupera o SHA
> certo. O que falha é o *branch* de backup — nome com `/` é ambíguo com o
> prefixo de path — então use `git branch <novo-nome-simples> backup/<branch>`.

Quando a limpeza acabar, as tags `backup/*` podem ser removidas. Até lá, elas
são o que separa limpeza de incidente.