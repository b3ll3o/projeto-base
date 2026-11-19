---
name: e2e-coverage-mode
description: Fecha a cobertura e2e de todos os fluxos da aplicação antes de um push — audita, planeja, revisa o plano, implementa os specs faltantes, roda a suíte e commita/pusha na branch. Use antes de todo push que toque telas, rotas ou ações, e quando alguém perguntar "os fluxos da aplicação têm e2e?".
type: workflow
---

# Workflow: `e2e-coverage-mode`

> pt-BR: fecha o espaço entre "a tela existe" e "a tela foi provada". O gate
> [`check-e2e-flow-coverage`](../../.tooling/scripts/ci/check-e2e-flow-coverage.ts)
> mede a **paridade declarativa** (inventário ⇄ specs ⇄ `page.tsx` do disco);
> este workflow mede a **semântica** (o spec afirma o efeito? a recusa está
> coberta? a semente é pela API?) e **implementa** o que falta.

**Trigger:** "os fluxos da aplicação têm e2e?", "falta teste e2e", "cobertura e2e
antes do push", e **todo push** que toque `apps/web/**`.

**Composição:** sequential (1 agente + 1 revisor), com retorno ao implementador
após a correção do plano.

```text
E2E-SPECIALIST (auditar → planejar) → REVIEWER (revisar o plano) → E2E-SPECIALIST (implementar → verificar → commitar/pushar)
```

## Por que o ciclo é do agent e não do hook

O hook [`pre-push`](../../.husky/pre-push) roda `ci:preflight` (que inclui o
gate de paridade) e `ci:boot` — **a suíte e2e não roda no push local**. O que
falta entre o gate e o CI é a leitura semântica e a implementação do que falta,
e as duas precisam de um agent.

## Handoff

```yaml
e2e-specialist → code-reviewer (revisão do plano):
  task: "Revisar o plano de specs e2e faltantes antes de qualquer implementação"
  context:
    plano: "docs/superpowers/plans/<data>-e2e-<slug>.md"
    lacunas: "lista da auditoria (tipo, fluxo, rota, sintoma)"
  expected_output:
    blockers: [{ item, motivo, correcao }]
    approved: bool
  success_criteria:
    - "O plano afirma o EFEITO de cada fluxo, não só que renderiza"
    - "A recusa está com o dado PLANTADO"
    - "A semente de cada estado prévio é por API/banco, com o porquê"
    - "O par que segura o comportamento está inteiro (recusa/liberdade, antes/depois)"
    - "argv, URL e comando são literais — o plano não re-deriva o esperado da implementação"
    - "A ordem dos fatos no cenário torna a mutação observável"

code-reviewer → e2e-specialist (plano corrigido):
  task: "Aplicar as correções do plano e re-revisar até zero blocker"
  context:
    blockers: "lista acima"
  expected_output:
    plano_corrigido: "path"
    blockers_abertos: 0
  success_criteria:
    - "Nenhum blocker aberto"
```

## Passos

| # | Passo | Quem | Como se prova |
|---|---|---|---|
| 0 | Pré-condições: branch (nunca `main`), árvore, `main` atualizada | `e2e-specialist` | `git branch --show-current` |
| 1 | **Auditar**: gate de paridade + leitura de cada spec | `e2e-specialist` | lista de lacunas com o denominador (telas, fluxos, specs) |
| 2 | **Planear**: um item por lacuna, no formato `agents:coordinate` | `e2e-specialist` | `docs/superpowers/plans/<data>-e2e-<slug>.md` |
| 3 | **Revisar o plano** (outro agent) | `code-reviewer` | blockers corrigidos, zero aberto |
| 4 | **Implementar**: linha do inventário **+** spec, no mesmo diff | `e2e-specialist` | `// FLUXO: F<N>` na primeira linha |
| 5 | **Verificar**: spec novo, suíte inteira, preflight | `e2e-specialist` | saída do `test:e2e` |
| 6 | **Commitar e pushar** na branch | `e2e-specialist` | `git push -u origin feature/<slug>` |

## Comandos

```bash
# 1. a metade declarativa
pnpm exec tsx .tooling/scripts/ci/check-e2e-flow-coverage.ts

# 4/5. o spec novo, a suíte, e o gate
pnpm --filter @projeto/web test:e2e f<N>-<slug>.spec.ts
pnpm --filter @projeto/web test:e2e
pnpm ci:preflight

# 6. o commit (Conventional Commits — o hook commit-msg cobra)
git add apps/web/e2e/f<N>-<slug>.spec.ts .agents/specs/conventions/e2e-playwright.md
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
