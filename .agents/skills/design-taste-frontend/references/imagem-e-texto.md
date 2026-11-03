# Imagem e texto

## §1. Imagem

### Decida o que existe

Antes de qualquer busca, decida **o que de imagem existe de verdade** para
este assunto: as fotografias do próprio projeto, uma interface real que
possa ser mostrada, uma ferramenta de geração que você possa chamar, ou
nada. **Não planeje em torno de imagem que não existe.**

"Não tem nada do próprio projeto" quase nunca quer dizer nada: a cidade, a
rua, os materiais e a história do assunto estão em arquivos abertos e
museus, de graça, com crédito.

### Imagens reais das coleções abertas

Busque pelo **inventário** do passo 1, não pela categoria: a rua em cartões
-postais antigos, um mapa velho do bairro, o material de perto, o ofício
em gravuras, um objeto de museu da mesma espécie, uma prancha botânica, uma
carta celeste.

Cada imagem encontrada:

- é **baixada para o projeto**, com a fonte e a licença registradas;
- é **creditada na página** (a linha de crédito fica pequena no rodapé);
- é **listada no relatório** (título, autor, licença, página de origem);
- **nunca** é apresentada como produto, sala, prato, pessoa ou equipe do
  próprio cliente — ela mostra o mundo **em volta** do cliente.

Use-as grandes e com intenção: uma fotografia de arquivo como hero, uma
gravura ampliada virando o motivo da página, o mapa real da rua na seção de
contato. Olhe cada uma antes de escolher.

### Crop e tratamento

- **Mesmas proporções de crop** em toda a página (**73%** dos sites
  estudados deixa a mídia com canto reto).
- **Uma luz e um grado** em toda a fotografia — banco misturado denuncia a
  página.
- A hero ocupa **pelo menos metade da primeira tela** em **68%** dos sites
  de maior nota.
- Texto **nunca** por cima de uma manchete ou de uma declaração. Sob uma
  foto, o texto leva um véu neutro.

### Mostrar software

Quando o produto **é** software e não há fotografia, as pictures da página
são a **própria interface**: um fragmento crível do produto em HTML, no
tamanho real (rótulos verdadeiros, números que batem, um item em hover ou
selecionado), com o atributo `data-ui` na raiz para as bordas e os menus do
produto. **Nunca** um dashboard falso de barras cinzas, nunca uma moldura
de aparelho.

### Desenhar o assunto

Para o que não tem imagem honesta: desenhe o objeto — as peças como formas
planas em SVG inline, grandes, num único linguagem gráfica, nas cores que
fazem valer a compra (um esmalte, um acabamento, um material), **nunca**
placeholders cinza.

### Tipo e cor sozinhos

Quando não há imagem nenhuma, a página se sustenta com **escala** e **campo
de cor** — mas isso é o último recurso, não o primeiro.

### O piso

Pelo menos **quatro imagens reais** na página (fotografias, imagens de
arquivo, mapas, gravuras, vídeo, arte em bitmap; para software, os
fragmentos de interface cortados contam). Normalmente seis a doze.

**Desenho em SVG não conta** para o piso: desenhe o que não tem imagem e
ainda assim traga imagens reais.

Uma imagem em movimento, sempre que exista um clipe honesto: um loop mudo
com quadro de poster.

### Onde as pictures vão

Por quantidade de tela primeiro (a hero), depois por função: a imagem que
**mostra a coisa**, a que **situa o lugar**, a que **prova o claim**. O que
não pertence: imagem decorativa ao lado de texto que não precisa dela.

## §2. Texto

**A copy é a primeira decisão de design.** Uma manchete que precisa de
quatro linhas não se salva com tipografia, e uma página de slogans não se
salva com layout. Escreva a página em texto puro antes de qualquer markup.

### Escreva o argumento primeiro

Numa nota de rascunho, uma linha para cada pergunta:

- Quem lê, e o que já sabe?
- O que é isto, dito como o dono diria a um amigo?
- **Uma** coisa que o leitor deve acreditar depois de uma tela?
- O que o faria acreditar (uma imagem da coisa, um número, um nome, uma
  demonstração)?
- O que ele faz depois?

Depois liste a página como claims, um por seção, cada um com sua prova:

```
1. É um banquinho de carvalho de três pés, feito sob encomenda.   → o banquinho, grande
2. Cada assento é cortado de uma tábua, então o veio é seu.       → três close-ups
3. Leva seis semanas, e você acompanha.                            → as etapas, fotografadas
4. Custa 240 e é entregue pelo marceneiro.                        → preço, botão
```

Seção sem claim é enchimento — apague. É assim que se escapa da ordem de
estoque (hero, logos, features, depoimento, preço, chamada): **a ordem do
argumento é a ordem da página**.

### A manchete de duas linhas

Nos sites de galeria estudados a manchete da hero tem mediana de **5
palavras** e **70%** cabem em uma ou duas linhas na largura de desktop.
Toda manchete da página, em todo viewport, cabe em **duas linhas ou
menos**.

A restrição é aritmética — faça a conta antes de se apaixonar pela frase:

```
caracteres por linha ≈ largura da linha em px ÷ (tamanho da fonte em px × k)

k ≈ 0,40  fontes condensadas
k ≈ 0,50  a maioria das grotesques e serifas em tamanho de display, tracking apertado
k ≈ 0,58  fontes largas/estendidas, caixa alta
```

| Onde | Largura | Tamanho | Por linha | Orçamento de duas linhas |
|---|---|---|---|---|
| Celular 390, calhas de 20px | 350px | 44px | ~16 | **~32 caracteres** |
| Celular 390, calhas de 20px | 350px | 34px | ~21 | ~42 caracteres |
| Tablet 768 | 690px | 64px | ~22 | ~44 caracteres |
| Desktop, medida de 12 colunas | 1100px | 104px | ~21 | ~42 caracteres |
| Desktop, meia largura | 620px | 72px | ~17 | ~34 caracteres |

Uma manchete de hero com **cerca de 32 caracteres ou menos** (quatro a seis
palavras) sobrevive em toda largura num tamanho confiante. Até ~42 funciona
se o tamanho no celular cair para os 30 e poucos. Passando disso você está
escrevendo uma frase: mova o resto para a linha de apoio.

**Controlando a quebra:**

- Dê à manchete um `max-width` em `ch` para ela quebrar onde você quer, e
  acrescente `text-wrap: balance` para as duas linhas saírem parecidas.
- Onde a quebra importa (costuma importar), **autore**: `Banquinhos para<br>
  cozinhas pequenas`. Confira o screenshot do celular; se a linha autorada
  quebrar ali, esconda o `<br>` num breakpoint ou encurte.
- **Nunca** resolva uma manchete longa só diminuindo-a. Uma manchete tímida
  de 28px e nove palavras é pior que cinco palavras a 64px.
- Evite a palavra órfã na segunda linha. Rebalanceie **cortando uma
  palavra**, não empurrando a largura.

Headings de seção seguem a mesma regra e são mais curtos: **duas a cinco
palavras**.

**Uma declaração não é manchete.** Uma frase de introdução ou uma citação
grande é parágrafo: marque como `<p>` ou `<blockquote>`, mantenha ~25
palavras e use o tamanho de declaração (36px ou menos no desktop, 32px no
tablet, 24px no celular). Pode correr em três linhas (quatro no celular).
Maior que isso, ou marcada como heading, ou na linha principal da primeira
tela, é manchete — e vale a regra das duas linhas.

### Formas de manchete que funcionam

Escolha a mais simples que seja verdadeira:

- **O nome.** A marca ou a pessoa, muito grande, com a descrição em uma
  linha em outro lugar. Forte quando o nome é curto e o assunto é visual.
- **O que é.** "Uma estante de vinil no seu bolso."
- **O claim.** "Seu banco não faz isso." Uma frase que um concorrente não
  assinaria.
- **A instrução.** "Entenda seu dinheiro." Verbo primeiro, curto.
- **O lugar ou o momento.** "Antártida." "Lisboa, desde 1984."

Formas a evitar, porque são a média de toda landing page:

- O mad-lib: "A plataforma com IA para times modernos".
- O trícolono: "Rápido. Simples. Seguro."
- A correção: "Não é só uma ferramenta, é um fluxo".
- "X, reinventado / redefinido / simplificado". "Bem-vindo a…". "Conheça…"
  para um produto que ninguém conheceu.
- Uma pergunta que o leitor não fez.
- Manchete que precisa do cólon: "Ledgerly: faturamento para
  freelancers" — o nome já está na navegação.
- Uma palavra da manchete estilizada diferente.

**Sentence case.** Sem ponto final, a não ser que a voz da direção use em
todo lugar.

### Linha de apoio, corpo, botões

**Linha de apoio.** Uma frase, no máximo ~22 palavras, que diz
concretamente o que a coisa é e para quem é. É para onde vai o detalhe
cortado da manchete. **Nunca repete a manchete com outras palavras.**

**Corpo.** Parágrafos curtos de afirmações simples. Prefira o substantivo
específico e o número real: "entrega em uma semana" em vez de "entrega
rápida"; "38 lugares" em vez de "aconchegante". Leia cada frase e pergunte
se outra empresa poderia imprimi-la sem mudar; se puder, afie ou corte.

**Botões.** Nomeie a ação ou a coisa: "Reservar mesa", "Ver os planos",
"Baixar para Mac". Uma a três palavras. A ação primária mantém **um** nome
em toda a página. Um botão primário por tela; a segunda ação é um link de
texto simples. **Não** coloque seta em todo link — no máximo uma, na ação
primária.

**Navegação.** Wordmark, até cinco links simples, uma ação. Rótulos são
substantivos singulares.

### Prova sem inventar

**Nunca** invente clientes, citações de gente nomeada, logos de imprensa,
número de usuários, avaliações ou benchmarks. Prova inventada é desonesta e
é um indício reconhecido de página gerada.

Quando o briefing não dá prova, use o que é verdadeiro por construção:

- Mostre a coisa em si, grande. Uma demonstração real vale mais que
  qualquer citação.
- Explique como funciona, especificamente.
- Use os fatos do briefing (preço, lugar, ano, materiais, o que inclui).

### Coisas que leem como geradas

- "Solução completa para…" / "Eleve seu…" / "Transforme o seu…"
- Adjetivo vazio: "inovador", "revolucionário", "sem precedentes".
- Três benefício em tricolon.
- Depoimento com nome genérico e empresa genérica.
- Numeração de seção (01, 02) com ícone acima.
- "Learn more" como rótulo de link.
- Parágrafo de três linhas centrado que não diz nada.

### Microtipografia

O texto corrido tem entrelinha de **1,45–1,6** e medida de **45–75
caracteres**. A linha de apoio tem **no máximo ~22 palavras**. O `alt` de
uma imagem real descreve o que a imagem mostra (não "imagem de café"), e
uma imagem decorativa leva `alt=""`. Números tabulares onde os números se
alinham. Zero e vírgula do mesmo tamanho do resto da linha.
