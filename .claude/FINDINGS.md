# Findings que moldaram o binding Claude Code

> **Por que este arquivo existe.** São fatos medidos sobre hooks do Claude Code e
> sobre o `stack-code-reviewer.ts` que, se ninguém registrar, voltam a ser
> reinventados — e três deles corrigem uma suposição que a documentação de hooks
> encourage a fazer.
>
> O binding em si está descrito em [`.claude/README.md`](./README.md). Este arquivo
> é a justificativa de cada decisão, não a referência de uso.

## 1. `onFailure` não é campo de hook

Medido no binário do CLI em execução (2.1.296). O campo pertence a **`policyHelper` /
`policyHelpers`** — helpers de política de OS-admin. Aceita `"continue"` ou
`"refuse"`, **não** `block`, e é explicitamente ignorado fora das entradas
per-OS. Escrever `onFailure: "block"` num hook seria um no-op silencioso: um
controle que parece configurado e não existe.

O que sustenta a conclusão são as **strings**, não quantas vezes elas se
repetem — por isso a evidência abaixo cita o texto. Citações literais:

```text
Its "onFailure" requires the helper
["path","script","interpreter","outputBehavior","onFailure", ...]
"onFailure" on the singular policyHelper is ignored — it is only honored on the
policyHelpers per-OS entries
"onFailure": ... is not a recognized value ("continue" or "refuse")
```

Reproduzir:

```bash
grep -a -o '.\{70\}"onFailure".\{90\}' "$(ls -t ~/.local/share/claude/versions/* | head -1)"
```

A primeira versão deste README afirmava "34 ocorrências" aqui. Medido de novo, o
token exato `"onFailure"` aparece **10** vezes no binário em execução — e o 34
não correspondia nem a esse nem ao `CLAUDE_PROJECT_DIR` (58). Melhor: a mesma
contagem nos três binários instalados dá **0 / 9 / 10** (2.1.221 / 2.1.291 /
2.1.296). O número muda entre versões adjacentes sem que nada nesta prosa mude —
é a razão de a evidência acima ser citação de string, e não contagem.

O que **realmente** produz o bloqueio é `exit 2` — a CLI nomeia de
`hook blocking error`. E para a negação sem ambiguidade, o script emite
`hookSpecificOutput.permissionDecision: "deny"` e sai `0`.

## 2. `cwd` não é campo documentado do payload de hook

A entrada documentada é `{session_id, tool_name, tool_input, tool_response}`.
Para um guard que precisa da raiz do projeto, o próprio binário diz o que usar:

> `hooks for such calls start in your home directory with a reduced environment: a guard that inspects the project must use $CLAUDE_PROJECT_DIR or the cwd field on stdin.`

Daí o `${CLAUDE_PROJECT_DIR:-$PWD}` — e o fallback foi verificado: sem a env
var, o comando ainda nega o lockfile.

## 3. `jq` não está instalado nesta máquina

`jq -e` é a validação prescrita e o `jq -r` é a extração de payload nos
exemplos de hook. Nenhum dos dois existe aqui. Um hook escrito a partir desses
exemplos **não quebraria com erro**: `bash -c` devolveria 127, o hook sairia
não-zero, e o comportamento observável seria o de um hook que falha sempre.

Por isso toda a extração de JSON aqui é feita com `node` — que o repo já exige
(`engines: node >= 22.6`).

Armadilha irmã, medida nesta mesma sessão: um harness de teste que dependia de
`jq` para montar o comando ficou com a variável **vazia**, executou
`bash -c ""`, e reportou `exit=0` nos três casos. Um teste que passa medindo
nada. O harness agora aborta se o comando extraído vier vazio.

## 4. `stack-code-reviewer.ts` escreve o relatório incondicionalmente

`tooling/scripts/stack-code-reviewer.ts:237` faz `writeFileSync(outFile, ...)`
em toda invocação, e o default de `out-file` é `stack-review-report.json` na
raiz. Num hook por edição isso seriam dezenas de escritas concorrentes do mesmo
arquivo, cada uma com `files=1`, e a última a terminar sobrescreveria o relatório
do commit inteiro. Daí a exigência de `--out-file` apontando para `mktemp -d`
no hook PostToolUse — que é o motivo de ele não ser opcional.

## 5. `--mode` é rótulo, não comportamento

O parâmetro é parseado (`:225`) e impresso (`:238`), e nenhum `if` sobre ele
existe no script. Passar `--mode=post-edit` faria o hook imprimir
`mode=post-edit`, sugerindo um comportamento que não existe. O valor honesto é
`--mode=pre-commit`: é o conjunto de regras que de fato roda.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
