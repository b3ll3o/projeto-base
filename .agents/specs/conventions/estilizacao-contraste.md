---
name: estilizacao-contraste
version: 1.0.0
updated: 2026-11-16
maintainer: ux-design-specialist
description: "A MEDIDA de contraste do padrão de estilização — a §2.2 da convenção `estilizacao.md`: o método, o comando que reproduz a tabela, os 17 pares medidos e o que cada um obriga. Extraída para arquivo próprio porque a convenção-mãe está no teto de 300 linhas. O instrumento é o script tooling/scripts/contraste-token.ts."
---

# O contraste do padrão de estilização (§2.2 da convenção `estilizacao`)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> É a **§2.2** de [`estilizacao.md`](./estilizacao.md) — a MEDIDA. Os números
> de seção são os de lá, para que "§2.2" continue valendo.

## O método

Luminância relativa WCAG sobre os valores REAIS de
`apps/web/app/globals.css` (bloco `@theme`):

```
L = 0,2126·R + 0,7152·G + 0,0722·B
   (cada canal linearizado: v ≤ 0,03928 ? v/12,92 : ((v+0,055)/1,055)^2,4)
razão = (L₁+0,05)/(L₂+0,05)
```

## O comando que reproduz a tabela

```bash
pnpm estilo:contraste
```

O script [`tooling/scripts/contraste-token.ts`](../../../tooling/scripts/contraste-token.ts)
lê os tokens do bloco `@theme` e compõe o fundo do alerta **como o browser
compõe** (8 bits pré-multiplicado, com o arredondamento do Chromium) — que é
o que faz o número do alerta bater com o pixel. MEDIDO 2026-11-16 no Chromium
1223: o par do alerta de erro dá **5,37** no browser e **5,37** no script.

## Os pares medidos

| Par | Razão | Onde o par acontece |
|---|---|---|
| `foreground/surface` | 17,87 | texto em painel, card e campo |
| `foreground/background` | 17,08 | texto corrido da página |
| `ring/surface` | 7,95 | anel de foco sobre card |
| `ring/background` | 7,59 | anel de foco sobre a página |
| `muted-foreground/surface` | 6,91 | legenda e metadado |
| `muted-foreground/background` | 6,61 | legenda e metadado na página |
| `primary-foreground/primary-hover` | 6,66 | texto do botão primário no hover |
| `primary-foreground/primary` | 5,17 | texto do botão primário |
| `destructive` sobre o fundo do alerta | 5,37 | texto de erro do `Alerta` |
| `success` sobre o fundo do alerta | 5,65 | texto do aviso de sucesso |
| `control/surface` | 4,89 | contorno de campo sobre card |
| `control/background` | 4,68 | contorno de campo e de select sobre a página |
| `control/muted` | 4,13 | contorno do botão secundário no hover |
| `surface/background` | 1,05 | **a superfície sobre o fundo da página** — o degrau que carrega a hierarquia |
| `muted/surface` | 1,18 | **tint de hover** — não é texto, e por isso não tem a exigência de 4,5:1 |
| `border/surface` | 1,24 | **divisória decorativa** — não é texto nem contorno de controle |
| a borda do alerta de erro | 1,65 | **a caixa do `Alerta`** (30% do token) — fio quase invisível, e é por isso que a MENSAGEM carrega o estado |

## O que cada número obriga

- **Texto** ≥ 4,5:1 (WCAG 1.4.3) — o pior par de texto é o do alerta de
  erro, **5,37**.
- **Contorno de controle** ≥ 3:1 (WCAG 1.4.11) — o pior é
  `control/muted`, **4,13**.
- **Não é texto** — o tint de hover (1,18), a divisória decorativa (1,24) e
  a borda do alerta (1,65) não têm a exigência de 4,5:1: não carregam
  texto. A CAIXA do alerta e a divisória separam por fio de 1px, e o
  `surface/background` (1,05) separa por PASSO DE TOM.

> ⚠️ **O fundo do `Alerta` é a PÁGINA com 10% do token por cima** — não a
> superfície. Por isso os pares do alerta são medidos contra `background` + o
> tint: contra a superfície dariam 6,70 e 6,88, e o número otimista é o
> número errado.
>
> ⚠️ **`surface/background` = 1,05** — o MENOR número da tabela, e o degrau
> que carrega a hierarquia de superfície (o card branco sobre a página quase
> branca). Ele é aceito de PROPÓSITO: a superfície se separa do fundo por
> PASSO DE TOM, e o fio de 1px é justamente o que a §2.3 da convenção proíbe
> de usar para isso. Um degrau de 5% de luminância é pouco — e é o número que
> o card tem hoje. O app derivado que quiser mais degrau afunda o fundo
> (`--color-background`), e aí mede de novo.
>
> ⚠️ **`ring/primary` = 1,54** — o anel NUNCA encosta no preenchimento. O
> `outline-offset: 2px` é obrigatório, e é por isso que o foco é o
> utilitário `foco` (que traz o offset) e não `outline-2` solto.
