# ADR-0008: A camada de binding do Claude Code (o wrapper é cópia, e a cópia é medida)

- **Status:** Aceito
- **Data:** 2026-11-09
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [issue #149](https://github.com/b3ll3o/projeto-base/issues/149) · [`check-binding-canonico`](../../.tooling/scripts/ci/check-binding-canonico.ts) · o gate de cobertura da camada de skills (que chega com o PR #148)
- **ADR anterior:** [0007-refresh-token-revogavel.md](./0007-refresh-token-revogavel.md)

## Contexto

O template é **vendor-neutral**: a definição de uma skill ou de um agent vive
em `.agents/`, e nenhuma tool vendor precisa conhecer o formato de ninguém.
O Claude Code, porém, **descobre** as skills em `.claude/skills/<nome>/SKILL.md`
e os agents em `.claude/agents/<nome>.md` — ele não lê `.agents/`.

Então existe uma **camada de binding**: um arquivo por definição, que existe
só para que o Claude Code ache a coisa, e que **não pode ser a fonte de
verdade**. A regra do repo é dura sobre isso — o `.claude/README.md` abre com
*"Esta pasta não é fonte de verdade"* — e a matriz de cobertura do
[`documentacao.md`](../../.agents/specs/conventions/documentacao.md) §3 manda
que a decisão tenha o **doc canônico** dela.

Duas perguntas estavam abertas, e as duas eram lacunas com instrumento faltando:

1. **O wrapper diz a verdade?** O `.claude/README.md` promete que o `name` e a
   `description` do wrapper são *"copiados literalmente do frontmatter
   canônico"*, e avisa que re-serializar YAML corrompe o `description` — *"a
   skill é descoberta com o gatilho errado, sem erro visível"*. Nenhum gate
   media isso. O `check-skill-coverage` (que chega com o PR #148) mede a
   **existência** do wrapper, e o próprio cabeçalho dele diz que a
   *"qualidade do wrapper … é humana por ora"*.
2. **Os agents têm binding?** São **3 de 28** — e a escolha vivia só no
   `.claude/README.md`, que é o binding, não o spec.

O caso real do primeiro item apareceu MEDIDO em 2026-11-09: o PR #147 trocou
`healthchecks via curl` por `healthchecks via node` no frontmatter canônico da
skill `docker` e **não tocou no wrapper**. A divergência ficou em `main`, e
nenhum gate acusou — porque nenhum gate comparava **conteúdo**.

E a justificativa que o binding tinha para os 3 agents era **falsa**, e o repo
tem como medi-lo: ela dizia que só valia ligar os *"agentes de papel único
cujo frontmatter não tem nada de específico para o Claude Code"*. MEDIDO: os
**28** agents canônicos declaram `tools:` — `task-manager` tem
`tools: Read, Write`, `code-reviewer` tem `tools: Read, Glob, Grep, Bash`.
O `tools` governa o comportamento de **todo** agent: sem ele, o subagent herda
a pool inteira da conversa, e o próprio `.claude/README.md` chama isso de
*"um desvio silencioso"*.

## Decisão

### Decisão 1 — O frontmatter do wrapper é cópia **byte a byte**

O wrapper de **skill** declara `name` e `description`; o wrapper de **agent**
declara `name`, `description` e `tools`. Cada campo vem do canônico como a
**LINHA INTEIRA** — nunca re-serializado.

> Por que linha inteira, e não valor: re-serializar YAML produz o **mesmo
> valor semântico** com bytes diferentes (as aspas somem, a vírgula entra, a
> string é truncada). Um gate que parseasse o YAML e comparasse valores
> passaria verde sobre o defeito — e a corrupção que o README descreve é
> justamente de byte, não de sentido.

`tools` é **obrigatório** no wrapper de agent e **não** é copiado no de skill:
no agent ele restringe a pool herdada (é a allowlist que impede o desvio
silencioso), e na skill é metadado de outra tool — carregá-lo aqui seria
divida que quebra em outro vendor.

O instrumento é o gate
[`check-binding-canonico`](../../.tooling/scripts/ci/check-binding-canonico.ts).
Ele compara, campo a campo, todo campo que o wrapper declara; wrapper sem
canônico, campo obrigatório ausente e campo que o canônico não declara são
erro. A **mensagem** carrega o arquivo e a **linha** divergente dos dois lados.

### Decisão 2 — A cobertura de agents é **parcial por decisão**, e a decisão é registrada aqui

Os 3 wrappers de agent são `review-router` e `specialist-router` (os dois
**orquestradores**, os únicos que despacham outros agents) e
`documentation-specialist` (o dono da documentação da aplicação — o agent cujo
frontmatter tem `Write`/`Edit`).

O motivo do piloto é **ruído de descoberta**: 28 definições de agent no
contexto do Claude Code é um custo que ninguém pediu. O motivo **não** é
segurança — um agent **sem** wrapper não é exposto ao Claude Code, e um agent
**com** wrapper é fiel ao canônico porque a Decisão 1 o obriga a ser.

A cobertura de **skills** é completa (29 de 29, com o PR #148) — e a assimetria
é deliberada: a skill é descoberta por **caminho** e o Claude Code precisa
que ela exista lá para o gatilho funcionar; o agent é uma definição que o
Claude Code **escolhe** entre várias.

### Decisão 3 — A decisões é canônica **aqui**, e o binding só aponta para ela

O `.claude/README.md` continua sendo o guia do Claude Code — o que roda, como
está ligado, o que está por measure. Mas a **decisão** mora neste ADR, e o
README aponta para cá. A regra do repo é que o fato tem **um** dono, e o dono
da decisão é o spec.

## Consequências

- **O gate entra verde depois de consertar 2 wrappers divergentes** — a skill
  `docker` e o agent `documentation-specialist` (que tinha perdido as aspas da
  `description`). MEDIDO 2026-11-09: o gate novo acusa **24 wrappers** (21
  skills + 3 agents), 0 divergências depois do conserto.
- **A cobertura de agents continua 3 de 28**, e agora isso é uma **decisão
  versionada** e não um número solto num README. Um agent novo **sem**
  wrapper é uma escolha — e a lista dos 3 é um fato que o repo pode reconciliar
  depois, se a cobertura subir.
- **O PR #148 e este PR convivem.** O `check-skill-coverage` mede a
  **existência** do wrapper; o `check-binding-canonico` mede o **conteúdo**.
  Os dois olham o mesmo diretório e medem coisas diferentes — o que é o motivo
  de o segundo existir.
- **O `description` de uma skill é o seu gatilho.** Corrigir o canônico sem
  copiar para o wrapper deixa a skill descoberta com o gatilho errado, e
  agora isso é **vermelho no preflight**, com a linha do lado errado nomeada.
- **Custo:** o gate roda em todos os preflights, mede 24 arquivos e lê duas
  linhas de cada — nada que mereça medição de custo.

## Alternativas rejeitadas

- **Criar os 25 wrappers de agent que faltam.** Fecha a cobertura e desfaz
  uma decisão deliberada do dono do repo por um achado de `severity:p2`. E
  o ganho seria pequeno: os 25 agents são de papel único, e ligá-los enche o
  contexto de descoberta sem governar comportamento novo. Reavaliar se um
  agent novo precisar de binding é decisão de uso, não de cobertura.
- **Comparar o YAML parseado, e não a linha.** Passaria verde sobre o
  defeito exato que o README descreve (a re-serialização), porque o valor
  semântico é o mesmo.
- **Gate novo dentro do `check-skill-coverage`.** Ele mede **existência**; a
  comparação de conteúdo é outra pergunta, e o PR #148 ainda não está em
  `main` — um gate próprio não depende do merge de outro PR.
- **Deixar a comparação como "humana".** Era o estado até 2026-11-09, e o
  PR #147 provou que ela falha: a divergência do `docker` entrou em `main` e
  ninguém percebeu.

## Ver Também

- [`.claude/README.md`](../../.claude/README.md) — o guia do binding, e o
  ponto onde esta ADR é referenciada.
- [`../../docs/integrations/claude-code.md`](../integrations/claude-code.md) —
  a integração do Claude Code para quem usa o template.
- [ADR-0002](./0002-autenticacao-jwt-argon2.md) — a decisão anterior sobre
  a camada de segurança do template, que usa o mesmo princípio: o wrapper é
  cópia, e a cópia é medida.
