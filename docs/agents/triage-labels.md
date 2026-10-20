# Triage Labels

> Gerado por `/setup-matt-pocock-skills` e **versionado desde então**. Re-rodar a skill
> sobrescreve este arquivo pelo template em inglês. Para trocar os rótulos, edite a coluna
> "Label no nosso tracker" e crie o label com `gh label create`.

As skills falam em papéis canônicos de triagem. Este arquivo mapeia cada papel para a
string de label realmente usada no tracker deste repo.

A skill `triage` define **sete** papéis: **duas categoria** e **cinco estado**. Toda issue
triada deve carregar **exatamente uma categoria e um estado**.

## Categoria (o que é)

| Label em mattpocock/skills | Label no nosso tracker | Significado                        |
| -------------------------- | ---------------------- | ---------------------------------- |
| `bug`                      | `bug`                  | Algo está quebrado                 |
| `enhancement`              | `enhancement`          | Feature nova ou melhoria           |

## Estado (onde está)

| Label em mattpocock/skills | Label no nosso tracker | Significado                                 |
| -------------------------- | ---------------------- | ------------------------------------------- |
| `needs-triage`             | `needs-triage`         | Maintainer precisa avaliar esta issue       |
| `needs-info`               | `needs-info`           | Aguardando mais informação de quem reportou |
| `ready-for-agent`          | `ready-for-agent`      | Totalmente especificada, pronta para agent  |
| `ready-for-human`          | `ready-for-human`      | Exige implementação humana                  |
| `wontfix`                  | `wontfix`              | Não será trabalhada                         |

As sete labels existem no tracker (`gh label list` confirma 7/7), e cada papel usa o nome
canônico como string. Se dois estados conflitarem, sinalize e pergunte ao maintainer
antes de agir.

## `bug` (categoria) não é `type:bug` (domínio)

Os dois existem no tracker e são eixos diferentes:

- **`bug`** é a **categoria de triagem**. É o que a skill `triage` aplica. Vem do
  defaults do GitHub, sem prefixo.
- **`type:bug`** é a **família de domínio** do `finding-orchestrator`, junto de
  `severity:` e `agent:`. É o que um finding de agente carrega.

Uma issue triada normalmente leva os dois: `bug` + `needs-triage` diz *o que é e em que
estado está*; `type:bug` + `severity:p1` diz *de que trata e quão grave é*. Jamais
confunda um pelo outro: se a instrução pedir "aplique a categoria bug", o rótulo é
`bug`, sem prefixo.

Para trocar o mapeamento, edite a coluna "Label no nosso tracker" e crie o label novo no
tracker. O setup do plugin (`/setup-matt-pocock-skills`) escreve este arquivo mas **não**
cria os labels: se trocar a tabela, `gh label create` na mão.
