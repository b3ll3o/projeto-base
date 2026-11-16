---
name: estilizacao
version: 1.1.0
updated: 2026-11-11
maintainer: ux-design-specialist
description: "Padrão de estilização do frontend — tokens semânticos no @theme do Tailwind 4, primitivas de interface em apps/web/components/ui/, o que é proibido numa tela, o mínimo de acessibilidade, como um app derivado ADOTA o padrão e qual instrumento o obriga. O DONO dos valores de token é apps/web/app/globals.css; este doc diz a REGRA, não os valores."
---

# Convenção: `estilizacao` (padrão de estilização do frontend)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## §1. O que esta convenção é

O template é copiado inteiro para virar o app derivado
(`cp -r projeto-base/ meu-novo-projeto/`). O que viaja com a cópia é o
**código** — os tokens, as primitivas e a regra de lint. O que decide se o
app derivado fica **bonito e consistente** é o que este documento declara.

**Três donos, e nenhum tem duas cópias:**

| O quê | Dono |
|---|---|
| **Os valores** dos tokens (a cor, o raio, a fonte) | [`apps/web/app/globals.css`](../../../apps/web/app/globals.css) (bloco `@theme` do Tailwind 4) |
| **As regras** (o que é proibido, como aderir, como estender, o contraste medido) | esta convenção |
| **O instrumento** (quem cobra) | [`packages/eslint-config/rules/no-estilizacao-informal.js`](../../../packages/eslint-config/rules/no-estilizacao-informal.js) |

> ⚠️ **Token transcrito em dois lugares envelhece em um deles.** A tabela de
> papéis vive aqui (o NOME do token e para que serve); o VALOR vive no
> `globals.css`. A MEDIDA de contraste vive aqui — e só aqui.

## §2. Tokens

### §2.1 Os papéis

Cada token tem um nome de **papel**, nunca de família (`--color-primary`, e
não `--color-blue-600`). O nome é o contrato; o valor é decisão de cada app.

| Token | Papel | Onde aparece |
|---|---|---|
| `--color-background` | fundo da página | `body` |
| `--color-surface` | superfície elevada: painel, card, campo | `bg-surface` |
| `--color-muted` | apoio: hover de botão e de linha | `bg-muted` |
| `--color-foreground` | tinta primária (texto corrido) | `text-foreground` |
| `--color-muted-foreground` | tinta secundária: metadado, legenda e **link de navegação** | `text-muted-foreground` |
| `--color-border` | divisória decorativa (linha de tabela, separador) | `border-border` |
| `--color-control` | contorno de **controle** (campo, botão secundário, select, checkbox) | `border-control` |
| `--color-primary` | ação primária | `bg-primary` |
| `--color-primary-hover` | hover da ação | `hover:bg-primary-hover` |
| `--color-primary-foreground` | texto sobre a ação | `text-primary-foreground` |
| `--color-ring` | foco visível | utilitário `foco` |
| `--color-destructive` | erro: texto, borda de campo inválido, tinta do alerta | `text-destructive` |
| `--color-success` | sucesso: tinta do aviso de confirmação | `text-success` |

Fora de cor: `--radius-md` (o raio **único**) e `--font-sans` (a fonte
única, a do sistema).

**A distinção que a escala cobre:** `background` (a página) · `surface` (o
que está em cima) · `muted` (o apoio) · `border` (divisória, 1,24:1 — é
decorativa) · `control` (contorno, 4,68:1 — é o que a pessoa precisa
enxergar). As duas últimas são **de propósito diferentes**: a borda
decorativa pode ser fraca; o contorno de um campo, não.

### §2.2 Regras do token

1. **O token guarda a COR COMPLETA** (`hsl(0 0% 100%)`), nunca a tripla HSL
   crua (`0 0% 100%`). No Tailwind 4 a utilitária gerada é
   `background-color: var(--color-x)`: uma tripla crua é CSS inválido, e o
   browser descarta a declaração **em silêncio**. MEDIDO 2026-11-11 no build
   deste app: era o que `globals.css` fazia.
2. **`--color-ring` tem de existir e tem de diferir da ação.** Anel da mesma
   cor do botão é indistinguível dele (medido: `ring/primary` = 1,54:1).
3. **Token sem consumidor real não entra.** Variável de nome difícil é
   variável inline. Quando o primeiro consumidor aparecer, o token entra —
   com a regra §4.4.
4. **Contraste medido, não estimado.** Texto corrido ≥ 4,5:1 e borda de
   controle ≥ 3:1 (WCAG 1.4.3 e 1.4.11).

**A MEDIDA (o único lugar onde ela vive).** MEDIDO 2026-11-11, luminância
relativa WCAG (sRGB → linear → L → razão), sobre os valores REAIS de
`globals.css`. A fórmula é a do WCAG 2.x: `L = 0,2126·R + 0,7152·G +
0,0722·B` com cada canal linearizado por `v ≤ 0,03928 ? v/12,92 :
((v+0,055)/1,055)^2,4`, e a razão é `(L₁+0,05)/(L₂+0,05)`. Os tokens saem de
`grep -A2 -E '^\s*--color' apps/web/app/globals.css`; a leitura no browser
(`getComputedStyle`) confere dentro de 0,01.

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
| `destructive` sobre o fundo do alerta | 5,42 | texto de erro do `Alerta` |
| `success` sobre o fundo do alerta | 5,65 | texto do aviso de sucesso |
| `control/surface` | 4,89 | contorno de campo sobre card |
| `control/background` | 4,68 | contorno de campo e de select sobre a página |
| `control/muted` | 4,13 | contorno do botão secundário no hover |
| `muted/surface` | 1,18 | **tint de hover** — não é texto, e por isso não tem a exigência de 4,5:1 |
| `border/surface` | 1,24 | **divisória decorativa** — não é texto nem contorno de controle |

> ⚠️ **O fundo do `Alerta` é a PÁGINA com 10% do token por cima** — não a
> superfície. É por isso que os pares do alerta são medidos contra
> `background` + o tint, e não contra `surface`: medir contra a superfície
> daria 6,70 e 6,88, e o número otimista é o número errado.
>
> ⚠️ **`ring/primary` = 1,54** — o anel NUNCA encosta no preenchimento. O
> `outline-offset: 2px` é obrigatório, e é por isso que o foco é o
> utilitário `foco` (que traz o offset) e não `outline-2` solto.

### §2.3 O que NÃO tem token (e por quê)

- **Sombra**: o sistema não tem sombra. Superfície separada por **passo de
  tom**; sombra entra quando o primeiro menu/dialog/popover existir.
- **Modo escuro**: fora, até existir consumidor (§4.5).
- **Tipografia**: sem token — a escala do Tailwind já é a régua, e o padrão
  fixa os **PAPÉIS** (§4.2), não os tamanhos.
- **Fio de 1px**: permitido em **dois** lugares, e em nenhum outro —
  **divisória decorativa** (`--color-border`) e **dado tabular** (a linha
  da tabela). Fora disso, a superfície se separa por passo de tom.

## §3. Primitivas

`apps/web/components/ui/` é o catálogo. Toda primitiva é **Server
Component** por padrão (sem `'use client'`): quem precisa de estado é o
formulário que a usa, e a primitiva recebe o que precisa por prop.

| Primitiva | O que entrega | O que substitui (medido em `origin/main`) |
|---|---|---|
| `Container` | o `<main>` da tela | `mx-auto max-w-3xl p-8` — **16×** |
| `CabecalhoPagina` | `h1` + descrição + ação | `text-2xl font-semibold text-slate-900` — **16×**; `mt-1 text-sm text-slate-500` — **13×** |
| `Campo` | rótulo + controle + dica + erro, com a fiação de a11y | label — **7×**; input — **7×**; erro de campo — **7×** |
| `Botao` | primário e secundário; com `href` é link do Next | `rounded-md bg-slate-900 px-4 py-2` — **10×**; secundário — **4×** |
| `Alerta` | erro (`role="alert"`) e sucesso (`role="status"`) | alerta de erro — **4×**; de sucesso — **1×** |
| `Tabela` + `CabecalhoTabela` + `CelulaTabela` | tabela com `scope="col"` e nome acessível | `th` — **24×**; `td` — **19×**; as **5** tabelas |
| `EstadoVazio` | o que está vazio + o que fazer | o bloco de estado vazio |
| `LinkTexto` | link de saída (`Cancelar`, `Criar conta`, `editar`) | a classe de link de texto — **5×** |

> Comando da medida: `git grep -F -o "<class string>" origin/main -- 'apps/web/app/**' 'apps/web/components/**' | wc -l`.
> Para as células: `git grep -h -o "<th" origin/main -- 'apps/web/app/**' | wc -l` (24) e
> `git grep -h -o "<td" origin/main -- 'apps/web/app/**' | wc -l` (19).

**O dono da classe do CONTROLE** (`CLASSE_CONTROLE`, `CLASSE_CHECKBOX` em
`campo.tsx`) é o que cobre o campo de texto, o `<select>` e o checkbox: os
três são a mesma família, e um dono por família é o que faz a regra
sobreviver ao app derivado.

**O que NÃO vira primitiva** (over-abstração): card genérico (superfície é
`bg-surface` + `rounded-md`), modal, toast, badge, ícone, esqueleto de
carregamento, grid/flex/espaçador (o Tailwind já é a ferramenta).

## §4. Regras

### §4.1 Permitido na tela

- Cor **só** por token semântico (`bg-surface`, `text-muted-foreground`,
  `border-control`).
- Raio **só** `rounded-md`.
- Espaçamento na escala do Tailwind, com o vão entre seções maior que o vão
  dentro de uma seção.
- Um `<main>` por tela (o `Container`), headings em ordem `h1 → h2`,
  `<label htmlFor>` em todo campo.
- Os **4 estados** de toda tela com dado: vazio, carregando, erro e sucesso.
  Estado vazio ≠ estado de erro.

> **O estado atual do app de referência** (medido 2026-11-11): o **vazio**
> existe em `/users` (`EstadoVazio`); o **erro** existe nas telas que leem da
> API (`Alerta`); o **carregando** NÃO existe em lugar nenhum — 0 arquivos
> `loading.tsx` — e as **5** tabelas de admin renderizam `<tbody>` vazio, sem
> mensagem. **LACUNA DECLARADA**: o app derivado que precisar declare os 4
> estados; o de referência declara vazio e erro.

### §4.2 Tipografia (os papéis)

| Papel | Tamanho | Tinta |
|---|---|---|
| Título de tela | `text-2xl font-semibold` | `text-foreground` |
| Título de seção | `text-lg font-medium` | `text-foreground` |
| Corpo / dado | `text-sm` | `text-foreground` |
| Descrição da tela (o subtítulo do cabeçalho) | `text-sm` | `text-muted-foreground` |
| Metadado | `text-xs` (só metadado) | `text-muted-foreground` |
| Erro | `text-sm` — **nunca** menor que o corpo | `text-destructive` |

### §4.3 Proibido

- **Paleta stock** do Tailwind (`text-slate-900`, `bg-red-50`,
  `border-slate-300`, `text-white`) e **valor literal** de cor (`bg-[#fff]`,
  `text-[rgb(0,0,0)]`) — **com variante e com opacidade** (`hover:bg-slate-700`,
  `bg-slate-900/50` contam).
- **Raio** fora de `rounded-md`; **sombra** em repouso (inclusive no campo).
- **`outline-none` sem substituto**: o foco é o utilitário `foco`
  (`globals.css`), que apaga o anel no clique de mouse e o devolve na
  navegação por teclado. **Todo elemento focável tem `foco`** — campo,
  botão e link.
- **`text-xs` para texto que se precisa ler**; erro menor que `text-sm`.
- Rótulo em maiúsculas espaçadas fora de dado tabular.
- Emoji como ícone; gradiente decorativo; `backdrop-blur` (vidro).
- **Mensagem de estado que cole a exceção crua**: a tela diz o que houve e
  o que a pessoa pode fazer; o diagnóstico cru fica no log do servidor.
- **`className` como substitutor**: o que o caller passa é ADICIONAL, não
  substitutor (a ordem do CSS decide, não a da string).

### §4.4 O que se PEDE em troca

Cada token novo exige, **no mesmo PR**: (1) o papel na tabela §2.1, (2) o
valor em `globals.css` com a **cor completa**, (3) o **contraste medido**
de cada par em que ele entra, anotado em §2.2, (4) um consumidor real, e
(5) o nome no padrão `--color-<papel>`.

### §4.5 O que o padrão NÃO decide (e o app derivado decide)

- **Modo escuro**: fora até existir consumidor.
- **Densidade**: o app é **Operar** (densidade é o produto); um app de
  leitura pode mudar a escala de espaçamento.
- **Impressão**: sem regra — cor de tela não é cor de impressão.
- **Movimento**: só transição de cor no hover (`transition-colors`, 150ms).
  Sem animação de entrada, sem paralaxe.

## §5. Acessibilidade (o mínimo, não o ideal)

1. **Foco visível** em todo elemento focável — o utilitário `foco`, e nada
   de `outline-none` sem ele. Um app com dois sistemas de foco (anel azul
   no botão, anel do browser no link) é um app com foco inconsistente.
2. **Erro comunicado por cor E por texto**: `aria-invalid` + mensagem com
   `role="alert"`. A cor do fio é reforço, nunca o portador.
3. **Rótulo associado**: `label htmlFor` + `id` do controle — é o que dá o
   nome acessível do campo.
4. **`role="alert"` para erro** (interrompe a fala) e **`role="status"` para
   confirmação** (não interrompe). A decisão vem da variante do `Alerta`,
   não de quem chama.
5. **Tabela com nome acessível** (`legenda` → `<caption class="sr-only">`) e
   cabeçalho com `scope="col"`. A legenda é **obrigatória** na primitiva.
6. **Link com nome próprio** quando há vários iguais na tela: o "editar" de
   6 linhas diz QUAL (`aria-label="Editar {nome}"`).
7. **Reflow (WCAG 1.4.10)**: a tela reflowa em 320px sem rolagem horizontal.
   O `Container` usa `p-4 sm:p-8` e o `CabecalhoPagina` usa `flex-wrap`.
   ⚠️ **LIMITE DECLARADO**: o `Sidebar` do app de referência é de largura
   fixa (`w-64`) e **não** colapsa em tela estreita — o app derivado que
   precisar de 320px precisa de um chrome que colapse.

## §6. Como um app derivado ADOTA o padrão

**Copiar, verbatim, e não editar:**

1. `apps/web/app/globals.css` — o bloco `@theme` e o utilitário `foco`.
2. `apps/web/components/ui/**` — as primitivas **menos o spec**
   (`primitivas.spec.tsx` importa `@testing-library/react`, que é devDep do
   `apps/web`; o app derivado precisa dele ou apaga o spec).
3. `packages/eslint-config/rules/no-estilizacao-informal.js` (+ o `.d.ts`) e
   o registro no `apps/web/eslint.config.mjs` — o instrumento.

**Não copiar:** `app/page.tsx` (boilerplate), `components/Sidebar.tsx`
(chrome do app), os formulários de exemplo.

**Para trocar a identidade visual do app derivado:** mude **um par** de
tokens — `--color-primary` + `--color-primary-hover` — e, se quiser foco
próprio, `--color-ring`. Qualquer outra mudança é fork e exige decisão
explícita (a skill `ui-modes` diz: redesenho substitui, e diz que
substituiu).

## §7. O instrumento

A regra `estilizacao/no-estilizacao-informal` (flat config do ESLint) mede
**três** coisas: cor (paleta stock e literal, com variante e opacidade),
raio e sombra.

```bash
pnpm --filter @projeto/web lint          # a regra morde
pnpm --filter @projeto/web typecheck
pnpm --filter @projeto/web test:unit     # inclui o spec da regra
```

O spec da regra é [`apps/web/estilizacao.spec.ts`](../../../apps/web/estilizacao.spec.ts):
ele prova que a regra recusa a violação **e** que o repo real não tem
nenhuma.

**O que a regra NÃO mede** (e é humano): hierarquia tipográfica,
espaçamento, se o token citado existe, e o contraste. Ela mede a FORMA da
classe, não a coerência da tela.

**Os limites declarados da regra:** ela mede a **classe literal no JSX** — uma
classe guardada em **constante** (`className={CLASSE_CONTROLE}`) não é vista,
e é por isso que as primitivas são a ÚNICA fonte de classe do app (a revisão
humana mede o que está nelas). E a **fusão** de `className` do caller é
concatenação, não substituição: duas utilitárias da mesma família (duas
cores) ficam à mercê da ordem do CSS.

**A exceção:** `eslint-disable-next-line` funciona, como em toda regra — e o
único uso legítimo é **elemento que flutua de verdade** (menu, dialog,
popover), que é o único caso em que sombra entra no sistema.

## §8. Cross-refs

- [`ui-craft`](../../skills/ui-craft/SKILL.md) — as leis de craft (hierarquia,
  estados, anti-slop) que o padrão assume.
- [`ui-modes`](../../skills/ui-modes/SKILL.md) — o modo da tela (este app é
  **Operar**: densidade é o produto).
- [`ui-break`](../../skills/ui-break/SKILL.md) — o pior caso de cada valor.
- [`idioma.md`](./idioma.md) — a prosa do app é pt-BR.
- [`documentacao.md`](./documentacao.md) — a documentação é parte do código.
- [`dry.md`](./dry.md) — a primitiva é o dono do estilo do campo; o
  `className` repetido é a dívida que ela paga.
