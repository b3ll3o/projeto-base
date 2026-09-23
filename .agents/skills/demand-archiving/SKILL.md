---
name: demand-archiving
description: Como arquivar uma demanda implementada. Use após merge de PR final + retro completa + melhorias aplicadas. Cobre validação de elegibilidade, coleta de metadados, formato de arquivo, atualização do run original, commit atômico.
---

# Skill: `demand-archiving`

> Especificação canônica em
> [`.agents/specs/conventions/demand-archiving.md`](../../specs/conventions/demand-archiving.md).
> Esta skill é a **metodologia**; o workflow é o
> [`.agents/workflows/archive-demand.md`](../../workflows/archive-demand.md).

## Quando usar

- Demanda implementada (PR MERGED) + retro completa (`b<N>-result.md`) + melhorias aplicadas.
- Pós-rollout de feature/infra com impacto em `agents/`, `skills/`, `workflows/`, `conventions/`, ou `memory/`.
- Durante auditoria periódica (1×/trimestre) por `agent-architect`.

## Quando NÃO usar

- Para arquivar bug trivial ou doc fix sem melhorias estruturais (não há demanda).
- Para demandas ainda em progresso (mesmo que pausadas).
- Para demandas abandonadas/cancelled (usar `.agents/runs/cancelled/<slug>.md` em vez de `archive/`).

## Inputs

```yaml
demand_slug: "dockerize-apps"             # kebab-case slug único
original_run_path: ".agents/runs/2026-09-22-pilot-001.md"  # path do run ativo
prs:                                        # PRs mergeados (lista de inteiros)
  - 24
retro_refs:                                 # refs retro (paths relativos a .claude/projects/.../memory/)
  - b21-result.md
  - b22-result.md
improvements:                               # contagem por categoria (≥ 1 item não-zero obrigatório)
  agents_added: 1                          # ex.: docker-specialist
  agents_updated: 0
  skills_added: 1                          # ex.: docker/SKILL.md
  skills_updated: 1                        # ex.: specialist-routing v1.1
  workflows_added: 0
  workflows_updated: 1                     # ex.: specialist-routing.md
  conventions_added: 1                     # ex.: specialist-routing.md
  conventions_updated: 2
  memory_updated: 3                        # ex.: agent-architect.md + MEMORY.md index + ...
tags:                                       # tags livres para busca
  - docker
  - specialist-routing
  - rollout
```

## Comportamento (10 passos)

### 1. Verificar PR final MERGED

```bash
gh pr view <pr-number> --json state,mergedAt
```

Resultado esperado: `state == "MERGED"`. Se `OPEN`/`CLOSED`, **abortar** (demanda não elegível).

### 2. Verificar `retro_ref` existe

```bash
test -f .claude/projects/-home-leo-Documentos-projetos-base/memory/<retro>.md
```

Se ausente, **abortar** (convenção §1 — retro completa é obrigatória).

### 3. Coletar PR metadata

```bash
gh pr view <pr-number> --json title,mergeCommit,author,mergedAt
```

Extrair: `title`, `sha` (mergeCommit), `author.login`, `mergedAt` (ISO 8601).

### 4. Derivar slug kebab-case

- Pegar `title` do PR ou nome curto da demanda.
- Converter para lowercase, espaços → `-`, remover caracteres não-alfanuméricos.
- Exemplo: `Dockerize API+Web` → `dockerize-api-web`.

### 5. Definir path de archive

```text
.agents/runs/archive/<YYYY-MM-DD>-<slug>.md
```

`YYYY-MM-DD` = data do run original (não data do arquivamento). `archived_at` no frontmatter é data do arquivamento.

### 6. Gerar frontmatter canônico

Conforme convenção §3 — todos os campos obrigatórios:

- `archived_at` (ISO 8601)
- `original_run` (filename do run ativo)
- `demand_slug` (kebab-case)
- `prs` (lista de inteiros)
- `retro_refs` (lista de filenames)
- `improvements` (objeto com 9 chaves)
- `status` (sempre `archived` para este workflow)
- `tags` (lista de strings)

### 7. Gerar body

5 seções obrigatórias (convenção §3):

1. `# <Demand Title>`
2. `## Demanda original` — resumo ≤ 5 linhas
3. `## PRs` — tabela `| PR# | Título | SHA merge | Autor |`
4. `## Retro` — lista com refs aos `b<N>-result.md`
5. `## Improvements aplicadas` — lista descritiva por categoria
6. `## Cross-refs` — outras refs (specs, plans, branches)

### 8. Escrever arquivo

```bash
# Criar pasta se não existir
mkdir -p .agents/runs/archive/

# Escrever arquivo
cat > .agents/runs/archive/<YYYY-MM-DD>-<slug>.md <<'EOF'
---
archived_at: <ISO>
...
---
# <title>
...
EOF
```

### 9. Adicionar link no run original

No topo do arquivo `.agents/runs/<original_run>` (após frontmatter), adicionar:

```markdown
> **Archive:** [`.agents/runs/archive/<YYYY-MM-DD>-<slug>.md`](./archive/<YYYY-MM-DD>-<slug>.md)
```

**NÃO** deletar o run original (manter histórico).

### 10. Validar + Commit atômico

```bash
# Validar formato (se script existir)
pnpm archive:lint --archive=.agents/runs/archive/<YYYY-MM-DD>-<slug>.md

# Stage ambos arquivos
git add .agents/runs/archive/<YYYY-MM-DD>-<slug>.md .agents/runs/<original_run>

# Commit atômico
git commit -m "docs(agents): archive demand <slug>"
```

**NÃO** fazer `git push` — controller decide.

## Outputs

```yaml
archive_path: ".agents/runs/archive/2026-09-22-pilot-001.md"
commit_sha: "<hash do commit atômico>"
original_run_linked: ".agents/runs/2026-09-22-pilot-001.md"
lint_passed: true | false
```

## Anti-Padrões

1. ❌ **Arquivar antes do PR MERGED** — pode haver rollback.
2. ❌ **Deletar run original** — perde histórico. Manter arquivo + adicionar link.
3. ❌ **Esquecer cross-refs** — quebra rastreabilidade. Sempre referenciar `b<N>-result.md` + specs.
4. ❌ **Mudar formato sem atualizar convenção** — qualquer divergência deve atualizar `demand-archiving.md` §3.
5. ❌ **Arquivar demandas com melhorias apenas em PRs posteriores** — sem evidência de melhorias próprias, não arquivar.

## Cross-refs

- Convenção: [`.agents/specs/conventions/demand-archiving.md`](../../specs/conventions/demand-archiving.md)
- Workflow: [`.agents/workflows/archive-demand.md`](../../workflows/archive-demand.md)
- Validador: [`tooling/scripts/archive-lint.ts`](../../../tooling/scripts/archive-lint.ts) — TDD spec em `archive-lint.spec.ts`