# Passo 3, parte A — extração estrutural (AST)

> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> O bloco abaixo é **do upstream, verbatim**; a prosa que o agent precisa
> entender é esta.

Para os arquivos de código, extraia as relações por **AST**: determinístico, rápido e
sem gastar token nenhum. Roda em paralelo com a parte B.

```bash
$(cat graphify-out/.graphify_python) -c "
import sys, json
from graphify.extract import collect_files, extract
from pathlib import Path
import json

code_files = []
detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding=\"utf-8\"))
for f in detect.get('files', {}).get('code', []):
    code_files.extend(collect_files(Path(f)) if Path(f).is_dir() else [Path(f)])

if code_files:
    # root= anchors node ids and source_file on the scan root; cache_root only says
    # where graphify-out/cache lives. Pass both: without root= the anchor falls back
    # to cache_root, so pointing the cache elsewhere would rename every node (#3727).
    result = extract(code_files, cache_root=Path('INPUT_PATH'), root=Path('INPUT_PATH'))
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding=\"utf-8\")
    print(f'AST: {len(result[\"nodes\"])} nodes, {len(result[\"edges\"])} edges')
else:
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps({'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}, ensure_ascii=False), encoding=\"utf-8\")
    print('No code files - skipping AST extraction')
"
```
