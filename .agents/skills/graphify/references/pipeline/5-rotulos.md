# Passo 5 — rotular as comunidades

> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> O bloco abaixo é **do upstream, verbatim**; a prosa que o agent precisa
> entender é esta.

Leia `.graphify_analysis.json` e, para cada chave de comunidade, escreva um nome de
2-5 palavras em linguagem natural (ex.: "Mecanismo de atenção", "Pipeline de
treino", "Carga de dados").

Substitua `LABELS_DICT` pelo dicionário que você construiu (ex.:
`{0: "Mecanismo de atenção", 1: "Pipeline de treino"}`) e `INPUT_PATH` pelo caminho
real.

O relatório é regerado com os rótulos reais (eles mudam a redação das perguntas
sugeridas) e o `graph.json` é reexportado para os nós carregarem o
`community_name` curado. Se o guard de encolhimento recusar de novo, mostre a
mensagem — **não force**.

```bash
$(cat graphify-out/.graphify_python) -c "
import sys, json
from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding=\"utf-8\"))
detection  = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding=\"utf-8\"))
analysis   = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding=\"utf-8\"))

# root= as in Step 4 / the --update runbook (#1361) — same base for node-key parity.
G = build_from_json(extraction, root='INPUT_PATH', directed=IS_DIRECTED)
communities = {int(k): v for k, v in analysis['communities'].items()}
cohesion = {int(k): v for k, v in analysis['cohesion'].items()}
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}

# LABELS - replace these with the names you chose above
labels = LABELS_DICT

# Regenerate questions with real community labels (labels affect question phrasing)
questions = suggest_questions(G, communities, labels)

report = generate(G, communities, cohesion, labels, analysis['gods'], analysis['surprises'], detection, tokens, 'INPUT_PATH', suggested_questions=questions)
Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding=\"utf-8\")
Path('graphify-out/.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False), encoding=\"utf-8\")
# Re-export so graph.json nodes carry the curated community_name (#2490).
# Same extraction as Step 4, so the #479 shrink-guard passes on node count;
# if it still refuses, surface the guard message - do not force past it.
wrote = to_json(G, communities, 'graphify-out/graph.json', community_labels=labels)
if not wrote:
    print('ERROR: refused to shrink graphify-out/graph.json (existing graph has more nodes; #479).')
    print('If this shrink is intentional (you deleted files), re-run a full build with --force.')
print('Report updated with community labels')
"
```
