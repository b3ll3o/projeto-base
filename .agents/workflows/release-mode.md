# Workflow: `release-mode` — Bump de Versão do Template

> Workflow reutilizável para preparar um release do template (major/minor/patch).
> Detalhes em `.agents/specs/conventions/post-merge-release.md` e `.agents/specs/conventions/estrutura-e-versionamento.md §Histórico de Versões`.

**Trigger:** "preparar release", "bumpar versão X.Y.Z", "tag release vA.B.C"

**Composição:** sequential (3 estágios)

## Agentes Encadeados

```text
┌────────────────┐
│   DOC-WRITER   │  Atualiza 3 docs versionados + Histórico
└────────┬───────┘
         ▼
┌────────────────┐
│  CODE-REVIEWER │  Valida consistência cross-refs nos 3 docs
└────────┬───────┘
         ▼
┌────────────────┐
│  TASK-MANAGER  │  Cria task `chore/bump-A.B.C` no backlog
└────────────────┘
```

## Handoffs

```yaml
doc-writer → code-reviewer:
  task: "Atualizar docs/MONOREPO.md, docs/STACK.md, .agents/specs/conventions/estrutura-e-versionamento.md com nova versão + Histórico de Versões"
  context: ["docs/MONOREPO.md", "docs/STACK.md", ".agents/specs/conventions/estrutura-e-versionamento.md"]
  expected_output: { updated_files: [...], changelog_entry: "..." }
  success_criteria: "3 docs atualizados; linha adicionada no Histórico com Conventional Commits summary"

code-reviewer → task-manager:
  task: "Validar consistência cross-refs entre os 3 docs (paths relativos devem resolver)"
  context: ["diff dos 3 docs"]
  expected_output: { approved: bool, findings: [...] }
  success_criteria: "0 broken refs; números de versão consistentes entre os 3 docs"

task-manager:
  task: "Criar task `chore/bump-A.B.C` com acceptance criteria completos"
  context: ["3 docs atualizados", "histórico preenchido"]
  expected_output: { task_id: "TASK-bump-A.B.C", acceptance_criteria: [...] }
  success_criteria: "Task tem ID único, type=chore, priority=high, acceptance_criteria verificáveis"
```

## Quando usar

- Bump de versão major (breaking changes)
- Bump de versão minor (features novas)
- Bump de versão patch (bugfixes)
- Tag de release retroativa (backfill) via `workflow_dispatch`

## Quando NÃO usar

- Hotfix urgente (use workflow regular + label `hotfix`)
- Bump de package npm interno (use Changesets, não este workflow)
- Mudança que não envolve bump (use `docs-mode`)

## Critérios de Done

- 3 docs versionados atualizados
- Linha adicionada no Histórico de Versões
- Cross-refs validados (rodar `pnpm ci:preflight`)
- Branch `chore/bump-A.B.C` aberta + PR revisado
- Tag automática criada após merge (via `.github/workflows/release-template.yml`)

## Cross-references

- Spec: [`.agents/specs/conventions/post-merge-release.md`](../specs/conventions/post-merge-release.md)
- Spec: [`.agents/specs/conventions/estrutura-e-versionamento.md`](../specs/conventions/estrutura-e-versionamento.md) §Histórico de Versões
- Catálogo: [`.agents/WORKFLOWS.md`](../WORKFLOWS.md)

---

**Mantido por:** projeto-base contributors
