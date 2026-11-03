> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> Os blocos são **do upstream, verbatim**; a prosa que o agent precisa entender
> é esta.

# Clonar do GitHub e fundir grafos de repositórios diferentes

Carregue esta referência quando o usuário passou uma ou mais URLs
`https://github.com/...`, ou nomeou várias subpastas locais para fundir em um
mesmo grafo.

## Passo 0 — clonar o(s) repositório(s) do GitHub (só se houve URL do GitHub)

**Um repositório:**

```bash
LOCAL_PATH=$(graphify clone <github-url> [--branch <branch>])
# Use LOCAL_PATH as the target for all subsequent steps

**Vários repositórios (grafo entre repositórios):**

```bash
# Clone each repo, run the full pipeline on each, then merge
graphify clone <url1>   # → ~/.graphify/repos/<owner1>/<repo1>
graphify clone <url2>   # → ~/.graphify/repos/<owner2>/<repo2>
# Run /graphify on each local path to produce their graph.json files
# Then merge:
graphify merge-graphs \
  ~/.graphify/repos/<owner1>/<repo1>/graphify-out/graph.json \
  ~/.graphify/repos/<owner2>/<repo2>/graphify-out/graph.json \
  --out graphify-out/cross-repo-graph.json

O graphify clona em `~/.graphify/repos/<owner>/<repo>` e reaproveita os clones
existentes em execuções repetidas. Cada nó do grafo fundido carrega um atributo
`repo` que diz de qual repositório veio.

**Várias subpastas locais (layout de monorepo ou multi-serviço):**

```bash
graphify extract ./core/     # → ./core/graphify-out/graph.json
graphify extract ./service/  # → ./service/graphify-out/graph.json
graphify extract ./platform/ # → ./platform/graphify-out/graph.json
# Add --backend gemini|kimi|openai|deepseek|claude-cli depending on which API key you have set

# Then merge at the project root:
graphify merge-graphs \
  ./core/graphify-out/graph.json \
  ./service/graphify-out/graph.json \
  ./platform/graphify-out/graph.json \
  --out graphify-out/graph.json

O pipeline da skill escreve todas as saídas intermediárias e finais em
`graphify-out/`, no diretório de trabalho atual. Rodar a skill em cada subpasta
e fundir é a alternativa — mas o caminho rápido abaixo assume **um** grafo.

Depois que `graphify-out/graph.json` existe, o caminho rápido assume: qualquer
pergunta sobre o codebase roda `graphify query` direto no grafo fundido — sem
reconstruir.
