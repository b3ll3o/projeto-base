# Passo 3, parte C — mesclar AST + semântico

> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> O bloco abaixo é **do upstream, verbatim**; a prosa que o agent precisa
> entender é esta.

Os nós da AST entram primeiro; os da semântica são deduplicados por id. Cada item
semântico recebe `_origin: 'semantic'` — sem essa marca, um subagente que escreve
`L12` para uma seção de documento faz o nó **parecer** AST, e o próximo
`graphify update` o apaga junto com o arquivo de código reextraído.

```bash
$(cat graphify-out/.graphify_python) -c "
import sys, json
from pathlib import Path

ast = json.loads(Path('graphify-out/.graphify_ast.json').read_text(encoding=\"utf-8\"))
sem = json.loads(Path('graphify-out/.graphify_semantic.json').read_text(encoding=\"utf-8\"))

# Stamp tier provenance on the semantic side. build._is_ast_tier reads
# _origin when present and otherwise guesses from the SHAPE of
# source_location ('L<line>' means AST). A subagent that writes 'L12' for a
# doc section therefore made that node read as AST, and the next
# `graphify update` deleted it along with the re-extracted code file it
# seemed to belong to (#2843). extract() stamps its own items 'ast'; the
# semantic side must say so explicitly.
for n in sem['nodes']:
    n.setdefault('_origin', 'semantic')
for e in sem['edges']:
    e.setdefault('_origin', 'semantic')

# Merge: AST nodes first, semantic nodes deduplicated by id
seen = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])

merged_edges = ast['edges'] + sem['edges']
merged_hyperedges = sem.get('hyperedges', [])
merged = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': sem.get('input_tokens', 0),
    'output_tokens': sem.get('output_tokens', 0),
}
Path('graphify-out/.graphify_extract.json').write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding=\"utf-8\")
total = len(merged_nodes)
edges = len(merged_edges)
print(f'Merged: {total} nodes, {edges} edges ({len(ast[\"nodes\"])} AST + {len(sem[\"nodes\"])} semantic)')
"
```
