# Tipo, cor e estrutura

> O detalhe por trás das leis de
> [`leis-e-casos.md`](leis-e-casos.md). Números que não estão aqui **não
> estão no estudo** — não invente.

## §1. Tipo

### A escala: poucos tamanhos, muito longe uns dos outros

O trabalho visual é feito por **duas ou três tamanhos**, muito separados.
A mediana da relação manchete/corpo nos sites estudados é **4,3**; nos
melhores, o maior tipo chega a **8,4vw** (contra 5,0vw nos fracos). Cinco
tamanhos numa página é o teto.

Em display: tracking **−0,02 a −0,05em**, entrelinha **0,85–1,05**. Em
texto: **16–20px**, entrelinha **1,45–1,6**, **45–75 caracteres** por linha.

Uma família é o normal (um terço dos sites estudados); duas é o limite.
Alinhado à esquerda por padrão — centralize no máximo um momento.

### Medida e quebras

A medida do texto é o que segura a linha, não o tamanho da fonte. Bloco de
texto com mais de ~75 caracteres lê mal; com menos de 45, a linha fica
curta demais para o olho voltar.

O intervalo de entrelinha é o que separa "digitado" de "composto": em
display, 0,85–1,05; no corpo, 1,45–1,6. Uma manchete com entrelinha de 1,2
lê como um parágrafo grande.

### Carregando as fontes

A fonte que o site pede é a fonte que ele **carrega**: fonte de display com
`font-display: swap` e uma reserva com as mesmas métricas evita o salto de
layout. Carregue o peso só quando ele for usado — cada peso a mais é uma
requisição e um risco de layout.

### Uma família ou duas

Uma é o normal e o mais forte: a hierarquia vem do **tamanho**, não da
mistura. Quando são duas, a segunda entra para um papel específico (dado,
rótulo, citação) — não para "enfeite" e nunca para a manchete.

### Detalhes que separam tipo composto de texto digitado

- **Números tabulares** onde os números se alinham em coluna.
- **Zero, vírgula e aspas** com o mesmo peso e tamanho do resto.
- **Ângulo reto em citação**, não itálico decorativo.
- **Caixa alta só em rótulo curto** — e o label pequeno em caixa alta e
  espaçada está entre as house rules proibidas.
- **Uma palavra de destaque estilizada** na manchete está proibida.

### Erros que o inspetor não vê

O inspetor mede números; estes não são números: uma manchete que só faz
sentido depois de rolar, uma frase de apoio que repete a manchete com
outras palavras, um parágrafo que **qualquer outra empresa imprimiria sem
mudar**.

## §2. Cor

### Os papéis

Quatro papéis, e só quatro:

| Papel | O que é |
|---|---|
| **fundo** | o que cobre a maior parte da tela |
| **tinta** | o texto corrido, na tinta cheia |
| **acento** | a ação e talvez mais uma coisa |
| **campos** | os preenchimentos de seção |

### Proporção

Nomeie as proporções antes de nomear as cores: qual cor segura mais
superfície, qual apoia, onde está o acento. **Acento em dez lugares não
significa nada**; acento na ação única e num detalhe significa "aqui".

### Superfícies sem linha nem sombra

Superfícies se separam por **um pequeno passo de tom**. Linha de 1px e
sombra em repouso estão proibidos — sombra só no que flutua de verdade (um
menu, um diálogo).

### Campos de cor

Uma seção pode trocar a cor do campo inteiro: é o mecanismo mais forte que
existe, e por isso é caro — no máximo um ou dois por página. **Nada faz
fade em nada**: a transição entre campos é uma borda, não um degradê.

### Páginas escuras

Em página escura, o texto é **claro na tinta cheia** e as superfícies
sobem de tom em pequenos passos. O erro comum é inverter a lógica das
superfícies: numa página escura, subir um passo no fundo clareia a
superfície e apaga a hierarquia.

### Cor e fotografia

Sob uma fotografia, o texto leva um **véu neutro** (a única exceção
permitida à regra do gradiente) — nunca um gradiente colorido. E a
fotografia da página compartilha **uma luz e um grado**: banco de imagem
misturado denuncia a página mais rápido que qualquer outro defeito.

### Contraste

O texto corrido tem que passar em contraste — o `ui-craft` traz os tokens
de contraste medidos do app; aqui o mesmo mecanismo vale, com a
proporção do display.

### Famílias banidas

**Paleta de assistente**: creme-amarelo com terracota ou ferrugem; violeta
ou índigo. **Gradiente** em qualquer lugar. **Gradiente decorativo** em
blob. E "quente" aqui não é terracota: é o material do assunto (o barro, a
tinta da rua, a paisagem da janela).

## §3. Estrutura

### Margens e grade

**Um** grid e **um** par de margens apertadas (16–32px), usados em todo
lugar; as coisas grandes vão até as bordas. Os blocos de texto compartilham
duas ou três bordas esquerda na página inteira — seis posições x distintas
significa que as coisas foram colocadas uma a uma.

### Onde o texto fica

O texto ocupa uma coluna; a outra metade da largura do bloco **não fica
vazia**: segura a imagem, a segunda coluna, a lista ou a figura. No estudo
de 100 Sites of the Day, cerca de 1 seção em 100 deixou metade da largura
vazia — e foi apontada como um dos defeitos mais nomeados.

### Espaço vazio

Espaço vazio é decisão, não acidente. Um **buraco** (vazio acidental) fica
ao lado de uma coluna curta ou embaixo de uma decoração removida; um
**descanso** (vazio deliberado) é uma imagem colocada ou um campo de cor, e
há **no máximo um por página**. Nenhum trecho de nada mais alto que meia
tela.

### O quadro: margens, equilíbrio e títulos

- As duas margens externas são **iguais**, em toda largura.
- A assimetria vive **dentro** da grade, nunca no quadro.
- O vão entre seções (120–240px no desktop) é **claramente maior** que
  qualquer vão dentro de uma seção.
- A primeira tela tem **um `h1`** que diz o que a página é; toda seção tem
  heading que a nomeia.

### Seções: leve a ideia e varie o arranjo

Seções vizinhas **não** compartilham layout. E a ideia precisa chegar ao
preço, ao FAQ e ao rodapé — a falha mais comum entre sites bons é uma
primeira tela distinta seguida de blocos de estoque.

### Navegação

Wordmark, três a cinco links simples, **uma** ação. Rótulos são substantivos
singulares. Sem barra com vidro, sem pílula flutuante.

### Fechos

O rodapé é um **fecho desenhado**, não um sitemap: na maioria dos sites
fortes o nome volta na largura cheia.

### O celular é uma segunda composição

A tela do celular **não** é a de desktop espremida: tem crop próprio e
quebras de linha próprias. A primeira tela do celular ainda é uma coisa
clara. Fileira que rola na horizontal no celular lê como cortada — embrulhe,
a não ser que o corte seja deliberado.

### Como as páginas falham

Em ordem de frequência no estudo: manchete de três linhas; seção sem
heading; texto pequeno e cinza; tela de desktop majoritariamente vazia;
placeholder; menos de quatro imagens reais; grade de cards em série;
ponto focal ausente; ação primária que não é botão de verdade; e a página
que "serviria" com o nome de qualquer concorrente trocado.
