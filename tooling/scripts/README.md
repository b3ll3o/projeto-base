# tooling/scripts

Scripts CLI que rodam localmente (pre-commit) e em CI para automatizar
revisões de qualidade e sincronização de documentação.

## Scripts

| Script | Comando | Quando |
| --- | --- | --- |
| `stack-code-reviewer.ts` | `pnpm stack:review --files=<lista>` | pre-commit + CI `review-stack.yml` (D11) |
| `doc-sync.ts` | `pnpm docs:sync --files=<lista>` | pre-commit + CI `sync-docs.yml` (D12) — só reprova quando um doc **mapeado não existe** (`alerts > 0`); severidade `minor` nunca bloqueia |
| `weekly-docs-sync.ts` | `pnpm weekly:docs-sync --since=<ISO> --until=<ISO>` | o cron semanal: gera o artefato de `.agents/runs/weekly-docs-sync-<ts>.md` (a análise da semana + o parecer do `doc-sync`) |
| `contraste-token.ts` | `pnpm estilo:contraste` | mede a razão de contraste dos tokens do padrão de estilização (a tabela da §2.2 da convenção `estilizacao.md`) |

### O relatório semanal (`weekly-docs-sync.ts`)

O gerador do artefato semanal mora no repo porque os defeitos dele
precisam de dono e de teste. Três regras que ele garante:

- **janela determinística**: `--since`/`--until` são normalizados para hora
  cheia (`2026-11-09` → `2026-11-09T00:00:00`) e entram no artefato. Data nua
  no git herda a HORA da execução — o mesmo comando media coisa diferente
  conforme o momento.
- **path vazio não é arquivo**: a linha em branco do `git log` não entra na
  lista de arquivos mais tocados.
- **diretório é diretório**: sai do path sem o nome do arquivo, e a raiz é
  `(raiz)` — nunca `README.md/`.

O parecer do `doc-sync` vai no artefato com a **origem** de cada ação
(`source_file`), e ações repetidas são contadas uma vez.

## Como adicionar um novo script

1. Criar arquivo `.ts` em `tooling/scripts/` (ou subpasta `lib/` para helpers compartilhados).
2. Adicionar entrada no array `scripts` do `package.json` raiz:
   ```json
   "stack:review": "tsx tooling/scripts/stack-code-reviewer.ts"
   ```
3. Se o script tiver regras configuráveis, criar `.agents/agents/<nome>.md` documentando as lenses e o report schema.
4. Atualizar este README adicionando linha na tabela.
5. Adicionar specs `*.spec.ts` ao lado do script e cobrir com `pnpm tooling:test`.

## Como desligar para um commit específico

```bash
git commit --no-verify -m "wip: ..."
```

(NÃO recomendado — usar `git revert` se for um falso positivo.)