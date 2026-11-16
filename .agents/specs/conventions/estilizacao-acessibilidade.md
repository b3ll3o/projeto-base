---
name: estilizacao-acessibilidade
version: 1.0.0
updated: 2026-11-16
maintainer: ux-design-specialist
description: "A §5 da convenção `estilizacao.md` — o MÍNIMO de acessibilidade do padrão de estilização do frontend (foco visível, erro por cor E texto, nome acessível, reflow a 320px), extraída para arquivo próprio porque a convenção-mãe está no teto de 300 linhas. A regra é a da convenção-mãe; este doc é a sua parte de acessibilidade."
---

# Acessibilidade do padrão de estilização (§5 da convenção `estilizacao`)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> É a **§5** de [`estilizacao.md`](./estilizacao.md) — os números de seção
> são os de lá, para que toda referência a "§5.1" continue valendo.

O padrão de estilização não é bonito: é **operável**. Esta é a parte da
convenção que fala de acessibilidade, e ela é o mínimo — não o ideal.

## §5. Acessibilidade (o mínimo, não o ideal)

1. **Foco visível** em todo elemento focável — o utilitário `foco`, e nada
   de `outline-none` sem ele (dois sistemas de foco é foco inconsistente).
   O anel **não transita**: `transition-colors` inclui `outline-color`, e o
   indicador surgia em 150ms (MEDIDO 2026-11-16). Onde há anel, a transição
   é da propriedade que PRECISA transicionar.
   ⚠️ **A COMBINAÇÃO É PROIBIDA PELA REGRA** (`estilizacao/no-estilizacao-informal`):
   `foco` junto de `transition-colors` reprova o lint. E o e2e
   `f6-navegacao.spec.ts` mede o anel no browser: `outline 2px solid
   rgb(17, 71, 187)`, `outline-offset: 2px`, e a transição **não** anima
   `outline-color`.
2. **Erro comunicado por cor E por texto**: `aria-invalid` + `role="alert"`. A cor do fio é reforço, nunca o portador da mensagem.
3. **Rótulo associado**: `label htmlFor` + `id` do controle — é o que dá o nome acessível (o `Campo` garante).
4. **`role="alert"` para erro** (interrompe a fala) e **`role="status"` para
   confirmação** (não interrompe). A decisão vem da variante do `Alerta`.
5. **Tabela com nome acessível** (`legenda` → `<caption class="sr-only">`) e
   cabeçalho com `scope="col"`. A legenda é **obrigatória** na primitiva.
6. **Link com nome próprio** quando há vários iguais: o "editar" de 6 linhas
   diz QUAL (`aria-label="Editar {nome}"`). O mesmo vale para o BOTÃO de
   linha: o "Salvar" de N linhas diz de qual linha
   (`aria-label="Salvar perfil de {email}"`).
7. **Reflow (WCAG 1.4.10)**: o CONTEÚDO reflowa — `p-4 sm:p-8` no
   `Container`, `flex-wrap` no `CabecalhoPagina`, e `break-words` + `min-w-0`
   no título (sem os dois, um nome de 80 chars estourava a tela — MEDIDO
   2026-11-16).
   ⚠️ **O CHROME TAMBÉM COLABSA** (MEDIDO 2026-11-16 no Chromium 1223, a
   320px): o `Sidebar` é `w-64 shrink-0` e o layout é `flex` FIXO, então a
   coluna de conteúdo ficava com 320 − 256 = **64px** e a tela rolava na
   horizontal (`scrollWidth` 393px em `/login`, 437px em `/users/novo`, 378px
   em `/` — MEDIDO, contra `clientWidth` 320).
   O conserto é o chrome virar BARRA no topo abaixo de `md`
   (`flex-col md:flex-row` no layout, `w-full md:w-64` no `Sidebar`), e não
   esconder a navegação. MEDIDO depois do conserto: `scrollWidth` **320** =
   `clientWidth` **320** nas três rotas.
   O e2e `f6-navegacao.spec.ts` afirma isso (`scrollWidth <= clientWidth` a
   320px) — é a rede de segurança da medida.
