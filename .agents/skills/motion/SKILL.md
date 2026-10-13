---
name: motion
version: 1.0
updated: 2026-10-13
description: "Critério de review e regras de motion para apps/web — os 10 padrões não-negociáveis, os gatilhos de escalada, e os valores exatos (curvas, durações, origem, timing) para não chutar em review. CSS-first: o projeto não tem biblioteca de animação, e as regras valem com ou sem uma. Adaptado de review-animations + STANDARDS (emilkowalski, MIT). Carregada por ux-design-specialist e ui-review."
---

# Skill: `motion`

> **Quem invoca:** `ux-design-specialist` e `ui-review`, quando o diff toca
> transição, animação ou `@keyframes` em `apps/web/**`.
> **Quem NÃO invoca:** `nextjs-specialist` — performance de bundle é dele, performance de
> **movimento** é daqui.
>
> **Quando invocar:** PR/diff que introduz ou altera animação; ao adicionar
> feedback visual a um fluxo (submit, erro, carregamento).
> **Medido em 2026-10-13: o repo não tem biblioteca de animação** (`grep motion
> apps/web/package.json` → nada). As regras abaixo valem para CSS puro; se uma
> lib entrar depois, a coluna "propriedade GPU" é o que muda.

## Postura

O viés é para **movimento que parece certo**, não que apenas roda. Uma transição
que "funciona" mas parece lenta, cai da origem errada, dispara demais ou derruba
frame é regressão, não aprovação. **O padrão é apontar; aprovação se conquista.**

## Os 10 padrões não-negociáveis

Violação é achado.

1. **Movimento justificado.** Toda animação responde "por que isto anima?" —
   consistência espacial, indicação de estado, feedback, explicação, ou evitar
   mudança brusca. "Parece legal" num elemento visto o dia todo é bloqueio.
2. **Frequência-apropriada.** Movimento combina com quantas vezes é visto.
   Ações de teclado e 100+/dia **não** animam. Dezenas/dia: movimento reduzido.
   Ocasional: padrão. Raro/primeira vez: pode ter delight.
3. **Easing responsivo.** Entrada/saída usam `ease-out` ou curva custom forte.
   **`ease-in` em UI é bloqueio** — atrasa exatamente o momento que a pessoa está
   olhando. Easings nativos do CSS são fracos demais.
4. **UI abaixo de 300ms.** Acima disso em elemento de UI precisa de justificativa.
5. **Origem e correção física.** Popover/dropdown/tooltip escalam **do gatilho**
   (`transform-origin`), não do centro. **Nunca anime de `scale(0)`** — comece em
   `scale(0.9–0.97)` + opacity. (Modal é isento: é centralizado.)
6. **Interrompível.** Movimento disparado rápido ou por gesto (toast, toggle,
   drag) tem de ser interrompível — `transition` ou spring que retargeta do
   estado atual, **não** keyframe que reinicia do zero.
7. **Só propriedade de GPU.** Anime `transform` e `opacity`. Animar
   `width`/`height`/`margin`/`padding`/`top`/`left` é achado de performance.
8. **Acessibilidade.** `prefers-reduced-motion` respeitado — mais suave, **não
   zero** (mantém opacity/cor, descarta deslocamento). Movimento de hover atrás de
   `@media (hover: hover) and (pointer: fine)`.
9. **Entrada/saída assimétrica.** Ação deliberada (pressionar, segurar, confirmar
   destrutivo) anima mais devagar; resposta do sistema é imediata. Timing simétrico
   em press-and-release é achado.
10. **Coesão.** Movimento combina com a personalidade do componente e com o resto
    do produto. Quando em dúvida, **o movimento mais forte é deletar**.

## Valores exatos

**Easing.** Ordem de decisão:

| Caso | Curva |
|------|-------|
| Entrando ou saindo | `ease-out` forte |
| Movendo/morphing na tela | `ease-in-out` forte |
| Hover / mudança de cor | `ease` |
| Movimento constante (marquee, progresso) | `linear` |

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* ease-out forte para UI */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* ease-in-out forte */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* curva de drawer (iOS-like) */
```

**Duração.**

| Elemento | Duração |
|----------|---------|
| Feedback de pressionar botão | 100–160ms |
| Tooltip, popover pequeno | 125–200ms |
| Dropdown, select | 150–250ms |
| Modal, drawer | 200–500ms |

**Regra: animação de UI fica abaixo de 300ms.** Um dropdown de 180ms parece mais
responsivo que um de 400ms. Spinner mais rápido faz o load **parecer** mais rápido.

**Frequência → decisão.**

| Frequência | Decisão |
|------------|---------|
| 100+/dia (atalho, command palette) | **Nenhuma animação. Nunca.** |
| Dezenas/dia (hover, navegação de lista) | Remover ou reduzir drasticamente |
| Ocasional (modal, drawer, toast) | Animação padrão |
| Raro/primeira vez (onboarding, celebração) | Pode ter delight |

**Física.**

```css
/* origem consciente do gatilho */
.popover { transform-origin: var(--transform-origin); } /* modal: center */

/* feedback de pressionar — sutil (0.95–0.98) */
button:active { transform: scale(0.97); transition: transform 160ms var(--ease-out); }

/* entrada sem JS */
.toast {
  opacity: 1; transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;
  @starting-style { opacity: 0; transform: translateY(100%); }
}
```

**Interrompibilidade.** `transition` é interrompível e retargeta; `@keyframes`
reinicia do zero. Para algo disparado rápido (toast entrando, toggle), transition.

**Performance.**

- Só `transform`/`opacity` — pulam layout/paint. `padding`/`margin`/`height`/
  `width`/`top`/`left` disparam os três passos de render.
- **Não dirija transform de filho por variável CSS no pai** — recalcula estilo de
  todos os filhos:
  ```js
  el.style.setProperty('--x', `${d}px`); // ruim: recalc em todos os filhos
  el.style.transform = `translateY(${d}px)`; // bom: só este elemento
  ```
- CSS anima melhor que JS sob carga (roda fora da main thread); rAF engasga
  enquanto o browser carrega, executa script e pinta. **CSS para movimento
  predeterminado; JS para movimento dinâmico e por gesto.**
- **Spring** (se uma lib entrar) para gesto com momento, elemento "vivo", ou
  interação reversível no meio: `{ type: "spring", duration: 0.5, bounce: 0.2 }`.
  Bounce sutil (0.1–0.3); reserve para drag-to-dismiss e interações leve-jocosas.

**Stagger.** 30–80ms entre itens de uma entrada de grupo. Delay maior parece
lento. Stagger é decorativo — **nunca** bloqueie interação durante.

**Máscara de crossfade imperfeito.** Se o crossfade mostra dois estados sobrepostos,
`filter: blur(2px)` durante a transição os funde numa transformação percebida.
Blur < 20px (blur pesado é caro, especialmente no Safari).

## Gatilhos de escalada — aponte de imediato

- `transition: all` (propriedade sem limite)
- `scale(0)` ou entrada só-fade sem transform inicial
- `ease-in` em qualquer interação de UI; easing nativo fraco em animação deliberada
- animação em atalho de teclado ou ação 100+/dia
- duração de UI > 300ms sem razão declarada
- `transform-origin: center` em popover/dropdown/tooltip ancorado no gatilho
- `@keyframes` em toast, toggle ou algo disparado rápido
- animar propriedade de layout (`width`/`height`/`margin`/`padding`/`top`/`left`)
- `prefers-reduced-motion` ausente em movimento
- `:hover` não protegido por `@media (hover: hover)`
- timing simétrico de entrada/saída em press-and-release ou hold
- entrada "tudo de uma vez" onde um stagger de 30–80ms caberia

## Hierarquia de remediação

Ao propor conserto, prefira o movimento anterior:

1. **Deletar** a animação (alta frequência / sem propósito / por teclado).
2. **Reduzir** — duração menor, transform menor, menos propriedades.
3. **Corrigir o easing** — `ease-in` → `ease-out`/curva custom forte.
4. **Corrigir origem/física** — `transform-origin` certo; `scale(0)` → `scale(0.95)`+opacity.
5. **Tornar interrompível** — keyframes → transitions, ou spring para gesto.
6. **Levar para a GPU** — propriedade de layout → `transform`/`opacity`.
7. **Timing assimétrico** — desacelerar a fase deliberada, estalar a resposta.
8. **Polir** — blur para crossfade, stagger, `@starting-style`.
9. **Acessibilidade e coesão** — reduced-motion + gate de hover; afinar à personalidade.

## Formato de saída obrigatório

### Parte 1 — Tabela de achados

Uma linha por achado. Nunca uma lista "Antes:/Depois:".

| Antes | Depois | Por quê |
|-------|--------|---------|
| `transition: all 300ms` | `transition: transform 200ms var(--ease-out)` | `all` anima propriedades não intencional e fora da GPU |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nada aparece do nada — `scale(0)` parece vir do vácuo |
| `ease-in` no dropdown | `ease-out` + curva forte | `ease-in` atrasa o momento observado; parece lento |

### Parte 2 — Veredito

Comentário restante agrupado por impacto, do maior pro menor. Omita tier vazio.
Fecha com decisão explícita:

- **Bloquear** — qualquer regressão que quebrava a sensação; animação em ação de
  teclado/alta frequência; `scale(0)`/`ease-in` em UI; animação não-GPU com
  conserto fácil de GPU.
- **Aprovar** — sem regressão que quebrava a sensação, sem movimento óbvio que
  deveria ser deletado, duração e easing dentro do limite, interrompibilidade
  tratada onde precisa, reduced-motion respeitado.

Cite `file:line`. Quando um valor exato for necessário (curva, duração, spring),
**puxe da tabela acima** — não chute.

## Referências

- Agent: `.agents/agents/ux-design-specialist.md` · skill irmã: `ui-review`
- Checklist de a11y (reduced-motion, foco): `ui-craft` §6
- Origem: [emilkowalski/skills — review-animations](https://github.com/emilkowalski/skills/tree/main/skills/review-animations)
  (MIT, © Emil Kowalski) — padrões não-negociáveis, gatilhos de escalada e
  hierarquia de remediação; `STANDARDS.md` do mesmo repo — as curvas, durações e
  regras de física citadas acima.