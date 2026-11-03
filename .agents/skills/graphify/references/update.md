> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> Os blocos são **do upstream, verbatim**; a prosa que o agent precisa entender
> é esta.

# Atualização incremental (`--update`) e reagrupamento (`--cluster-only`)

Carregue esta referência **só** quando o usuário passou `--update` ou
`--cluster-only`. Um build completo de primeira vez **nunca** lê este arquivo.

## Para `--update` (reextração incremental)

Use quando você adicionou ou modificou arquivos desde a última execução. Só
reextrai os arquivos que mudaram — economiza tokens e tempo.

O primeiro bloco calcula o diff contra o manifesto:

```bash
$(cat graphify-out/.graphify_python) -c "
import sys, json
from graphify.detect import detect_incremental, save_manifest
from pathlib import Path

from graphify.paths import out_path
from graphify.watch import _read_build_excludes, _read_build_gitignore
result = detect_incremental(Path('INPUT_PATH'), extra_excludes=_read_build_excludes(out_path()), gitignore=_read_build_gitignore(out_path()))
new_total = result.get('new_total', 0)
nf = result.get('new_files', {})
print(json.dumps({
    'new_total': new_total,
    'deleted': len(result.get('deleted_files', [])),
    'new_by_type': {t: len(v) for t, v in nf.items()},
    'total_files': result.get('total_files'),
    'total_words': result.get('total_words'),
    'skipped_sensitive': result.get('skipped_sensitive', []),
}, indent=2, ensure_ascii=False))
print('Full result: graphify-out/.graphify_incremental.json')
Path('graphify-out/.graphify_incremental.json').write_text(json.dumps(result, ensure_ascii=False), encoding=\"utf-8\")
deleted = list(result.get('deleted_files', []))
if new_total == 0 and not deleted:
    print('No files changed since last run. Nothing to update.')
    raise SystemExit(0)
if deleted:
    print(f'{len(deleted)} deleted file(s) to prune.')
if new_total > 0:
    print(f'{new_total} new/changed file(s) to re-extract.')
"

Depois, preencha `.graphify_detect.json` para que os passos 3A-6 (que o leem
incondicionalmente) vejam o estado certo de uma execução incremental: `files`
carrega o subconjunto que mudou e `all_files` o corpus completo.

Se houver arquivos novos, **primeiro** veja se todos os arquivos que mudaram
são de código:

```bash
$(cat graphify-out/.graphify_python) -c "
import json
from pathlib import Path
r = json.loads(Path('graphify-out/.graphify_incremental.json').read_text(encoding=\"utf-8\"))
Path('graphify-out/.graphify_detect.json').write_text(json.dumps({
    'files': r.get('new_files', {}),
    'all_files': r.get('files', {}),
    'total_files': r.get('new_total', 0),
    'total_words': r.get('total_words', 0),
    'skipped_sensitive': r.get('skipped_sensitive', []),
    'needs_graph': True,
}, ensure_ascii=False), encoding=\"utf-8\")
"

- Se `code_only` for verdadeiro: imprima `[graphify update] Code-only changes
  detected - skipping semantic extraction (no LLM needed)` e rode **só** o
  passo 3A (a AST) e o merge.
- Se `code_only` for falso (algum arquivo que mudou é doc/paper/image/video):
  **primeiro**, se algum arquivo que mudou está em `new_files['video']`, rode a
  transcrição (veja [`transcribe.md`](./transcribe.md)); depois siga com a
  extração semântica dos que faltam.

Se não houver arquivos novos (só remoções), crie uma extração vazia para que o
passo de merge consiga podar:

```bash
$(cat graphify-out/.graphify_python) -c "
import json
from pathlib import Path

result = json.loads(open('graphify-out/.graphify_incremental.json', encoding='utf-8').read()) if Path('graphify-out/.graphify_incremental.json').exists() else {}
code_exts = {'.py','.ts','.js','.go','.rs','.java','.cpp','.c','.rb','.swift','.kt','.cs','.scala','.php','.cc','.cxx','.hpp','.h','.kts','.lua','.toc','.f','.F','.f90','.F90','.f95','.F95','.f03','.F03','.f08','.F08'}
new_files = result.get('new_files', {})
all_changed = [f for files in new_files.values() for f in files]
code_only = all(Path(f).suffix.lower() in code_exts for f in all_changed)
print('code_only:', code_only)
"

Depois:

```bash
if [ ! -f graphify-out/.graphify_extract.json ]; then
    echo '[graphify update] Only deletions -- creating empty extraction for merge.'
    $(cat graphify-out/.graphify_python) -c "
import json
from pathlib import Path
Path('graphify-out/.graphify_extract.json').write_text(json.dumps({'nodes':[],'edges':[],'hyperedges':[],'input_tokens':0,'output_tokens':0}), encoding='utf-8')
"
fi

Rode os passos 4-8 sobre o grafo fundido como de costume.

Depois do passo 4, mostre o diff do grafo. **Antes** do passo de merge, salve o
grafo antigo: `cp graphify-out/graph.json graphify-out/.graphify_old.json`.
Limpe depois: `rm -f graphify-out/.graphify_old.json`.

```bash
$(cat graphify-out/.graphify_python) -c "
import json
from pathlib import Path
from graphify.build import build_merge
from graphify.detect import save_manifest

# Load new extraction and incremental state
new_extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding=\"utf-8\"))
incremental = json.loads(Path('graphify-out/.graphify_incremental.json').read_text(encoding=\"utf-8\"))
deleted = list(incremental.get('deleted_files', []))
# prune_sources is ONLY for genuinely DELETED files. Changed/re-extracted files are
# handled by build_merge's replace-on-re-extract (#1344): every source_file in
# new_chunks is dropped from the base before merge, so old/stale nodes don't survive.
# Do NOT add `changed` here: with root= passed, prune_set relativizes to the same base
# as the freshly merged nodes and would DELETE the re-extracted content (#1178 is moot
# now that replace — not the dedup pass — reconciles changed files).
prune = list(deleted) or None

# Use build_merge() — reads graph.json directly without NetworkX round-trip
# so edge direction (calls, implements, imports) is always preserved (#801).
# Pass root= so prune_sources (absolute paths from detect_incremental) are
# relativized to match the graph's relative source_file values; without it
# nothing is pruned and stale nodes accumulate on every update (#1361).
# directed=IS_DIRECTED: replace IS_DIRECTED with True if --directed was given, else
# False. Without it a --directed --update silently rebuilds undirected and collapses
# reciprocal A<->B edges (#1392).
G = build_merge(
    [new_extraction],
    graph_path='graphify-out/graph.json',
    prune_sources=prune,
    root='INPUT_PATH',
    directed=IS_DIRECTED,
)
print(f'[graphify update] Merged: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges')

# Write merged result back to .graphify_extract.json so Step 4 sees the full graph
merged_out = {
    'nodes': [{'id': n, **d} for n, d in G.nodes(data=True)],
    'edges': [
        # Explicit source/target last so they win over any stale attrs in d.
        {**{k: val for k, val in d.items() if k not in ('_src', '_tgt', 'source', 'target')},
         'source': d.get('_src', u), 'target': d.get('_tgt', v)}
        for u, v, d in G.edges(data=True)
    ],
    # G.graph["hyperedges"] holds hyperedges from both existing graph.json
    # and new_extraction (build_merge combines them). Falling back to
    # new_extraction only would silently drop prior-run hyperedges (#801).
    'hyperedges': list(G.graph.get('hyperedges', [])),
    'input_tokens': new_extraction.get('input_tokens', 0),
    'output_tokens': new_extraction.get('output_tokens', 0),
}
Path('graphify-out/.graphify_extract.json').write_text(json.dumps(merged_out, ensure_ascii=False), encoding=\"utf-8\")
print(f'[graphify update] Merged extraction written ({len(merged_out[\"nodes\"])} nodes, {len(merged_out[\"edges\"])} edges)')

# Save manifest so next --update diffs against today's state, not the
# prior run's baseline (prevents ghost-node reports on subsequent updates).
# root= matches the build_merge call above so the manifest keys stay relative to
# the scan root — portable across clones/machines, so --update keeps matching
# cached files instead of missing every one after a move (#1417).
#
# Only stamp semantic files (docs/papers/images) that ACTUALLY produced output
# THIS run (new_extraction is this run's fresh extraction, read above before the
# merge overwrote the file): a changed doc whose chunk failed must stay unstamped
# so the next --update re-queues it, otherwise it is marked done and its content
# is lost forever (#2015). Mirrors the library extract path
# (cli._stamped_manifest_files + clear_semantic + scan_corpus).
from graphify.cli import _stamped_manifest_files
_manifest_files = _stamped_manifest_files(incremental['files'], new_extraction, Path('INPUT_PATH'))
# Changed semantic files dispatched this run but NOT stamped had their chunk fail
# or be omitted; clear any stale semantic_hash so they are re-queued (#1948).
_sem_types = ('document', 'paper', 'image')
_dispatched = {f for t, fl in incremental.get('new_files', {}).items() if t in _sem_types for f in fl}
_stamped = {f for fl in _manifest_files.values() for f in fl}
_cleared = _dispatched - _stamped
# scan_corpus = the RAW full corpus so in-root files newly excluded since last run
# are dropped rather than masquerading as deletions; untouched rows preserved (#1908).
_scan = {f for fl in incremental['files'].values() for f in fl}
save_manifest(_manifest_files, root='INPUT_PATH', scan_corpus=_scan, clear_semantic=_cleared or None)
print('[graphify update] Manifest saved.')
"

```bash
$(cat graphify-out/.graphify_python) -c "
import json
from graphify.analyze import graph_diff
from graphify.build import build_from_json
from graphify.paths import load_node_link_graph
import networkx as nx
from pathlib import Path

# Load old graph (before update) from backup written before merge
old_data = json.loads(Path('graphify-out/.graphify_old.json').read_text(encoding=\"utf-8\")) if Path('graphify-out/.graphify_old.json').exists() else None
new_extract = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding=\"utf-8\"))
G_new = build_from_json(new_extract, directed=IS_DIRECTED)

if old_data:
    G_old = load_node_link_graph(old_data)
    diff = graph_diff(G_old, G_new)
    print(diff['summary'])
    if diff['new_nodes']:
        print('New nodes:', ', '.join(n['label'] for n in diff['new_nodes'][:5]))
    if diff['new_edges']:
        print('New edges:', len(diff['new_edges']))
"

---

## Para `--cluster-only`

Pule os passos 1-3. Reagrupe sobre o grafo existente:

```bash
graphify cluster-only .

O `graphify cluster-only .` é **autocontido**: reagrupa, nomeia as comunidades e
regenera `GRAPH_REPORT.md`, `graph.json` e o grafo.
