> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> Os blocos são **do upstream, verbatim**; a prosa que o agent precisa entender
> é esta.

# Hook de commit e integração nativa com o `AGENTS.md`

Carregue esta referência quando o usuário pediu para instalar o hook de
post-commit ou para ligar o graphify no `AGENTS.md` de um projeto.

## Para o hook de git commit

Instala um hook de post-commit que reconstrói o grafo depois de cada commit.
**Não precisa de processo em segundo plano** — dispara uma vez por commit e
funciona com qualquer editor.

```bash
graphify hook install    # instala
graphify hook uninstall  # remove
graphify hook status     # consulta
```

Depois de cada `git commit`, o hook detecta quais arquivos de código mudaram
(via `git diff HEAD~1`), refaz a extração AST desses arquivos e reconstrói o
`graph.json` e o `GRAPH_REPORT.md`. Mudanças em docs ou imagens são ignoradas
pelo hook — para essas, rode `/graphify --update` à mão.

Se já existir um hook de post-commit, o graphify **acrescenta** a ele em vez de
substituí-lo.

---

## Para a integração nativa com o `AGENTS.md`

Rode uma vez por projeto para deixar o graphify sempre ligado nas sessões do
agent:

```bash
graphify agents install
```

Isso escreve uma seção `## graphify` no `AGENTS.md` local, instruindo o agent
a consultar o grafo antes de responder perguntas sobre o codebase e a
reconstruí-lo depois de mudanças no código. Nenhum `/graphify` manual nas
sessões futuras.

```bash
graphify agents uninstall  # remove a seção
```

```bash
graphify hook install    # install
graphify hook uninstall  # remove
graphify hook status     # check