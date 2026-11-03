# `add` (uma URL no corpus) e `--watch` (reconstrução automática)

> Adaptado de [safishamsi/graphify](https://github.com/safishamsi/graphify) (MIT).
> Os blocos são **do upstream, verbatim**; a prosa que o agent precisa entender
> é esta.

Carregue esta referência quando o usuário rodou `/graphify add <url>` ou passou
`--watch`. **Nenhum dos dois faz parte do build padrão.**

## Para `/graphify add`

Busca uma URL e a acrescenta ao corpus, depois atualiza o grafo.

```bash
$(cat graphify-out/.graphify_python) -c "
import sys
from graphify.ingest import ingest
from pathlib import Path

try:
    out = ingest('URL', Path('./raw'), author='AUTHOR', contributor='CONTRIBUTOR')
    print(f'Saved to {out}')
except ValueError as e:
    print(f'error: {e}', file=sys.stderr)
    sys.exit(1)
except RuntimeError as e:
    print(f'error: {e}', file=sys.stderr)
    sys.exit(1)
"
```
```

Substitua `URL` pela URL real, `AUTHOR` pelo nome do usuário (se tiver sido
dado) e `CONTRIBUTOR` pelo mesmo. Se o comando sair com erro, **diga ao usuário
o que deu errado** — não siga em silêncio. Depois de salvar com sucesso, rode
automaticamente o pipeline `--update` em `./raw` para fundir o arquivo novo no
grafo existente.

Tipos de URL suportados (detectados sozinhos):

- YouTube / qualquer URL de vídeo → o áudio é baixado pelo yt-dlp e
  transcrito para `.txt` na próxima execução (precisa de
  `pip install 'graphifyy[video]'`)
- Twitter/X → buscado via oEmbed, salvo como `.md` com o texto e o autor
- arXiv → resumo + metadados salvos como `.md`
- PDF → baixado como `.pdf`
- Imagens (.png/.jpg/.webp) → baixadas; a visão do Claude extrai na próxima
  execução
- Qualquer página web → convertida para markdown via html2text

---

## Para `--watch`

Sobe um watcher em segundo plano que monitora uma pasta e atualiza o grafo
sozinho quando os arquivos mudam.

```bash
$(cat graphify-out/.graphify_python) -m graphify.watch "$(cat graphify-out/.graphify_root)" --debounce 3
```
```

O watcher observa **a mesma pasta** que o graphify extraiu, lida do
`graphify-out/.graphify_root` confiado que o passo 1 resolveu — não há caminho
para substituir, então uma raiz de varredura com metacaracteres de shell nunca
é reinterpretada aqui. O comportamento depende do que mudou:

- **Só arquivos de código (.py, .ts, .go, etc.):** refaz a extração AST +
  reconstrução + agrupamento na hora, **sem LLM**. O `graph.json` e o
  `GRAPH_REPORT.md` são atualizados sozinhos.
- **Docs, papers ou imagens:** grava a flag `graphify-out/needs_update` e
  imprime um aviso para rodar `/graphify --update` (a reextração semântica
  exige LLM).

O **debounce** (3 s por padrão) espera a atividade de arquivo cessar antes de
disparar, para que uma leva de escritas paralelas de agents não dispare uma
reconstrução por arquivo.

`Ctrl+C` para parar.

Para fluxos agentic: rode `--watch` num terminal em segundo plano. As mudanças
de código vindas de ondas de agents entram sozinhas entre as ondas.
