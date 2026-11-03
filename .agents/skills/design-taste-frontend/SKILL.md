---
name: design-taste-frontend
version: 1.0
updated: 2026-11-03
description: "Direção de arte e anti-slop para página PÚBLICA (landing, marketing, one-pager) — o argumento da página em claims, a direção visual, as house rules que o upstream mediu em 247 sites, e o critério de critique. Adaptado de leonxlnx/taste-skill (MIT). Use quando a tarefa for uma página pública ou quando alguém disser que a página está genérica, 'de IA' ou sem graça; NÃO use para tela de app — essa é a skill ui-craft."
---

# Skill: `design-taste-frontend`

> **Quem invoca:** o `ux-design-specialist` — quando a tela em questão é
> **pública** (landing, página de marketing, one-pager, página de produto
> pública), não uma tela de app.
>
> **Quando invocar:** quando o pedido é construir, redesenhar, dar estilo ou
> **revisar uma página pública**; ou quando alguém diz que a página está
> "genérica", "templada", "de IA", "sem graça" ou pede algo "premium".
>
> **Não invocar:** para tela de app (login, listagem, formulário, admin) —
> essa é a [`ui-craft`](../ui-craft/SKILL.md), que já traz a outra metade
> deste mesmo upstream. Para o **processo de revisão** de tela de app, é a
> [`ui-review`](../ui-review/SKILL.md). Para movimento, é a
> [`motion`](../motion/SKILL.md).

## §1. O escopo: a metade que o repo não tinha

Este repo é um **produto interno**: listagem, formulário, login, admin. O
[`ui-craft`](../ui-craft/SKILL.md) adaptou do `leonxlnx/taste-skill`
exatamente a metade que serve a isso — e **deixou de fora** a outra, com um
motivo escrito no próprio arquivo:

> *"As leis de tipo de landing page não valem aqui. Num app, o `h1` compete
> com dado, não com slogan."*

Esta skill é **a outra metade**: a página pública. Aqui valem o `h1` em
`8vw`, o photograph hero, a seção de preço, o formulário de inscrição. E
valem as **house rules** — o conjunto de regras que o upstream **mediu** em
247 sites de galeria, e que é o oposto exato do que um gerador de página
produz.

A fronteira, escrita para não se cruzar:

| | Tela de app | Página pública |
|---|---|---|
| dono da skill | `ui-craft` | **esta** |
| `h1` | compete com dado | compete com slogan |
| densidade | o produto | respiro é o produto |
| tokens | `apps/web/app/globals.css` | direção própria da página |
| revisão | `ui-review` (e2e próprio) | `references/inspecao-e-pesquisa.md` |

## §2. O fluxo

Dez passos, na ordem. Os passos 1 a 5 decidem se a página presta; os 6 a 10
a constroem e provam. O passo a passo está em
[`references/procedimento.md`](references/procedimento.md) — leia-o inteiro
antes de começar, porque a ordem é o que funciona.

| # | Passo | O que decide |
|---|---|---|
| 1 | Ler o briefing e o projeto | o que é real — inclusive **que imagens existem** |
| 2 | Escrever o argumento | a página como **claims com prova**; a ordem das seções nasce daqui |
| 3 | Escolher a direção | composição, paleta e tipografia **antes** de desenhar |
| 4 | Achar a ideia | a frase que só este cliente pode ter |
| 5 | Escrever as palavras | a copy, pela conta da medida |
| 6 | Construir | com a folha de direção em mãos |
| 7 | O portão | a lista do que é proibido, conferida |
| 8 | Olhar | a crítica às imagens — **as imagens, não o código** |
| 9 | Mover | a camada de movimento |
| 10 | Reportar | o que foi feito, com o que ainda não cumpre |

As **house rules** (o que é proibido) estão em
[`references/house-rules.md`](references/house-rules.md); as **leis do ofício**
(o que é obrigatório) em
[`references/leis-e-casos.md`](references/leis-e-casos.md).

## §3. O que **não** foi importado — e por quê

O upstream traz um **sorteador de direção** (`draw.mjs`, que compra uma
composição/paleta/tipografia de um corpus de 247 sites), um **inspetor de
browser** (`inspect.mjs`, que mede as house rules na página viva) e um
**corpus** de 1,6 MB (`library/`).

**Nada disso foi vendorizado aqui.** O motivo é o mesmo que tirou a
categoria `vendor` da convenção de tamanho: um arquivo que ninguém sabe se
pode editar é um arquivo estranho. O `graphify` — que é CLI externa — é
referenciado e não copiado; aqui é o mesmo principle: o **método** é do
repo, o **instrumento** é do upstream.

O que fazer no lugar:

| Upstream | Aqui |
|---|---|
| `draw.mjs` sorteia a direção | **escolha por raciocínio**, com as leis e as house rules como critério — e escreva a direção numa frase antes de codar |
| `inspect.mjs` mede na página viva | [`ui-review`](../ui-review/SKILL.md) + os e2e de `apps/web/e2e/` medem o que é do app; para a página pública, a crítica visual é a da §8 do procedimento |
| `library/` (corpus) | os números do estudo estão em [`references/inspecao-e-pesquisa.md`](references/inspecao-e-pesquisa.md) — é isso que sustenta as regras |

Se o inspetor do upstream for necessário, ele está no repositório dele
(Apache/MIT, ver §6) — mas ele **não** entra neste repo, e o que ele mede
não substitui o `ui-review`.

## §4. Os arquivos

| Arquivo | Leia quando |
|---|---|
| [`references/procedimento.md`](references/procedimento.md) | sempre — o passo a passo dos 10 passos |
| [`references/house-rules.md`](references/house-rules.md) | sempre — o que é proibido, com o número medido de cada regra |
| [`references/leis-e-casos.md`](references/leis-e-casos.md) | ao compor — as leis do ofício e os casos especiais (marca existente, redesign, sem checkout) |
| [`references/inspecao-e-pesquisa.md`](references/inspecao-e-pesquisa.md) | ao revisar e ao justificar uma regra — o critério de crítica e os números do estudo |
| [`references/tipo-cor-estrutura.md`](references/tipo-cor-estrutura.md) | ao definir tipo, cor e grid |
| [`references/imagem-e-texto.md`](references/imagem-e-texto.md) | ao escolher imagem e ao escrever a copy |

## §5. A regra que vem antes de todas

> **Nunca afirme um check que você não rodou.**

O upstream termina o passo 10 com essa frase e arazão: cada item do checklist
foi pulado em algum teste que saiu mal. Vale para o relatório que você
entrega ao usuário.

## §6. Adaptação

**Adaptado de** [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill)
(`skills/design-taste-frontend/SKILL.md`, MIT, © leonxlnx) — o mesmo
upstream de onde o [`ui-craft`](../ui-craft/SKILL.md) tirou a metade de
tela de app.

O upstream é um `SKILL.md` de 542 linhas com 11 arquivos de referência (5.200
linhas, em inglês) e 1,6 MB de corpus. Aqui a adaptação segue o precedente
das outras duas skills deste repo tiradas do mesmo material: **prosa em
pt-BR**, **≤300 linhas por arquivo**, **o conteúdo denso preservado**, e
**nada vendorizado**. Os números do estudo foram mantidos — citar número
medido é a regra; arredondar ou inventar é proibido.
