---
name: graphify
version: 1.1
updated: 2026-10-29
description: "Grafo de conhecimento do código — transforma uma pasta em um grafo consultável (HTML, JSON para GraphRAG e GRAPH_REPORT.md) e responde perguntas sobre arquitetura, dependências e comunidades. Adaptado de safishamsi/graphify (MIT). Use quando a pergunta for sobre a ESTRUTURA do código e o `graphify-out/` já existir, ou quando o mapa precisar ser construído antes de responder."
---

# Skill: `graphify`

> **Quem invoca:** `explorer` — quando a pergunta é sobre a **estrutura** do
> código (o que se conecta com o quê, quais partes formam um grupo) e o
> `graphify-out/` já existe, ou quando o mapa precisa ser construído antes de
> responder.
>
> **Quando invocar:** "como X se conecta com Y?", "o que depende de quê?",
> "quais partes do sistema formam esta comunidade?" — perguntas que exigem
> **atravessar** o código, não ler três arquivos.
>
> **Não invocar:** para "onde fica a função Y?" (o `explorer` com grep responde
> em segundos); para revisar código (`code-reviewer`); para auditoria
> determinística (as skills `*-audit`); para o **conteúdo** de um arquivo
> (leia o arquivo).

## §1. O que esta skill faz

O `graphify` é uma **CLI externa** (Python) que transforma uma pasta de
arquivos — código, docs, papers, imagens, vídeo — em um **grafo de
conhecimento consultável**. A saída tem três partes:

| saída | para que serve |
|---|---|
| `graphify-out/graph.html` | visualização interativa do grafo |
| `graphify-out/graph.json` | JSON pronto para GraphRAG (consulta por tool) |
| `graphify-out/GRAPH_REPORT.md` | o relatório em linguagem natural (god nodes, conexões surpreendentes, perguntas sugeridas) |

Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
**Adaptado, não vendorizado**: o original é um comando (`/graphify`) de um
plugin de coding agent; aqui é uma skill do padrão do projeto — prosa em
pt-BR, frontmatter próprio, cabeçalho com quem invoca, e o pipeline dividido
em `references/`.

> **A fronteira de idioma é declarada:** a **prosa** — o que o agent precisa
> entender e fazer — é pt-BR. Os **blocos de código** são do upstream,
> verbatim: eles são a implementação da ferramenta, e mexer neles seria
> reescrever o tool para um repo que não o usa. Onde um bloco precisa de
> decisão do agent, a prosa que o acompanha está em pt-BR logo acima dele.

## §2. O caminho rápido (leia antes de qualquer coisa)

**Se `graphify-out/graph.json` já existe, a pergunta é uma CONSULTA, não uma
construção.** Rodar o pipeline de novo é desperdício: minutos de extração e
tokens para recalcular um grafo que já está lá.

```
graphify-out/graph.json existe    → responda com `graphify query "…"`.
                                    NÃO reconstrua.
graphify-out/graph.json não existe → construa (os passos 0-9 abaixo).
```

O detalhamento das consultas está em
[`references/query.md`](./references/query.md).

Se o usuário chamou `--help` ou `-h` (sem outros argumentos), **imprima o
bloco de comandos da §5 e pare.** Não rode nenhum comando, não detecte
arquivos, não assuma o caminho `.`.

## §3. A pré-condição: a CLI

O `graphify` **não faz parte do repositório** — é uma ferramenta externa. O
passo 1 do pipeline detecta o interpretador certo (uv tool, pipx, venv,
instalação direta) e grava o caminho em `graphify-out/.graphify_python`;
**todos os blocos seguintes usam `$(cat graphify-out/.graphify_python)`**, nunca
`python3` solto. O bloco completo está em
[`references/pipeline/1-instalacao.md`](./references/pipeline/1-instalacao.md).

**Medido em 2026-11-05: a CLI ESTÁ instalada neste ambiente** — `which graphify`
acha o binário, e o pipeline rodou de verdade: `graphify update .` reconstruiu
o grafo em 5.880 nós, 12.195 arestas e 436 comunidades (a extração **estrutural**
é determinística e de graça — a semântica é a que depende de chave). ⚠️ O
`import graphify` **continua** falhando: a CLI é um executável, não um módulo
Python importável — e `which` é o teste certo.

**Medido em 2026-10-29 (supersedido pela medição de 2026-11-05): a CLI não
estava instalada** — `which graphify` não achava o binário. Sem a CLI, esta skill
não roda: o que ela oferece ao `explorer` é o **protocolo** (quando usar, o que
pedir, como verificar), não a execução local. **Gatilho para rever esta
medição**: `which graphify` não acha o binário.

**A chave de API é OPCIONAL.** O grafo não precisa de nenhuma: a extração
**estrutural** (AST) é determinística e de graça. A extração **semântica** usa
`GEMINI_API_KEY`/`GOOGLE_API_KEY` **se** estiverem no ambiente; sem elas, o
próprio agent que roda a sessão é o modelo, ou o grafo fica só com as arestas
estruturais. **Nunca peça uma chave ao usuário e nunca trave por causa de
uma.** O `graphify` **não** lê `ANTHROPIC_API_KEY` nem `OPENAI_API_KEY`.

## §4. Os passos

Siga na ordem. Não pule passo. Cada passo tem o bloco executável em
`references/pipeline/`.

| # | passo | o que faz | o bloco |
|---|---|---|---|
| 0 | repositório GitHub e merge multi-pasta | clona a URL e/ou une vários diretórios em um grafo | [`github-e-merge.md`](./references/github-and-merge.md) |
| 1 | garantir o `graphify` instalado | detecta o interpretador e grava `graphify-out/.graphify_python` | [`1-instalacao.md`](./references/pipeline/1-instalacao.md) |
| 2 | detectar os arquivos | classifica em `code`/`document`/`paper`/`image`/`video` e **avisa** quando o corpus é grande (>2M palavras ou >500 arquivos) | [`2-deteccao.md`](./references/pipeline/2-deteccao.md) |
| 2.5 | vídeo e áudio | transcreve com Whisper (só quando há vídeo) | [`transcribe.md`](./references/transcribe.md) |
| 3 | extrair entidades e relações | **parte A**: AST (determinístico, grátis) · **parte B**: semântica (subagentes em paralelo, com cache) · **parte C**: merge | [`3a-extracao-ast.md`](./references/pipeline/3a-extracao-ast.md) · [`3b-extracao-semantica.md`](./references/pipeline/3b-extracao-semantica.md) · [`3c-merge.md`](./references/pipeline/3c-merge.md) |
| 4 | construir, agrupar e analisar | monta o grafo, roda a detecção de comunidades | [`4-construcao.md`](./references/pipeline/4-construcao.md) |
| 4.5 | **health check do grafo** | diagnóstico **read-only** da integridade: colapso de arestas, nós pendurados, órfãos | [`4.5-health-check.md`](./references/pipeline/4.5-health-check.md) |
| 5 | rotular as comunidades | um nome de 2-5 palavras por comunidade | [`5-rotulos.md`](./references/pipeline/5-rotulos.md) |
| 6 | exportar o HTML (+ vault do Obsidian, só com `--obsidian`) | o HTML é **sempre** gerado, salvo `--no-viz` | §5 e [`exports.md`](./references/exports.md) |
| 6b-8 | wiki, Neo4j, FalkorDB, SVG, GraphML, MCP, benchmark | rodam **só** com a flag correspondente | [`exports.md`](./references/exports.md) |
| 9 | manifesto, custo, limpeza e relatório | grava o manifesto, anota o custo em tokens, limpa os temporários e escreve o `GRAPH_REPORT.md` | [`9-manifesto.md`](./references/pipeline/9-manifesto.md) |

### §4.1 O passo 3 é o caro — e ele tem regra própria

- **A parte A (AST) e a parte B (semântica) rodam em paralelo.** A AST é
  determinística e rápida; começa enquanto os subagentes de semântica
  despacham. Em corpus grandes, isso economiza 5-15 s.
- **A parte B exige a ferramenta de dispatch de subagente.** Ler os arquivos
  um a um é proibido: é 5-10× mais lento. Chame o dispatch **uma vez por
  chunk, todas as chamadas na mesma resposta**, para que rodem em paralelo. O
  limite prático medido neste repo é **1-2 subagentes por vez** — acima disso
  o fan-out satura e é cancelado.
- **Antes de despachar, imprima a estimativa**: arquivos → número de
  subagentes (`ceil(arquivos_sem_cache / 22)`) → tempo (~45 s por lote).
- **O cache vem primeiro.** Só despache para o que está em
  `graphify-out/.graphify_uncached.txt`. Se tudo estiver em cache, pule B1 e
  B2 — **mas rode o merge de B3**: é ele que escreve
  `graphify-out/.graphify_semantic.json`, e a parte C lê esse arquivo
  incondicionalmente. Escrever um arquivo semântico vazio no lugar do merge
  descarta todos os nós em cache.
- **Se mais da metade dos chunks falhar**, pare e avise: o problema é o
  `subagent_type`, não o corpus.

### §4.2 O guard de interpretador vale para os subcomandos

Antes de rodar `--update`, `--cluster-only`, `query`, `path`, `explain` ou
`add`: leia `.graphify_python` e use o interpretador gravado. Sem esse guard,
um `python3` diferente do que instalou a CLI roda um ambiente sem o pacote. O
bloco está em
[`references/pipeline/guard-do-interpretador.md`](./references/pipeline/guard-do-interpretador.md).

## §5. Os comandos

```
/graphify                                             # pipeline completo no diretório atual
/graphify <path>                                      # pipeline completo em um caminho
/graphify https://github.com/<owner>/<repo>           # clona o repo e roda o pipeline
/graphify <url1> <url2> ...                           # clona vários repos, constrói e une os grafos
/graphify <path> --mode deep                          # extração minuciosa, arestas INFERIDAS mais ricas
/graphify <path> --update                             # incremental: reextrai só o que mudou
/graphify <path> --directed                           # preserva a direção das arestas (fonte→destino)
/graphify <path> --whisper-model medium               # modelo maior do Whisper ( transcrição mais precisa)
/graphify <path> --cluster-only                       # reagrupa sobre o grafo existente
/graphify <path> --no-viz                             # sem visualização (só relatório + JSON)
/graphify <path> --svg                                # exporta também graph.svg
/graphify <path> --graphml                            # exporta também graph.graphml (Gephi, yEd)
/graphify <path> --neo4j                              # gera graphify-out/cypher.txt (Neo4j)
/graphify <path> --neo4j-push bolt://localhost:7687   # empurra direto para o Neo4j
/graphify <path> --falkordb                           # gera graphify-out/cypher.txt (FalkorDB)
/graphify <path> --falkordb-push falkordb://localhost:6379
/graphify <path> --mcp                                # sobe servidor MCP por stdio
/graphify <path> --watch                              # reconstrói sozinho a cada mudança
/graphify <path> --wiki                               # wiki navegável (índice + um artigo por comunidade)
/graphify <path> --obsidian --obsidian-dir ~/vaults/projeto
/graphify add <url>                                   # traz uma URL para o corpus e atualiza o grafo
/graphify add <url> --author "Nome"                   # marca quem escreveu
/graphify add <url> --contributor "Nome"              # marca quem acrescentou ao corpus
/graphify query "<pergunta>"                          # BFS: contexto amplo
/graphify query "<pergunta>" --dfs                    # DFS: rastreia um caminho específico
/graphify query "<pergunta>" --budget 1500            # limita a resposta a N tokens
/graphify path "AuthModule" "Database"                # menor caminho entre dois conceitos
/graphify explain "SwinTransformer"                   # explicação em linguagem natural de um nó
```

As exportações (HTML, Obsidian, wiki, Neo4j, FalkorDB, SVG, GraphML) estão
em [`references/exports.md`](./references/exports.md).

## §6. As regras de honestidade

O grafo é uma **afirmação** sobre o código — e uma afirmação errada custa
mais que um grafo ausente:

1. **Nunca invente uma aresta.** Na dúvida, use `AMBIGUOUS`.
2. **Nunca omita o aviso de corpus grande.** O passo 2 avisa; o aviso vai
   para o usuário.
3. **Mostre sempre o custo em tokens** no relatório.
4. **Nunca esconda o score de coesão atrás de símbolos** — mostre o número.
5. **Nunca gere o HTML de um grafo com mais de 5.000 nós** sem avisar o
   usuário.

## §7. As armadilhas

| armadilha | o que acontece | o que fazer |
|---|---|---|
| **O grafo envelhece** | `graphify-out/` é um artefato do momento da extração; o código muda e ele não | use `--update`, ou reconstrua; e trate o grafo como *snapshot*, não como fonte da verdade |
| **`graphify-out/` no repositório** | o grafo é escrito dentro da árvore de trabalho | deixe-o **fora** do versionamento (é artefato, não fonte) e avise o usuário de que ele apareceu no `git status` |
| **A extração semântica custa caro** | subagentes + tokens por chunk | despache por cache, em lotes de 1-2, e meça antes de despachar |
| **A CLI não está instalada** | o passo 1 falha | o `explorer` segue com grep/read; o grafo é um **upgrade opcional**, nunca um bloqueio. ⚠️ MEDIDO em 2026-11-05: neste ambiente a CLI **está** instalada (`which graphify` responde) — a armadilha é o `import graphify`, que falha mesmo com a CLI presente (é um executável, não um módulo) |
| **A chave de API ausente** | só as arestas estruturais | avise que o grafo ficou estrutural; **não peça a chave** |
| **Um subagente devolveu JSON inválido** | o chunk é perdido | avise e **pule** o chunk; só pare se mais da metade falhar |
| **O grafo encolheu** | o guard de encolhimento recusa sobrescrever um `graph.json` maior | é proposital: se a redução for de propósito, rode um build completo com `--force` |

## §8. A verificação

A skill funcionou quando:

- `graphify-out/graph.json` existe e é JSON válido;
- `graphify-out/GRAPH_REPORT.md` existe e tem as seções **God Nodes**,
  **Surprising Connections** e **Suggested Questions**;
- o health check (passo 4.5) **não** imprimiu `GRAPH HEALTH WARNING` — se
  imprimiu, o aviso vai para o resumo final, não pode ser engolido;
- uma consulta real responde: `graphify query "<pergunta do relatório>"`.

## §9. Cross-references

- [`explorer`](../../agents/explorer.md) — quem carrega esta skill.
- [`references/query.md`](./references/query.md) — as consultas (`query`,
  `path`, `explain`), com o vocabulário do grafo.
- [`references/extraction-spec.md`](./references/extraction-spec.md) — o
  prompt e o schema JSON que cada subagente de extração tem de preencher.
- [`references/update.md`](./references/update.md) — a reextração incremental.
- [`references/exports.md`](./references/exports.md) — os formatos de saída.
- [`references/hooks.md`](./references/hooks.md) — o hook de reconstrução
  automática e a integração com o `AGENTS.md` do projeto.
- [`references/add-watch.md`](./references/add-watch.md) — `add` e `--watch`.
- [`references/transcribe.md`](./references/transcribe.md) — vídeo e áudio.
- [`references/github-and-merge.md`](./references/github-and-merge.md) — repositório
  GitHub e merge de várias pastas.
