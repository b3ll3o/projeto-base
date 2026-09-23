---
name: archive-demand
description: Arquiva uma demanda implementada em `.agents/runs/archive/`. Use quando demanda mergeou + retro completa + melhorias aplicadas.
type: workflow
---

# Workflow: `archive-demand`

> pt-BR: arquiva uma demanda já implementada, criando registro permanente
> em `.agents/runs/archive/<YYYY-MM-DD>-<slug>.md` com frontmatter canônico.

## Inputs

- `demand_slug` (string, kebab-case) — ex: `dockerize-apps`
- `original_run_path` (path relativo) — ex: `.agents/runs/2026-09-22-pilot-001.md`
- `prs` (lista de números) — ex: `[12, 24]`
- `retro_refs` (lista de paths relativos) — ex: `[b21-result.md, b22-result.md]`
- `improvements` (objeto com contagens) — ex: `{ agents_added: 1, memory_updated: 2, ... }`

## Quando usar

- ✅ Demanda com PR final MERGED + retro completa + melhorias aplicadas
- ❌ Demanda ainda em progresso (mesmo se pausada)
- ❌ Demanda sem `b<N>-result.md` (sem elegibilidade)

## Passo a passo

1. **Validar elegibilidade** (convenção §1):
   - PR final está MERGED? (`gh pr view <N> --json state`)
   - `b<N>-result.md` existe? (`test -f .claude/projects/.../memory/<retro>.md`)
   - `improvements` tem ≥ 1 item não-zero?

2. **Coletar metadados**:
   - PR title + SHA merge (`gh pr view <N> --json title,mergeCommit`)
   - Original run path
   - Lista de melhorias (de `b<N>-result.md` seção "Cross-refs" ou "Improvements")

3. **Criar arquivo de archive**:
   - Path: `.agents/runs/archive/<YYYY-MM-DD>-<slug>.md` (data do run original)
   - Conteúdo: frontmatter (§3 convenção) + body com seções
   - Usar template definido em [`demand-archiving.md §3`](../specs/conventions/demand-archiving.md#3-formato-de-arquivo-de-archive)

4. **Atualizar run original**:
   - Adicionar linha no topo: `> **Archive:** [\`<archive-path>\`](./archive/<archive-filename>)`
   - **NÃO** deletar o original (manter histórico)

5. **Validar formato** (se script existir):
   - `pnpm archive:lint --archive=<archive-path>` (ver [Step 5 script](../../tooling/scripts/archive-lint.ts))

6. **Commit atômico**:
   ```bash
   git add .agents/runs/archive/ .agents/runs/<original-run>
   git commit -m "docs(agents): archive demand <slug>"
   ```

## Outputs

- Arquivo em `.agents/runs/archive/<slug>.md` com frontmatter canônico
- Linha de link no arquivo original
- Commit atômico no git

## Cross-refs

- Convenção: [`.agents/specs/conventions/demand-archiving.md`](../specs/conventions/demand-archiving.md)
- Skill: [`.agents/skills/demand-archiving/SKILL.md`](../skills/demand-archiving/SKILL.md)
- Script: [`tooling/scripts/archive-lint.ts`](../../tooling/scripts/archive-lint.ts)