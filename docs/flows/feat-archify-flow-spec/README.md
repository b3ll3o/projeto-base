# Flow — feat/archify-flow-spec

Workflow diagram auto-gerado pelo `archify flow` para a branch `feat/archify-flow-spec`.

## Artefatos

- `workflow.json` — diagrama workflow conforme `schemas/workflow.schema.json` (v1)
- `workflow.html` — diagrama standalone (HTML + JS embedded, ~795 KB)
- `_flow_source.json` — sidecar de provenance (range, baseSha, generated_at)

## Comando

```bash
node dev-archify/archify/bin/archify.mjs flow \
  --git-range=main...feat/archify-flow-spec \
  --out=docs/flows/feat-archify-flow-spec \
  --since-message='docs:*'
```

Filtro `--since-message='docs:*'` mantém apenas os 2 commits `docs:`, suficiente para caber
no fixed-v1 layout do renderer (max 6 colunas). Sem o filtro, o decide lane teria 5 nodes
e 2 deles cairiam em `col=5`, sobrepondo-se.

## Diagrama

- **2 nodes modify**: `docs/superpowers/specs/2026-09-23-archify-flow-subcommand-design.md`
  (364 linhas) + `docs/superpowers/plans/2026-09-23-archify-flow-subcommand.md`
  (2064 linhas)
- **2 nodes decide**: `e15b273 docs(specs): adicionar spec...` + `0daa784 docs(plans): plano...`
- **mainPath**: spec → plan (em ordem cronológica)
- **validateReceipt**: passed
