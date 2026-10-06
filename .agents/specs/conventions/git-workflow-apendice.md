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

# 2. A branch tem commits que nunca foram publicados?
git log <branch> --not --remotes
#    vazio  => seguro, o conteúdo está todo em main
#    cheio => o trabalho pode existir só na máquina -> siga para o passo 3

# 3. O que a branch tem que main não tem?
git diff --name-only main <branch>
```

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