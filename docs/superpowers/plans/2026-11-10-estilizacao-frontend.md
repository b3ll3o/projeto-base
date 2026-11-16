---
name: plano-estilizacao-frontend
description: "Plano do padrão de estilização do frontend — tokens semânticos no @theme do Tailwind 4, primitivas de interface extraídas da repetição de class strings, migração das 15 telas do apps/web e a convenção que todo app derivado deste template passa a seguir."
version: 1.2.0
updated: 2026-11-16
status: executado
state_snapshot: .agents/runs/state-snapshot-20261111T003559Z.md
---

# Plano — padrão de estilização do frontend

> **Demand:** *"analise a aplicação, analise as estilizações usadas atualmente
> nos sistemas, crie um plano para estilizar o frontend da aplicação e criar um
> padrão de estilização que deve ser seguido por todas as aplicações que forem
> criadas com base nesse projeto"*.
>
> **Snapshot de estado:**
> [`.agents/runs/state-snapshot-20261111T003559Z.md`](../../../.agents/runs/state-snapshot-20261111T003559Z.md)
> (`proceed: true`, `gap_blocker: false`).

---

## §1. O estado medido (AS-IS)

O frontend do `projeto-base` é um app interno em Next.js 15 (App Router) +
Tailwind 4. Ele **não tem design system**: tem 2 tokens de cor e a repetição
literal de class strings.

| Medida | Valor | Comando |
|---|---|---|
| Tokens de cor em `globals.css` | **2** (`--color-background`, `--color-foreground`) | `grep -c '^\s*--color' apps/web/app/globals.css` |
| Usos da paleta stock do Tailwind (`text-slate-*`, `bg-red-*`, `border-*`) | **226** (87 em `components/`, 139 em `app/`) | `grep -rhoE '(text\|bg\|border)-(slate\|gray\|red\|blue\|green\|amber\|zinc\|neutral\|stone)-[0-9]{2,3}' apps/web/components apps/web/app --include='*.tsx' \| wc -l` |
| Valores de cor literais em JSX | **12** | `grep -rnE '#[0-9a-fA-F]{3,8}\b\|rgba?(\|hsla?(' apps/web/app apps/web/components --include='*.tsx' \| grep -v spec \| wc -l` |
| String de `<input>` repetida | **7×** | `grep -rc 'rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm' apps/web/{app,components}` |
| String de `<label>` repetida | **7×** | idem, `block text-sm font-medium text-slate-900` |
| String de erro de campo repetida | **7×** | idem, `mt-1 text-sm text-red-700` |
| Container de página repetido | **16×** | idem, `mx-auto max-w-3xl p-8` |
| Botão primário repetido | **4×** | idem, `rounded-md bg-slate-900 px-4 py-2 …` |
| Alerta de erro repetido | **4×** | idem, `rounded-md border border-red-200 bg-red-50 p-3 …` |
| Primitivas de interface | **0** | `ls apps/web/components/ui` → não existe |
| Convenções de estilo no índice | **0** | `ls .agents/specs/conventions` → 24 indexadas, nenhuma de estilo |
| Instrumento que obriga o padrão | **0** | `ls packages/eslint-config/rules` → 1 regra, e ela é de DDD |

**O defeito de raiz:** `globals.css` guarda a cor em **tripla HSL crua**
(`--color-background: 0 0% 100%`). No Tailwind 4 a utilitária gerada é
`background-color: 0 0% 100%` — CSS inválido, descartado em silêncio pelo
browser. Hoje isso não quebra nada **porque ninguém usa** `bg-background`: o
`body` envolve o valor na mão (`hsl(var(--color-background))`). É a mesma
classe que a skill `ui-craft` §1 já registra: **token novo precisa guardar a
cor completa**.

**O que o próprio repo já disse:** o cabeçalho de
`apps/web/components/login-form.tsx` declara, em pt-BR, *"O design system
deste repositório é a repetição dessas classes inline"*. O plano troca a
repetição por um sistema.

---

## §2. Decisões fechadas

| # | Decisão | Escolha | Por que |
|---|---------|---------|--------|
| **D1** | Escopo | tokens + primitivas + migração das 15 telas + convenção + instrumento | o pedido é "estilizar **e** criar o padrão". Padrão sem estilo aplicado é prosa; estilo sem padrão é a repetição de hoje |
| **D2** | Onde o token mora | `apps/web/app/globals.css`, bloco `@theme` | o Tailwind 4 é CSS-first; `tailwind.config.ts` do repo está **inerte** (é sintaxe v3, e o `@theme` não o lê) |
| **D3** | Forma do token | **cor completa** (`hsl(0 0% 100%)`), nunca tripla crua | a tripla é o defeito de raiz de §1 |
| **D4** | Quantos tokens | 13 de cor + 1 raio + 1 fonte, **todos com consumidor real** | token sem consumidor é variável de nome difícil — regra da `ui-craft` §1 |
| **D5** | Escuro (dark mode) | **fora** | não há consumidor, não há requisito, e dobra o custo de cada token |
| **D6** | Onde vive o padrão | `.agents/specs/conventions/estilizacao.md` + índice nos **dois** índices (AGENTS.md §6 e o README das convenções) | convenção é a casa de "regra que todo app derivado segue"; os dois índices são o mesmo índice |
| **D7** | O instrumento | **regra ESLint flat** (`estilizacao/no-estilizacao-informal`) em `packages/eslint-config/rules/`, registrada no `apps/web/eslint.config.mjs` | a regra de estilo é um problema de lint, não de preflight: o repo já tem 54 gates e uma regra local ESLint (`ddd-hexagonal/no-domain-imports-from-infra`) — a casa certa já existe |
| **D8** | Pacote novo (`packages/ui`) | **fora** | o template é copiado inteiro (`cp -r projeto-base/ meu-novo-projeto/`); um pacote a partir daqui não é transportado pela cópia |
| **D9** | Fonte | `system-ui` (o que já está) | `next/font` baixa a fonte no build — CI sem rede quebra o build, e a fonte não é o problema |
| **D10** | Comportamento | **nenhuma** mudança de texto, id, role, nome acessível ou ordem de coluna | os e2e e os unit fixam esses valores (medido: **zero** teste depende de classe CSS) |
| **D11** | Primitiva de link | **dentro** (`LinkTexto`) | `next/link` continua sendo a abstração de navegação; o que a primitiva acrescenta é o DONO da classe do link de texto (5 cópias medidas em `origin/main`), com a tinta e o foco. Um wrapper que só troca o import não vale — este carrega a regra |

### §2.1 Decisões corrigidas na revisão do plano

A revisão (o `ux-design-specialist` como autoridade de design, com contraste
medido) mudou **três** decisões do plano original. Elas estão anotadas aqui
porque o plano é o registro do que foi decidido — e um plano que mente sobre
a própria revisão é a mesma classe de defeito que um doc que mente:

| # | Antes | Depois | Por quê |
|---|-------|--------|---------|
| **D4** | 9 tokens | **13** tokens de cor | faltavam 4 papéis com consumidor real: `--color-muted` (hover), `--color-control` (contorno de controle), `--color-primary-hover` e `--color-primary-foreground`. Sem `--color-control`, o campo herdava `border-slate-300` = **1,37:1** contra o branco — abaixo dos 3:1 da WCAG 1.4.11 |
| **D12** | ação na tinta (`--color-primary` = ink) | **ação em azul** (`--color-primary: hsl(221 83% 53%)`) | com a ação na mesma cor da tinta, o `--color-ring` não tem cor própria: o anel de foco da tela inteira seria o azul, e a ação seria indistinguível do texto. A troca é uma **troca de identidade**, e está declarada |
| **D13** | fundo branco | **fundo `slate-50`** e superfície branca | `bg-white` sobre página branca é invisível: o card dependia de fio de 1px para existir, e fio de 1px é proibido pela `ui-craft` §5. Separar por passo de tom é o que a regra pede |

E **uma** decisão nova:

| # | Decisão | Escolha | Por quê |
|---|---------|---------|--------|
| **D14** | Foco | utilitário `foco` (`@utility` do Tailwind 4) | 25 elementos repetiam o mesmo comportamento de foco em 4 classes (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900` + `focus:outline-none`). Um utilitário é a resposta do Tailwind 4 para "a mesma coisa em 25 lugares" |
| **D15** | Primitiva de link | **dentro** (`LinkTexto`) — inverte a D11 original | a revisão mediu **5** cópias da mesma classe de link de texto em `origin/main`, não 4. Um link de texto carrega uma REGRA (tinta secundária, sublinhado, foco do sistema) que é o que faz a pessoa saber que aquilo navega — e um link sem o `foco` fica com o anel default do browser, ou seja, a tela passa a ter DOIS sistemas de foco |

### §2.2 Decisões corrigidas na revisão do PR

A revisão do PR (3 reviewers em paralelo: UX/design, código e Next.js)
mudou **cinco** coisas que o plano original não previa. Elas estão aqui
porque o plano é o registro do que foi decidido.

| # | Antes | Depois | Por quê |
|---|-------|--------|---------|
| **D16** | a regra lia só o `className` literal | a regra lê também a **constante de classe** (cujo nome declara que é classe: `CLASSE_*`, `CLASSES_*`) | MEDIDO: as 8 primitivas guardam as classes em constantes, e a regra era cega **exatamente onde o padrão mora** — um `text-slate-900` de volta na `CLASSES_BOTAO` passava o gate |
| **D17** | o `h2` sem dono (`text-lg font-medium text-foreground` em 7 lugares) | nona primitiva: `CabecalhoSecao` | a convenção §3 promete que as primitivas são a ÚNICA fonte de classe do app; o `h1` tinha dono e o `h2` não |
| **D18** | `transition-colors` no campo e no botão | `transition-[border-color]` e `transition-[background-color]` | `transition-colors` inclui `outline-color`, e o anel de foco passava a **surgir em 150ms** (do `currentColor` para o token do anel). MEDIDO no browser |
| **D19** | emoji `✅` como estado | texto `Sim` / `Não` | a própria convenção §4.3 proíbe emoji como ícone, e o leitor de tela anunciava "white heavy check mark" |
| **D20** | o `className` do caller era SUBSTITUÍDO em 4 primitivas | é ADICIONAL em todas | o tipo aceitava `className` e a classe sumia sem aviso — a convenção §4.3 promete o contrário |

---

## §3. O padrão, em 4 peças

### 3.1 Tokens (`apps/web/app/globals.css`)

| Token | Papel | Consumidor |
|---|---|---|
| `--color-background` | fundo de página | `body` |
| `--color-surface` | superfície elevada (1 passo de tom) | painel, card, campo |
| `--color-muted` | apoio: hover de linha e de botão secundário | `bg-muted` |
| `--color-foreground` | tinta primária | `body`, título, célula |
| `--color-muted-foreground` | tinta secundária (só metadado e legenda) | subtítulo, `th`, rodapé |
| `--color-border` | divisória decorativa | borda de tabela, separador |
| `--color-control` | contorno de **controle** | campo, botão secundário, checkbox |
| `--color-primary` | ação | botão primário |
| `--color-primary-hover` | hover da ação | botão primário |
| `--color-primary-foreground` | texto sobre a ação | botão primário |
| `--color-ring` | foco visível (**tem de diferir da primária**) | utilitário `foco` |
| `--color-destructive` | erro | alerta de erro, borda de campo inválido, texto de erro |
| `--color-success` | sucesso | alerta de sucesso |

Mais `--radius-md` (raio único) e `--font-sans` (system-ui). Regra do
Tailwind 4: o valor do token é a **cor completa**; `bg-surface` sai
`background-color: var(--color-surface)`.

### 3.2 Primitivas (`apps/web/components/ui/`)

| Primitiva | Substitui | today |
|---|---|---|
| `Container` | `mx-auto max-w-3xl p-8` (o `<main>` da tela) | 16× |
| `CabecalhoPagina` | `h1` de tela + subtítulo + slot de ações | 16× / 10× |
| `CabecalhoSecao` | o `h2` de tela (adicionado na revisão do PR — D17) | 7× |
| `Campo` | `label` + `input` + erro + dica, com `id`/`aria-invalid`/`aria-describedby` | 7× / 7× / 7× |
| `Botao` (`primario`, `secundario`; com `href` é link) | as duas strings de botão | 4× + 4× |
| `Alerta` (`erro`, `sucesso`) | os dois alertas (`role="alert"` vs `role="status"`) | 4× + 1× |
| `Tabela` + `CabecalhoTabela` + `CelulaTabela` | `mt-6 w-full border-collapse text-sm`, `th`, `td` | 5 tabelas |
| `EstadoVazio` | o bloco `border-dashed p-12` + o texto de estado vazio | 1× |
| `LinkTexto` | a classe de link de texto (`Cancelar`, `Criar conta`, `editar`) | 5× |

**O que a revisão tirou do catálogo:** `Painel` (card genérico sem contrato —
vira `bg-surface` + `rounded-md` na tela). O `Link` de texto **ficou** — a D15
registra por quê.

Toda primitiva é **Server Component** por padrão (sem `'use client'`): quem
precisa de estado é o formulário que a usa, e a primitiva recebe o que
precisa por prop.

### 3.3 A convenção (`.agents/specs/conventions/estilizacao.md`)

Declara: os papéis dos tokens (os **valores** ficam em `globals.css` — uma
só cópia), o catálogo das primitivas, o que é proibido numa tela, o mínimo
de acessibilidade, **como um app derivado adota** o padrão (copiar 3
arquivos) e como ele se estende (token novo exige consumidor real + ajuste
da convenção no mesmo PR).

### 3.4 O instrumento (regra ESLint)

`estilizacao/no-estilizacao-informal`, em `packages/eslint-config/rules/`:

1. **cor** — nenhuma classe da paleta stock do Tailwind (`text-slate-900`,
   `bg-red-50`, `border-slate-300`) e nenhum valor literal (`bg-[#fff]`,
   `text-[rgb(0,0,0)]`) em `className`. O token semântico é o caminho.
2. **raio** — só `rounded-md` (o raio é decisão de família, tomada uma vez).
3. **sombra** — nenhuma sombra em repouso (a `ui-craft` é explícita: sombra
   é para o que flutua).

A regra é registrada **no web** (`apps/web/eslint.config.mjs`), que é onde
há Tailwind. Ela roda em `pnpm --filter @projeto/web lint`, que está no
`ci:local` e no job `quality` do CI.

---

## §4. Tarefas

| # | Tarefa | Arquivos | Aceite |
|---|--------|----------|---------|
| **T1** | Tokens no `@theme` + `body` com a cor completa | `apps/web/app/globals.css` | `grep -c '^\s*--color' apps/web/app/globals.css` → 13 (o número subiu de 9 na revisão — a D4); `pnpm --filter @projeto/web build` não falha e a utilitária gerada tem cor válida |
| **T2** | 9 primitivas | `apps/web/components/ui/*.tsx` (9 arquivos) | cada uma renderiza e tem spec |
| **T3** | Migração das telas | 15 `app/**/*.tsx` + `components/{login-form,cadastro-usuario-form,empresa-form,Sidebar}.tsx` + `app/convite/[token]/aceitar-convite.tsx` | **0** classes da paleta stock; texto, id, role e ordem de coluna intactos |
| **T4** | Regra ESLint + registro + `.d.ts` | `packages/eslint-config/rules/no-estilizacao-informal.{js,d.ts}`, `apps/web/eslint.config.mjs` | `pnpm --filter @projeto/web lint` verde com o código migrado, **vermelho** com `text-slate-900` |
| **T5** | Spec da regra (dente) | `apps/web/estilizacao.spec.ts` | caso sintético (paleta stock, literal, raio, sombra) **e** diferencial contra o repo real (0 erros) |
| **T6** | Spec das primitivas | `apps/web/components/ui/primitivas.spec.tsx` | render, label/erro linked por `aria-describedby`, `role` do alerta, variantes |
| **T7** | A convenção + os **dois** índices | `.agents/specs/conventions/estilizacao.md`, `AGENTS.md` §6, `.agents/specs/conventions/README.md` | `check-doc-size` ≤ 300 linhas; `check-doc-refs` verde |
| **T8** | Ponteiro na `ui-craft` (evita 3ª cópia dos valores) | `.agents/skills/ui-craft/SKILL.md` | a skill aponta para `globals.css` e para a convenção, e não transcreve valor de token |
| **T9** | Entrada humana para o padrão | `docs/STACK.md` (§3) | quem chega pelo doc da stack acha a convenção |
| **T10** | Conferência visual real | browser | a troca de identidade (fundo `slate-50`, ação azul) precisa de olho humano, não só de contraste medido |
| **T11** | Revisão do PR | 2 reviewers em paralelo (código + UI) | achado corrigido antes do merge |

**Fora do escopo (decidido, não é falta):** dark mode; `packages/ui` novo;
`next/font`; reescrita visual que mude texto, id, role ou ordem de coluna;
estado de carregamento (skeleton) novo; `motion` (a skill existe, mas
nenhuma tela anima hoje); error boundary com `global-error.tsx`.

---

## §5. O que pode quebrar (medido, não receio)

| Risco | Quem fixa | O que o plano faz |
|---|---|---|
| e2e quebra por texto/estrutura | `f1`–`f19`, `fixtures.ts` (ids `#{campo}-erro`, `form [role="alert"]`, `main table tbody tr`, `main ul > li`, `main` único, ordem das células, `scope="col"`, `dl>dt>dd`) | o texto, os ids, as roles e a ordem **não mudam**; a primitiva `Campo` mantém `id`, `aria-invalid` e `aria-describedby` |
| e2e quebra por classe | — | **zero** testes dependem de classe (medido: `grep -rn "toHaveClass\|classList\|getAttribute('class')" apps/web` → 0) |
| cobertura cai | gate de 80% no `apps/web` | as primitivas entram no denominador e têm spec (T6) |
| lint quebra em arquivo fora do web | `apps/api` | a regra é registrada **só** no `apps/web/eslint.config.mjs` |
| `tailwind.config.ts` inerte | ninguém | fica como está; a convenção diz que o `@theme` é a fonte |

---

## §6. Verificação

```bash
pnpm --filter @projeto/web lint          # a regra morde
pnpm --filter @projeto/web typecheck     # os tipos dos props das primitivas
pnpm --filter @projeto/web test:unit     # specs das primitivas + da regra
pnpm --filter @projeto/web test:coverage # teto de 80%
pnpm --filter @projeto/web test:e2e      # as 15 telas migradas, no browser
pnpm ci:preflight                        # doc-size, doc-refs, doc-coverage
```

E a prova de que o padrão **pega**:

```bash
# plantar a violação e ver a regra accusar
printf 'export const X = () => <p className="text-slate-900">oi</p>;\n' > apps/web/app/_violacao.tsx
pnpm --filter @projeto/web lint           # → erro da regra
rm apps/web/app/_violacao.tsx
```

## §7. O que a revisão do PR mudou (medido)

3 reviewers em paralelo (UX/design, código, Next.js) sobre o commit da
primeira entrega. Achados corrigidos **antes** do merge:

| Achado | Correção |
|---|---|
| O anel de foco surgia em 150ms (`transition-colors` transiciona `outline-color`) | `transition-[border-color]` / `transition-[background-color]` (D18) |
| Título de seção e e-mail longos estouravam a tela (WCAG 1.4.10): `scrollWidth` 2741px a 320px | `break-words` + `min-w-0` no título; `break-words` na célula |
| Alvo de toque abaixo de 24×24 (WCAG 2.5.8): checkbox 16×16, link 57×20 | `size-6` no checkbox; `min-h-6` no `LinkTexto` |
| A regra não recusava `border-t-slate-200` (a cor tinha de ser o último segmento) | a cor é o último segmento, com modificador de lado, opacidade arbitrária e `!` |
| A regra não recusava `drop-shadow-*` / `inset-shadow-*` | as três famílias de sombra |
| A regra não recusa `rounded-t-md` (recusava o próprio padrão) | o raio do padrão é aceito nos lados |
| A regra lia só o literal | lê também template, ternário, `||`, argumento de helper e **constante de classe** (D16) |
| `variante` e `tamanho` vazavam como atributo DOM (`<button variante="secundario">`) | rest spread |
| `role` do `Alerta` podia ser sobrescrito pelo caller | `role` não é prop e vem depois do spread |
| 4 primitivas SUBSTITUÍAM o `className` do caller | somam (D20) |
| Emoji `✅` como estado do perfil | texto `Sim` / `Não` (D19) |
| O `h2` e o link do menu eram classe repetida (7× cada) | `CabecalhoSecao` (D17) + constante no `Sidebar` |
| `eslint .` reprovava com 2303 erros do `.next-dev/` (distDir alternativo, `NEXT_DIST_DIR`) | `.next-dev` e `.next-boot` no `ignores` e no `.gitignore` |
| O campo "Nome" de `admin/profiles/new` não tinha `maxLength` (o domínio recusa >80) | `maxLength={80}` |
| O estado de erro de `/users` não tinha ação | "Tentar de novo" (o mesmo caminho do `guard-admin`) |
| A convenção afirmava um reflow que não acontecia (e a causa era o chrome, não o conteúdo) | §5.7 reescrita com a medição (com o chrome fora, o conteúdo cabe em 320px) |

**O que ficou DECLARADO, não corrigido** (e por quê):

- **Reflow em 320px no app de referência**: o chrome (`Sidebar` de `w-64`
  fixo) não colapsa. Fechar isso é chrome de app, não padrão de estilo — a
  convenção §5.7 declara o limite e o motivo.
- **Contagem de `/users`**: a tela afirma o total de uma página (a API é
  paginada e não devolve o total). Pré-existente, e mexer nisso muda o
  contrato da tela — fora do escopo de estilo.
- **`tailwind.config.ts`**: inerte (sintaxe v3, e o Tailwind 4 só lê config
  com `@config`). Fica, com o aviso escrito no arquivo: apagá-lo é decisão de
  outro escopo, e a armadilha (adicionar `@config` e o `content` v3 passar a
  valer) está nomeada.
