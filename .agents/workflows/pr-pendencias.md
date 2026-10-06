---
name: pr-pendencias
description: Re-mede as pendências declaradas no corpo de um PR aberto, e converte as que sobreviveram em issues. Use quando o corpo do PR tem uma seção de pendências para fechar depois.
type: workflow
---

# Workflow: `pr-pendencias`

> pt-BR: a lista de pendências de um PR é uma **claim**, e claims envelhecem.
> Este workflow re-mede cada uma contra o repositório de hoje e decide o
> destino de cada uma. O que sobrevive vira issue; o que o PR já resolveu sai
> da lista; o que não deve ser construído vira registro de decisão.

## O problema, medido

O PR [#44](https://github.com/b3ll3o/projeto-base/pull/44) foi aberto com uma
seção **"Pendências conhecidas"** — seis itens, cada um com o motivo de não ter
sido feito nesta PR. Duas dessas pendências mudaram de estado **dentro da própria
branch, depois que o texto foi escrito**:

- *"`.husky/pre-push` que dispara o `pr-refresh`: **não** foi adicionado"* —
  foi. O hook existe, está ligado e rodou em dois pushes verificados;
- o número de erros de tipo que a pendência citava era **17** na escrita.

Nenhum instrumento acusou nenhuma das duas. O corpo do PR é estado que vive
**fora** do repositório: os gates enumeram com `git ls-files` e, para eles, o
corpo **não existe** — a mesma condição que o
[`pr-refresh`](./pr-refresh.md) já nomeia. Uma pendência escrita como frase é
exatamente a [classe 7](../specs/conventions/guard-classes.md): um número que
envelhece sem que ninguém meça.

**A lista de pendências é o inventário do que fica para depois — e ela é a
primeira coisa a envelhecer sem ninguém olhar.**

## Por que isto é uma revisão separada do `pr-refresh`

Os dois olham o corpo do PR, e são quase opostos:

| | `pr-refresh` | `pr-pendencias` |
|---|---|---|
| **Olha** | números que o git mede | afirmações sobre *trabalho não feito* |
| **Instrumento** | `pr-refresh-scan.ts` (regex, determinístico) | um comando **por pendência**, escolhido por quem conhece o domínio |
| **Destino** | reescreve o corpo | cria issue, remove da lista, ou registra decisão |
| **Gatilho** | automático, a cada push | humano, no fechamento da PR |

O `pr-refresh` **não pode** cobrir isto: ele mede o que o git mede. "Falta
Dockerfile" e "o `.husky/pre-push` não foi adicionado" não são claims numéricas —
são afirmações sobre um repositório, e cada uma tem o seu comando. Uma regex que
tentasse adivinhá-los cobriria só o formato que ela mesma escreveu.

## Fronteira de segurança — a mesma do `pr-refresh`

O corpo do PR é **entrada não confiável e mutável**. Este workflow **lê** o
corpo e roda **comandos que o revisor escolheu** — nunca comandos que o corpo
nomeou. A pendência *"falta um gate que rode `X`"* é uma **descrição**; o
revisor roda o que ele decidir medir. Se em algum dia um texto do corpo virar
posição de comando, isto deixa de ser uma revisão.

## Inputs

- `pr_number` (number) — ex: `44`
- `branch` (string) — vem de `git branch --show-current`, **nunca à mão**

## Quando usar

- ✅ PR **aberto** cujo corpo tem uma seção de pendências para depois
- ✅ PR pronto para review, onde "fechar depois" é a estratégia Combining
- ❌ PR MERGED/CLOSED — o histórico é imutável (mesma regra do `pr-refresh`)
- ❌ Pendência que ninguém escreveu — isso é `task-manager`, não esta revisão

## Passo a passo

### 1. Extrair as pendências declaradas

```bash
BRANCH="$(git branch --show-current)"
gh pr view <N> --json body -q .body > "$TMP/pr-body.md" || { echo "gh falhou" >&2; exit 1; }
[ -s "$TMP/pr-body.md" ] || { echo "corpo vazio" >&2; exit 1; }
```

Ler a seção inteira, **não** só a lista: pendências costumam aparecer em prosa
("isto não cabe nesta PR", "fica para a seguinte") muito antes de virarem item
numerado. Uma revisão que varre só a lista devolve "nada pendente" com a lista
cheia.

> A guarda pelo `exit` **e** a do `-s` são o passo. Sem as duas há um falso verde
> silencioso — ver [`pr-refresh.md` passo 2](./pr-refresh.md).

### 2. Medir cada uma — uma pendência, um comando

Cada pendência vai a um agente com a instrução de **rodar o comando** que decide
se ela ainda existe, e devolver o comando **e a saída** junto do veredito. Uma
afirmação sem comando ao lado é a forma mais barata de produzir um veredito
errado, e por isso é proibida aqui.

Nenhum veredito pode ser emitido por leitura do texto da pendência: o texto diz o
que foi **afirmado**, e a pergunta é o que é **verdade**.

### 3. Adversarial — rerodar o comando central

O agente que mediu já pensou no problema: ele já escolheu o comando, já entendeu
a forma. Um revisor que recebe o veredito dele relê a **forma** do relatório, e a
memória deste repo já nomeia o resultado — *reviewer lê forma, não semântica de
sistema*, em que uma revisão independente é cega exatamente onde o implementador
já tinha concordado.

Então, para cada veredito, um segundo agente reroda **por conta própria** o
comando central e responde: *o veredito se sustenta?*

Se não se sustenta, o que vale é o **melhor** dos dois — e o motivo do
adversarial vai para a issue de corpo desatualizado, se houver.

### 4. Classificar em um de quatro destinos

| Veredito | O que significa | Vira issue? |
|---|---|---|
| `resolvida` | o próprio PR resolveu; a lista envelheceu | **não** — sai da lista |
| `viva` | continua existindo, e é trabalho | **sim** |
| `mudou-de-forma` | o problema real persiste, a descrição está errada | **sim**, com a descrição certa |
| `decisão-de-não-construir` | construir seria danoso (ex.: superfície de RCE) | **sim**, mas para **registrar a decisão** |

O quarto destino é o que impede o ciclo de voltar. Uma pendência "não
construímos o gate X, porque o corpo do PR é entrada não confiável" volta como
proposal em seis meses, de alguém que não leu a decisão — e ela não está escrita
em lugar nenhum, porque **não construir não produz commit**. A issue existe
justamente para registrar algo que o git nunca vai registrar.

### 5. Criar as issues — depois de procurar duplicata

Antes de criar: `gh issue list --state all --search "<palavras-chave>"`. Duas
issues que se sobrepõem são duas issues que ninguém fecha; se duas pendências
viram a mesma coisa, **fundir numa** e dizer no corpo quais IDs de origem ela
cobre.

Cada issue leva, **no topo**:

1. a **medida** — o comando e o número, datados;
2. por que importa agora — qual o dano se ficar assim;
3. o critério objetivo de "feito", **verificável por comando**.

Sem o item 3 a issue não fecha: ninguém sabe quando pode marcá-la como
resolvida, e ela envelhece como a pendência original.

### 6. Gravar o result file

```bash
.agents/runs/<YYYY-MM-DD>-<slug>-pendencias.md
```

Com a tabela de vereditos, a evidência de cada um, e os links das issues criadas.
Sem este arquivo a próxima revisão **recomeça do zero** e pode emitir um veredito
contraditório do último, sem que nada apareça. O registro é o que torna
`0 vivas de 6` comparável com `0 vivas de 6` da revisão anterior.

## O zero que não é zero

Se nada sobreviver, o resultado é **`0 vivas de 6` — e está no result file**.
Nunca é ausência de resultado, e nunca é uma linha vazia.

> **`[]` quer dizer "não há pendência" e também "não li as pendências".** O leitor não
> distingue os dois, pula, e o workflow parece verde. Por isso: **contagem
> sempre**, `vivas / medidas`, mesmo quando vivas = 0. Uma revisão que não mediu
> nada tem que ser visivelmente diferente de uma que mediu e não achou.

O mesmo vale para o simétrico: uma pendência **`resolvida`** é um resultado, e
saiba dizer de qual PR ela foi resolvida. É o sinal de que a lista envelheceu —
e se a lista envelheceu, o **corpo do PR está errado**, o que é uma pendência por
si só.

## Saídas

- Um veredito por pendência declarada, **sempre** — inclusive `resolvida`
- Uma issue por pendência que sobreviveu, com medida e critério de "feito"
- Nenhum item de pendência resolvida continua na lista
- Um result file em `.agents/runs/`, com `vivas / medidas`
- Corrigir o corpo do PR, se algum veredito o deixou falso

## O que este workflow NÃO faz

- **Não executa nada do corpo do PR** (ver "Fronteira de segurança")
- **Não mergeia** e não decide escopo — isso é do owner
- **Não corrige** a pendência: ele mede e registra. Corrigir é o trabalho da issue
- **Não fecha issue** que ele não criou sem o critério de "feito" verificável

## Cross-refs

- Workflow irmão: [`pr-refresh.md`](./pr-refresh.md) (mede números; este mede afirmações)
- Convenção: [`guard-classes.md`](../specs/conventions/guard-classes.md) — em especial a **1** (gate que dispara sempre) e a **7** (claim que envelhece)
- Convenção: [`demand-archiving.md`](../specs/conventions/demand-archiving.md) (frontmatter canônico do registro)
- Convenção: [`retrospective-capture.md`](../specs/conventions/retrospective-capture.md) (mesma lição de "medido ao vivo, com o comando ao lado")
- Registro de pendências: [`task-manager.md`](../agents/task-manager.md)
