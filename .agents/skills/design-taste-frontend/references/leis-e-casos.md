# As leis do ofício e os casos especiais

## §1. As leis (forma curta)

Os números vêm do estudo, exceto onde está marcado como estilo da casa.

### Tipo

- **Duas ou três tamanhos** fazem o trabalho visível: um muito grande, um
  pequeno, nada no meio. A mediana da relação manchete/corpo nos sites
  estudados é **4,3**; os melhores vão muito além (maior tipo: mediana de
  **8,4vw** nos sites de topo contra **5,0vw** nos fracos).
- **Tipo de display:** tracking −0,02 a −0,05em, entrelinha 0,85–1,05.
  **Texto:** 16–20px, entrelinha 1,45–1,6, 45–75 caracteres por linha.
- **Cinco tamanhos** numa página é o teto. **Uma família** é o normal (um
  terço dos sites estudados); duas é o limite.
- **Alinhado à esquerda** por padrão. Centralize no máximo um momento.

### Espaço

- **Uma grade, um par de margens apertadas** (16–32px), usada em todo lugar;
  as coisas grandes vão até as bordas. Os blocos de texto compartilham duas
  ou três bordas esquerda na página inteira.
- **Assimetria dentro da grade, nunca no quadro**: as duas margens externas
  são iguais, e um heading fora do centro é respondido por algo no lado
  oposto da grade.
- **O vão entre seções é claramente maior** que qualquer vão dentro de uma:
  120–240px no desktop (a mediana do estudo é ~240).
- **Cada seção tem uma composição diferente** da vizinha; nenhuma é uma
  grade de cards.

### Cor

- **Um fundo, uma tinta, um acento.** O acento aparece na ação e talvez em
  mais uma coisa.
- **Texto corrido na tinta cheia.** Uma página em cinza suave lê inacabada.
- **Superfícies se separam por um pequeno passo de tom**, nunca por linha ou
  sombra.
- Uma seção pode mudar a cor de todo o campo. **Nada faz fade em nada.**

### Imagem

- **Uma imagem dominante vence seis pequenas.** Nos sites de maior nota, a
  mídia da hero cobre pelo menos metade da primeira tela em **68%** das
  vezes.
- **Mesmas proporções de crop, mesmo tratamento**, cantos retos a não ser
  que a direção diga o contrário (**73%** dos sites estudados deixa a mídia
  com canto reto).
- **Nenhuma imagem é melhor que um placeholder**, um ícone ou uma forma
  abstrata. Um desenho feito para este assunto, nas cores dele e com cuidado,
  é melhor que qualquer um dos dois. Uma foto real do mundo dele, encontrada
  e creditada, é melhor ainda.
- **Toda imagem encontrada** é baixada para o projeto, creditada na página e
  listada no relatório. Nenhuma é apresentada como do próprio cliente.
- **Nada é pousado por cima** de uma manchete ou de uma declaração.

### Componentes

- **Botões:** chapados, uma cor de preenchimento, ou com canto reto ou
  totalmente redondo, decidido uma vez (nos sites de topo: **52%** reto,
  **23%** pílula; o raio "macio" de 9–16px é o padrão dos sites fracos).
  A maioria das hero fortes não tem botão, ou tem um.
- **Navegação:** wordmark, três a cinco links simples, uma ação. Sem
  cromado de barra.
- **Um controle explica como se usa pela forma, pelo rótulo e pelo lugar.**
  Quando parece precisar de uma frase explicando a operação, **redesenhe o
  controle** em vez de somar a frase. O que um campo aceita é diferente:
  remova o limite onde puder (um date picker, um parser que aceite qualquer
  formato comum). Um limite que fica — regra de senha, tipo e tamanho de
  arquivo — fica visível ao lado do campo e ligado a ele por
  `aria-describedby`.
- **O rodapé é um fecho desenhado**, não um sitemap: na maioria dos sites
  fortes o nome volta na largura cheia.

## §2. Casos especiais

### Marca ou design system existente

Mapeie as cores e as fontes da marca sobre os papéis e **tome só a
composição**. As house rules continuam valendo; se a própria marca exige um
dispositivo proibido (o logo dentro de um gradiente, o acento em violeta),
**mantenha o asset da marca**, diga isso no relatório e passe a exceção só
para aquela regra.

### Redesenho, restyle ou revisão de uma página que já existe

1. **Registre o "antes".** Rode o projeto como está e inspecione em uma
   pasta própria; leia o código: o framework, o método de estilo (Tailwind
   v3 ou v4, CSS modules, styled-components, CSS puro), os componentes, e o
   que precisa sobreviver — rotas, formulários, dados, comportamento, os
   assets da marca.
2. **Uma revisão para aqui.** Critique as capturas do "antes", liste os
   achados e **nomeie as três mudanças** que mais moveriam a página.
3. **Mantenha a stack, o conteúdo e o que funciona.** Nada de migrar
   framework ou biblioteca de estilo; confira o arquivo de dependências
   antes de adicionar qualquer coisa. Um restyle mantém o layout e troca
   tipo, cor e componentes pela direção escolhida; um redesenho troca a
   direção inteira e reconstrói as seções a partir dos blueprints dentro dos
   componentes existentes. Nos dois casos, siga do passo 2 do procedimento
   com o conteúdo real da página.
4. **Ordem de trabalho, maior efeito e menor risco:** tipo (famílias e
   escala), cor (um fundo, uma tinta, um acento), o quadro (margens, ritmo
   das seções, um título na primeira tela e um heading em cada seção),
   estados (hover, focus, loading, vazio, erro), e então os componentes de
   estoque (card com ícone, badge em pílula, blob de gradiente, grade de
   cards) trocados pelos blueprints escolhidos.
5. **Prove.** Inspecione de novo, compare antes e depois em cada largura,
   clique em cada link, formulário e menu que funcionava antes, e reporte as
   medições dos dois lados lado a lado.

### Um componente ou uma seção, não uma página

Pule a escolha de direção, a não ser que não haja direção a seguir. Combine
com o design ao redor, aplique as house rules e as leis, e **inspecione o
resultado mesmo assim**.

### Sem checkout, sem backend de formulário

O botão primário vai para o destino real quando o briefing nomeia um. Sem
isso, abre um e-mail com assunto e corpo escritos (`mailto:` com as escolhas
do visitante preenchidas) ou, numa loja, aponta para `#checkout` e o
relatório diz que precisa ser ligado antes de publicar. **Nunca falsifique
um formulário de pagamento.**

### Sem Chrome ou sem Node 22

Rode o lint do upstream (Node 18+), tire as capturas com a ferramenta de
browser que houver e critique essas. **Diga no relatório que o inspetor não
pode rodar.**

### Sem rede

Se a busca em arquivos abertos não chegar a nenhuma fonte, **desenhe as
imagens** e diga no relatório que as coleções abertas não puderam ser
pesquisadas.
