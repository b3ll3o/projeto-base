# Issue tracker: GitHub

> Gerado por `/setup-matt-pocock-skills` e **versionado desde então**. Re-rodar a skill
> sobrescreve este arquivo pelo template em inglês e leva junto os fallbacks medidos
> (`Part of #<n>`, `type:bug` vs `bug`). Para trocar o tracker, edite aqui.

Issues e specs deste repo vivem nas **GitHub Issues** de `b3ll3o/projeto-base`.
Todas as operações usam a CLI `gh`, que infere o repo de `git remote -v`.

## Convenções

- **Criar**: `gh issue create --title "..." --body "..."`. Para corpo longo, escreva o
  arquivo e use `--body-file <path>`: heredoc no shell quebra calado.
- **Ler**: `gh issue view <n> --json number,title,body,labels,comments`
- **Listar**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, com `--label` / `--state` quando filtrar
- **Sub-issue**: `gh issue create --parent <pai> ...` ou `gh issue edit <pai> --add-sub-issue <filha>`,
  **mas ambos exigem `gh` 2.94+** — confira a sua com `gh --version`, e se for menor use a API:
  `gh api --method POST repos/<owner>/<repo>/issues/<pai>/sub_issues -F sub_issue_id=<db-id-da-filha>`
  (o `<db-id>` é o database id numérico, obtido com `gh api repos/<owner>/<repo>/issues/<n> --jq .id`).
  O endpoint está habilitado neste repo: `GET .../issues/111/sub_issues` responde `[]`.
  Sem sub-issues, ponha `Part of #<pai>` no topo do corpo da filha.
- **Comentar**: `gh issue comment <n> --body "..."`
- **Rotular**: `gh issue edit <n> --add-label "..."` / `--remove-label "..."`
- **Fechar**: `gh issue close <n> --comment "..."`

## Vocabulário de rótulos do repo

As três famílias do `finding-orchestrator` são as do domínio; os papéis de triagem estão
em [`triage-labels.md`](./triage-labels.md). Para o inventário atual, meça:
`gh label list --limit 100 --json name --jq '.[].name'`.

| Família     | Valores                                                                                                                                                              | Quando                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `severity:` | `p0` (bloqueia produção), `p1` (impacto mensurável), `p2` (cosmético/teórico)                                                                                         | obrigatória em qualquer issue de bug                                                    |
| `type:`     | `bug`, `regression`, `gap`, `drift`                                                                                                                                    | obrigatória; `gap` = lacuna vs convenção/ADR, `drift` = inconsistência cross-doc/config  |
| `agent:`    | `code-reviewer`, `security-auditor`, `prisma-db-specialist`, `docker-prod-specialist`, `openapi-contract-specialist`, `otelcol-infra-specialist`, `release-versioning-specialist` | registra a autoria do achado                                                             |

**Cuidado com `bug`**: existe um label chamado `bug` sem prefixo (categoria de triagem,
detalhada em [`triage-labels.md`](./triage-labels.md)) ao lado do `type:bug` desta tabela.
Para família de domínio use sempre a forma com prefixo; o `bug` sem prefixo pertence à
triagem e significa outra coisa.

Corpos de issue e spec são escritos em **pt-BR** (`.agents/specs/conventions/idioma.md`).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Mude para `yes` se este repo passar a tratar PRs
externos como pedidos de funcionalidade; `/triage` lê esta flag.)_

Issue e PR vivem em trilhas separadas: PR entra por branch + review
(`stack-code-reviewer` + `doc-sync` no pre-commit), não pela fila de triagem.

- **Ler um PR**: `gh pr view <n> --comments` e `gh pr diff <n>`
- **Listar PRs externos para triagem**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`
- **Comentar / rotular / fechar**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`

GitHub compartilha um único espaço de numeração entre issues e PRs: um `#42` solto pode ser
qualquer um dos dois. Resolva com `gh pr view 42` e caia para `gh issue view 42` se falhar.

## Quando uma skill pede "publish to the issue tracker"

Crie uma GitHub issue, com `severity:` e `type:`.

## Quando uma skill pede "fetch the relevant ticket"

Leia como em **Ler** acima, mais os ADRs de `docs/adr/` que tocarem a área.

## Wayfinding operations

Usado por `/wayfinder`. O **map** é uma issue cujas **child** issues são os tickets.
Os nomes abaixo são contrato: o `/wayfinder` localiza esta seção pelo título.

- **Map**: uma issue com label `wayfinder:map`, carregando o corpo Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Child ticket**: issue ligada ao map como sub-issue (ver **Sub-issue**). Onde sub-issues não existam, adicione a child à task list no corpo do map e ponha `Part of #<map>` no topo do corpo da child. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Uma vez reivindicada, o ticket é atribuído a quem está conduzindo.
- **Blocking**: as **native issue dependencies** do GitHub, a representação canônica e visível na UI. Adicione a aresta com `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<db-id-do-blocker>`, onde `<db-id>` é o **database id** numérico do blocker (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _não_ o `#number` nem o `node_id`). O GitHub reporta `issue_dependencies_summary.blocked_by` (só blockers abertos, o gate vivo). Sem dependencies, caia para uma linha `Blocked by: #<n>, #<n>` no topo do corpo da child. Um ticket está desbloqueado quando todo blocker está fechado.
- **Frontier query**: liste as children abertas do map (`gh issue list --state open`, escopado às sub-issues / task list do map), descarte as que têm blocker aberto (`issue_dependencies_summary.blocked_by > 0`, ou uma issue aberta na linha `Blocked by`) ou assignee; a primeira na ordem do map vence.
- **Claim**: `gh issue edit <n> --add-assignee @me`, a primeira escrita da sessão.
- **Resolve**: `gh issue comment <n> --body "<resposta>"`, depois `gh issue close <n>`, depois acrescente um ponteiro de contexto (gist + link) ao Decisions-so-far do map.
