---
name: grilling
version: 1.0
updated: 2026-11-03
description: "Protocolo de questionamento para stress-testar um plano, uma decisão ou uma ideia antes de agir — mapeia a demanda como árvore de decisão, pergunta por rodadas só o que já pode ser perguntado, e dá a resposta recomendada junto. Adaptado de mattpocock/skills (MIT). Use quando o pedido for 'me questiona', 'questiona meu plano', 'stress-testa essa ideia', ou antes de despachar um plano que ainda tem decisão em aberto."
---

# Skill: `grilling`

> **Quem invoca:** o `orchestrator` — na **thread principal**, antes de
> despachar um plano com decisão em aberto — e qualquer agent que receba
> "me questiona", "questiona meu plano" ou "stress-testa isso".
>
> **Quando invocar:** quando existe um **plano, decisão ou ideia** para
> stress-testar e o usuário está presente para responder. A pergunta que
> decide é sempre a mesma: **existe alguma decisão em aberto cuja resposta
> muda o que será feito?** Se sim, pergunte. Se não, aja.
>
> **Não invocar:** para buscar **fatos** (o ambiente, o código e a
> configuração respondem — isso é tarefa de agent read-only, não do
> usuário); para revisar código (é `code-reviewer`); para decidir o modo de
> uma tela (é `ui-modes`); para pedir aprovação de um plano já fechado (é o
> fluxo de aprovação do `orchestrator`).

## §1. A regra que separa este protocolo de uma conversa

A pergunta que faz o trabalho não é "o que falta?" — é **"qual decisão, se
respondida diferente, muda o trabalho?"**. Fato não se pergunta: **fato é
tarefa sua** (§4).

## §2. A árvore de decisão

Mapeie a demanda como **árvore de decisão**: cada decisão ramifica nas
decisões que dependem dela. A árvore é interna — o usuário não a vê, e não
precisa.

Trabalhe a árvore em **rodadas**. A **fronteira** é toda decisão cujos
pré-requisitos já estão resolvidos: as perguntas que você pode fazer **agora**
sem adivinhar respostas que ainda não ouviu. Faça a **fronteira inteira em
uma rodada** — numere cada pergunta e leve a resposta recomendada junto.
Depois espere as respostas e recalcule.

Uma pergunta cuja resposta depende de outra pergunta ainda aberta nesta
rodada pertence a uma **rodada posterior**, não a esta.

O formato de uma rodada:

```
❓ **Q1** - **<título da pergunta>**: <corpo da pergunta, pode ter vários parágrafos e escolhas>

➡️ <sua resposta recomendada>

---

❓ **Q2** - **<título da pergunta>**: <corpo da pergunta>

➡️ <sua resposta recomendada>
```

Escreva cada pergunta de modo que um **"sim"** aceite a sua recomendação.

Cada rodada muda a árvore: as decisões resolvidas empurram a fronteira para
fora e destravam perguntas que dependiam delas. Recompute e pergunte a
próxima rodada.

## §3. Fato é tarefa sua

Quando uma pergunta da fronteira precisa de um fato do ambiente
(filesystem, configuração, código, serviço rodando), **despache um subagent
com contexto novo** para descobrir — não pergunte ao usuário o que você
mesmo pode ler.

Não bloqueie por causa disso: uma exploração em andamento é um pré-requisito
**não resolvido**, então só as perguntas **a jusante** dela esperam o
subagent; pergunte o resto da fronteira agora.

As **decisões** são do usuário: apresente cada uma e espere.

## §4. O fim

A sessão termina quando a **fronteira está vazia**: todo ramo da árvore
visitado, nada assumido em silêncio. **Não aja** sobre o resultado antes de o
usuário confirmar que o entendimento é compartilhado.

## §5. O que este protocolo não substitui

| Situação | Quem resolve |
|---|---|
| falta um fato do ambiente | agent read-only (`explorer`) — leia, não pergunte |
| o plano está errado por análise de código | `code-reviewer` |
| o modo da tela (Persuadir/Operar/Ler/Experienciar) | `ui-modes` |
| o plano já está fechado e precisa de aprovação | o fluxo de aprovação do `orchestrator` |
| a demanda precisa ser arquivada antes | `demand-archiving` |

## §6. Adaptação

**Adaptado de** [mattpocock/skills](https://github.com/mattpocock/skills)
(`skills/grilling/SKILL.md`, MIT, © Matt Pocock). O original é um protocolo
genérico de interview; aqui ele descreve **onde** roda (a thread principal,
porque o usuário é quem responde), **o que** não se pergunta (fato) e como
se alinha ao resto do repo (a tabela da §5).

O formato da rodada (`❓`/`➡️`) é do upstream e foi mantido.
