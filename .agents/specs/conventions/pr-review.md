---
name: pr-review
version: 1.0
updated: 2026-11-17
maintainer: orchestrator
description: "Regra de revisão de PR — todo PR precisa de pelo menos um comentário de revisão, e a revisão é orquestrada: classificar o diff, despachar um specialist por parte alterada, consolidar e comentar no PR."
---

# Convenção: pr-review (revisão de PR)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md). O **processo**
> passo a passo está em [`pr-review-mode.md`](../../workflows/pr-review-mode.md);
> o **instrumento** que cobra a regra está em
> [`tooling/scripts/pr-review-gate.ts`](../../../tooling/scripts/pr-review-gate.ts).

## A regra

> **Todo PR aberto precisa de pelo menos um comentário de revisão antes de ser
> mergeado.**

Sem comentário de revisão, o PR não passa no check `review-comment` (job do
workflow [`pr-review.yml`](../../../.github/workflows/pr-review.yml)) e, com ele
no ruleset `master`, **o merge fica bloqueado**.

O comentário de revisão é o que o **processo orquestrado** publica: a
consolidação dos achados de todos os specialists despachados para as partes do
diff. Ele carrega o marcador:

```
<!-- pr-review -->
```

O marcador é o que separa "a revisão do processo" de "alguém digitou uma frase
no PR". Sem ele, o gate não vê nada — e o gate não pode adivinhar.

## Por que a regra existe

Três fatos medidos no repo, nenhum deles opinativo:

1. **O `quality` é o único check required** (ruleset `master`, id `23853096`).
   Antes desta regra, `required_approving_review_count = 0` e
   `required_reviewers = []`: **nada** obrigava uma revisão. O PR #171 entrou
   com 63 arquivos e 5.298 linhas adicionadas sem um único comentário de
   revisão.
2. **O roteamento existia, mas não era executado.** `tooling/scripts/review-router.ts`
   emite o despacho de reviewers a partir do diff (MEDIDO no PR #171: 9
   reviewers, 11 evidências de `path_glob`), e o despacho terminava em
   `console.log` — `grep -rnE 'review:route' -- .husky .github` devolve
   **vazio**.
3. **A revisão humana não escala com o tamanho do PR.** A regra do repo é que
   a revisão é feita por agent: o que faltava era o **gatilho** e o
   **instrumento**.

## O que a regra NÃO é

| Não é | Por quê |
|---|---|
| Um veredito de aprovação | O gate mede que **a revisão aconteceu**, não que ela aprovou. O conteúdo do comentário é humano (e de agent). |
| Uma aprovação de outro autor | Num repo de contribuidor único isso seria uma regra que **nunca pode passar** (classe 5 de [`guard-classes.md`](./guard-classes.md)). O gate mede a existência da revisão, não a independência do revisor. |
| Uma substituição da revisão humana | O processado é **orquestrado por agents** e o resultado é publicado no PR para quem decide o merge. |
| Um check do `preflight` | O `preflight` roda em **qualquer push** e não tem PR. Um gate de PR no `preflight` reprovaria todo push de branch. O gate vive no workflow `pr-review.yml`, que escuta `pull_request_review`. |

## O que conta como comentário de revisão

O gate lê 3 canais da API do GitHub e aceita o que carrega o marcador
`<!-- pr-review -->` em qualquer um deles:

| Canal | Endpoint | Quem produz |
|---|---|---|
| Review do PR | `GET /repos/{o}/{r}/pulls/{n}/reviews` | `gh pr review --comment` / `POST /pulls/{n}/reviews` |
| Comentário inline | `GET /repos/{o}/{r}/pulls/{n}/comments` | revisão de linha do diff |
| Comentário de conversa | `GET /repos/{o}/{r}/issues/{n}/comments` | `gh pr comment` |

O **corpo do PR** não conta: é do autor, e a regra é sobre a revisão.

## Os 3 estados do gate

O gate tem **três** estados, e nenhum deles é "verde por ausência":

| Estado | Quando | Saída |
|---|---|---|
| **verde** | ≥ 1 comentário com o marcador | exit 0 |
| **vermelho** | 0 comentários com o marcador | exit 1, com o motivo e o comando do conserto |
| **não verificável** | não deu para ler a API (sem PR, sem token, rede caída) | exit 1, com o motivo — **nunca exit 0** |

O terceiro estado é o ponto: `pr-refresh-gate` já mediu que **pular com `0`
é verde**, e é o pior estado possível num gate de PR — o PR nasce inativo e
ninguém é avisado. Aqui o gate não pula: ele diz que não mediu.

⚠️ **E O "não verificável" DIZ O MOTIVO, que são DOIS.** MEDIDO 2026-11-18 na
5ª revisão do PR #171: o número de uma ISSUE respondia "não consegui ler a
API", e o conserto indicado era **autenticar o `gh`** — que já estava
autenticado, e que não era a causa. O gate resolve o PR antes de ler os
comentários, e um **404** é "o número {n} não é um PR" (o número é de uma
issue), com o conserto próprio: conferir o número.

⚠️ E o repositório vem do `--repo=owner/nome`, do `GITHUB_REPOSITORY` (CI) ou
do **`origin` do git** — o último é o que faz o comando documentado
(`pnpm pr:review-check --pr=<n>`) funcionar de dentro do clone.

## Os dois instrumentos

| Instrumento | Onde | O que cobra |
|---|---|---|
| `pr-review-gate` | `tooling/scripts/pr-review-gate.ts` | A regra: o PR tem ≥ 1 comentário de revisão. Roda no CI (workflow `pr-review.yml`). |
| `check-pr-review-wired` | `.tooling/scripts/ci/check-pr-review-wired.ts` | O **processo está ligado**: o workflow existe, invoca o gate, o gate está no `package.json`, a convenção está indexada nos **dois** índices, e o workflow escuta `pull_request_review`. |

O segundo existe porque a classe 1 de [`guard-classes.md`](./guard-classes.md)
é "condição inalcançável": um `review-comment` que **ninguém exige** no ruleset
é um check que roda e não bloqueia nada. E o terceiro — o processo escrito em
prosa que ninguém executa — é o estado que o repo já mediu: 9 reviewers
despachados para um `console.log`.

## Gatilho: quando a revisão é disparada

| Evento | O que acontece |
|---|---|
| PR **aberto** / **reaberto** / **sincronizado** | o workflow `pr-review.yml` roda o gate → **vermelho** (não há revisão ainda) |
| **Review submetida** (`pull_request_review`) | o workflow roda de novo → **verde** se o marcador estiver lá |
| Branch avançou depois da revisão | o gate volta a **vermelho**: o PR mudou depois de revisado |

O evento `pull_request_review` é o que fecha o laço. Sem ele, o gate ficaria
vermelho para sempre depois da primeira execução — posting a revisão não
dispara o `ci.yml`, que só escuta `pull_request` (`opened`, `synchronize`,
`reopened`, `edited`).

## O que o comentário publicado tem de conter

O gate mede o **marcador**; o conteúdo é o que faz a revisão valer. O formato
canônico está em [`pr-review-mode.md`](../../workflows/pr-review-mode.md) §O
comentário consolidado:

1. o marcador `<!-- pr-review -->`;
2. a lista de **partes do diff** analisadas e o **specialist** de cada uma;
3. os achados, com severidade, `arquivo:linha`, impacto e conserto;
4. o que **não** foi verificado.

O item 4 não é cortesia: um relatório que não diz o que ficou de fora lê como
"não tinha nada". É a mesma lição de [`guard-classes.md`](./guard-classes.md) —
"quem não pode ser comparado é reclassificado, nunca apagado".

## Exceções

Nenhuma. PR de hotfix também passa por revisão — o que muda é o **prazo** do
merge, não a existência do comentário.

## Referências

- [`pr-review-mode.md`](../../workflows/pr-review-mode.md) — o processo passo a passo
- [`review-routing.md`](./review-routing.md) — a matriz que decide quem revisa o quê
- [`git-workflow.md`](./git-workflow.md) — branch, PR e merge
- [`guard-classes.md`](./guard-classes.md) — as 7 classes de guard
- [`docs/fluxo-desenvolvimento.md`](../../../docs/fluxo-desenvolvimento.md) — o fluxo completo
