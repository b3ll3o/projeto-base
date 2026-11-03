> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> Os blocos são **do upstream, verbatim**; a prosa que o agent precisa entender
> é esta.

# Consultar o grafo (`query`)

Carregue esta referência quando o usuário faz uma pergunta contra um grafo que
**já existe**, ou roda `/graphify query`. O núcleo do `query` do graphify
responde a pergunta a partir do grafo — sem reconstruir nada.

**Dois modos de travessia — escolha pela pergunta:**

| Modo | Flag | melhor para |
|------|------|-------------|
| BFS (padrão) | _(nenhuma)_ | "com o que X se conecta?" — contexto amplo, vizinhos mais próximos primeiro |
| DFS | `--dfs` | "como X chega a Y?" — rastreia uma cadeia ou caminho de dependência específico |

**Primeiro confirme que o grafo existe:**

```bash
$(cat graphify-out/.graphify_python) -c "
from pathlib import Path
if not Path('graphify-out/graph.json').exists():
    print('ERROR: No graph found. Run /graphify <path> first to build the graph.')
    raise SystemExit(1)
"

Se falhar, **pare** e diga ao usuário para rodar `/graphify <path>` primeiro.

## Passo 0 — expansão da consulta (OBRIGATÓRIA antes da travessia)

O `query` do graphify casa nós por **substring case-folded + IDF** — não há
stemming, sinônimos nem casamento entre idiomas. Uma pergunta com palavras
diferentes das do grafo volta como ruído.

Conserte isso **sem inventar tokens**, expandindo a consulta contra o
vocabulário real do grafo primeiro:

1. Extraia o vocabulário dos rótulos dos nós:

```bash
$(cat graphify-out/.graphify_python) -c "
import json, re
from pathlib import Path
data = json.loads(Path('graphify-out/graph.json').read_text(encoding='utf-8'))
vocab = set()
for n in data['nodes']:
    for c in re.findall(r'[^\W\d_]+', n.get('label','') or '', re.UNICODE):
        parts = re.findall(r'[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+', c) or [c]
        for p in parts:
            t = p.lower()
            if 3 <= len(t) <= 30:
                vocab.add(t)
Path('graphify-out/.vocab.txt').write_text('\n'.join(sorted(vocab)), encoding='utf-8')
print(f'vocab: {len(vocab)} tokens')
"

2. Leia `graphify-out/.vocab.txt`. Então, para a pergunta do usuário, escolha
   **até 12 tokens desta lista exata** que casem semanticamente:

   - Você **tem** que escolher só tokens presentes no arquivo de vocabulário.
     **Não invente tokens.**
   - Se um conceito da pergunta não tiver token plausível no vocabulário,
     **pule** — não substitua por um quase-sinônimo vindo da memória de
     treino.
   - Se **nenhum** token do vocabulário casar, devolva uma lista vazia e diga
     ao usuário que o corpus não tem vocabulário relevante para a pergunta.
   - **Traduza entre idiomas:** "autenticacao" → procure `auth`, `credential`,
     `token`, `security` **SE** estiverem no vocabulário.
   - **Morfologia:** "handlers" mapeia para `handler` **SE** estiver no
     vocabulário; "todos" mapeia para `todo` **SE** estiver.

3. **Imprima a seleção explicitamente** ao usuário antes de rodar a consulta,
   para que a expansão seja auditável:

```
Query expanded to (from graph vocab, N tokens): [token1, token2, ...]

Se a lista vier vazia, **diga isso claramente e pare** — não siga para a
travessia.

## Passo 1 — a travessia

Monte a **string expandida** juntando os tokens escolhidos com espaços. Use
essa string como `QUESTION` abaixo — **não** a pergunta original.

Prefira a CLI quando ela está instalada:

```bash
graphify query "QUESTION"
# or: graphify query "QUESTION" --dfs --budget 3000

Se a CLI não estiver disponível, carregue `graphify-out/graph.json` e rode a
travessia inline:

```bash
$(cat graphify-out/.graphify_python) -c "
import sys, json
from networkx.readwrite import json_graph
from pathlib import Path

data = json.loads(Path('graphify-out/graph.json').read_text(encoding='utf-8'))
G = json_graph.node_link_graph(data, edges='links')

question = 'QUESTION'
mode = 'MODE'  # 'bfs' or 'dfs'
terms = [t.lower() for t in question.split() if len(t) >= 3]  # match the vocab threshold; keeps api/jwt/ios (#1392)

# Find best-matching start nodes
scored = []
for nid, ndata in G.nodes(data=True):
    label = ndata.get('label', '').lower()
    score = sum(1 for t in terms if t in label)
    if score > 0:
        scored.append((score, nid))
scored.sort(reverse=True)
start_nodes = [nid for _, nid in scored[:3]]

if not start_nodes:
    print('No matching nodes found for query terms:', terms)
    sys.exit(0)

subgraph_nodes = set()

if mode == 'dfs':
    # DFS: follow one path as deep as possible before backtracking.
    # Depth-limited to 6 to avoid traversing the whole graph.
    visited = set()
    stack = [(n, 0) for n in reversed(start_nodes)]
    while stack:
        node, depth = stack.pop()
        if node in visited or depth > 6:
            continue
        visited.add(node)
        subgraph_nodes.add(node)
        for neighbor in G.neighbors(node):
            if neighbor not in visited:
                stack.append((neighbor, depth + 1))
else:
    # BFS: explore all neighbors layer by layer up to depth 3.
    frontier = set(start_nodes)
    subgraph_nodes = set(start_nodes)
    for _ in range(3):
        next_frontier = set()
        for n in frontier:
            for neighbor in G.neighbors(n):
                if neighbor not in subgraph_nodes:
                    next_frontier.add(neighbor)
        subgraph_nodes.update(next_frontier)
        frontier = next_frontier

# Traversal chooses the nodes; collect relationships separately so seed edges,
# cycles, and cross-links are not lost just because both endpoints were visited.
# Taking the induced subgraph also keeps edges to nodes beyond the depth limit
# out of the result. data=True retains each edge's own attributes, including
# distinct parallel relationships in a MultiGraph.
subgraph_edges = [
    (u, v, edge_data)
    for u, v, edge_data in G.subgraph(subgraph_nodes).edges(data=True)
    if u != v
]

# Token-budget aware output: rank by relevance, cut at budget (~4 chars/token)
token_budget = BUDGET  # default 2000
char_budget = token_budget * 4

# Score each node by term overlap for ranked output
def relevance(nid):
    label = G.nodes[nid].get('label', '').lower()
    return sum(1 for t in terms if t in label)

ranked_nodes = sorted(subgraph_nodes, key=relevance, reverse=True)

lines = [f'Traversal: {mode.upper()} | Start: {[G.nodes[n].get(\"label\",n) for n in start_nodes]} | {len(subgraph_nodes)} nodes']
for nid in ranked_nodes:
    d = G.nodes[nid]
    lines.append(f'  NODE {d.get(\"label\", nid)} [src={d.get(\"source_file\",\"\")} loc={d.get(\"source_location\",\"\")}]')
for u, v, edge_data in subgraph_edges:
    if u in subgraph_nodes and v in subgraph_nodes:
        lines.append(f'  EDGE {G.nodes[u].get(\"label\",u)} --{edge_data.get(\"relation\",\"\")} [{edge_data.get(\"confidence\",\"\")}]--> {G.nodes[v].get(\"label\",v)}')

output = '\n'.join(lines)
if len(output) > char_budget:
    output = output[:char_budget] + f'\n... (truncated at ~{token_budget} token budget - use --budget N for more)'
print(output)
"

O fallback inline:

1. Ache os 1-3 nós cujo rótulo casa melhor com os tokens expandidos.
2. Rode a travessia adequada a partir de cada nó inicial.
3. Leia o subgrafo — rótulos dos nós, relações das arestas, etiquetas de
   confiança, localizações de origem.
4. Responda usando **apenas** o que o grafo contém. Cite `source_location` ao
   citar um fato específico.
5. Se o grafo não tiver informação suficiente, **diga isso** — não invente
   arestas.

Substitua `QUESTION` pela string **expandida**, `MODE` por `bfs` ou `dfs` e
`BUDGET` pelo orçamento de tokens (padrão `2000`).

## Passo 2 — devolver a resposta para o grafo

Depois de escrever a resposta, salve-a de volta no grafo, para que as consultas
futuras melhorem. Inclua os tokens expandidos dentro do `--answer`, para que a
expansão fique registrada:

```bash
$(cat graphify-out/.graphify_python) -m graphify save-result --question "ORIGINAL_QUESTION" --answer "ANSWER" --type query --nodes NODE1 NODE2

### A memória de trabalho (o laço que se melhora)

Acrescente um `--outcome`, para que as sessões futuras aprendam com esta:

- `useful` — os nós citados responderam bem à pergunta (viram **fontes
  preferidas**).
- `dead_end` — a pergunta/caminho não levou a lugar algum; não refaça na
  próxima vez.
- `corrected` — a resposta salva estava errada; o `--correction` registra o
  que estava certo.

No **começo** do trabalho com o grafo, atualize e leia as lições: rode
`graphify reflect --if-stale` (barato, determinístico, sem LLM).

---

O `/graphify path` e o `/graphify explain` estão em
[`path-and-explain.md`](./path-and-explain.md).
