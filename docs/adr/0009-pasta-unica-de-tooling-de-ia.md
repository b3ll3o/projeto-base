# ADR-0009: Uma pasta de tooling de IA (`.agents/`) e o binding por symlink

- **Status:** Aceito
- **Data:** 2026-11-09
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`check-pasta-unica`](../../.tooling/scripts/ci/check-pasta-unica.ts) · [`check-agent-frontmatter`](../../.tooling/scripts/ci/check-agent-frontmatter.ts) · [`check-skill-coverage`](../../.tooling/scripts/ci/check-skill-coverage.ts) · [`AGENTS.md` §1.3](../../AGENTS.md)
- **Substitui:** [ADR-0008](./0008-camada-de-binding-do-claude-code.md)

## Contexto

O template é **vendor-neutral**: a definição de uma skill ou de um agent vive
em `.agents/`, e nenhuma tool vendor precisa conhecer o formato de ninguém.
O Claude Code, porém, **descobre** as skills em `.claude/skills/<nome>/SKILL.md`
e os agents em `.claude/agents/<nome>.md` — ele não lê `.agents/`.

Daí nasceu uma **segunda árvore**: a pasta `.claude/` no repo, feita de 29
wrappers de skill e 3 de agent. Cada wrapper repetia o `name`/`description` do
`SKILL.md` canônico — era uma **cópia**, e a cópia podia divergir.

Duas sondas medidas em 2026-11-09 (Claude Code 2.1.319), com pasta limpa e uma
única skill de teste:

| Sonda | Estrutura | Descoberto |
|---|---|---|
| 1 | só `.agents/skills/probe-skill/SKILL.md` | **0** skill de projeto |
| 2 | a mesma + `.claude` como **symlink** para `.agents` | **30 skills e 28 agents**, sem wrapper nenhum |

A sonda 1 é a limitação do harness (a descoberta de skill de projeto é só em
`.claude/skills/`). A sonda 2 é o achado que fecha a discussão: **o wrapper
não era necessário** — o `SKILL.md` canônico já tem `name` e `description` no
frontmatter, que é tudo que o harness lê para descobrir.

O custo da cópia era medido, não suposto: a skill `docker` tinha a
`description` divergente do canônico (o PR #147 trocou `healthchecks via curl`
por `healthchecks via node` no canônico e não tocou no wrapper) e a divergência
ficou em `main` sem nenhum gate reclamar — porque nenhum gate comparava
conteúdo. O [ADR-0008](./0008-camada-de-binding-do-claude-code.md) fechou essa
lacuna com o gate `check-binding-canonico`: 32 wrappers comparados byte a byte.

E havia uma segunda assimetria, sem instrumento nenhum: os **3** wrappers de
agent eram uma escolha registrada só no `.claude/README.md` — o binding, não o
spec — e a justificativa que eles traziam ("só agents de papel único") era
**falsa**: os 28 agents canônicos declaram `tools:`.

## Decisão

### Decisão 1 — Só existe `.agents/`

A pasta de tooling de IA do repo é **uma**: `.agents/`. Agents, skills,
memórias, workflows, convenções, hooks, `settings.json` e os READMEs vivem
lá. A regra está em [`AGENTS.md` §1.3](../../AGENTS.md), e o gate
[`check-pasta-unica`](../../.tooling/scripts/ci/check-pasta-unica.ts) a
transforma em instrumento: reprova se a pasta `.claude/` existir **na árvore
de trabalho** ou estiver **versionada no índice** do git.

As duas regras existem porque o `.gitignore` esconde a pasta do `git status`:
sem a regra do disco, a pasta que a ferramenta cria sozinha (o Claude Code
cria `.claude/` ao rodar `/config`, `/hooks`, `/mcp`) apareceria e **ninguém
veria**; sem a regra do índice, o commit seguinte publicaria arquivos que
ninguém editou.

Quando uma pasta de vendor aparecer, o conteúdo é **migrado para `.agents/`**
e a pasta é removida. As pastas dos **outros** vendors (`.cursor/`, `.windsurf/`,
`.continue/`) não são reprovadas: elas são criadas de propósito, por receita
em [`docs/integrations/`](../../docs/integrations/).

### Decisão 2 — O binding é por symlink, na máquina

O Claude Code descobre o que está em `~/.claude/`. O symlink é o que liga a
máquina ao repo, e ele aponta para `.agents/`:

```bash
mkdir -p ~/.claude/skills
for d in .agents/skills/*/; do
  dest="$HOME/.claude/skills/$(basename "${d%/}")"
  rm -rf "$dest" && ln -sfn "$PWD/${d%/}" "$dest"
done

mkdir -p ~/.claude/agents
for f in .agents/agents/*.md; do
  dest="$HOME/.claude/agents/$(basename "$f")"
  rm -f "$dest" && ln -sfn "$PWD/$f" "$dest"
done
```

O symlink é de **diretório** (o `SKILL.md` tem `references/` ao lado, e um
symlink só no arquivo quebraria o caminho relativo) e é **por máquina** — vale
para todo projeto aberto nela, e para desligar basta apagar os symlinks.

O `rm -rf`/`rm -f` antes do `ln` não é decoração: `ln -sfn` sobre um
**diretório real** cria o link DENTRO dele (`<nome>/<nome>`), e a skill
continua invisível. O destino é substituído de propósito — é o binding do
template.

**O que a sonda mediu e o que a receita faz.** A sonda 2 usou um symlink de
**pasta inteira** (`~/.claude` → `.agents`); a receita cria um symlink **por
skill e por agent**. As duas formas fazem o harness abrir o arquivo canônico —
e a segunda é a que funciona quando `~/.claude/` já tem conteúdo de outra
ferramenta, que o symlink de pasta inteira esconderia.

O custo é o inverso do de antes: a configuração saiu do repo e foi para a
máquina. A receita vive em
[`docs/integrations/claude-code.md`](../../docs/integrations/claude-code.md) e
em [`.agents/README.md`](../../.agents/README.md).

### Decisão 3 — A cópia saiu, e com ela a classe de defeito; o que passa a valer é o canônico

O `check-binding-canonico` foi **removido**: ele comparava o wrapper com o
canônico, e não há wrapper para comparar. A classe de defeito que ele media
— a cópia divergindo do original — não existe mais, porque não há cópia.

O que resta é o que vale no canônico, e cada parte tem o seu dono:

| O quê | Quem mede |
|---|---|
| A skill é **descobrível** (`name` e `description` preenchidos, `name` = diretório) | [`check-skill-coverage`](../../.tooling/scripts/ci/check-skill-coverage.ts) |
| O agent declara `name` (igual ao arquivo), `description` (é o gatilho) e `tools` (sem ele o subagent herda a pool inteira) | [`check-agent-frontmatter`](../../.tooling/scripts/ci/check-agent-frontmatter.ts) |
| O agent é **roteado** (órfão e fantasma) | [`check-agent-routing-coverage`](../../.tooling/scripts/ci/check-agent-routing-coverage.ts) |
| Não existe uma segunda árvore | [`check-pasta-unica`](../../.tooling/scripts/ci/check-pasta-unica.ts) |

O `tools` continua sendo obrigatório em todo agent canônico — e agora é
**medido no próprio arquivo que o harness lê**, que é o arquivo que vale.

## Consequências

- **A cobertura de agents deixa de ser parcial.** Com o wrapper, 3 de 28
  agents eram expostos ao Claude Code e a escolha vivia num README. Com o
  symlink, os **28** são descobertos — e o custo (o contexto de descoberta) é
  o de qualquer template que use o Claude Code.
- **O `description` de uma skill é o seu gatilho, e não há mais um lugar para
  ele divergir.** A divergência que o PR #147 deixou passar (e que o gate
  `check-binding-canonico` acusou) não tem mais onde acontecer: quem edita o
  canônico edita o que o harness descobre.
- **A configuração do Claude Code não é mais versionada.** Um clone novo
  precisa do symlink; a receita está no doc de integração. É o preço da
  neutralidade — e o repo tem, para o resto das ferramentas, as receitas
  equivalentes em `docs/integrations/`.
- **O `.mcp.json` fica na raiz** — é a exceção única, e é do protocolo do
  Claude Code: ele só lê MCP no escopo de projeto pela raiz.
- **Perde-se um instrumento**: a comparação byte a byte entre wrapper e
  canônico. Ganha-se a eliminação da cópia que ela media.

## Alternativas rejeitadas

- **Manter a pasta `.claude/` no repo e apenas versionar o diff.** É o estado
  anterior: a cópia continua podendo divergir, e o `check-binding-canonico`
  vira um gate de conformidade de um wrapper que a sonda 2 provou ser
  desnecessário.
- **Manter a pasta `.claude/` fora do repo, sem gate.** Resolve o versionamento
  e nada mais: a pasta volta a aparecer sozinha (o harness a cria), e sem
  instrumento ninguém a vê.
- **Vendorizar a pasta por receita nos outros vendors.** É o que já acontece
  com `.cursor/` e `.windsurf/`: a diferença é que o `.claude/` **nasce
  sozinho**, e é por isso que ele é o único reprovado.
- **Substituir o symlink por um plugin ou MCP que sirva as definições.** Mudaria
  a forma do binding e o preço da descoberta; a sonda 2 mostra que o symlink
  basta.

## Ver Também

- [`AGENTS.md` §1.3](../../AGENTS.md) — a regra, na forma curta.
- [`.agents/README.md`](../../.agents/README.md) — a pasta única e a receita
  do binding.
- [`docs/integrations/claude-code.md`](../../docs/integrations/claude-code.md) —
  a integração para quem usa o template.
- [ADR-0008](./0008-camada-de-binding-do-claude-code.md) — a decisão
  substituída: a camada de binding com wrapper.
