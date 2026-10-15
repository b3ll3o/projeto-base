---
name: learning-observation
description: Captura DURANTE a tarefa o que o harness sozinho não captura — o porquê de um desvio, a regra que se mostrou escrita mas não cumprida, e a regra que deveria morrer. Usa a taxonomia de 3 tipos e o filtro negativo para não transformar ruído em memória. Ancorada no checkpoint de review+fix que o repo já exige ao fim de cada task.
type: specialist
---

# Skill: `learning-observation`

> Camada **DURANTE**. É o par de
> [`retrospective-capture`](../retrospective-capture/SKILL.md), que é a camada
> **DEPOIS**. Sem esta, a retro recebe um diff e uma conversa e reconstrói o
> porquê às custas; com esta, o porquê chega escrito.
>
> **Seção canônica:** a triagem de destino e o gate que a exige estão em
> [`.agents/specs/conventions/retrospective-capture.md`](../../specs/conventions/retrospective-capture.md).
> O destino em disco é derivado lá, e em nenhum outro lugar.

## Papel

O harness do Claude Code **já** grava memória durante a tarefa, de forma
estruturada e estável — MEDIDO 2026-10-14 com `grep -l "originSessionId" <memdir>/*.md | wc -l`
sobre `ls -1 <memdir>/*.md | wc -l`: **112 de 115**. O número envelhece a cada
memória nova; o que não envelhece é o que ele **não** faz, e é o escopo inteiro desta
skill:

| O harness faz | Esta skill faz |
|---|---|
| grava que algo aconteceu | classificar **qual** das 3 espécies de regra o fato revela |
| grava a mesma estrutura sempre | filtrar o que **não** é aprendizado |
| não sabe o que é desvio | ancorar no checkpoint onde o desvio é visível |
| aceita a afirmação como está | exigir o **comando** que mediu a afirmação |

## Quando usar

- **No review+fix do fim de cada task** — o checkpoint que a
  [convenção de roteamento](../../specs/conventions/review-routing.md) já exige.
  É o ponto onde "funcionou" e "não funcionou" ainda estão frescas e onde o
  review já produziu evidência.
- Ao ser corrigido por um reviewer (o segundo round é o sinal mais forte que
  existe: o primeiro round acha o sintoma, o segundo acha a regra).
- Ao descobrir que um controle que se acreditava verde estava medindo vazio.

## Quando NÃO usar

- Erro de digitização, bump de dep, resolução de conflito → ruído, ver §"Filtro negativo".
- Tarefa de < 10 min sem review → nada a observar.
- **Observação que não tem comando.** Ver §"Auto-suficiência".

## A taxonomia de 3 tipos

Toda observação pertence a **exatamente um** tipo. Forçar a escolha é o
trabalho: o tipo decide o que acontece com a memória depois.

### T1 — regra que era nova

O repo **não** escrevia isso, e agora se sabe. Destino: convenção, gate, ou
ADR.

> MEDIDO 2026-10-14, `git ls-files 'tooling/scripts/ci/**' | wc -l` → **0**
> enquanto `ls -1 .tooling/scripts/ci/*.ts | wc -l` → **42**: o prefixo `.` some
> em `.tooling` e nada acusa. T1.

### T2 — regra que **já estava escrita** e não cumpriram

A regra existe no repo e ninguém a seguiu, ou ela foi seguida e não bastou.
Este é o tipo que o repo mais perde e o mais barato de aprender: MEDIDO
2026-10-14, `git grep -lF "<slug>" -- '*.md'` → **0** para a maioria das 72
memórias do corpus — a regra foi absorvida pela convenção sem que a procedência
sobrevivesse, e ninguém sabe se ela alguma vez foi seguida.

> A convenção diz "confira o `exit`, não o `stdout`". O `Edit` reportou `OK` e
> corrompeu fora do alvo. T2 — e a pergunta central é *por que a regra escrita não
> pegou*, não *como evitar o próximo*.

### T3 — regra que **deveria morrer**

Uma convenção, gate ou prática que está costing mais do que protege. Sem esta
espécie, o corpus só cresce e nada encurta. Destino: `removida:` no ledger de
cristalização.

> "`rebase --skip` descarta o commit inteiro; a convenção de git manda evitar
> `--skip` e manda medir com `ORIG_HEAD`" — quando uma regra exige mais
> disciplina do que a situação merece, ela é obedecida por sorte, não por
> convicção. T3.

## Filtro negativo — o que NÃO registrar

O filtro é metade do valor: um log de observação que aceita tudo vira um
arquivo que ninguém lê, e o próximo agente paga o custo de lê-lo.

- ❌ **O que o `git diff` já mostra.** O diff existe; duplicá-lo em prosa custa
  leitura e não ensina nada.
- ❌ **O que é fato, não regra.** "A task 4.2 mudou 3 arquivos" envelhece hoje.
- ❌ **A afirmação sem comando.** Ver §"Auto-suficiência".
- ❌ **O sintoma cujo mecanismo você não sabe.** "Deu ruim" não é
  observação; "`Edit` trocou `0x27`→`0x22` fora do alvo e o sintoma apareceu
  numa linha não editada" é.
- ❌ **O detalhe que só importa nesta task.** Sem T1, T2 ou T3, não há memória.

## Auto-suficiência

**Toda observação cita o comando que a mediu.** Sem o comando, a observação é
uma história — e `guard-classes.md` §2 classe 7 diz que claim sem derivação
envelhece até virar falsa sem ninguém perceber.

```markdown
---
name: <slug-em-kebab-case>
description: <uma linha, o que a REGRA é — não o que aconteceu>
metadata:
  type: feedback
---

**Regra:** <a regra em uma frase>

**Por que:** <o fato, com o comando ao lado>

**Como sei:** `<comando que reproduz>` → <saída medida, com a data>
```

O destino em disco é derivado na
[seção canônica](../../specs/conventions/retrospective-capture.md#destino-canônico-do-result-file).
**Não escrever o caminho** — ele já foi declarado uma vez e o
`check-memory-dir-concordance` existe para impedir que ele se multiplique.

## Saída para a camada DEPOIS

Ao terminar a atividade, a retro **drena** estas observações para o
`decision-list`, e cada uma ganha uma linha no ledger de cristalização com uma
destinação: `citada:`, `gate:`, `recusada:`, `removida:` ou `pendente`.

O gate [`check-memory-crystallization`](../../../.tooling/scripts/ci/check-memory-crystallization.ts)
lê esse ledger nas duas direções e bloqueia quando uma memória não tem
destino, ou quando a linha aponta para algo que não existe.

## Mecânica adaptada

Flush **no mesmo turno** em que a observação nasce — nunca em lote no fim. Um
log observations que só é escrito no fim perde a única coisa que ele devia
guardar: *onde* você estava quando percebeu.

> Mecânica de flush, numeração e arquivamento adaptada de `task-observer`
> (Eoghan Henn, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
> A taxonomia, o filtro negativo e o ledger são deste repo.

## Anti-Padrões (NÃO fazer)

- ❌ Registrar em lote no fim — o flush é por turno
- ❌ Aceitar a observação sem classificar em T1/T2/T3 (é ruído)
- ❌ Declarar um gate que "deveria existir" sem escrevê-lo; a prevenção mais
  forte é codemod, depois auto-check, e a skill **por último**
- ❌ Copiar o path do diretório de memória para um `.md` novo

## Cross-references

- [`retrospective-capture`](../retrospective-capture/SKILL.md) — a camada DEPOIS
- [`.agents/specs/conventions/retrospective-capture.md`](../../specs/conventions/retrospective-capture.md) — canônica, com o destino e o gate
- [`.agents/specs/conventions/guard-classes.md`](../../specs/conventions/guard-classes.md) — as 7 formas de um controle falhar reportando verde
- [`.agents/specs/conventions/review-routing.md`](../../specs/conventions/review-routing.md) — o checkpoint do fim da task
- [`.agents/workflows/retrospective-mode.md`](../../workflows/retrospective-mode.md) — o orquestrador DEPOIS

---

**Arquivo:** `.agents/skills/learning-observation/SKILL.md`
**Tipo:** Specialist methodology skill
**Memória:** [`MEMORY.md`](./MEMORY.md)
