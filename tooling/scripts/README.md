# tooling/scripts

Scripts CLI que rodam localmente (pre-commit) e em CI para automatizar
revisões de qualidade e sincronização de documentação.

## Scripts planejados (Fase 8)

| Script | Comando | Quando |
| --- | --- | --- |
| `stack-code-reviewer.ts` | `pnpm stack:review --files=<lista>` | pre-commit + CI `review-stack.yml` (D11) |
| `doc-sync.ts` | `pnpm docs:sync --files=<lista> --auto-apply-minor=<bool>` | pre-commit + CI `sync-docs.yml` (D12) |

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