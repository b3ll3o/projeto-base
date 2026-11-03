# House rules — o que é proibido numa página pública

> **Estas regras valem em toda construção, seja qual for a direção.** O
> inspetor do upstream media cada uma delas na página viva; aqui elas são
> conferidas por leitura e por e2e.

Cada linha traz: a regra, e **o que fazer** no lugar dela.

| Regra | No lugar dela |
|---|---|
| **Manchete: duas linhas ou menos, em qualquer largura.** Vale para todo `h1`–`h6` e para a linha principal da primeira tela, seja qual for a tag. | Corte palavras. Depois alargue a medida. O tamanho vem por último. |
| **Um título claro na primeira tela**, no único `h1` da página, e um heading em cada seção. | Diga o que é: o nome com o que faz, o produto com o que é para, o evento com a data e o lugar. |
| **Margens externas iguais; nenhuma seção encostada num lado** com a outra metade da tela vazia. | Feche todo vazio com algo no lado oposto: a imagem da seção, uma segunda coluna, uma lista, uma figura. |
| **Nenhum trecho em branco** mais alto que cerca de meia tela. | O espaçamento normal entre seções. Um descanso deliberado é uma imagem colocada ou um campo de cor — uma vez por página. |
| **Declaração é parágrafo.** Uma frase de introdução ou uma citação grande é marcada como `<p>` ou `<blockquote>`, fica no tamanho de declaração (36px ou menos no desktop, 24px no celular) e corre por cerca de 25 palavras, três linhas. | Maior que isso é manchete, e vale a regra das duas linhas. Em teste cego, jurados leram uma frase de 42px em quatro linhas como manchete de quatro linhas. |
| **Sem eyebrow.** Sem label pequeno acima de um heading, sem badge em pílula acima da manchete, sem chip "Novo ·". | Ponha a informação no heading ou na primeira frase — ou não ponha. |
| **Sem monoespaçada** fora de bloco de código de verdade. | A fonte do texto. Números tabulares onde os números se alinham. |
| **Sem numeração de índice.** Sem 01 / 02 / 03, sem (001), sem "Passo 2". | A ordem aparece pela posição, pelo tamanho ou pelas palavras. Um `<ol>` de verdade se a ordem importar. |
| **Sem fio fino.** Sem divisórias de 1px, sem caixa contornada, sem grade, mira ou marca de corte. | Espaço. Um passo de tom no fundo. Uma mudança de escala. Uma forma preenchida. |
| **Sem gradiente.** Nem como fundo, nem em botão, nem no texto. | Cor chapada — ou uma fotografia de verdade. Um véu neutro sob o texto de uma foto é a única exceção. |
| **Sem sombra em coisa parada.** Sem brilho. | Um passo de tom entre superfícies. Sombra só no que de fato flutua: um menu, um diálogo. |
| **Sem paleta de assistente.** Nada de fundo creme-amarelo com terracota ou ferrugem; nada de violeta ou índigo. | A paleta treatada. |
| **Sem label pequeno em caixa alta e espaçada.** | Sentence case num tamanho legível. |
| **Sem card de feature com ícone no topo, sem fileira de cards idênticos.** | O blueprint de seção treatado. |
| **Sem vidro.** Sem painel com backdrop blur, sem navegação em pílula flutuante. | Uma barra simples: wordmark, três ou quatro links, uma ação. |
| **Sem emoji, sem blob de gradiente, sem forma decorativa, sem dashboard falso de barras cinzas.** | Uma imagem de verdade, um fragmento real da interface, ou nada. |
| **Sem palavra de destaque estilizada** na manchete (itálico, serifa, cor, sublinhado). | Uma fonte, uma cor. As palavras carregam a ênfase. |
| **No máximo duas fontes**, normalmente uma. | O sistema tipográfico treatado. |

## Três lugares que têm convenção própria

Ficam de fora da lista acima:

1. **Código de verdade** em `<pre>`/`<code>` — monoespaçada é o certo ali.
2. **Tabelas e campos de formulário** de verdade — podem ter linha.
3. **Fragmento real de interface** cuja raiz carregue o atributo `data-ui` — as
   bordas e os menus do próprio produto.

## Por que estas — honestamente

Algumas regras são **medidas**: entre os 247 sites do estudo, os avaliados com
7,5 ou mais usaram card de feature com ícone 1% das vezes, contra 28% nos
sites abaixo de 6,5; badge em pílula 14% contra 34%; gradiente 22% contra
52%; sombra 24% contra 48%; caixa alta pequena e espaçada 16% contra 57%.

Outras são **gosto do dono** e vão contra a moda atual das galerias:
monoespaçada em label, numeração de índice e grade de fio fino são, na
verdade, *mais* comuns em sites premiados do que em sites fracos — é
exatamente por isso que gerador os imita e é por isso que hoje eles leem como
figurino. Aqui estão proibidas sem exceção.

## A regra que vem depois de tirar a ornamentação

Tirar a ornamentação **deixa espaço**. Nunca preencha esse espaço com outra
ornamentação. Preencha com **escala** (deixe o principal maior), com o
**conteúdo inteiro**, com uma **imagem feita para este assunto**, ou com um
**campo de cor chapada**. Deixe vazio de propósito, no máximo uma vez por
página.

O registro datado dos "indícios" de página gerada está em
[`inspecao-e-pesquisa.md`](inspecao-e-pesquisa.md).
