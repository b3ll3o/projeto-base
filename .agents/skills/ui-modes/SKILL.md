---
name: ui-modes
version: 1.0
updated: 2026-10-13
description: "Antes de desenhar ou revisar qualquer tela, decide o MODO que ela serve — Persuadir, Operar, Ler ou Experienciar — e por consequência o que pesa: Convertência, Rastreabilidade, Compreensão ou Presença. Também fixa as três regras que evitam erro caro: o brief vence, refinamento preserva e redesenho substitui, e símbolo carregado não vira ornamento. Carregada por ux-design-specialist e ui-review. Adaptado de impeccable (pbakaus, Apache-2.0)."
---

# Skill: `ui-modes`

> **Quem invoca:** `ux-design-specialist` e `ui-review`, **antes** de qualquer
> decisão de aparência.
> **Quando invocar:** ao criar uma tela nova, ao revisar uma existente, ou quando
> dois conselhos de UI parecem contraditórios (é sinal de que o modo não foi
> declarado).

## Passo 1 — Declarar o modo

O modo nomeia **o que o sucesso da pessoa é nesta superfície**. Escolha pela
superfície pedida, não pelo produto:

| Modo | A pessoa… | Pesa mais | Onde aparece neste repo |
|------|-----------|-----------|--------------------------|
| **Persuadir** | decide e age; o design **é** o produto | Atenção e conversão | (não existe ainda) |
| **Operar** | completa uma tarefa | Rastreabilidade, consistência, expectativa nativa | listagem, cadastro, login — **3 das 4 telas atuais** |
| **Ler** | entende algo | Estrutura para compreensão | `docs/`, `README.md`, changelog |
| **Experienciar** | está dentro da obra | O artefato lidera; a interface recua | portfólio, galeria |

> **Medido em 2026-10-13: 3 das 4 telas de `apps/web` são modo Operar.**
> `app/users/page.tsx` (listagem), `app/users/novo/page.tsx` (cadastro),
> `app/login/page.tsx` (login) — `find apps/web/app -name page.tsx | wc -l` → 4.
> A quarta, `app/page.tsx`, **não** é Operar: é o boilerplate do `create-next-app`
> (hero centralizado, `p-24`, `text-4xl`), o arquétipo de landing page que
> `ui-craft` §1 proíbe. É Persuadir por acidente, não por decisão — se virar
> tela de produto, o ADR que registra o modo tem de dizer isso.
> Uma tela nova de produto em Persuadir é decisão de produto e vale ADR.

**Persistir** o modo na review, não num arquivo de estado. A decisão é cheap de
re-fazer e cara de duplicar.

## Passo 2 — Aplicar o modo

### Operar (o modo deste repo)

Escaneabilidade, consistência e a cena real de uso **superam** expressão. A marca
vive em detalhe preciso, não em hero.

- **Rastreabilidade vence decoração.** Cada peso visual corresponde a uma
  hierarquia de ação real. O que não ajuda a completar a tarefa sai.
- **Densidade é produto** (ver `ui-craft` §2–3).
- **Consistência com o que já existe** vale mais que o ideal da tela ideal. Tela que
  diverge do resto custa mais do que rende.
- **Expectativa nativa:** botão parece botão, link parece link, o que é destrutivo
  parece destrutivo.

### Persuadir

O visitante decide e age. Atenção é recurso escasso efinite. Realizar o registro
quando o brief precisa — seguir o mundo comprometido, não o hábito da categoria.

### Ler

Estruture para compreensão **primeiro**; depois faça valer a pena ficar.

### Experienciar

Deixe o artefato liderar desde o primeiro viewport; a interface recua.

## Passo 3 — As três regras que evitam erro caro

### O brief vence

Honre a estética, a era, o material, a fonte e a paleta **pedidos**, mesmo quando
conflitam com um aviso de padrão saturado. Redirecionar um brief claro para o
gosto do agent é falha, não ORIGINALidade.

### Refinamento preserva; redesenho substitui

| | Refinamento | Redesenho |
|---|---|---|
| Identidade visual | mantém | substitui |
| Comportamento | mantém | mantém |
| Copy factual | mantém (pergunte antes de alterar) | mantém |
| Fora do escopo | não toca | pode reestruturar |
| `DESIGN.md` / tokens | ajusta | substitui, e diz que substituiu |

**Nunca** aplique polimento sobre o visual descartado ("ficar no meio"). Redesenho
que vira meio-termo é o pior dos dois.

### Símbolo carregado não vira ornamento

O mundo visual de um sujeito **não** autoriza emblema ligado a militarismo,
supremacia ou movimento de ódio como motivo, badge ou ornamento — bandeira do
Sol Nascente, bandeira de batalha confederada, insígnia nazista e variantes
estilizadas. Use as formas neutras daquele mundo. Conteúdo que **documenta** o
símbolo como fato fica como está.

> **Autoridade visual é evidência, não nome de arquivo.** A ausência de um
> `DESIGN.md` **não** faz o projeto ser greenfield: o redesenho decide se
> preserva, expande ou substitui o mundo existente. Este repo tem 2 tokens em
> `globals.css` — isso é um mundo mínimo a **preservar e expandir**, não um
> vazio a preencher de imaginação.

## Passo 4 — Saída

Antes de propor qualquer coisa, responda em uma linha por tela:

```
Modo: Operar — a pessoa está cadastrando um usuário e precisa saber que deu certo e o que fazer agora.
```

Se essa frase não puder ser escrita sem adverbial, o modo ainda não foi decidido.

## Referências

- Agent: `.agents/agents/ux-design-specialist.md`
- Skills irmãs: `ui-craft` (aplicação no modo Operar), `ui-break` (pior caso),
  `motion`, `ui-review`
- Telas do repo: `apps/web/app/**`
- Origem: [impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0,
  © Peter Bakaus) — modos de superfície, brief-vences, semântica de refinamento vs
  redesenho e a regra de símbolos carregados.