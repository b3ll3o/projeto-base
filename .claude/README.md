# `.claude/` — binding Claude Code

> **Esta pasta não é fonte de verdade.** Toda definição canônica, vendor-neutral,
> vive em [`.agents/`](../.agents/). O que está aqui existe apenas para que o
> Claude Code **descubra** essas definições nos caminhos onde ele procura.
>
> Regra que valida a pasta inteira: se um arquivo aqui e o canônico divergirem,
> o canônico está certo e o wrapper é um defeito.

## Mapa

| Caminho | Papel | Estado |
|---|---|---|
| `.claude/skills/<dir>/SKILL.md` | Wrapper que expõe a skill canônica | 15 de 15 |
| `.claude/agents/<name>.md` | Wrapper que expõe o agent canônico | 2 de 26 (piloto) |
| `.claude/hooks/pretooluse-block-pnpm-lock.mjs` | Guard de escrita no lockfile | pipe-testado; inerte até `/hooks` |
| `.claude/hooks/posttooluse-stack-review.sh` | Reviewer pós-edição, em modo feedback | pipe-testado; inerte até `/hooks` |
| `.claude/settings.json` | Registra os dois hooks | válido; recarrega no `/hooks` |
| `.claude/FINDINGS.md` | Por que cada hook é como é | 5 fatos medidos |
| `.mcp.json` | Servidores MCP pinados | versões fixas; carrega na próxima sessão |

> A coluna **Estado** tem duas dimensões que uma palavra só apaga: o *script*
> funciona (medido por pipe-test) e o *registro* está carregado. Neste commit os
> dois scripts funcionam e **nenhum** registro está carregado — ver
> [Ativação](#ativação-estes-hooks-não-sobem-sozinhos). "Ativo" aqui significaria
> que o hook responde a uma edição real, e hoje não responde.

## Skills (15 wrappers)

Um wrapper por skill em `.agents/skills/`. Cada um tem 30 linhas e **não contém
procedimento**: só `name`/`description` copiados literalmente do frontmatter
canônico, e a instrução de ler o canônico antes de agir.

O `name` e a `description` são copiados como **linha inteira**, nunca
re-serializados. Re-serializar YAML é a forma clássica de corromper um
`description` que já vem entre aspas duplas — e um `description` corrompido
produz uma skill que o Claude Code descobre com o gatilho errado, sem erro
visível.

Campos deliberadamente **não** copiados: `type`, `tools`, `version`, `updated`.
São metadados de outra ferramenta ou convenção; carregá-los aqui seria
dívida que quebra em outro vendor. Ver `prefer-agents-directory`.

## Agents (2 wrappers, piloto)

Só `review-router` e `specialist-router`. A escolha é deliberada: são os dois
**orquestradores**, os únicos que despacham outros agents e, portanto, os únicos
em que `tools` governa o comportamento de verdade. Ligar os outros 24 traria
ao Claude Code agentes de papel único cujo frontmatter não tem nada de específico
do Claude Code — ruído de descoberta em troca de nada.

Para estes dois, `tools` **é** copiado verbatim:

```
tools: Read, Glob, Grep, Bash, Agent
```

Sem o campo, o subagent herda **todas** as tools da conversa principal — mais
permissivo que o canônico, e um desvio silencioso. `tools` é uma allowlist
sobre a pool herdada, não uma lista enumerada: entradas que não resolvem são
removidas em silêncio desde que ao menos uma resolva. Daí copiar as cinco
canônicas em vez de escolher um subconjunto.

## Os dois hooks

```
PreToolUse Edit|Write
  └─ node "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/pretooluse-block-pnpm-lock.mjs"

PostToolUse Edit|Write
  └─ bash "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/hooks/posttooluse-stack-review.sh"
```

O `PreToolUse` **bloqueia** — o deny chega antes de a tool executar.

O `PostToolUse` **não bloqueia**: dispara depois que a escrita já aconteceu, e
o único contrato disponível é feedback. `exit 2` põe o texto na frente do
Claude, que reage no mesmo turno. É a diferença entre "impedir" e "avisar".

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

O `.claude/settings.json` **não existia** quando esta sessão começou, e o
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

**Fail-closed no stdin** — payload ilegível ou JSON inválito sai com `exit 2`
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
  guard que morre de exceção não decide nada; payload inavaliável é fail-closed.

Reproduzir: `printf '%s' '<payload>' | node .claude/hooks/pretooluse-block-pnpm-lock.mjs`

## Findings que moldaram isto

Cinco fatos medidos que explicam por que cada hook é como é: `onFailure` não ser
campo de hook, `jq` não existir nesta máquina, o reviewer escrever o relatório
incondicionalmente, `--mode` ser rótulo e não comportamento. Cada um com o
comando de reprodução ao lado, em [`.claude/FINDINGS.md`](./FINDINGS.md).

## MCP

`.mcp.json` registra dois servidores, **com versão fixada** — nunca `@latest`:

| Servidor | Pacote | Versão |
|---|---|---|
| `playwright` | `@playwright/mcp` | 0.0.83 |
| `context7` | `@upstash/context7-mcp` | 4.4.1 |

Ambas as versões foram conferidas no registry, não copiadas de memória. Fixar é
o que impede um `npx` de trazer código novo e não revisado para dentro do hook
de uma sessão que não o pediu.

**Ressalva de duplicata:** os dois servidores já chegam como plugin nesta
instalação. Quem já os tem via plugin vai ver as duas cópias. O `.mcp.json`
existe para o caso em que o projeto é aberto **sem** os plugins — é aí que ele
resolve algo.

## Lacunas conhecidas

Não são defeitos deste binding; são coisas que ele **não** cobre, registradas
para não serem descobertas como surpresa.

### `.claude/**` não está na matriz de review-routing

`.agents/specs/conventions/review-routing.md` não tem `path_globs` para
`.claude/**`. Consequência: um commit que só toque este binding é classificado
em domínio **desconhecido** e despacha **zero** reviewers — o commit passa sem
nenhuma revisão por matriz. Fechar isso é um PR na convenção de roteamento,
fora do escopo deste trabalho.

### Nenhum gate compara wrapper com canônico

O canônico é a fonte da verdade, mas **nada** no repo verifica que
`.claude/skills/*/SKILL.md` continua batendo com `.agents/skills/*/SKILL.md`. Um
drift aqui passaria por review — foi justamente um `tools:` descartado que a
revisão adversarial deste commit pegou, por leitura. Um gate que diffe os dois
`name:`/`description:` é o conserto; fica para depois, porque é tooling novo.

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

### Só 2 de 26 agents têm wrapper

Os outros 24 agents de `.agents/agents/` continuam sem binding. Não é falha de
cobertura do trabalho — foi a escolha registrada acima, para não poluir a
descoberta do Claude Code com agentes que não têm nada de específico deste
vendor.

## Verificação

```bash
# configs parseáveis
node -e 'for (const f of [".claude/settings.json", ".mcp.json"]) JSON.parse(require("fs").readFileSync(f, "utf-8"))'

# guard do lockfile responde ao payload
printf '%s' '{"tool_name":"Edit","tool_input":{"file_path":"pnpm-lock.yaml"}}' \
  | node .claude/hooks/pretooluse-block-pnpm-lock.mjs

# reviewer: domain/ que importa @nestjs/* -> esperado exit 2 + o blocker
mkdir -p /tmp/probe/domain
printf "import { Injectable } from '@nestjs/common';\n" >/tmp/probe/domain/y.ts
printf '%s' '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/probe/domain/y.ts"}}' \
  | bash .claude/hooks/posttooluse-stack-review.sh
rm -rf /tmp/probe

# reviewer: .ts real e limpo -> esperado exit 0 e NENHUMA saída
printf '%s' '{"tool_name":"Edit","tool_input":{"file_path":"apps/api/src/modules/users/domain/events/user-created.event.ts"}}' \
  | bash .claude/hooks/posttooluse-stack-review.sh

# skills: 15, todas com ponteiro ao canônico (esperado: 0)
ls .claude/skills | wc -l
grep -L '\.agents/skills/' .claude/skills/*/SKILL.md | wc -l

# agents: 2, ambos declarando tools explicitamente
ls .claude/agents | wc -l
grep -c '^tools:' .claude/agents/*.md
```

Todas as medições deste arquivo foram feitas com o comando escrito ao lado.
Nenhum número aqui é de memória.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
