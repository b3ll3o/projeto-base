# Apêndice: Apagar Branch Mergeada com `-D`

> Apêndice de [git-workflow.md](./git-workflow.md) §Branch Morta: Apagar Quando
> o PR Sai de OPEN. Leia **antes** do primeiro `git branch -D`.

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

# 3. Quais arquivos a branch REALMENTE carrega que main não tem?
MB=$(git merge-base origin/main <branch>)
comm -23 \
  <(git diff --name-only $MB <branch> | sort) \
  <(git ls-tree -r --name-only origin/main | sort)
#    vazio  => a branch não entrega nada que main não tenha -> vá ao passo 4
#    cheio => forte indício de conteúdo perdido -> passo 4 nele
#
#  NÃO compare `ls-tree <branch>` contra `ls-tree main`: isso conta como
#  "da branch" arquivo que ela só herdou e main já removeu. Medido: a PR #35
#  acusou 3 exclusivos por esse caminho, mas 1 era `.eslintrc.js`, de blob
#  idêntico ao merge-base — a branch nunca o tocou. Diff contra o merge-base
#  acusou os 2 que ela de fato criou. Classe "erra o eixo" do guard-classes.

# 4. Dos arquivos que existem nos dois, sobrou linha que só a branch tem?
```

> ⚠️ **Não use `git log <branch> --not --remotes` como predicado.** Ele mede
> *"não está em nenhuma ref remota"*, não *"não está em `main`"*. Enquanto
> `origin/<branch>` existir, ele devolve vazio para toda branch publicada —
> inclusive as que têm conteúdo real ausente de `main`. E **depois** do
> `git push origin --delete <branch>` — que é o passo seguinte do bloco
> principal — a ref some, o comando volta a devolver a branch **inteira**, e o
> diagnóstico se inverte sem nenhum aviso. Note que o procedimento que prescreve
> a consulta é o mesmo que destrói a pré-condição que a torna inerte.
>
> O discriminante é o **passo 3** (diff contra merge-base), não o passo 2.

Para cada arquivo divergente, veja se sobrou linha que só a branch tem:

```bash
comm -23 \
  <(git show <branch>:<arquivo> | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort -u) \
  <(git show main:<arquivo>     | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort -u)
```

Saída vazia ⇒ main é igual ou mais novo ⇒ `-D` é seguro.
Saída com linha real ⇒ **não apague.** Reabra o PR ou extraia o commit.

> Não confie só no contador. Ele mede *divergência de texto*, não *perda*: nas
> branches deste repo acusou centenas de "linhas perdidas" que eram versões
> antigas de arquivos que `main` já havia reescrito. O total exato não está fixado
> aqui — ele envelhece a cada `main` que reescreve os mesmos arquivos. Por isso a
> inspeção linha a linha.

## Caso 2 — branch sem PR

Branch nunca aberta como PR e nunca mergeada. Ela não está "morta" — está
**abandonada** ou **em trabalho**. Apagar é decisão de conteúdo, não de higiene.

Medido: as branches sem PR deste repo foram todas inspecionadas e **nenhuma** era
descartável — uma tinha um artigo inteiro ausente de `main`. Para essas, o caminho
é PR ou backup, nunca `-D` no escuro.

## Caso 3 — PR closed sem merge

O PR fechou mas o código **não** entrou em `main`. É o caso que mais exige
exame, porque a branch tem conteúdo real que **ninguém mais tem**.

```bash
gh pr list --state all --head <branch> --json number,state,mergedAt
```

`state: CLOSED` com `mergedAt: null` = conteúdo não está no tronco. Não apague
no escuro — rode o exame de conteúdo dos dois casos acima.

Medido neste repo (2026-10-06, branches fechadas sem merge — as duas têm o mesmo
merge-base, `4ffc732`). Comparando por `ls-tree`, ambas acusam
`apps/api/.eslintrc.js` como exclusivo — mas o **conteúdo** do arquivo nas duas é
byte a byte igual ao do merge-base (blob `e4a50a8`): nenhuma das duas branches o
tocou, e `main` o removeu em `ad0ff70` ao trocar por `eslint.config.mjs`. No diff
contra o merge-base ele desaparece. Por isso a tabela abaixo é a que vale:

| Branch (PR) | Ainda fora de `main` | Veredito |
|---|--:|---|
| `docs/articles-transcription-vibe-coding-sdd` (#35) | **1** arquivo: a transcrição de 513 linhas | a branch entregou 2, mas o **mapping** foi extraído no PR #57 e é o arquivo do tronco (`wc -l docs/articles/vibe-coding-sdd-engineering-loop-mapping.md`); a **transcrição** segue fora, sobrevivindo só na tag — decisão de copyright do dono do repo |
| `feat/evals-convention-and-spec-template` (#36) | **0** | `main` é mais nova em tudo — branch apagada |

> A coluna é o que o exame (passo 3) devolve: `comm -23` entre
> `git diff --name-only $(git merge-base origin/main <branch>) <branch>` e
> `git ls-tree -r --name-only origin/main`. Ela **envelhece** — o #35 tinha 2 fora
> de `main` antes do PR #57.

As divergências da #36 nos arquivos que existem nos dois lados, todas com `main`
mais nova — nenhuma é perda:

| Arquivo | Órfãs | Composição |
|---|--:|---|
| Arquivo | Órfãs | Composição |
|---|--:|---|
| `AGENTS.md` | 18 | links `../.agents/memory/*.md` que **saem do repo** — o `main` usa `./.agents/` |
| `evals.md` | 1 | o link para a transcrição da PR #35 — `main` já tem o destino, a branch não |
| `spec.md` | 0 | — |

> **A coluna conta só link markdown**: extração por `grep -oE '\]\([^)]+\)'` sobre
> `git show <branch>:<arquivo>` contra `git show origin/main:<arquivo>` (bloco do
> passo 4). Ela **não** pega marcador de prosa como `_(pendente …)_` nem linha de
> tabela reescrita por `main` — quem quiser esses conta no diff. A divergência
> total não está fixada aqui porque `main` reescreve esses arquivos a cada merge:
> **re-meça pelo bloco, não pelo número.**

> **A #36 deve ser descartada, não integrada:** restaurar os links órfãos de
> `evals.md` da branch os tornaria links markdown para arquivos que não existem
> em lado nenhum, e o gate `check-eslint-drift` (`allowlist: []`) falha com
> qualquer `.eslintrc.*` em `apps/`. Uma das linhas da branch ainda afirma a
> regra de cobertura errada ("80% por projeto vitest") que a `main` documenta
> como inerte.

> **Sinal correlato que o exame não acharia:** no momento do exame, `main`
> citava os 2 artigos da PR #35 em 12 linhas de 5 arquivos
> (`engineering-loop.md`, `evals.md`, `01-understand.md`,
> `vetor-grafos-fine-tuning-resumo.md` e um plano) — e não em 4: o artigo chegou
> a ser citado por PRs que **rodaram depois** do close do #35, alargando o rastro.
> Nenhuma das 12 tinha forma de link markdown, então `check-doc-refs` era cego
> para todas. A contagem está ancorada no commit **antes** do PR #57 e envelhece
> a cada merge que reescreve as citações — re-meça com
> `git grep -c 'vibe-coding-sdd-engineering-loop' <ref>` em vez de citá-la.
> Confirmado por counterfactual: convertendo-as em link markdown, o gate passou a
> acusar as quebradas — e, depois que o mapping entrou (PR #57), a maioria resolve
> e fica **sob verificação**. Referência quebrada é, portanto, indício de branch
> preservada — e ponto cego do gate.

Duas saídas legítimas:

- **conteúdo está em `main`** (o PR fechou porque outra via entregou) → apague
- **conteúdo não está** → **não apague**: reabra o PR, ou salve com
  `git tag backup/<branch> <branch>` e só então apague

"PR fechado" não é sinônimo de "trabalho preservado". O PR fecha quando alguém
decide; o conteúdo pode ter sido descartado nessa decisão, e é justamente por
isso que ele ainda está na branch.

## A tag de recuperação

Apagar é irreversível para quem não conhece o SHA. Antes de cada `-D` **em
branch cujo exame acusou conteúdo fora de `main`** (passo 3 acima) — com o exame
vazio a main já tem tudo, e criar tag ali é ruído que se acumula a cada limpeza:

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