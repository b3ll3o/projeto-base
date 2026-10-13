---
name: ui-craft
version: 1.0
updated: 2026-10-13
description: "Convenções de craft de interface para apps Next.js + Tailwind 4 — escala de tokens (cor, tipografia, espaçamento, raio, sombra), hierarquia tipográfica, os 4 estados de toda tela com dado, foco visível, contraste medido, e as regras anti-slop que se aplicam a tela de app (não a landing page). Adaptado de taste-skill (leonxlnx, MIT) e impeccable (pbakaus, Apache-2.0). Use ao criar/revisar a aparência de qualquer tela ou componente de apps/web, ou ao definir tokens."
---

# Skill: `ui-craft`

> **Quem invoca:** `ux-design-specialist` (papel e checklist a11y ficam no agent; aqui é o
> **sistema visual**). Também carregada por `ui-review` quando a revisão é de aparência.
>
> **Quando invocar:** ao criar ou revisar a aparência de uma tela/componente em
> `apps/web/**`, ou ao definir/estender tokens em `apps/web/app/globals.css`.
> **Não** invocar para RSC vs Client, caching, bundle — isso é `nextjs-specialist`.

## Escopo: tela de app, não landing page

Este projeto é um **produto interno**: listagem de usuários, formulário de cadastro,
login. O modo é **Operate** (ver skill `ui-modes`). Duas consequências practices:

- **As leis de tipo de landing page não valem aqui.** Num site de marketing o `h1`
  pode ser `8vw`. Num app, o `h1` compete com dado, não com slogan — ele fica em
  `text-xl`/`text-2xl` e o peso vem de cor e peso de fonte, não de escala.
- **A densidade é o produto.** Um painel com respiro de landing page é um painel
  que cabe 40% das linhas. Aqui, espaçamento é orçamento.

## 1. Tokens — fonte única

Tudo referencia token. Valor solto em JSX é finding. A fonte é
`apps/web/app/globals.css`, bloco `@theme` do Tailwind 4.

Hoje existem **2** tokens (`--color-background`, `--color-foreground`) e **zero**
valor literal em JSX — medido em 2026-10-13:
`grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' apps/web/app apps/web/components --include='*.tsx' | wc -l` → `0`.

O que se espalha é a **paleta stock do Tailwind**: **68** usos de
`text-{slate,gray}-*`, `bg-red-*`, `border-*` — medido em 2026-10-13:
`grep -rhoE '(text|bg|border)-(slate|gray|red|blue|green|amber|zinc|neutral|stone)-[0-9]{2,3}' apps/web/components apps/web/app --include='*.tsx' | wc -l`
→ `68` (44 em `components/`, 24 em `app/`). Essa é a segunda fonte de cor — e
ela continua produzindo cor fora do sistema **depois** que todos os
`--color-*` existirem. Tokenizar não é só hoistar literal: é trocar
`text-slate-500` por `text-muted-foreground`. Ao propor tokens, cubra nesta ordem:

| Papel | Token | Regra |
|-------|-------|-------|
| Fundo de página | `--color-background` | 1 valor |
| Superfície elevada | `--color-surface` | 1 passo de tom acima do fundo, **nunca** sombra para separar |
| Tinta primária | `--color-foreground` | texto corrido NUNCA em cinza suave — página em cinza lê inacabada |
| Tinta secundária | `--color-muted-foreground` | só metadado e legenda |
| Borda | `--color-border` | 1 passo; borda não substitui espaçamento |
| Ação | `--color-primary` + `--color-primary-foreground` | um só par. A ação primária da tela |
| Foco | `--color-ring` | **precisa** existir e diferir de `--color-primary` |
| Erro | `--color-destructive` + `--color-destructive-foreground` | par completo |

**Regra dos 3 passos de tom.** Uma escala de cor é uma rampa com passos nomeados
(`50/100/…/900` é o padrão do Tailwind). Superfície separada por **um passo**, nunca
por linha ou sombra. Sombra é para o que flutua de verdade: menu, dialog.

**Regra do foco.** `--color-ring` é obrigatório. `outline: none` sem substituto é
bug de acessibilidade, não escolha de estilo.

```css
/* apps/web/app/globals.css — extensão do @theme existente, não reescrita */
@theme {
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(222.2 84% 4.9%);
  --color-surface: hsl(220 14% 97%);
  --color-muted-foreground: hsl(220 9% 46%);
  --color-border: hsl(220 13% 91%);
  --color-primary: hsl(221 83% 53%);
  --color-primary-foreground: hsl(0 0% 100%);
  --color-ring: hsl(221 83% 40%);
  --color-destructive: hsl(0 72% 45%);
  --color-destructive-foreground: hsl(0 0% 100%);
}
```

> **O token guarda a COR COMPLETA, não a tripla HSL.** O Tailwind 4 emite
> `background-color: var(--color-surface)` literalmente — com
> `--color-surface: 220 14% 97%` o browser descarta a declaração em silêncio e o
> elemento fica transparente. Só os 2 tokens atuais sobrevivem porque
> `globals.css:15-16` envolve o valor na mão: `hsl(var(--color-background))`.
> Medido em 2026-10-13: `npx @tailwindcss/cli` com `220 14% 97%` emite a
> variável crua; `hsl(222 84% 5%)` emite cor válida. Tripla sem `hsl()` é
> exatamente o defeito que o comentário de `globals.css:5-9` já registra — não
> introduza o mesmo bug em 8 tokens novos.

> **Ao propor token novo:** diga de onde ele é reusado e o que hoje está duplicado.
> Token com um único consumidor é variável com nome difícil — e inline.

## 2. Hierarquia tipográfica

Cinco tamanhos no máximo por tela, e o trabalho é feito por **três**: um grande, um
pequeno, nada no meio.

| Papel | Tamanho | Peso | Nota |
|-------|---------|------|------|
| Título de tela | `text-2xl` (24px) | 600 | o `h1` da rota |
| Título de seção | `text-base` (16px) | 600 | |
| Corpo | `text-sm` (14px) | 400 | padrão de dado em tabela/lista |
| Metadado | `text-xs` (12px) | 400 | só secundário; **não** para texto que se precisa ler |
| Microcopy de erro | `text-sm` | 400 | **nunca** menor que o corpo — erro pequeno não é erro |

**Regras que não se negociam:**

- Corpo em **16px ou mais** quando é texto corrido de leitura. `text-sm` (14px) é
  para **dado** (célula de tabela, item de lista), não para parágrafo.
- **Rótulo em maiúsculo minúsculo e espaçado é proibido** fora de dado tabular.
- **Duas famílias no máximo**, e uma é o normal.
- Alinhamento à esquerda por padrão. Centralizar no máximo um momento por tela.
- `font-variant-numeric: tabular-nums` em toda coluna numérica — sem isso o número
  "pula" quando muda de `99` para `100`.

## 3. Espaçamento

- Uma escala, um par de margens apertadas, usadas em todo lugar. No Tailwind 4 já
  existe: `2/4/6/8/12/16/24/32`.
- O vão **entre** seções é claramente maior que qualquer vão **dentro** de uma.
- Nada de `rounded-md` no meio: raio é decisão de **família de componente**, tomada
  uma vez. Achado (2px), médio (6px) ou redondo (9999px) — decidir e aplicar.
  O default fraco (9–16px "soft") não está entre as opções.

## 4. Os 4 estados, sempre

Toda tela com dado tem os quatro. Especificar **antes** de codificar.

| Estado | Regra |
|--------|-------|
| **Vazio** | Dizer o que é isso e o que fazer. Nunca tela em branco. |
| **Carregando** | Skeleton do **mesmo formato** do conteúdo final. Nada de spinner para < 300 ms. |
| **Erro** | O que aconteceu + o que a pessoa pode fazer. Nunca stack trace, nunca `undefined`, nunca o número HTTP cru. |
| **Sucesso** | Confirmação com texto claro **e destino** (para onde vai agora). |

> **Estado vazio ≠ estado de erro.** "Nenhum usuário cadastrado" é informação;
> "Falhou ao carregar" é problema. Nunca o mesmo componente para os dois sem
> distinguir.

## 5. Regras anti-slop (aplicam-se a tela de app)

Adaptadas de taste-skill. A coluna da direita é o substituto — o ponto é nunca
trocar ornamento por outro ornamento.

| Regra | Em vez de |
|-------|-----------|
| **Sem vidro.** Nada de `backdrop-blur` em painel ou navegação flutuante. | Barra simples: marca, links, uma ação. |
| **Sem gradiente decorativo.** Nada de blob, nada de gradiente em fundo ou botão. | Cor plana, ou um campo inteiro de cor de tom. |
| **Sem dashboard falso.** Nada de barras cinzas de enfeite, stat card com número inventado. | A interface real, ou nada. |
| **Sem emoji.** | Ícone do conjunto real, ou texto. |
| **Sem palavra de destaque estilizada** (itálico, serifada, colorida, sublinhada) no título. | Uma fonte, uma cor. A palavra carrega o peso. |
| **Sem badge acima do título** ("Novo ·" em chip). | A informação vai no título ou na primeira frase. |
| **Sem monoespaçada** fora de código real. | A fonte de texto; algarismos tabulares onde número alinha. |
| **Sem indexação decorativa** (01 / 02 / 03). | A ordem vem da posição ou das palavras. `<ol>` de verdade se a ordem importa. |
| **Sem fio de 1px** como divisória nem contorno de caixa. | Espaço, um passo de tom, ou forma preenchida. |
| **Sem sombra em repouso.** | Um passo de tom entre superfícies. Sombra só no que flutua (menu, dialog). |
| **Sem grade de cards de ícone.** Nenhuma fileira de cards idênticos. | A composição da seção. |
| **Sem gradiente/sombra em elemento interativo que não está flutuando.** | Tom de fundo. |

**Três lugares têm convenção própria e ficam de fora:** código real em `<pre>`/
`<code>` (monoespaçada é correta), tabela real e campo de formulário real (podem
ter linha), e fragmento de interface real cuja raiz carrega `data-ui`.

> **Por que a remoção de ornamento não basta.** Uma tela que perdeu rótulo, fio e
> card e não ganhou nada no lugar lê como **vazia** — e uma tela vazia é pior que
> uma tela com adereço. A outra metade é substância: tipo maior, campo inteiro de
> cor, e todo estado specificado. Não troque substância por contenção.

## 6. Checklist de measurable

Cada item com critério observável, não com opinião:

- [ ] Nenhum valor de cor/espaçamento/raio literal em JSX — tudo por token
- [ ] `--color-ring` existe e é aplicado em todo elemento focável via `:focus-visible`
- [ ] Nenhum `outline: none` sem substituto (`grep -rn "outline-none\|outline: none" apps/web`)
- [ ] Contraste ≥ 4.5:1 texto normal, ≥ 3:1 texto grande e borda de input — **medido**, não estimado
- [ ] Corpo de texto corrido ≥ 16px; `text-xs` só em metadado
- [ ] Coluna numérica com `tabular-nums`
- [ ] Os 4 estados renderizam (vazio, carregando, erro, sucesso) — e o e2e cobre ao menos vazio e erro
- [ ] `aria-invalid` + `aria-describedby` no campo com erro; erro não comunicado **só** por cor
- [ ] Um `<main>`, headings em ordem `h1 → h2`, `<label htmlFor>` em todo campo

## Referências

- Agent: `.agents/agents/ux-design-specialist.md`
- Skills irmãs: `ui-modes` (qual o modo da tela), `ui-break` (pior caso), `motion`, `ui-review`
- Tokens: `apps/web/app/globals.css`
- Origem: [taste-skill](https://github.com/leonxlnx/taste-skill) (MIT, © Leonxlnx) — house rules
  e leis de craft, adaptadas de "anti-slop de landing page" para "consistência de
  tela de app"; [impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, © Peter Bakaus)
  — modos de superfície e craft floor.