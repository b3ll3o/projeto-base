# Passo 3, parte B — extração semântica (subagentes em paralelo)

> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> O bloco abaixo é **do upstream, verbatim**; a prosa que o agent precisa
> entender é esta.

Só para `document`, `paper` e `image` (o código já foi coberto pela parte A).

**Caminho rápido:** se a detecção não achou nenhum doc, paper ou image, pule a parte B
inteira e vá para a C — **mas escreva o arquivo semântico vazio** (o primeiro bloco
abaixo) antes, senão a parte C quebra com `FileNotFoundError` (ela lê
`.graphify_semantic.json` incondicionalmente).

**O dispatch é obrigatório.** Ler os arquivos um a um é 5-10× mais lento. Chame o
dispatch uma vez por chunk, todas as chamadas na mesma resposta, para que rodem em
paralelo. O limite prático deste repo é **1-2 subagentes por vez**.

**Antes de despachar, imprima a estimativa** (arquivos → subagentes → tempo):
`ceil(arquivos_sem_cache / 22)` subagentes, ~45 s por lote.

**B0 — o cache vem primeiro.** Só despache para o que está em
`.graphify_uncached.txt`. Se tudo estiver em cache, pule B1 e B2 — **mas rode o merge
de B3**: é ele que escreve `.graphify_semantic.json`, e a parte C lê esse arquivo
incondicionalmente. Escrever um arquivo semântico vazio no lugar do merge descarta
todos os nós em cache.

**B1 — os chunks.** De 20 a 25 arquivos cada; **cada imagem ganha um chunk só** (a
visão precisa de contexto separado); agrupe arquivos do mesmo diretório.

**B2 — despache todos de uma vez.** O `CHUNK_PATH` tem de ser **absoluto** (derive
do `pwd`, que é onde a parte C faz o glob). O prompt de cada subagente é o
`references/extraction-spec.md`, com `FILE_LIST`, `CHUNK_NUM`, `TOTAL_CHUNKS`,
`DEEP_MODE` e `CHUNK_PATH` substituídos.

**B3 — colete, cacheie e faça o merge.** O sucesso é o arquivo em disco, não a
resposta do subagente: se o chunk não apareceu, o subagente provavelmente foi
despachado como read-only — **avise**, não pule em silêncio. Se um subagente falhou
ou devolveu JSON inválido, avise e pule o chunk; **não aborte**. Se mais da metade
falhar, pare e avise para repetir com `subagent_type="general-purpose"`.

**Os contadores de token são reais:** o JSON do chunk sempre tem zeros — leia o
campo `usage` do resultado do dispatch e grave no chunk **antes** do merge.

```bash
$(cat graphify-out/.graphify_python) -c "
import json
from pathlib import Path
Path('graphify-out/.graphify_semantic.json').write_text(json.dumps({'nodes':[],'edges':[],'hyperedges':[],'input_tokens':0,'output_tokens':0}), encoding='utf-8')
"
```
```bash
$(cat graphify-out/.graphify_python) -c "
import json
from graphify.cache import check_semantic_cache
from pathlib import Path

detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding=\"utf-8\"))
# Only content files go to semantic extraction. Code is already covered structurally
# by the AST pass (Part A); flattening every category here makes subagents re-read
# every source file (#1392). Video is transcribed to a document in Step 2.5 first.
all_files = [f for cat in ('document', 'paper', 'image') for f in detect['files'].get(cat, [])]

cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(all_files, root='INPUT_PATH', prompt_file='SPEC_PATH')

# Always (re)write the cache file: write hits, else DELETE any leftover from a prior
# run so Part C never merges a stale .graphify_cached.json (#1392).
if cached_nodes or cached_edges or cached_hyperedges:
    Path('graphify-out/.graphify_cached.json').write_text(json.dumps({'nodes': cached_nodes, 'edges': cached_edges, 'hyperedges': cached_hyperedges}, ensure_ascii=False), encoding=\"utf-8\")
else:
    Path('graphify-out/.graphify_cached.json').unlink(missing_ok=True)
Path('graphify-out/.graphify_uncached.txt').write_text('\n'.join(uncached), encoding=\"utf-8\")
# Nothing has been dispatched yet, so any chunk file on disk is a leftover from an
# interrupted run, and Step B3 merges every .graphify_chunk_*.json it finds.
for stale in Path('graphify-out').glob('.graphify_chunk_*.json'):
    stale.unlink()
print(f'Cache: {len(all_files)-len(uncached)} files hit, {len(uncached)} files need extraction')
"
```
```
Task(description="Your task is to perform the following. Follow the instructions below exactly.\n\n<agent-instructions>\n[extraction prompt, with FILE_LIST, CHUNK_NUM, TOTAL_CHUNKS, DEEP_MODE substituted]\n</agent-instructions>\n\nExecute this now. Output ONLY the structured JSON response.")
```
```bash
PROJECT_ROOT=$(pwd)  # cwd — where Part C globs graphify-out/ (NOT .graphify_root/scan dir, #1392)
# Then for chunk N: CHUNK_PATH="${PROJECT_ROOT}/graphify-out/.graphify_chunk_0N.json"
```
```bash
$(cat graphify-out/.graphify_python) -c "
import json, glob
from pathlib import Path

chunks = sorted(glob.glob('graphify-out/.graphify_chunk_*.json'))
all_nodes, all_edges, all_hyperedges = [], [], []
total_in, total_out = 0, 0
for c in chunks:
    d = json.loads(Path(c).read_text(encoding=\"utf-8\"))
    all_nodes += d.get('nodes', [])
    all_edges += d.get('edges', [])
    all_hyperedges += d.get('hyperedges', [])
    total_in += d.get('input_tokens', 0)
    total_out += d.get('output_tokens', 0)
Path('graphify-out/.graphify_semantic_new.json').write_text(json.dumps({
    'nodes': all_nodes, 'edges': all_edges, 'hyperedges': all_hyperedges,
    'input_tokens': total_in, 'output_tokens': total_out,
}, indent=2, ensure_ascii=False), encoding=\"utf-8\")
print(f'Merged {len(chunks)} chunks: {total_in:,} in / {total_out:,} out tokens')
"
```
```bash
$(cat graphify-out/.graphify_python) -c "
import json
from graphify.cache import save_semantic_cache
from pathlib import Path

new = json.loads(Path('graphify-out/.graphify_semantic_new.json').read_text(encoding=\"utf-8\")) if Path('graphify-out/.graphify_semantic_new.json').exists() else {'nodes':[],'edges':[],'hyperedges':[]}
uncached = [line for line in Path('graphify-out/.graphify_uncached.txt').read_text(encoding=\"utf-8\").splitlines() if line]
saved = save_semantic_cache(new.get('nodes', []), new.get('edges', []), new.get('hyperedges', []), root='INPUT_PATH', allowed_source_files=uncached, prompt_file='SPEC_PATH')
print(f'Cached {saved} files')
"
```
```bash
$(cat graphify-out/.graphify_python) -c "
import json
from pathlib import Path

cached = json.loads(Path('graphify-out/.graphify_cached.json').read_text(encoding=\"utf-8\")) if Path('graphify-out/.graphify_cached.json').exists() else {'nodes':[],'edges':[],'hyperedges':[]}
new = json.loads(Path('graphify-out/.graphify_semantic_new.json').read_text(encoding=\"utf-8\")) if Path('graphify-out/.graphify_semantic_new.json').exists() else {'nodes':[],'edges':[],'hyperedges':[]}

all_nodes = cached['nodes'] + new.get('nodes', [])
all_edges = cached['edges'] + new.get('edges', [])
all_hyperedges = cached.get('hyperedges', []) + new.get('hyperedges', [])
seen = set()
deduped = []
for n in all_nodes:
    if n['id'] not in seen:
        seen.add(n['id'])
        deduped.append(n)

merged = {
    'nodes': deduped,
    'edges': all_edges,
    'hyperedges': all_hyperedges,
    'input_tokens': new.get('input_tokens', 0),
    'output_tokens': new.get('output_tokens', 0),
}
Path('graphify-out/.graphify_semantic.json').write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding=\"utf-8\")
print(f'Extraction complete - {len(deduped)} nodes, {len(all_edges)} edges ({len(cached[\"nodes\"])} from cache, {len(new.get(\"nodes\",[]))} new)')
"
```
