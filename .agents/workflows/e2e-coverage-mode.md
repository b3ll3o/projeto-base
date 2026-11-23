---
name: e2e-coverage-mode
description: Fecha a cobertura e2e de todos os fluxos da aplicação antes de um push — audita, planeja, revisa o plano, implementa os specs faltantes, roda a suíte, revisa o spec e commita/pusha na branch. Use quando a demanda é roteada ao e2e-specialist (tela ou spec e2e) e quando alguém perguntar "os fluxos da aplicação têm e2e?".
type: workflow
---

# Workflow: `e2e-coverage-mode`

> pt-BR: fecha o espaço entre "a tela existe" e "a tela foi provada". O gate
> [`check-e2e-flow-coverage`](../../.tooling/scripts/ci/check-e2e-flow-coverage.ts)
> mede a **paridade declarativa** (inventário ⇄ specs ⇄ `page.tsx` do disco);
> este workflow mede a **semântica** (o spec afirma o efeito? a recusa está
> coberta? a semente é pela API?) e **implementa** o que falta.

**Trigger:** "os fluxos da aplicação têm e2e?", "falta teste e2e", "cobertura e2e
antes do push", e **quando a demanda é roteada ao agent** — a matriz
`specialist-routing.md` v1.8 roteia uma tela (`apps/web/app/**/page.tsx`) ou
um spec (`apps/web/e2e/**`).

**Composição:** sequential (1 implementador + revisores), com retorno ao
implementador após cada correção.

```text
E2E-SPECIALIST (auditar → planejar) → CODE-REVIEWER (revisar o plano) → E2E-SPECIALIST (implementar → verificar) → CODE-REVIEWER (revisar o spec) → E2E-SPECIALIST (commitar/pushar)
```

## Por que o ciclo é do agent e não do hook

O hook [`pre-push`](../../.husky/pre-push) roda `ci:preflight` (que inclui o
gate de paridade) e `ci:boot` — **a suíte e2e, o lint, os tipos e a cobertura
não rodam no push local**. O que falta entre o gate e o CI é a leitura
semântica e a implementação do que falta, e as duas precisam de um agent.

## Dispatch 1 — revisão do plano

```yaml
dispatch:
  from: e2e-specialist
  to: code-reviewer
  composition: sequential

  task:
    description: "Revisar o plano de specs e2e faltantes antes de qualquer implementação"

  context:
    files:
      - docs/superpowers/plans/<data>-e2e-<slug>.md
    code_snippets: []
    prior_outputs:
      - "auditoria: lista de lacunas (tipo, fluxo, rota, sintoma)"
    constraints:
      - "Read-only: não editar, não commitar, não fazer checkout/stash/reset"
      - "Responder em pt-BR, sem praise"

  expected_output:
    format: "yaml"
    schema:
      blockers:
        - item: "..."
          motivo: "..."
          correcao: "..."
      approved: bool

  success_criteria:
    - "O plano afirma o EFEITO de cada fluxo, não só que renderiza"
    - "A recusa está com o dado PLANTADO"
    - "A semente de cada estado prévio é por API/banco, com o porquê"
    - "O par que segura o comportamento está inteiro (recusa/liberdade, antes/depois)"
    - "argv, URL e comando são literais — o plano não re-deriva o esperado da implementação"
    - "A ordem dos fatos no cenário torna a mutação observável"

  on_failure:
    fallback_agent: null
    retry_policy: "once"
    max_retries: 1
```

## Dispatch 2 — revisão do spec implementado

```yaml
dispatch:
  from: e2e-specialist
  to: code-reviewer
  composition: sequential

  task:
    description: "Revisar o spec e2e implementado antes do commit, contra a convenção e2e-playwright"

  context:
    files:
      - apps/web/e2e/f<N>-<slug>.spec.ts
      - .agents/specs/conventions/e2e-playwright.md
    code_snippets: []
    prior_outputs:
      - "plano aprovado e spec implementado"
    constraints:
      - "Read-only: não editar, não commitar, não fazer checkout/stash/reset"

  expected_output:
    format: "yaml"
    schema:
      findings:
        - severity: "blocker | major | minor | info"
          category: "bug | smell | security | perf | testability | style"
          description: "..."
          location: { file: "...", line: 0 }
          recommendation: "..."
      approved: bool

  success_criteria:
    - "O spec afirma o efeito (dado na tela ou no banco), não só que renderizou"
    - "A recusa tem o dado plantado"
    - "A semente é por API/banco, e a asserção é a que a pessoa lê"

  on_failure:
    fallback_agent: null
    retry_policy: "once"
    max_retries: 1
```

## Passos

| # | Passo | Quem | Como se prova |
|---|---|---|---|
| 0 | Pré-condições: branch (nunca `main`), árvore, `main` atualizada | `e2e-specialist` | `git branch --show-current` |
| 1 | **Auditar**: gate de paridade + leitura de cada spec | `e2e-specialist` | lista de lacunas com o denominador (telas, fluxos, specs) |
| 2 | **Snapshot + planejar**: `state-snapshot-<ts>.md` e um item por lacuna | `e2e-specialist` | `docs/superpowers/plans/<data>-e2e-<slug>.md` com `state_snapshot:` no frontmatter |
| 3 | **Revisar o plano** (outro agent) | `code-reviewer` | blockers corrigidos, zero aberto |
| 4 | **Implementar**: linha do inventário **+** spec, no mesmo diff | `e2e-specialist` | `// FLUXO: F<N>` na primeira linha |
| 5 | **Verificar**: spec novo, depois `pnpm ci:local` | `e2e-specialist` | saída do `ci:local` |
| 6 | **Revisar o spec** (outro agent) | `code-reviewer` | findings corrigidos, zero blocker |
| 7 | **Commitar e pushar** na branch | `e2e-specialist` | `git push -u origin feature/<slug>` |

## Comandos

```bash
# 1. a metade declarativa
pnpm exec tsx .tooling/scripts/ci/check-e2e-flow-coverage.ts

# 5. o spec novo (feedback rápido) e o gate obrigatório antes do push
pnpm --filter @projeto/web test:e2e f<N>-<slug>.spec.ts
pnpm ci:local

# 7. o commit (Conventional Commits — o hook commit-msg cobra)
git branch --show-current
git add <spec> <inventário> <plano> <eventual conserto de produto>
git commit -F <arquivo-de-mensagem>
git push -u origin feature/<slug>
```

## Quando Usar

- Antes de um push que toque tela, rota, ação ou estado novo.
- Quando o gate acusar paridade quebrada (tela sem linha, fluxo sem spec).
- Quando alguém perguntar "isso aqui é coberto por e2e?".

## Quando Não Usar

- Cobertura unit/integration → `test-writer`.
- Aparência e a11y da tela → `ux-design-specialist`.
- Defeito de produto revelado por um spec: o spec está certo — conserte o
  produto.

## Referências

- Agent: [`.agents/agents/e2e-specialist.md`](../agents/e2e-specialist.md)
- Convenção: [`e2e-playwright.md`](../specs/conventions/e2e-playwright.md)
- Git: [`git-workflow.md`](../specs/conventions/git-workflow.md)
- Coordenação: [`agents-coordinate`](../skills/agents-coordinate/SKILL.md)

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
