# Convenção: Retrospective Capture — Captura Estruturada de Aprendizados

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Hoje aprendizados pós-atividade são capturados **de forma ad-hoc**:
- `b<N>-result.md` ao final de cada plano multi-task
- Memory files de agents via "decisões Tomadas"
- Nenhum gatilho automático, nenhum formato único

Este padrão institui um **processo explícito** com trigger conditions,
metodologia, e outputs reproduzíveis — sem overhead desproporcional
para tarefas triviais.

## Os 3 Triggers

| # | Tipo | Critério | Auto-detect |
|---|------|----------|-------------|
| **T1** | **Implementação grande** | Plano multi-task (≥ 3 tasks) ou feature com skill/agent novo | `git diff` × N files / N commits |
| **T2** | **Bugfix não-trivial** | Demorou > 30min OU exigiu > 2 rounds de review | review rounds counter |
| **T3** | **Adoção de novo padrão** | Primeiro uso de skill nova + memory marker | explicit flag em `<agent>-memory` |

**Exclusão:** typo fix, dep bump, merge conflict → não disparam.

## Composição (3 estágios)

```text
EXPLORER               →  RETROSPECTIVE-CAPTURE (skill)  →  DOC-WRITER
(coleta evidência)        (triangula + pontua)              (escreve result file)
                                                       +
                                            TASK-MANAGER (paralelo: backlog)
```

## As 3 Perguntas Obrigatórias (da skill)

1. **O que funcionou e DEVE virar regra?** → patterns discovered
2. **O que atrapalhou e DEVE virar anti-pattern?** → friction sources
3. **O que ficou ambíguo e DEVE virar ADR/memory?** → implicit knowledge

## Formato de Saída: `decision-list`

```yaml
- id: R-001
  artifact: "skill|convention|memory|adr|backlog"
  target: ".agents/path/file.md"   # path alvo
  content: |
    Conteúdo proposto (yaml/markdown/skills/ADR body).
  confidence: 0..100                # >= 70 vira proposal
  justification: |
    Por que isso é valioso (referência ao evento que motivou).
  action: "create|update|comment"
```

## Threshold de Confidence

| Faixa | Ação |
|-------|------|
| **≥ 70** | Proposal → vira memory update OR skill/convention new OR ADR OR backlog item |
| **50–69** | Comentário no result file (registrar; re-avaliar em próximas sessões) |
| **< 50**  | Descartar (ruído) |

Heurística de scoring:
- **Repetição** (pattern apareceu 1× ou N×?) — peso alto
- **Impacto** (quantas próximas tasks seriam afetadas?) — peso alto
- **Clareza** (sabemos exatamente onde aplicar?) — peso médio

## Onde fica cada output

| Output | Localização | Tipo |
|--------|-------------|------|
| Result file | [§Destino canônico](#destino-canônico-do-result-file) abaixo | narrativa + linked memories |
| Memory updates | `.agents/memory/<agent>.md` | diff em "Decisões Tomadas" |
| Skill/convention new | `.agents/skills/`, `.agents/specs/conventions/` | PR `feat(retrospective)` |
| ADR | `.docs/adr/NNNN-*.md` | PR com reviewer de arquitetura |
| Backlog item | `TASK-NNN` em quadro do `task-manager` | item priorizado RICE |

## Destino canônico do result file

> **Fonte única do repo.** O result file da retro vive **fora** do repo, no diretório
> de memória da máquina. Esta seção é a **única** declaração desse caminho em
> `.agents/**`; toda outra referência aponta para cá em vez de repetir. Se você
> encontrou o caminho escrito em outro arquivo, isso é um defeito — corrija para
> um link, não para uma segunda cópia.

O diretório é **derivado do repositório**; não é fixo e não deve ser escrito à mão:

```bash
MEMORY_DIR="${HOME}/.claude/projects/-$(git rev-parse --show-toplevel | sed 's|^/||;s|/|-|g')/memory"

# 1. A derivação aponta para um diretório que existe?
test -d "${MEMORY_DIR}" || { echo "derivação quebrada: ${MEMORY_DIR}" >&2; exit 1; }

# 2. O result file DESTA campanha apareceu nele?
#    `N` não é opcional: sem ele o grep casa qualquer result file que já esteja
#    no diretório e o gate fica verde com ninguém tendo escrito nada.
N=40  # o número desta campanha — quem roda a retro sabe qual é
n_arquivos=$(ls -1 "${MEMORY_DIR}" | grep -cE "^b${N}(-.*)?-result\.md$")
test "${n_arquivos}" -eq 1 \
  || { echo "esperado 1 result file de b${N}, achei ${n_arquivos}" >&2; exit 1; }
```

| Segmento | Origem |
|----------|--------|
| `${HOME}` | home do usuário |
| `projects` | literal do layout do Claude Code |
| `-<slug>` | `git rev-parse --show-toplevel` com `/` → `-` e `/` inicial preservado |
| `memory` | literal |

**Por que `git rev-parse --show-toplevel` e não `pwd`:** o slug descreve o
*repositório*. Um `pwd` rodando de um subdiretório produz um slug diferente, e
`MEMORY_DIR` passa a apontar para um diretório que não existe. O `test -d` acima
existe para separar os dois casos que um `test -f` confundiria: *a derivação
quebrou* e *eu ainda não escrevi o arquivo*. São defeitos opostos — um se
corrige recriando o diretório, o outro escrevendo o arquivo — e um check que
não os distingue leva o autor a reescrever o arquivo no lugar errado até o
`ls` acusar que nada mudou.

**Limitação conhecida: worktree quebra a derivação.** O slug é derivado do
*caminho*, e um worktree é outro caminho para o mesmo repositório. MEDIDO
2026-10-07, do worktree `base-wt-gate-fix`:

    $ git rev-parse --show-toplevel
    /home/leo/Documentos/projetos/base-wt-gate-fix
    # → MEMORY_DIR = …/-home-leo-Documentos-projetos-base-wt-gate-fix/memory
    $ test -d "$MEMORY_DIR"   # → 1, "derivação quebrada"

O `test -d` **pega**, que é o que importa: a retrospectiva não passa por
acúmulo de outro repo, ela falha. Mas quem rodar a retro de dentro de um
worktree tem de rodar o gate do checkout principal, ou exportar `MEMORY_DIR`
apontando para lá. Registrado porque a mensagem "derivação quebrada" parece
apontar config quebrada, e a causa é estar no lugar certo do reposito errado.

**Por que não `test -f "${MEMORY_DIR}/<N>-result.md"`:** esta versão anterior
não verificava nada, por dois defeitos independentes. O `<N>` é um placeholder —
rodada literalmente, ela testa um arquivo chamado `<N>-result.md`, que não existe,
e **sai 1 sempre** (MEDIDO 2026-10-06: `exit=1`, mesmo com a derivação
correta). E mesmo com `<N>` preenchido, ela é tautológica: confirma a existência
de um arquivo que você acabou de escrever, e é cega para os dois defeitos que
importam — o arquivo no diretório errado, e o nome que nenhum consumidor
reconhece.

**Por que `-eq 1` e não `≥ 1`:** duas respostas para a mesma campanha não são
redundância, são ambiguidade — um consumidor que indexa por `b40` não sabe qual
das duas ler. E `grep -cE` conta **linhas**: um `grep` que não casa nada devolve
saída vazia e `0` no exit, então um critério escrito como "sem saída" passa
vacuamente (a forma `criterion-inert-on-empty-set` de `guard-classes.md`).

**O nome do arquivo é a parte que o gate não decide.** O padrão acima aceita
qualquer `b<N>…-result.md`, incluindo sufixo descritivo
(`b40-claims-envelhecem-na-memoria-result.md`) e campanha combinada
(`b5-b6-result.md` casa em `b5` e em `b6`). Isso é deliberado: uma regra que
exigisse o nome exato não teria o que reprovar em quem já tem um nome melhor, e
o custo de impor um formato é maior que o de conviver com a variação. O que
**não** é negociável é conter `b<N>` e terminar em `-result.md` — sem isso o
arquivo não é localizável por nenhum consumidor.

**O `N` sem o qual o gate não mede nada.** A versão intermediária —
`ls -1 "${MEMORY_DIR}" | grep -E '^b[0-9]+.*-result\.md$'` — era verde por
acúmulo: ela casa **qualquer** result file que já esteja no diretório, então o
gate saía 0 sem esta retrospectiva ter escrito nada. É a mesma classe do
`skipped` que se confunde com aprovação, uma geração adiante: um critério que
mede *"o diretório tem result file"* quando o que ele promete é *"esta campanha
tem result file"*. O mesmo comando também não enxerga um `b24` faltando — a
numeração tem buraco e nenhum check acima o vê.

**Não ponha a contagem aqui.** Ela envelhece a cada campanha, e este arquivo é
lido como verdade; um número nesse lugar é uma claim de classe 7 que o próximo
a abrir vai tratar como medida. Meça na hora:

```bash
ls -1 "${MEMORY_DIR}" | grep -cE '^b[0-9]+.*-result\.md$'
```

**O alcance do `b<N>`: alguns result files ficam fora dele.** O padrão exige que o
nome comece em `b<N>`, e existem campanhas cujo result file não começa assim
(`ci-robustness-plan-result.md`, `guard-classes-plan-result.md`,
`guard-classes-implementation-result.md`). São campanhas reais que nenhum gate
desta convenção alcança. A diferença entre os dois conjuntos mede-se na hora:

```bash
ls -1 "${MEMORY_DIR}" | grep -cE 'result\.md$'                          # total
ls -1 "${MEMORY_DIR}" | grep -cE '^b[0-9]+.*-result\.md$'               # dentro do padrão
ls -1 "${MEMORY_DIR}" | grep -E 'result\.md$' | grep -vE '^b[0-9]+'      # fora, nomeados
```

É limitação conhecida e aceita — o gate promete o que a retro escreve, não
inventariar o histórico inteiro. O que não é aceitável é contar os dois
conjuntos por um `grep` sem filtro e chamar o total de "result files da
campanha".

## Comandos / Triggers

```bash
# Manual dispatch
"capture learnings from this work"
"retrospective on <task-id>"
"post-mortem from b<N>"

# Auto (futuro)
# - husky post-commit com diff size > N
# - workflow `review-and-fix-after-each-task` quando review foi ≥ 2 rounds
```

## Quando NÃO aplicar

- Typo fix / dep bump / merge conflict
- Doc-only patches sem decisão arquitetural
- Quando o plano ainda está em curso (executar retrospectiva quando
  review+fix já foi aprovado)
- Como substituto para `task-mode` (gestão de backlog sem retrospectiva)

## Cross-references

- Skill: [`.agents/skills/retrospective-capture/SKILL.md`](../../skills/retrospective-capture/SKILL.md)
- Workflow: [`.agents/workflows/retrospective-mode.md`](../../workflows/retrospective-mode.md)
- Memória da skill: [`.agents/skills/retrospective-capture/MEMORY.md`](../../skills/retrospective-capture/MEMORY.md)
- Convenção relacionada: [`.agents/specs/conventions/evolucao-agents.md`](./evolucao-agents.md) (como memories são mantidas)
- Regra de tamanho: [`.agents/specs/conventions/tamanho-e-revisao.md`](./tamanho-e-revisao.md)
- AGENTS.md §6 (índice de convenções)
