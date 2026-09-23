---
name: demand-archiving
version: 1.0
updated: 2026-09-23
maintainer: agent-architect
description: "Convenção canônica de arquivamento de demandas implementadas — define elegibilidade, formato de storage, processo e regras de retenção para demandas implementadas que forneceram melhorias (agents/skills/workflows/conventions/memory)."
---

# Convenção: `demand-archiving` (arquivamento de demandas implementadas)

> pt-BR: define o critério de elegibilidade, formato de storage, processo de
> arquivamento e regras de retenção para demandas que foram implementadas
> **E** forneceram melhorias em `agents/`, `skills/`, `workflows/`,
> `specs/conventions/` ou `memory/`.

## §1. Quando arquivar

Uma demanda é elegível para arquivamento quando **TODAS** as condições são verdadeiras:

- [ ] **Implementada:** PR final mergeado em `main` (`state == MERGED`, não draft, não closed)
- [ ] **Retro completa:** existe arquivo `b<N>-result.md` correspondente em `.claude/projects/.../memory/`
- [ ] **Melhorias aplicadas:** ≥ 1 melhoria em `agents/`, `skills/`, `workflows/`, `specs/conventions/` ou `memory/`
- [ ] **Não paused/abandoned:** status final é `SUCCESS` ou `DONE_WITH_CONCERNS` (não `BLOCKED` nem `NEEDS_CONTEXT`)

**Exemplos elegíveis:**

- Fases 7-10 (B1-B11) — implementação do backend com melhorias de CI/skills/conventions
- Review-router rollout (B12-B20) — melhorias em specialists/router/matriz
- Docker rollout (B21-B22) — docker-specialist + skill + preflight checks

**Exemplos NÃO elegíveis:**

- Pilot #001 do review-router (B16): retro completa mas melhorias aplicadas em batches posteriores
- Demandas com PR ainda OPEN (mesmo com retro): aguardar merge
- Demandas abandonadas/cancelled: arquivo separado em `.agents/runs/cancelled/<slug>.md`

## §2. Storage

**Localização:** `.agents/runs/archive/`

**Nomenclatura:** `YYYY-MM-DD-<demand-slug>.md` (data da demanda original, slug kebab-case curto).

**Exemplo:** `.agents/runs/archive/2026-09-22-pilot-001.md`

> **Nota:** pasta `archive/` é sibling de `runs/` (não subpasta) — facilita git diff separado.

## §3. Formato de arquivo de archive

**Frontmatter YAML obrigatório:**

```yaml
---
archived_at: 2026-09-23T15:00:00Z        # ISO 8601 do arquivamento
original_run: 2026-09-22-pilot-001.md    # arquivo em .agents/runs/ ativo
demand_slug: review-router-pilot-001      # slug kebab-case
prs:                                       # PRs mergeados (lista de números)
  - 12
retro_refs:                                # refs retro (relativos a .claude/projects/.../memory/)
  - b16-result.md
improvements:                              # contagem por categoria
  agents_added: 0
  agents_updated: 0
  skills_added: 1
  skills_updated: 0
  workflows_added: 0
  workflows_updated: 0
  conventions_added: 0
  conventions_updated: 0
  memory_updated: 1
status: archived                          # archived | cancelled
tags:                                     # tags livres para busca
  - pilot
  - review-router
---
```

**Body (Markdown):**

```markdown
# <Demand Title>

## Demanda original
[resumo ≤ 5 linhas da demanda original]

## PRs
[tabela com PR # | título | SHA merge | autor]

## Retro
[refs aos b<N>-result.md com links relativos]

## Improvements aplicadas
[lista descritiva: o que mudou em agents/skills/etc]

## Cross-refs
[outras refs: specs, plans, branches]
```

## §4. Processo de arquivamento

**Quem pode arquivar:**

- ✅ Implementer da demanda (auto-arquiva após merge)
- ✅ `agent-architect` (auditoria retrospectiva)
- ✅ Humano (manual via `git commit`)

**Quando arquivar:**

- ✅ Imediatamente após merge do PR final + retro completa
- ❌ Nunca durante implementação (mesmo se pausada)

**Como arquivar (6 passos):**

1. Verificar elegibilidade (§1 — usar checklist)
2. Coletar metadados (PRs via `gh pr view <N>`, retro_refs, improvements)
3. Criar arquivo em `.agents/runs/archive/<YYYY-MM-DD>-<slug>.md` (§3)
4. **NÃO** deletar arquivo original em `.agents/runs/` (manter histórico)
5. Adicionar link no topo do arquivo original:
   ```markdown
   > **Archive:** [`<archive-path>`](./archive/<archive-filename>)
   ```
6. Commit atômico: `docs(agents): archive demand <slug>`

## §5. Retenção

- Demandas `archived`: mantidas indefinidamente (git history já garante backup)
- Demandas `cancelled`: idem
- Cleanup de `archive/`: **NUNCA** automático (humano decide)

## §6. Auditoria periódica

`agent-architect` deve revisar `.agents/runs/` vs `.agents/runs/archive/` 1×/trimestre:

- Demandas ativas > 90 dias sem commit → flag para revisão
- Arquivos archive com `retro_ref` quebrada → corrigir cross-ref
- Pasta `archive/` > 100 arquivos → considerar índice (próxima iteração)

## §7. Cross-refs

- [`.agents/workflows/archive-demand.md`](../workflows/archive-demand.md) — workflow que executa
- [`.agents/skills/demand-archiving/SKILL.md`](../skills/demand-archiving/SKILL.md) — skill com passos
- [`.agents/specs/conventions/evolucao-agents.md`](./evolucao-agents.md) — integra com ciclo de evolução
- [`.tooling/scripts/archive-lint.ts`](../../../tooling/scripts/archive-lint.ts) — validador TDD do frontmatter
- [`docs/TEMPLATE_USAGE.md`](../../../docs/TEMPLATE_USAGE.md) — guia principal (referência)

## §8. Histórico de Versões

| Versão | Data       | Mudança                                                                                                              |
|--------|------------|----------------------------------------------------------------------------------------------------------------------|
| 1.0    | 2026-09-23 | Lançamento inicial — convenção + workflow + skill + script validador (B23 polish)                                    |