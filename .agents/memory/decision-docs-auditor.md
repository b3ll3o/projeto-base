---
name: decision-docs-auditor-memory
description: Memória acumulada do agent decision-docs-auditor — auditor do pilar 3 do kit de documentação (PRD, TDR e ADR)
---

# Memória: `decision-docs-auditor`

> Arquivo de memória do agent `decision-docs-auditor`.

## Decisões Tomadas

### 2026-11-18 — A cobertura do índice é metade do item

**Contexto:** A matriz §2.3 declara, para o item 8 (ADR), a coluna `Índice` =
`docs/agents/domain.md`. Sem essa coluna, um ADR novo entra no disco e
**ninguém** chega nele pelo caminho oficial — e o gate `check-doc-kit` só
exige que o índice **cite** o arquivo, o que passa a valer no instante em que
ele é criado.

**Decisão:** O passo 2 da skill mede os **dois lados**: quantos ADRs existem
em disco e quantos o índice cita. O gap (ADR em disco fora do índice) é
medido como número, não como "o índice existe".

**Consequências:** Em 2026-11-18 a medida foi **12 de 12** — o
`docs/agents/domain.md` lista os 12 ADR com uma linha cada. A lacuna real do
pilar estava nos itens 6 e 7, não no 8.

### 2026-11-18 — `grep -F` com prefixo é o comportamento correto, não um bug

**Contexto:** O passo 1 exige as seções `## Contexto`, `## Decisão`,
`## Consequências`. O ADR-0002 tem `## Consequências` e, logo abaixo,
`### O que o JWT **NÃO** garante` e `### other consequences`. A dúvida era
se `grep -F '## Consequências'` casaria a seção errada.

**Decisão:** Manter o `grep -F` com o prefixo. A seção existe; o casamento por
prefixo é o que faz o passo tolerar um ADR que escreve `## Consequências
negativas` como heading de segundo nível.

**Consequências:** O prefixo casa `## Consequências negativas` como
satisfação da âncora — que é o comportamento desejado, porque a âncora da
matriz é `## Consequências` e o doc que a contém satisfaz o gate.

### 2026-11-18 — O PRD e o TDR são medidos por arquivo **e** por seção

**Contexto:** Em 2026-11-18 o `docs/prd/README.md` existia e o
`docs/prd/0001-projeto-base.md` não; o `docs/tdr/` inteiro não existia.

**Decisão:** Cada passo do PRD e do TDR mede (a) o arquivo da instância e
(b) o índice que deve citá-la, imprimindo o estado dos dois lados. Um passo
que só medisse seção diria "0 de 3" e esconderia que o **índice** já apontava
para um arquivo que não existia.

**Consequências:** O relatório distingue "o doc não existe" (P1, lacuna) de
"o índice cita o que não existe" (o sinal mais forte de que o item está pela
metade).

## Padrões Descobertos

- `docs/adr/` tem **12** ADR (0001 a 0012) e **todos** os 12 têm as três
  seções obrigatórias — o item 8 é o mais maduro dos três do pilar.
- O `docs/agents/domain.md` lista os 12 ADR **pelo nome do arquivo**, com uma
  linha de descrição para cada — e é ele quem carrega o aviso de que o
  `GLOSSARY.md` "ainda não existe".
- O `docs/adr/0008-camada-de-binding-do-claude-code.md` está marcado como
  **Substituído** pelo ADR-0009, e o índice do domain diz isso explicitamente.
  Um ADR substituído **continua no índice** — sair do índice não é o que
  marca a substituição.
- O ADR-0010 (`0010-system-design-canonico.md`) é o dono do conjunto do
  system design — é ele que o `docs/system-design/README.md` cita.
- O `docs/superpowers/plans/**` guarda planos de 2026-09 a 2026-11 e é
  **histórico**: o §7 da convenção exclui do escopo.

## Lições Aprendidas

- ❌ **Medir o PRD pelo `docs/superpowers/plans/`.** O plano é registro do que
  foi decidido na data; o PRD é a instância viva com Problema, Objetivo e
  Métricas.
- ❌ **Contar "o índice existe" como "o índice está completo".** O
  `check-doc-kit` cobra a **citação** do doc canônico; a cobertura de todos os
  arquivos da família é uma medida a mais, que só a auditoria faz.
- ❌ **Usar `ls docs/adr/*.md` como inventário.** `git ls-files` só enxerga o
  versionado — e um ADR não commitado não é um ADR do repo.
- ❌ **Tratar ADR substituído como ADR fora do índice.** A substituição se
  declara no corpo do ADR e no índice; a **ausência** é o que seria errado.

## Sugestões de Evolução

- [ ] Medir a **data de vigência** dos ADRs (a §4 da convenção exige que a
      substituição seja explícita) — hoje só o ADR-0008/0009 a tem, e nada
      mede isso.
- [ ] Medir se o **índice do PRD** lista **todas** as instâncias do PRD (como
      o passo 2 faz com os ADR), e não só a primeira.
- [ ] Apontar, no relatório, o ADR **mais antigo** sem seção `## Validação
      contínua` — a validação contínua é o que mantém um ADR verdadeiro.
