# O procedimento — os 10 passos

> Os passos 1 a 5 decidem se a página presta. Os 6 a 10 constroem e provam.
> A ordem é o que funciona: pular o passo 2 (o argumento) é o que produz
> a sequência de estoque — hero, logos, três features, depoimento, preço,
> chamada.

## 1. Ler o briefing e o projeto

Descubra o que é real: o assunto, o público, **a única coisa** que a página
precisa fazer com quem chega, a stack, a marca existente (cor, fonte, logo) e
— o mais importante — **que imagens existem de verdade**: as fotografias do
próprio projeto, uma interface real que possa ser mostrada, uma ferramenta de
geração que você possa chamar, ou nada.

**Não planeje em torno de imagem que você não tem.** "Nada é do próprio
projeto" raramente quer dizer nada: a cidade, a rua, os materiais e a
história do assunto estão em arquivos abertos e museus, de graça, com
crédito.

Se o pedido é vago, **decida e declare a sua leitura em uma linha** em vez de
perguntar. Só pergunte quando um fato ausente bloqueia o trabalho (por
exemplo, o nome do produto).

Depois, **liste o assunto** nas suas notas: oito a doze coisas que pertencem
a este cliente e a nenhum concorrente. O nome dele e o que o nome significa;
o endereço, o número, a rua, o bairro e o que aquele lugar parece (os
azulejos, as placas, as cores da tinta, as fontes da fachada, a luz, o
clima); os números do briefing (lugares, salas, minutos até o mar, o preço,
o ano); a restrição com que ele vive (um lote por mês, fechado no inverno,
só por agendamento); os materiais e as cores; os rituais e os horários (o
forno aceso às cinco, o ferry às sete); os impressos do mundo dele (horário,
rótulo, ingresso, placa).

**Essa lista é de onde vem a ideia** (passo 4) e é também a sua busca de
imagem: cada lugar, material e impresso é uma consulta.

## 2. Escrever o argumento

Antes de qualquer design, liste a página como **claims com prova**, uma
linha por seção. Os claims decidem quais seções existem e em que ordem.
Apague qualquer seção que não tenha claim.

É assim que se evita a sequência de estoque.

## 3. Escolher a direção

> O upstream sorteia a direção de um corpus (`draw.mjs`). **Esse sorteador
> não foi vendorizado aqui** (ver §3 do `SKILL.md`). Escolha por
> raciocínio, com as leis e as house rules como critério.

Uma direção tem quatro partes, e as quatro se decidem **antes** de desenhar:

1. **Composição** — a grade, a assimetria, a sequência de seções.
2. **Paleta** — um fundo, uma tinta, um acento, e as proporções entre eles.
3. **Tipografia** — a escala e o par de fontes.
4. **A imagem** — o que ocupa a primeira tela.

Escreva a direção em **uma frase**, antes de codar, e teste essa frase contra
a lista do passo 1: **qual jeito de compor carrega algo que só este cliente
tem?** Escolha esse, não o mais familiar. O erro mais comum de uma página
fraca é uma direção sorteada que não combinava com o assunto.

**Verifique a paleta contra o assunto.** A paleta é um conjunto de proporções
(um fundo, uma tinta, um acento, campos) tanto quanto um conjunto de cores.
Se as cores brigam com o material do assunto (pastel de candy para um
whisky de turfa, neon para um refúgio na montanha), troque as cores e
mantenha as proporções — e diga isso no relatório. Se o assunto tem cores
inequívocas (o material, a tinta da rua, a paisagem da janela), **mate as
cores no assunto**.

## 4. Achar a ideia

A frase que só este cliente pode ter: o nome dele e o que significa, a rua
onde ele está, a única restrição que o faz ser o que é.

Em teste cego, a página que ganhou cada briefing foi construída a partir de
**um item dessa lista**. As que perderam tinham uma composição boa com uma
ideia de categoria.

## 5. Escrever as palavras

Escreva a página inteira como um **deck de copy** (texto puro) antes do
markup.

- **Toda manchete cabe em duas linhas ou menos, em qualquer largura.** Faça
  a conta: cerca de 32 caracteres é seguro em toda largura, num tamanho
  confiante. As hero das galerias estudadas têm mediana de 5 palavras e 32
  caracteres.
- **Uma frase de apoio**, logo abaixo da manchete (32–48px abaixo),
  mostrada junto com ela — nunca ancorada no pé da primeira tela nem segura
  por animação. Quando a manchete é um nome ou uma figura de linguagem, essa
  frase diz plainly o que a coisa é. **Uma ação primária**, nomeada pelo que
  faz, como botão de verdade na primeira tela.
- **A primeira tela responde à primeira pergunta do visitante, em tipo
  grande.** Para um evento: o que é, quando e onde. Para um produto: o que
  é e o que custa ou faz. Para uma pessoa: quem é e o que faz. Toda seção
  pela qual o visitante veio (a programação, o cardápio, os quartos, o
  preço) tem heading próprio e lugar próprio na navegação.
- **Escreva o conteúdo inteiro.** Cada seção que o briefing pede entrega a
  informação por completo: o cardápio todo com preços, cada quarto com seus
  detalhes, cada palestra, o preço com o que inclui, uma resposta para cada
  pergunta real. **Seção magra é o motivo mais comum de uma página limpa
  perder para uma mais cheia.**
- **Detalhe de exemplo é esperado** onde o briefing deixa buraco (nome de
  prato, nome de quarto, título de projeto) para que o design seja visto em
  densidade cheia — e liste-os no relatório para o cliente confirmar.
  **Prova nunca é inventada**: sem clientes, citações, avaliações, imprensa,
  logos ou estatísticas de negócio.

## 6. Construir

Construa com o movimento **desligado na cabeça**: uma página que precisa de
animação para parecer pronta não está pronta. Ordem de trabalho:

1. **Tokens.** Cor e tipografia como custom properties; tudo abaixo referencia
   token. O `apps/web/app/globals.css` (Tailwind 4) é a fonte de token
   deste repo — e o bloco `@theme` dele é a base, não um destino: os tokens
   de página pública **não** colidem com os de app.
2. **A hero, exatamente como o blueprint descreve**, em desktop e em celular.
   Deixe o grande grande e o pequeno pequeno antes de existir qualquer outra
   coisa.
3. **Cada seção a partir do blueprint**, com o conteúdo deste projeto.
   **Mantenha a geometria, mude o assunto.** Seções vizinhas não podem
   compartilhar layout. **Leve a ideia para dentro de todas as seções** —
   preço, FAQ e rodapé inclusos: a falha mais comum no estudo, mesmo entre
   sites bons, é uma primeira tela distinta seguida de blocos de estoque.
4. **Imagens**, nesta ordem de preferência: (1) as do próprio projeto;
   (2) geradas, se houver ferramenta; (3) **imagens reais do mundo do
   assunto** em arquivos abertos, sempre que existir uma honesta; (4)
   **desenhadas em código a partir do próprio assunto**, para o que não tem
   imagem honesta; (5) só onde uma imagem honestamente genérica serve
   (o mar para uma casa à beira-mar), nunca como substituta do assunto;
   (6) tipo e cor sozinhos.
   > **O piso, que o inspetor do upstream mede:** pelo menos **quatro
   > imagens reais** na página, normalmente de seis a doze. Desenho em SVG
   > **não** conta para o piso — desenhe o que não tem imagem e ainda assim
   > traga imagens reais. Uma imagem **encontrada** mostra o mundo em volta
   > do cliente e nunca é apresentada como produto, sala, prato, pessoa ou
   > equipe do próprio cliente.
5. **A coisa viva** do passo 4, construída na seção que prova o claim, com
   conteúdo real, versão de celular e um fallback simples.
6. **As cenas de scroll**, quando a direção as trouxer — a página tem os
   momentos grandes, e uma cena **é composição**: decide quanto a página
   dura e o que cada tela mostra. Construa agora, não no fim.
7. **Cheio.** Olhe cada tela de desktop como um cartaz: uma coisa dominante e
   o conteúdo que ela carrega. Tela majoritariamente vazia é seção mal
   construída, não descanso — **um descanso por página é o limite**.
8. **O quadro.** Um par de margens externas iguais em toda largura; toda
   seção usa a largura que a página preparou — quando o texto fica na metade
   esquerda, a direita segura a imagem, a segunda coluna, a lista ou a
   figura, **nunca nada**. Assimetria vive **dentro** da grade, nunca no
   quadro. Seções separadas por 120–240px no desktop. Toda seção pela qual
   o visitante veio abre com um heading que a nomeia, e a primeira tela
   carrega o título da página num `h1`.
   > Esses são exatamente os defeitos que os leitores nomeam primeiro quando
   > uma página parece errada ("sem título claro", "espaço vazio aleatório",
   > "tudo empurrado para um lado").
9. **Estados e semântica.** Links e botões de verdade, foco visível, `alt`,
   layout de celular que é composição própria. Todo controle — a coisa viva
   inclusa — funciona só pelo teclado, em ordem de leitura, e tem nome
   acessível: o rótulo visível, ou `aria-label` quando mostra só um ícone.

## 7. O portão

O upstream roda `lint.mjs` (fonte) e `inspect.mjs` (browser real, em 1440,
768 e 390). **Nenhum dos dois foi vendorizado aqui** — ver §3 do `SKILL.md`.

O portão deste repo é:

1. **As house rules**, conferidas por leitura do diff — a lista está em
   [`house-rules.md`](house-rules.md).
2. **O e2e**, que roda a página de verdade: `apps/web/e2e/` (Playwright), com
   o comando da convenção `e2e-playwright.md`.
3. **`ui-review`**, quando a página pública for revisada como tela.
4. **`agent-browser`**, para o olhar avulso (screenshot de cada largura).

Trate cada `WARN` como errado, a não ser que você consiga defendê-lo em uma
frase para um designer.

**Inspecione o que o visitante recebe.** Com build, o portão final é sobre a
build de produção, não sobre o dev server: minifier e bundler mudam o que
manda (um já deixou de fora um `backdrop-filter` que o dev server mostrava).

## 8. Olhar

Passar no portão significa que nada proibido foi medido. **Não significa que
a página é boa.**

Abra os screenshots (cada largura) e **critique as imagens** — o critério
está em [`inspecao-e-pesquisa.md`](inspecao-e-pesquisa.md). Escreva a
crítica no formato dela, corrija os **três** problemas de maior peso, rode o
portão de novo, olhe de novo. **No máximo três rodadas.**

**Julgue só as pictures.** Se um problema aparece num screenshot, ele é real,
independentemente do que o código diga.

## 9. Mover

Construa a camada de movimento. Ela é obrigatória e é mais de um fade: o
inspetor do upstream conta os elementos que realmente se movem durante o
carregamento e o scroll, e reprova uma página com menos de oito (avisa com
menos de dezesseis). Quatro partes:

1. **O movimento-assinatura** nomeado na folha: um, bem feito.
2. **Uma entrada para as partes de cada seção:** o heading, depois o texto,
   depois a imagem, escalonados em 60–90ms, subindo 16–32px com opacidade,
   disparados uma vez quando a seção entra. Nunca um fade único para o bloco
   inteiro, e **nunca conteúdo que fica escondido se o script falhar**.
3. **Feedback em todo controle:** press, hover e focus em botões, links,
   cards.
4. **Uma imagem em movimento:** um clipe em loop mudo, um scale lento numa
   fotografia, um movimento ligado ao scroll.

Só `transform` e `opacity`; todo movimento tem fallback de
`prefers-reduced-motion` que mantém o conteúdo e derruba o deslocamento. Os
**valores exatos** (curva, duração, origem) estão na skill
[`motion`](../../motion/SKILL.md) — não chute aqui.

## 10. Reportar

Não reporte antes que tudo isto seja verdade:

- O portão (§7) está verde na versão final.
- Você abriu **todo** screenshot listado depois da última mudança, não só a
  primeira tela.
- Uma pessoa que nunca viu a página consegue dizer, em cinco segundos, o que
  é e o que fazer.
- Toda seção tem heading; as margens batem dos dois lados; nenhum trecho
  da página está vazio.
- A crítica da última rodada está escrita no formato do §8.

Diga ao usuário, breve: a direção escolhida (e por quê); a frase da ideia e a
coisa viva; os escores da última crítica e o que ainda não cumpre; cada
imagem encontrada com título, autor, licença e página de origem, e onde
está o crédito na página; quais desenhos estão no lugar de fotografia; e
qual conteúdo de exemplo precisa ser trocado antes de publicar.

**Não afirme um check que você não rodou.**
