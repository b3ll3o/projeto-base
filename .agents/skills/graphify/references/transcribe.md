> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> Os blocos são **do upstream, verbatim**; a prosa que o agent precisa entender
> é esta.

# Transcrever vídeo e áudio

Carregue esta referência **só** quando o `detect` reportou um ou mais arquivos
`video`. Um corpus sem vídeo nunca lê este arquivo.

## Passo 2.5 — transcrever os arquivos de vídeo/áudio (só se houve vídeo)

Pule este passo inteiro se o `detect` devolveu zero arquivos `video`.

Vídeo e áudio não podem ser lidos diretamente: transcreva para texto primeiro e
depois trate as transcrições como arquivos de documento no passo 3.

**A estratégia:** leia os god nodes de `graphify-out/.graphify_detect.json` (ou
do arquivo de análise, se existir de uma execução anterior) e **escreva você
mesmo o prompt do Whisper**, com uma frase de dica do domínio.

**Mas:** se o corpus tem *apenas* arquivos de vídeo e nenhum outro doc/código,
use o prompt genérico de fallback (`"Use proper punctuation and paragraph
breaks..."`).

**Passo 1 — escrever o prompt do Whisper.** Leia os rótulos dos god nodes da
saída do detect (ou da análise) e componha uma frase curta de dica do domínio:

- Rótulos: `transformer, attention, encoder, decoder` → `"Pesquisa de machine
  learning sobre arquiteturas de transformer e mecanismos de atenção. Use
  pontuação e quebras de parágrafo adequadas."`
- Rótulos: `kubernetes, deployment, pod, helm` → `"Discussão de DevOps sobre
  deployments de Kubernetes e charts do Helm. Use pontuação e quebras de parágrafo
  adequadas."`

**Exporte** o prompt como `GRAPHIFY_WHISPER_PROMPT` (o nome exato que o
transcritor lê — e tem de ser **exportado**, para o processo Python filho o
enxergar) para o arquivo `.graphify_whisper_prompt.txt` no diretório atual.

**Passo 2 — transcrever:**

```bash
export GRAPHIFY_WHISPER_MODEL=base  # or whatever --whisper-model the user passed (must be exported)
export GRAPHIFY_WHISPER_PROMPT="<the one-sentence domain hint you composed in Step 1>"
$(cat graphify-out/.graphify_python) -c "
import json, os, sys
from pathlib import Path
from graphify.transcribe import transcribe_all

detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding=\"utf-8\"))
video_files = detect.get('files', {}).get('video', [])
prompt = os.environ.get('GRAPHIFY_WHISPER_PROMPT', 'Use proper punctuation and paragraph breaks.')

transcript_paths = transcribe_all(video_files, initial_prompt=prompt)
# Write the JSON from Python (NOT a shell '>' redirect): transcribe_all/Whisper
# print progress to stdout, which would otherwise corrupt the JSON file (#1392).
Path('graphify-out/.graphify_transcripts.json').write_text(json.dumps(transcript_paths, ensure_ascii=False), encoding=\"utf-8\")
print(f'Transcribed {len(transcript_paths)} file(s)', file=sys.stderr)
"

Depois da transcrição:

- leia os caminhos das transcrições em `graphify-out/.graphify_transcripts.json`;
- **acrescente-os à lista de documentos** antes de despachar os subagentes
  semânticos no passo 3B;
- imprima quantas transcrições foram criadas: `Transcribed N video file(s) ->
  treating as docs`;
- se a transcrição falhar para um arquivo, imprima um aviso e siga com os
  demais.

**Modelo do Whisper:** o padrão é `base`. Se o usuário passou
`--whisper-model <nome>`, exporte `GRAPHIFY_WHISPER_MODEL=<nome>` (tem de ser
exportado, não só atribuído) **antes** de transcrever.
