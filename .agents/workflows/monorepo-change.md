# `monorepo-change` — Adicionar/Mover/Remover Pacote ou App

> Workflow detalhado. Trigger e composição resumidos em [`WORKFLOWS.md`](../WORKFLOWS.md).

**Trigger:** "criar novo app", "adicionar package compartilhado", "mover código entre packages"

**Composição:** sequential (2 estágios)

```text
MONOREPO-SPECIALIST → CODE-REVIEWER
```

## Handoff

```yaml
monorepo-specialist → code-reviewer:
  task: "Revisar mudanças estruturais no monorepo"
  context:
    - "pnpm-workspace.yaml (globs alterados)"
    - "turbo.json (pipeline alterado)"
    - "package.json (root + workspace alterados)"
    - "apps/, packages/, tooling/ (estrutura)"
  expected_output:
    findings: [...]
  success_criteria:
    - "Apps permanecem isolados (zero imports cruzados entre apps)"
    - "Dependências compartilhadas no root via workspace protocol"
    - "Pipelines turbo cacheáveis com outputs declarados"
    - "Versionamento via Changesets (não manual)"
```

### Passo Pré-Planner: Despachar specialist-router

Antes do passo 1:

1. Validar demanda tem escopo técnico (skill `specialist-routing` Passo 1)
2. Despachar `specialist-router` via Agent tool
3. Aguardar `.agents/runs/<ts>-specialist-<n>.yaml`
4. Se `gap_detected: true` → dispatch `agent-architect` + re-rodar router
5. Prosseguir com planning

### Passo Pós-Implementer: Despachar review-router

Após implementer reportar DONE:

1. Validar inputs (skill `review-routing` Passo 1)
2. Despachar `review-router` via Agent tool
3. Aguardar output em `.agents/runs/<timestamp>-review-<n>.yaml`
4. Triage conforme skill (Passo 4)
5. Se BLOCKING/IMPORTANT → dispatch fix-implementer (Passo 5)
6. Re-rodar router após fix
7. Avançar quando router retornar 0 BLOCKING/IMPORTANT

## Quando Usar

- Criar novo app (`apps/<nome>/`)
- Adicionar package compartilhado (`packages/<nome>/`)
- Adicionar tooling (`tooling/<nome>/`)
- Mover código entre apps/packages
- Renomear workspaces
- Atualizar `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`

## Quando NÃO Usar

- Implementar feature dentro de um app existente (use `backend-feature` ou `frontend-feature`)
- Mudança apenas em dependências (use workflow regular + code-reviewer)

## Referências

- Agent: [`.agents/agents/monorepo-specialist.md`](../agents/monorepo-specialist.md)
- Convenções: [`docs/MONOREPO.md`](../../docs/MONOREPO.md)
- Skill: `monorepo-dod-validation` (quando aplicável para validar final state)

---

**Mantido por:** projeto-base contributors
