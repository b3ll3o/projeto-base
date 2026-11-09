# Integração: Claude Code

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Claude Code.

## Como o Claude Code Carrega

- `AGENTS.md` na raiz → carregado automaticamente como contexto do agent principal
- `CLAUDE.md` na raiz → também carregado (alias para Claude Code) — **opcional**: o template não tem um; `AGENTS.md` é o índice
- Subdiretórios `AGENTS.md` ou `CLAUDE.md` → carregados sob demanda quando relevantes

## A pasta única

Este repo tem **uma** pasta de tooling de IA: `.agents/`. **Não existe
`.claude/` aqui** — a regra está em `AGENTS.md` §1.3 e o gate
`check-pasta-unica` reprova se a pasta `.claude/` aparecer no repo. As pastas
dos **outros** vendors (`.cursor/`, `.windsurf/`, `.continue/`) não são
reprovadas: elas são criadas de propósito, por receita — ver
[`cursor.md`](./cursor.md) e [`windsurf.md`](./windsurf.md).

O Claude Code, porém, descobre skill de projeto **só** em `.claude/skills/`.
MEDIDO 2026-11-09 (Claude Code 2.1.319): uma pasta contendo apenas
`.agents/skills/probe-skill/SKILL.md` devolveu **zero** skills de projeto; a
mesma pasta com `.claude` como symlink para `.agents` devolveu **30 skills e 28
agents**, **sem wrapper nenhum**.

O binding é, portanto, um **symlink na máquina** — e ele aponta para
`.agents/`, o que faz o arquivo canônico ser o arquivo descoberto.

## Setup do binding (uma vez por máquina)

Rode na raiz do repo:

```bash
# 1. skills: um symlink por diretório de skill
# O `rm -rf` antes não é decoração: `ln -sfn` sobre um diretório REAL cria o link DENTRO dele.
mkdir -p ~/.claude/skills
for d in .agents/skills/*/; do
  dest="$HOME/.claude/skills/$(basename "${d%/}")"
  rm -rf "$dest" && ln -sfn "$PWD/${d%/}" "$dest"
done

# 2. agents: um symlink por agent
mkdir -p ~/.claude/agents
for f in .agents/agents/*.md; do
  dest="$HOME/.claude/agents/$(basename "$f")"
  rm -f "$dest" && ln -sfn "$PWD/$f" "$dest"
done

# 3. hooks: o bloco "hooks" de .agents/settings.json vai para o settings de usuário.
#    Os hooks NÃO precisam de symlink: o comando registrado aponta para o
#    caminho do repo (`${CLAUDE_PROJECT_DIR:-$PWD}/.agents/hooks/<script>`).
node -e '
const fs = require("fs");
const p = process.env.HOME + "/.claude/settings.json";
const s = require("./.agents/settings.json");
const cur = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
const hooks = { ...(cur.hooks || {}) };
for (const [ev, list] of Object.entries(s.hooks)) hooks[ev] = [...(hooks[ev] || []), ...list];
fs.writeFileSync(p, JSON.stringify({ ...cur, hooks }, null, 2) + "\n");
'
```

> ⚠️ **O binding é por máquina, e vale para todo projeto aberto nela.** As
> skills deste repo passam a aparecer nos outros projetos. Para desligar:
> apague os symlinks de `~/.claude/skills/` e `~/.claude/agents/`.

> **Por que symlink de DIRETÓRIO e não de arquivo:** o `SKILL.md` tem
> `references/` ao lado, e um symlink só no `SKILL.md` quebraria o caminho
> relativo das referências.

## Dispatch de Subagents

O Claude Code descobre subagents em `~/.claude/agents/`. O symlink do passo 2
aponta para `.agents/agents/<nome>.md` — o arquivo canônico, que já tem
`name`, `description` e `tools` no frontmatter. Os **28** agents ficam
disponíveis, e o `tools` é o que limita a pool de ferramentas do subagent: sem
ele, o subagent herda **todas** as tools da conversa principal.

**O arquivo descoberto É o arquivo canônico — não há cópia.** O defeito que a
versão com wrapper tinha (re-serializar o YAML ao copiar a `description`: aspas
que somem, vírgula que entra, texto truncado) não existe mais: quem edita o
canônico edita o que o harness descobre. O que passa a valer é o gate
[`check-skill-coverage`](../../.tooling/scripts/ci/check-skill-coverage.ts) —
`name` e `description` preenchidos, e `name` igual ao diretório.

A decisão completa (por que uma pasta só, e o que a máquina faz) está no
[ADR-0009](../adr/0009-pasta-unica-de-tooling-de-ia.md) — que substitui o
[ADR-0008](../adr/0008-camada-de-binding-do-claude-code.md), o do modelo de
wrapper.

## Skills

O Claude Code descobre skills em `~/.claude/skills/`. O symlink do passo 1
aponta para `.agents/skills/<nome>/` — o diretório canônico, com o `SKILL.md`
que tem `name` e `description` no frontmatter. O gate `check-skill-coverage`
(exige `name` e `description` preenchidos, e `name` igual ao diretório) é o
que garante que a skill é descobrível.

## Hooks

O bloco `hooks` de `.agents/settings.json` é o payload. Ele é escrito em
`~/.claude/settings.json` (escopo de usuário) porque **não existe `.claude/` no
repo** — e o Claude Code só lê settings de projeto em `.claude/settings.json`.

O merge **concatena** as listas de cada evento: substituir o array inteiro
apagaria os hooks que a máquina já tinha registrado.

O comando de cada hook é:

```text
f="${CLAUDE_PROJECT_DIR:-$PWD}/.agents/hooks/<script>"; if [ -f "$f" ]; then <node|bash> "$f"; fi
```

O `if [ -f "$f" ]` é o que permite o settings ser de **usuário**: num projeto
que não tem `.agents/hooks/`, o hook é um no-op (`exit 0`) em vez de um erro de
"script não encontrado". O exit do script propaga — `exit 2` continua sendo
`exit 2` quando o script existe.

Depois de escrever o settings: abrir `/hooks` uma vez, ou reiniciar a sessão
(o watcher de settings só observa diretórios que já tinham settings no início
da sessão).

---

**Mantido por:** projeto-base contributors
