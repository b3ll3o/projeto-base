---
name: estilizacao
version: 1.3.0
updated: 2026-11-16
maintainer: ux-design-specialist
description: "Padrão de estilização do frontend — tokens semânticos no @theme do Tailwind 4, primitivas de interface em apps/web/components/ui/, o que é proibido numa tela, como um app derivado ADOTA o padrão e qual instrumento o obriga. O DONO dos valores de token é apps/web/app/globals.css; este doc diz a REGRA, não os valores. A §2.2 (a medida de contraste) e a §5 (o mínimo de acessibilidade) estão nos companions estilizacao-contraste.md e estilizacao-acessibilidade.md."
---

# Convenção: `estilizacao` (padrão de estilização do frontend)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## §1. O que esta convenção é

O template é copiado inteiro para virar o app derivado
(`cp -r projeto-base/ meu-novo-projeto/`). A cópia leva o **código** — tokens,
primitivas e a regra de lint; o que decide se o app derivado fica bonito e
consistente é o que este documento declara.

**Três donos, e nenhum tem duas cópias** — token transcrito em dois lugares
envelhece em um deles:

| O quê | Dono |
|---|---|
| **Os valores** dos tokens (a cor, o raio, a fonte) | [`apps/web/app/globals.css`](../../../apps/web/app/globals.css) (bloco `@theme` do Tailwind 4) |
| **As regras** (o que é proibido, como aderir, como estender, o contraste medido) | esta convenção |
| **O instrumento** (quem cobra) | [`packages/eslint-config/rules/no-estilizacao-informal.js`](../../../packages/eslint-config/rules/no-estilizacao-informal.js) |

> O NOME e o PAPEL de cada token vivem aqui; a MEDIDA de contraste, no
> companion [`estilizacao-contraste.md`](./estilizacao-contraste.md); o VALOR, no `globals.css` — e só lá.

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

Fora de cor: `--radius-md` (o raio **único**) e `--font-sans` (a do sistema). ⚠️ `rounded-md` é o NOME do raio: renomear o token obriga a renomear a regra e a §4.3 no mesmo PR (a regra não lê o `globals.css`).

**A distinção que a escala cobre:** `background` (a página) · `surface` (o
que está em cima) · `muted` (o apoio) · `border` (divisória, decorativa) ·
`control` (contorno, que a pessoa precisa enxergar). As duas últimas são
**de propósito diferentes**.

### §2.2 Regras do token

1. **O token guarda a COR COMPLETA** (`hsl(0 0% 100%)`), nunca a tripla HSL
   crua (`0 0% 100%`): no Tailwind 4 a utilitária gerada é
   `background-color: var(--color-x)`, e a tripla crua é CSS inválido — o
   browser a descarta **em silêncio**.
2. **`--color-ring` tem de existir e tem de diferir da ação.** Anel da mesma
   cor do botão é indistinguível dele (medido: `ring/primary` = 1,54:1).
3. **Token sem consumidor real não entra.** Variável de nome difícil é
   variável inline. Quando o primeiro consumidor aparecer, entra (§4.4).
4. **Contraste medido, não estimado.** Texto corrido ≥ 4,5:1 e borda de
   controle ≥ 3:1 (WCAG 1.4.3 e 1.4.11).

**A MEDIDA (o único lugar onde ela vive).** A §2.2 mede o contraste de 17
pares, e ela está no companion
[`estilizacao-contraste.md`](./estilizacao-contraste.md) — com o método, o
comando e a tabela. **O comando que reproduz a tabela:** `pnpm estilo:contraste`
(o script [`tooling/scripts/contraste-token.ts`](../../../tooling/scripts/contraste-token.ts)),
que lê os tokens do `@theme` e compõe o fundo do alerta COMO O BROWSER COMPÕE.

Os três números que a §2.3 e a §4 dependem: **texto** ≥ 4,5:1 (o pior par
de texto é o do alerta de erro, 5,37) e **contorno de controle** ≥ 3:1 (o
pior é `control/muted`, 4,13).

### §2.3 O que NÃO tem token (e por quê)

- **Sombra**: o sistema não tem sombra. Superfície separada por **passo de
  tom**; sombra entra quando o primeiro menu/dialog/popover existir.
- **Modo escuro**: fora, até existir consumidor (§4.5).
- **Tipografia**: sem token — a escala do Tailwind já é a régua, e o padrão
  fixa os **PAPÉIS** (§4.2), não os tamanhos.
- **Fio de 1px**: em **quatro** famílias, e em nenhum outro — divisória
  decorativa (`--color-border`), dado tabular (a linha da tabela), a **caixa
  do alerta** (`border-destructive/30` e `border-success/30`) e o **contorno
  de controle** (`--color-control`, no campo, no select, no checkbox e no
  botão secundário). As duas últimas têm contrato diferente da decorativa: o
  contorno de controle precisa de 3:1 contra a superfície (§2.2) e a borda do
  alerta é a caixa que separa a tinta do erro do fundo dela (1,65:1 — fio
  quase invisível, e é por isso que a MENSAGEM é que carrega o estado).

## §3. Primitivas

`apps/web/components/ui/` é o catálogo. Toda primitiva é **Server
Component** por padrão (sem `'use client'`): quem precisa de estado é o
formulário, e a primitiva recebe o que precisa por prop.

| Primitiva | Arquivo | O que entrega | O que substitui (medido em `origin/main`) |
|---|---|---|---|
| `Container` | `apps/web/components/ui/container.tsx` | o `<main>` da tela | `mx-auto max-w-3xl p-8` — **16×** |
| `CabecalhoPagina` | `apps/web/components/ui/cabecalho-pagina.tsx` | `h1` + descrição + ação | `text-2xl font-semibold text-slate-900` — **16×**; `mt-1 text-sm text-slate-500` — **13×** |
| `CabecalhoSecao` | `apps/web/components/ui/cabecalho-secao.tsx` | o `h2` da tela | `text-lg font-medium text-slate-900` — **7×** |
| `Campo` | `apps/web/components/ui/campo.tsx` | rótulo + controle + dica + erro, com a fiação de a11y | rótulo `block text-sm font-medium text-slate-900` — **7×**; input `w-full rounded-md border border-slate-300 px-3 py-2` — **7×**; erro de campo `mt-1 text-sm text-red-700` — **7×** |
| `Botao` | `apps/web/components/ui/botao.tsx` | primário e secundário; com `href` é link do Next | primário `rounded-md bg-slate-900 px-4 py-2` — **10×**; secundário (por `hover:bg-slate-50`) — **5×** |
| `Alerta` | `apps/web/components/ui/alerta.tsx` | erro (`role="alert"`) e sucesso (`role="status"`) | alerta de erro (por `bg-red-50`) — **5×**; de sucesso — **1×** |
| `Tabela` + `CabecalhoTabela` + `CelulaTabela` | `apps/web/components/ui/tabela.tsx` | tabela com `scope="col"` e nome acessível | `th` — **24×**; `td` — **19×**; as **5** tabelas |
| `EstadoVazio` | `apps/web/components/ui/estado-vazio.tsx` | o que está vazio + o que fazer | o bloco de estado vazio |
| `LinkTexto` | `apps/web/components/ui/link-texto.tsx` | link de saída (`Cancelar`, `Criar conta`, `editar`) | `text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900` — **5×** |

> Medida: `git grep -F -o "<class string>" origin/main -- 'apps/web/app/**' 'apps/web/components/**' | wc -l` — a string está ESCRITA na coluna, e é ela que o comando mede; células: `git grep -h -o "<th" origin/main -- 'apps/web/app/**' | wc -l` (24) e `git grep -h -o "<td" origin/main -- 'apps/web/app/**' | wc -l` (19).
>
> ⚠️ A coluna "Arquivo" é o que o gate `check-doc-coverage` mede: uma
> primitiva nova que não apareça aqui é uma primitiva sem doc canônico.

**O dono da classe do CONTROLE** (`CLASSE_CONTROLE`, `CLASSE_CONTROLE_COMPACTO`
e `CLASSE_CHECKBOX` em `campo.tsx`) cobre o campo, o `<select>` e o checkbox: um
dono por família. ⚠️ O tamanho menor do `<select>` é uma constante própria e
**não** um `className` por cima: `px-2` e `px-3` são a mesma utilitária, e o
CSS compilado põe `px-3` DEPOIS de `px-2` — o `px-2 py-1` escrito por cima
seria código morto (MEDIDO 2026-11-16).

**O que NÃO vira primitiva** (over-abstração): card genérico (superfície é
`bg-surface` + `rounded-md`), modal, toast, badge, ícone, esqueleto,
grid/flex/espaçador — o Tailwind já é a ferramenta.

## §4. Regras

### §4.1 Permitido na tela

- Cor **só** por token semântico (`bg-surface`, `text-muted-foreground`,
  `border-control`).
- Raio **só** `rounded-md`.
- Espaçamento na escala do Tailwind, com o vão entre seções maior que o vão
  dentro de uma seção.
- Um `<main>` por tela (o `Container`), headings em ordem `h1 → h2`, e todo
  campo com NOME ACESSÍVEL: rótulo visível no formulário (`Campo`) ou
  `aria-label` no dado tabular, onde a coluna dá o contexto.
- Os **4 estados** de toda tela com dado: vazio, carregando, erro e sucesso.
  Estado vazio ≠ estado de erro.

> **O estado atual do app de referência** (medido 2026-11-11): o **vazio**
> existe em `/users` (`EstadoVazio`) e o **erro** nas telas que leem da API
> (`Alerta`); o **carregando** NÃO existe — 0 arquivos `loading.tsx` — e as
> **5** tabelas de admin renderizam `<tbody>` vazio, sem mensagem. **LACUNA
> DECLARADA**: o app derivado que precisar declare os 4 estados.

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
  `text-[rgb(0,0,0)]`) — **com variante, com lado e com opacidade**
  (`hover:bg-slate-700`, `border-t-slate-200`, `bg-slate-900/50` contam).
- **Raio** fora de `rounded-md`; **sombra** em repouso (inclusive no campo).
- **`outline-none` sem substituto**: o foco é o utilitário `foco`.
  **Todo elemento focável tem `foco`**.
- **`text-xs` para texto que se precisa ler**; erro menor que `text-sm`.
- Rótulo em maiúsculas espaçadas fora de dado tabular.
- Emoji como ícone; gradiente decorativo; `backdrop-blur` (vidro).
- **Mensagem de estado que cole a exceção crua**: a tela diz o que houve e
  o que a pessoa pode fazer; o diagnóstico cru fica no log do servidor.
- **`className` como substitutor**: o que o caller passa é ADICIONAL, não
  substitutor (a ordem do CSS decide, não a da string).

### §4.4 O que se PEDE em troca

Cada token novo exige, **no mesmo PR**: (1) o papel na tabela §2.1, (2) o
valor em `globals.css` com a **cor completa**, (3) o **contraste medido** de
cada par, anotado no companion
[`estilizacao-contraste.md`](./estilizacao-contraste.md), (4) um consumidor real, e (5) o nome
`--color-<papel>`.

### §4.5 O que o padrão NÃO decide (e o app derivado decide)

- **Modo escuro**: fora até existir consumidor.
- **Densidade**: o app é **Operar** (densidade é o produto); um app de
  leitura pode mudar a escala de espaçamento.
- **Impressão**: sem regra — cor de tela não é cor de impressão.
- **Movimento**: só transição de cor no hover, 150ms — e **nunca** de
  `transition-colors` onde há anel de foco (§5.1 do companion
  [`estilizacao-acessibilidade.md`](./estilizacao-acessibilidade.md)). Sem
  animação de entrada.
  ⚠️ O `hover:` do Tailwind 4 já vem ATRÁS de `@media (hover: hover)`
  (MEDIDO 2026-11-16 no CSS compilado de `apps/web`) — ou seja, o botão não
  gruda no `bg-primary-hover` depois do toque. O que a skill `motion` §8
  exige está de graça.
- **A fonte**: a do sistema (`--font-sans`), e **não** `next/font` — que
  baixa a fonte no build, e o CI sem rede quebraria o build por causa da
  tipografia. Um app derivado que queira fonte própria decide isso FORA do
  padrão, e o valor vai no token `--font-sans`, no `globals.css`.
- **Largura**: o `Container` é `max-w-3xl` (768px) — uma tabela de 5 colunas
  rola dentro do `overflow-x-auto` da própria tabela.
- **Foco no clique de mouse**: o `foco` apaga o anel no `:focus` e o devolve
  no `:focus-visible` — certo em todo browser de produção.

## §6. Como um app derivado ADOTA o padrão

**Copiar, verbatim, e não editar:**

1. `apps/web/app/globals.css` — o bloco `@theme` e o utilitário `foco`.
2. `apps/web/components/ui/**` — as primitivas **menos o spec** (ele precisa
   de `@testing-library/react`, devDep do `apps/web`).
3. `packages/eslint-config/rules/no-estilizacao-informal.js` (+ o `.d.ts`) e
   o registro no `apps/web/eslint.config.mjs`.

**Não copiar:** `app/page.tsx` (boilerplate), `components/Sidebar.tsx`
(chrome do app), os formulários de exemplo.

**O chrome derivado COLLAPSA abaixo de `sm`/`md`**: a coluna de navegação é
`w-64` numa tela de 320px, e o layout é `flex` — sem colapsar, a coluna de
conteúdo fica com 64px e a tela rola na horizontal (WCAG 1.4.10; MEDIDO
2026-11-16: `scrollWidth` 393/437/378 contra `clientWidth` 320). O app de
referência empilha (`flex-col md:flex-row` no layout, `w-full md:w-64` no
chrome) e reflowa a 320px — MEDIDO: `scrollWidth` **320** = `clientWidth`
**320**.

**Para trocar a identidade visual:** mude **um par** de tokens —
`--color-primary` + `--color-primary-hover` — e, se quiser foco próprio,
`--color-ring`. Outra mudança é fork e exige decisão explícita (a skill
`ui-modes` diz: redesenho substitui, e diz que substituiu).

## §7. O instrumento

A regra `estilizacao/no-estilizacao-informal` (flat config do ESLint) mede
**cinco** coisas: cor (paleta stock e literal, com variante, lado e
opacidade), raio, sombra, a **transição do anel de foco** e o
**`outline-none` sem substituto**.

```bash
pnpm --filter @projeto/web lint          # a regra morde
pnpm --filter @projeto/web typecheck
pnpm --filter @projeto/web test:unit     # inclui o spec da regra
pnpm --filter @projeto/eslint-config lint # a PRÓPRIA regra é lintada
```

O spec da regra é [`apps/web/estilizacao.spec.ts`](../../../apps/web/estilizacao.spec.ts):
prova que ela recusa a violação **e** que o repo real não tem nenhuma. O
teste IRMÃO — o que planta a violação na config real — é o que prova que a
regra está LIGADA e com severidade de erro.

**O que a regra NÃO mede** (e é humano): hierarquia tipográfica,
espaçamento, se o token citado existe, e o contraste — ela mede a FORMA da
classe, não a coerência. **E mede 3 dos 8 bullets do §4.3**: o 1 (cor), o 2
(raio e sombra) e a METADE do 3 que é o anel de foco (a transição e o
`outline-none` sem substituto). A outra metade do bullet 3 ("todo elemento
focável tem `foco`" — a regra não sabe quais elementos são focáveis) e os
bullets 4 a 8 são do olho humano.

**Os limites declarados da regra:** ela mede a **classe que está no JSX** —
literal, template, ternário, `||` e argumento de helper — **e o VALOR das
constantes de classe**, resolvido por escopo dentro do arquivo. É o valor,
e não o NOME: 4 das 9 primitivas guardam a classe em `const base`, e a
regra que adivinhasse pelo nome (`CLASSE_*`, `CLASSES_*`) seria cega em 6 dos
11 componentes que ela deveria medir (MEDIDO 2026-11-16). Um **rename** da
constante não abre o furo — a regra lê a classe que a constante guarda. A
leitura pelo NOME continua valendo para a constante IMPORTADA de outro
arquivo (o `CLASSES_BOTAO_SECUNDARIO`, do `guard-admin.tsx`), onde a
referência não é resolvível. Uma classe montada em runtime (concatenação de
variável) não é vista: por isso as primitivas são a ÚNICA fonte de classe do
app (a revisão humana mede o que está nelas). E a **fusão** de `className`
do caller é concatenação, não substituição: duas utilitárias da mesma
família (duas cores) ficam à mercê da ordem do CSS.

**A exceção:** `eslint-disable-next-line` funciona, como em toda regra — e o
único uso legítimo é **elemento que flutua de verdade** (menu, dialog,
popover), o único caso em que sombra entra no sistema.

## §8. Cross-refs

- [`estilizacao-acessibilidade.md`](./estilizacao-acessibilidade.md) — a §5: o
  mínimo de acessibilidade (foco, erro, nome acessível, reflow).
- [`estilizacao-contraste.md`](./estilizacao-contraste.md) — a §2.2: a
  medida de contraste, o comando e os 17 pares.
- [`ui-craft`](../../skills/ui-craft/SKILL.md) — as leis de craft que o padrão assume.
- [`ui-modes`](../../skills/ui-modes/SKILL.md) — o modo da tela (este app é **Operar**).
- [`ui-break`](../../skills/ui-break/SKILL.md) — o pior caso de cada valor.
- [`idioma.md`](./idioma.md) — a prosa do app é pt-BR.
- [`documentacao.md`](./documentacao.md) — a documentação é parte do código.
- [`dry.md`](./dry.md) — a primitiva é o dono do estilo do campo.
