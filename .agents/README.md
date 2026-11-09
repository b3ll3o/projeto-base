# `.agents/` — a pasta única

> **Esta é a pasta única de tooling de IA do repo.** Toda definição
> canônica, vendor-neutral, vive aqui: agents, skills, memórias, workflows,
> convenções, hooks e o binding do Claude Code.
>
> **Não existe `.claude/` neste repo.** Até 2026-11-09 existiam duas árvores
> paralelas — `.agents/` (canônica) e `.claude/` (binding) — e a segunda era
> uma **cópia**: 29 wrappers que repetiam o `name`/`description` que o
> `SKILL.md` canônico já tinha. A regra agora está em `AGENTS.md` §1.3, e o
> gate [`check-pasta-unica`](../.tooling/scripts/ci/check-pasta-unica.ts)
> reprova se a pasta `.claude/` aparecer.
>
> O binding do Claude Code é feito **na máquina**, e é ele que aponta para
> cá — ver [Binding do Claude Code](#binding-do-claude-code-na-máquina).

## Mapa

| Caminho | Papel | Estado |
|---|---|---|
| `.agents/agents/<name>.md` | Definição canônica do agent | 28 arquivos — `ls .agents/agents/*.md \| wc -l` |
| `.agents/skills/<name>/SKILL.md` | Definição canônica da skill | 30 arquivos — `ls -d .agents/skills/*/ \| wc -l` |
| `.agents/memory/<name>.md` | Memória acumulada por agent | 30 arquivos — `ls .agents/memory/*.md \| wc -l` |
| `.agents/workflows/<id>.md` | Workflow detalhado | 15 arquivos — `ls .agents/workflows/*.md \| wc -l` |
| `.agents/specs/conventions/*.md` | Convenções do repo | 31 arquivos (24 convenções + o índice e 6 apêndices) — `ls .agents/specs/conventions/*.md \| wc -l` |
| `.agents/hooks/pretooluse-block-pnpm-lock.mjs` | Guard de escrita no lockfile | pipe-testado; inerte até `/hooks` |
| `.agents/hooks/posttooluse-stack-review.sh` | Reviewer pós-edição, em modo feedback | pipe-testado; inerte até `/hooks` |
| `.agents/settings.json` | Registra os dois hooks | válido; recarrega no `/hooks` |
| `.agents/FINDINGS.md` | Por que cada hook é como é | 5 fatos medidos |
| `.mcp.json` (raiz) | Servidores MCP pinados | versões fixas; carrega na próxima sessão |

> A coluna **Estado** tem duas dimensões que uma palavra só apaga: o *script*
> funciona (medido por pipe-test) e o *registro* está carregado. O script
> funciona; o registro depende de cada máquina — ver
> [Ativação](#ativação-estes-hooks-não-sobem-sozinhos). "Ativo" aqui significaria
> que o hook responde a uma edição real, e o que decide é o `/hooks` da máquina.

## Por que o binding saiu do repo

**MEDIDO 2026-11-09, Claude Code 2.1.319.** Duas sondas, com pasta limpa e
uma única skill de teste:

| Sonda | Estrutura | Skills de projeto descobertas |
|---|---|---|
| 1 | só `.agents/skills/probe-skill/SKILL.md` | **0** |
| 2 | a mesma + `.claude` como symlink para `.agents` | **30 skills e 28 agents** |

A sonda 1 é a limitação: o Claude Code descobre skill de projeto **só** em
`.claude/skills/`. A sonda 2 é o achado: **o wrapper não era necessário** — o
`SKILL.md` canônico já tem `name` e `description` no frontmatter, que é tudo
que o harness lê para descobrir. Os 29 wrappers eram cópias.

O gate [`check-skill-coverage`](../.tooling/scripts/ci/check-skill-coverage.ts)
trocou a regra "COM BINDING (existe wrapper em `.claude/skills/`)" por
**"DESCOBRÍVEL"**: o frontmatter do `SKILL.md` canônico tem `name` e
`description` não vazios, e o `name` é igual ao nome do diretório — porque o
binding da máquina é o symlink `~/.claude/skills/<diretório>`.

## Binding do Claude Code (na máquina)

O Claude Code descobre o que está em `~/.claude/`. O symlink é o que liga a
máquina ao repo — e ele aponta para `.agents/`, o que faz o arquivo canônico
ser o arquivo descoberto, sem cópia.

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
```

Os **hooks** não precisam de symlink: o comando registrado em
`.agents/settings.json` aponta para o caminho do repo.

O bloco `hooks` vai para o `~/.claude/settings.json` — **mesclado**, sem
sobrescrever o que já lá estiver. O merge **concatena** as listas de cada
evento (substituir o array inteiro apagaria os hooks que o usuário já tinha
registrado — foi o defeito da primeira versão deste comando). O merge é feito
com `node`, que o repo já exige (`engines: node >= 22.6`); `jq` **não** é
dependência do repo (ver [FINDINGS.md](./FINDINGS.md) §3):

```bash
node -e 'const fs=require("fs"),p=process.env.HOME+"/.claude/settings.json",s=require("./.agents/settings.json"),cur=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):{},hooks={...(cur.hooks||{})};for(const[ev,list]of Object.entries(s.hooks))hooks[ev]=[...(hooks[ev]||[]),...list];fs.writeFileSync(p,JSON.stringify({...cur,hooks},null,2)+"\n")'
```

> **O symlink é do diretório, não do arquivo** — o `SKILL.md` tem `references/`
> ao lado, e um symlink só no arquivo quebraria o caminho relativo.
>
> ⚠️ **O binding é por máquina, e vale para todo projeto aberto nela.** As
> skills deste repo passam a aparecer nos outros projetos da mesma máquina. Para
> desligar: apague os symlinks de `~/.claude/skills/` e `~/.claude/agents/`.

## Os dois hooks

```text
PreToolUse Edit|Write
  └─ f="${CLAUDE_PROJECT_DIR:-$PWD}/.agents/hooks/pretooluse-block-pnpm-lock.mjs"; if [ -f "$f" ]; then node "$f"; fi

PostToolUse Edit|Write
  └─ f="${CLAUDE_PROJECT_DIR:-$PWD}/.agents/hooks/posttooluse-stack-review.sh"; if [ -f "$f" ]; then bash "$f"; fi
```

O `PreToolUse` **bloqueia** — o deny chega antes de a tool executar.

O `PostToolUse` **não bloqueia**: dispara depois que a escrita já aconteceu, e o
único contrato disponível é feedback. `exit 2` põe o texto na frente do
Claude, que reage no mesmo turno. É a diferença entre "impedir" e "avisar".

O `if [ -f "$f" ]` é o que permite o `settings.json` viver em **escopo de
usuário**: num projeto que não tem `.agents/hooks/`, o hook é um no-op
(exit `0`), em vez de um erro de "script não encontrado". O exit do script
propaga — `exit 2` continua sendo `exit 2` quando o script existe.

### Comportamento medido do PostToolUse

| Payload | exit | Resultado |
|---|---|---|
| `.ts` limpo | 0 | silencioso |
| `.ts` com blocker real | **2** | finding entregue ao Claude |
| `.tsx` com 1 `major` (**aprovado**) | **2** | finding entregue — ver nota |
| `.jsx` com `<img>` | **2** | coberto; antes o filtro recusava `.jsx` |
| `.TS` maiúsculo com blocker | **2** | coberto; comparação é case-insensitive |
| extensão não coberta (`.md`) | 0 | ignora |
| arquivo não existe | 0 | ignora |
| stdin inválido | 0 | ignora |

O caso 2 é o que prova o laço: um arquivo `domain/` importando `@nestjs/common`
produziu `domain/ importa '@nestjs/common' — viola pureza do núcleo`, com
`exit 2` e o relatório descartado num `mktemp -d`.

**O caso 3 é o que a primeira versão deste hook fazia errado.** O exit do
reviewer é veredito de *aprovação* (`approved = blockers === 0 && majors <= 3`,
`stack-code-reviewer.ts:192`), não de achado: um único `major` produz
`approved: true` e exit 0. Ler o exit como "nada a relatar" descartava um finding
que tinha sido medido e escrito no relatório — o hook ficava mudo em cima de um
achado real. A decisão agora é pelo **conteúdo** do relatório, não pelo exit.

### Ativação: estes hooks não sobem sozinhos

O `settings.json` **não existia** quando esta sessão começou, e o
watcher de settings só observa diretórios que já tinham um arquivo de settings
no início da sessão. Resultado medido: escrever um `domain/` violando pureza
nesta sessão **não** disparou o reviewer — voltou só a resposta do formatador,
que vem de `~/.claude/settings.json` (escopo de usuário).

Para ativar: abrir `/hooks` uma vez, ou reiniciar a sessão. Não dá para fazer
isso de dentro de uma tool. O `.mcp.json` parte do mesmo lugar: os servidores
MCP são resolvidos no início da sessão.

Até lá, os hooks estão **corretos e testados**, mas **inertes**. O teste de
pipe (5 payloads na tabela acima) exercita o script pelo mesmo comando que o
`settings.json` registra — o que falta é o registro ser recarregado, não o
script funcionar.

## O guard do lockfile

`PreToolUse` em `Edit|Write` nega escrita em `pnpm-lock.yaml` — o comando
registrado está no diagrama de [Os dois hooks](#os-dois-hooks).

Duas decisões:

**`basename`, não path completo** — cobre o lockfile da raiz e o de qualquer
subpacote sem depender de cwd.

**Fail-closed no stdin** — payload ilegível ou JSON inválido sai com `exit 2`
em vez de `exit 0`. O custo é bloquear todo `Edit|Write` enquanto o hook
estiver quebrado; o benefício é um guard que não falha aberto em silêncio.

### Comportamento medido

11 payloads, pelo comando **exato** registrado no `settings.json`:

| Payload | exit | Resultado |
|---|---|---|
| `file_path` `.ts` | 0 | segue (sem deny) |
| `pnpm-lock.yaml` na raiz | 0 | `permissionDecision: "deny"` |
| `pnpm-lock.yaml` em subpacote | 0 | `permissionDecision: "deny"` |
| `meu-pnpm-lock.yaml.bak` | 0 | segue — `basename` compara o nome exato |
| stdin não-JSON | **2** | bloqueia (fail-closed) |
| sem `file_path` / `file_path: null` | 0 | segue |
| **symlink `lock-amigo.yaml` → lockfile** | 0 | **`deny`** — antes passava |
| **`file_path` número** | **2** | fail-closed — antes era `TypeError`, exit 1 |
| **`file_path` array** | **2** | fail-closed — idem |
| path inexistente `novo/pnpm-lock.yaml` | 0 | `deny` (casa pelo nome) |

Os dois casos em negrito são defeitos que a primeira versão tinha e que a revisão
adversarial achou por execução, não por leitura:

- **Symlink.** `basename` descreve o *nome*, e o que a escrita atinge é o *alvo*.
  `ln -s pnpm-lock.yaml lock-amigo.yaml` + `Write` em `lock-amigo.yaml` saía com
  `exit 0` e o conteúdo do lockfile mudava. Agora o nome é conferido nos dois
  níveis — literal e resolvido por `realpathSync`.
- **`file_path` não-string.** `basename(123)` lança `TypeError` e o processo
  morre com `exit 1` — que não é o `0` do "não é o alvo" nem o `2` do bloqueio. Um
  guard que morre de exceção não decide nada; payload inválido é fail-closed.

Reproduzir: `printf '%s' '<payload>' | node .agents/hooks/pretooluse-block-pnpm-lock.mjs`

## Findings que moldaram isto

Cinco fatos medidos que explicam por que cada hook é como é: `onFailure` não ser
campo de hook, `jq` não ser dependência do repo, o reviewer escrever o relatório
incondicionalmente, `--mode` ser rótulo e não comportamento. Cada um com o
comando de reprodução ao lado, em [`FINDINGS.md`](./FINDINGS.md).

## MCP

`.mcp.json` registra dois servidores, **com versão fixada** — nunca `@latest`:

| Servidor | Pacote | Versão |
|---|---|---|
| `playwright` | `@playwright/mcp` | 0.0.83 |
| `context7` | `@upstash/context7-mcp` | 4.4.1 |

Ambas as versões foram conferidas no registry, não copiadas de memória. Fixar é
o que impede um `npx` de trazer código novo e não revisado para dentro do hook
de uma sessão que não o pediu.

> O `.mcp.json` fica na **raiz** porque é o único caminho que o Claude Code lê
> para o escopo de projeto — a exceção única à "pasta única", e a exceção é do
> protocolo do Claude Code, não deste repo.

**Ressalva de duplicata:** os dois servidores já chegam como plugin nesta
instalação. Quem já os tem via plugin vai ver as duas cópias. O `.mcp.json`
existe para o caso em que o projeto é aberto **sem** os plugins.

## Lacunas conhecidas

Não são defeitos deste binding; são coisas que ele **não** cobre, registradas
para não serem descobertas como surpresa.

### O binding é por máquina, e não por repo

Um clone novo não vem com `.claude/`: quem usa o Claude Code precisa do
symlink. A receita está em
[Binding do Claude Code](#binding-do-claude-code-na-máquina) e em
[`docs/integrations/claude-code.md`](../docs/integrations/claude-code.md).
O custo é o inverso do de antes: a configuração é da máquina, e ela vale para
todo projeto aberto nela.

### A descoberta de uma skill nova só é medida no próximo preflight

O gate `check-skill-coverage` mede que o frontmatter **tem** `name` e
`description` e que o `name` é igual ao diretório — mas só para as skills que
ele lê. Uma skill **nova** publicada sem passar pelo preflight escapa até o
próximo `ci:preflight`.

### O hook herda uma regra cega do reviewer

`stack-code-reviewer.ts:150` usa `/^\s*<img\s/` **sem a flag `m`**, que só casa
quando o `<img>` está na primeira linha do arquivo. Em JSX real nunca está — a
regra `nextjs-img-vs-image`, a única de severidade `major`, é inerte. Medido:
com `m`, o mesmo conteúdo passa a casar na linha 5.

Não foi corrigido aqui porque o reviewer é ferramenta **pré-existente** e muda o
gate de todo o repo — blast radius maior que este PR. O que este binding herda
dele é a mesma cegueira: o hook não mede o que o reviewer não mede.

### O hook `.sh` não passa pelo formatter

`prettier` não tem parser para shell e `shellcheck` não está instalado. O guard
`.mjs` é coberto pelo pre-commit; o `.sh` **não é coberto por nada**. A
formatação dele é mantida à mão.

### Nenhum agent é "piloto" — todos os 28 são descobertos

Com o symlink, o Claude Code descobre os **28** agents de `.agents/agents/`
(inclusive os 25 que antes não tinham wrapper), porque o arquivo canônico já
carrega `name`, `description` e `tools`. O `tools` é o que limita a pool de
ferramentas do subagent — sem ele, o subagent herda **todas** as tools da
conversa principal.

## Verificação

```bash
# configs parseáveis
node -e 'for (const f of [".agents/settings.json", ".mcp.json"]) JSON.parse(require("fs").readFileSync(f, "utf-8"))'

# guard do lockfile responde ao payload
printf '%s' '{"tool_name":"Edit","tool_input":{"file_path":"pnpm-lock.yaml"}}' \
  | node .agents/hooks/pretooluse-block-pnpm-lock.mjs

# a pasta única é a única: o gate reprova se a pasta `.claude/` existir
node --import tsx .tooling/scripts/ci/check-pasta-unica.ts
```

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
