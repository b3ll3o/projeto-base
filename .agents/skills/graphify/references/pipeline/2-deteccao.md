# Passo 2 — detectar os arquivos

> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> O bloco abaixo é **do upstream, verbatim**; a prosa que o agent precisa
> entender é esta.

Classifica o corpus em `code`/`document`/`paper`/`image`/`video` e grava o sidecar
`.graphify_detect.json`. **Não imprima o JSON** — leia em silêncio e apresente o
resumo limpo (o segundo bloco é o formato do resumo; omita toda categoria com 0
arquivos).

Depois do resumo: se `total_files` for 0, pare; se `skipped_sensitive` não for vazio,
reporte a contagem e liste os nomes pulados (para um arquivo sinalizado errado ficar
visível e poder ser renomeado); se `total_words` > 2.000.000 **ou** `total_files` >
500, mostre o aviso, calcule os 5 subdiretórios de primeiro nível com mais arquivos e
pergunte em qual rodar — a menos que todos os arquivos estejam na raiz, caso em que
sugira `--no-cluster` e siga. Caso contrário, siga para o passo 2.5 (se houve vídeo) ou
para o passo 3.

```bash
$(cat graphify-out/.graphify_python) -c "
import json
from graphify.detect import detect
from pathlib import Path
from graphify.paths import out_path
from graphify.watch import _read_build_excludes, _read_build_gitignore
result = detect(Path('INPUT_PATH'), extra_excludes=_read_build_excludes(out_path()), gitignore=_read_build_gitignore(out_path()))
# Write the sidecar from Python, not a shell redirect, so the same block renders
# on PowerShell hosts without console-encoding drift (#2528).
Path('graphify-out/.graphify_detect.json').write_text(json.dumps(result, ensure_ascii=False), encoding=\"utf-8\")
print(f'Detected {result[\"total_files\"]} files')
"
```
```
Corpus: X files · ~Y words
  code:     N files (.py .ts .go ...)
  docs:     N files (.md .txt ...)
  papers:   N files (.pdf ...)
  images:   N files
  video:    N files (.mp4 .mp3 ...)
```
