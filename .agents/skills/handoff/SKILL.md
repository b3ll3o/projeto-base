---
name: handoff
version: 1.0
updated: 2026-11-03
description: "Compacta a conversa em um documento de passagem para o próximo agent — segue o formato canônico de task/context/expected_output/success_criteria da skill agents-coordinate, aponta (em vez de copiar) os artefatos que já existem e redige credencial. Adaptado de mattpocock/skills (MIT). Use quando a sessão for encerrar e outro agent (ou outra sessão) for continuar o trabalho."
---

# Skill: `handoff`

> **Quem invoca:** o `orchestrator` (quando a tarefa vai passar para outro
> agent) e qualquer agent que comece a perceber que não termina o trabalho
> dentro da sessão.
>
> **Quando invocar:** no **fim de uma sessão** (ou no corte de um contexto),
> quando existe um agent ou uma sessão seguinte que vai continuar o trabalho.
> Não é o fluxo de despacho: para passar trabalho a um subagent que começa
> agora, use a skill `agents-coordinate` (§2.1 e §2.2).
>
> **Não invocar:** para transferir trabalho **dentro** do repo entre agents
> que já se coordenam (é `agents-coordinate`); para resumir o que já está
> escrito em spec, plano ou ADR (aponte o caminho — §3).

## §1. O formato é o do repo

Este repo já tem um formato canônico de transferência, na skill
[`agents-coordinate`](../agents-coordinate/SKILL.md) §2.3. O handoff **usa
esse formato** — os mesmos nomes de campo, sem renomear nenhum:

```markdown
# Handoff — <tarefa>

## Task
<o que precisa ser feito, em uma ou duas frases>

## Context
- files: <caminhos>
- code_snippets: <os trechos que o próximo agent precisa ver>
- prior_outputs: <o que já foi produzido, e por onde>
- constraints: <o que não pode mudar>

## Expected Output
Formato: <o que o próximo agent deve entregar>
Schema: <a forma, se houver>

## Success Criteria
- <critério objetivo e verificável>
- <outro critério, se houver>

## On Failure
<o que fazer se não conseguir>

## Suggested skills
<quais skills o próximo agent deve carregar, e por quê>

## Artefatos
<spec, plano, ADR, issue, PR, diff — por caminho ou URL, sem copiar conteúdo>
```

⚠️ **O que difere do canônico — declarado, não implícito:**

- **As 2 últimas seções** (`Suggested skills`, `Artefatos`) **não** existem em
  `agents-coordinate` §2.3 — elas existem porque a §6 deste arquivo exige a
  primeira (é o mecanismo de descoberta de skill do repo) e porque a §3 exige
  a segunda (apontar o que já existe em vez de copiar).
- **Os campos que o `dispatch.md` NÃO usa num handoff de sessão:** `from`,
  `to` e `composition` (quem despacha quem — num handoff não há despacho, há
  uma sessão que continua) e `on_failure.{fallback_agent,retry_policy,max_retries}`
  (o §2.3 trata a falha como **prosa**). O `dispatch.md` é o dono do schema do
  **dispatch**; o dono do formato do **documento de passagem** é o §2.3 do
  `agents-coordinate`, que é o que este template segue.
- **O que o handoff mantém do canônico, campo por campo:** `Task`,
  `Context.{files,code_snippets,prior_outputs,constraints}`,
  `Expected Output.{format,schema}` e `Success Criteria` (lista de critérios
  objetivos e verificáveis).

## §2. Onde o documento vive

**No repo**, em `.agents/runs/handoff-<timestamp>.md`, versionado.

O upstream grava no diretório temporário do SO, com o argumento de que o
handoff é efêmero. Aqui a decisão é outra: o handoff é o **artefato datado
de uma execução** (a categoria `artefato-de-execucao` da convenção
`tamanho-e-revisao.md`), e versionado ele **sobrevive à sessão** — que é
justamente o propósito. Quem chegar depois encontra o arquivo no git.

O nome leva timestamp no formato do repo: `handoff-20261103T144253Z-<slug>.md`.

## §3. Aponte, não copie

Não duplique conteúdo que já está capturado em outro artefato — spec, plano,
ADR, issue, commit, diff. **Cite o caminho ou a URL**. O handoff que copia o
plano vira um segundo plano, e dois planos divergem.

O que **precisa** estar no documento, porque não existe em outro lugar: o
estado atual, as decisões já tomadas e a razão delas, e o que ficou em
aberto.

## §4. Redija antes de gravar

Credencial, token, senha, URL autenticada e dado pessoal **não** entram no
documento — nem redigidos pela metade. Escreva `[REDACTED]` no lugar. O
handoff é versionado: o que entra nele entra no histórico do git.

## §5. O foco da próxima sessão

Se o usuário passou argumentos ao invocar, trate-os como a descrição do que
a próxima sessão vai atacar e ordene o documento por essa ordem: o que está
no foco vem primeiro, o resto vira "artefatos".

## §6. Adaptação

**Adaptado de** [mattpocock/skills](https://github.com/mattpocock/skills)
(`skills/handoff/SKILL.md`, MIT, © Matt Pocock). O original grava em
`$TMPDIR` e cita uma seção "suggested skills"; aqui o destino é o diretório
versionado de execuções, o **formato é o canônico do repo**
(`agents-coordinate` §2.3) e a seção de skills carregadas é obrigatória
porque é o mecanismo de descoberta de skill do repo (`find-skills`).
