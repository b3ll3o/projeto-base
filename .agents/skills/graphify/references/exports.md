# Exportações extras e benchmark

> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> Os blocos são **do upstream, verbatim**; a prosa que o agent precisa entender
> é esta.

Carregue esta referência quando o usuário passou uma das flags de exportação
(`--wiki`, `--neo4j`, `--neo4j-push`, `--falkordb`, `--falkordb-push`, `--svg`,
`--graphml`, `--mcp`), ou quando o corpus é grande o bastante para o benchmark
de redução de tokens. **Cada passo roda só pela flag dele.**

## Passo 6 — HTML (sempre, salvo `--no-viz`) e vault do Obsidian

O HTML é **sempre** gerado, salvo `--no-viz`. O vault do Obsidian só sai se
`--obsidian` foi passado explicitamente — ele gera **um arquivo por nó**, então
não é gratuito.

```bash
graphify export obsidian
# ou com o diretorio customizado:
graphify export obsidian --dir ~/vaults/meu-projeto
```

```bash
graphify export html  # agrega automaticamente na visao de comunidade se o grafo passar de 5000 nos
# ou:
graphify export html --no-viz
```

## Passo 6b — Wiki (só com a flag `--wiki`)

**Só rode este passo se `--wiki` foi dado explicitamente.** Rode **antes** do
passo 9 (a limpeza), para que `.graphify_labels.json` ainda exista.

```bash
graphify export wiki
```

## Passo 7 — Neo4j (só com `--neo4j` ou `--neo4j-push`)

**Com `--neo4j`** — gera um arquivo Cypher para importar na mão:

```bash
graphify export neo4j
```

**Com `--neo4j-push <uri>`** — empurra direto para uma instância Neo4j no ar.
Peça as credenciais ao usuário se não foram dadas:

```bash
graphify export neo4j --push bolt://localhost:7687 --user neo4j --password PASSWORD
```

A URI padrão é `bolt://localhost:7687` e o usuário padrão é `neo4j`. Usa MERGE —
seguro para rodar de novo sem criar duplicatas.

## Passo 7a — FalkorDB (só com `--falkordb` ou `--falkordb-push`)

**Com `--falkordb`** — gera um arquivo Cypher. As instruções são OpenCypher, mas
o `GRAPH.QUERY` do FalkorDB roda **um statement por vez** (não há import de
script em lote como o `cypher-shell` do Neo4j), então prefira `--falkordb-push`
para carregar o grafo. Use o `--falkordb` só quando quiser o artefato portátil
`cypher.txt`:

```bash
graphify export falkordb
```

**Com `--falkordb-push <uri>`** — empurra direto para uma instância FalkorDB no
ar. As credenciais são opcionais; só peça ao usuário se a instância exigir:

```bash
graphify export falkordb --push falkordb://localhost:6379
```

A URI padrão é `falkordb://localhost:6379` (o esquema é informativo — `redis://`
ou um `host:port` puro também funcionam), a autenticação é opcional e o grafo
de destino é `graphify` por padrão. Usa MERGE — seguro para rodar de novo sem
criar duplicatas.

## Passo 7b — SVG (só com a flag `--svg`)

```bash
graphify export svg
```

## Passo 7c — GraphML (só com a flag `--graphml`)

```bash
graphify export graphml
```

## Passo 7d — servidor MCP (só com a flag `--mcp`)

```bash
$(cat graphify-out/.graphify_python) -m graphify.serve graphify-out/graph.json
```

Sobe um servidor MCP por stdio que expõe as ferramentas `query_graph`,
`get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats` e
`shortest_path`. Adicione-o ao Claude Desktop (ou a qualquer orquestrador de
agent compatível com MCP) para que outros agents consultem o grafo ao vivo.

## Benchmark de redução de tokens

Roda quando `total_words` passa de 5.000. Mede quanto contexto o grafo
economiza em comparação com ler os arquivos. É o único passo desta
referência que **não** depende de flag.
