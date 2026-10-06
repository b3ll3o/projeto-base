# WORKFLOWS.md — Fluxos Genéricos Pré-Configurados

> Workflows reutilizáveis baseados no padrão `agents:coordinate`. Cada workflow define uma sequência (ou composição) de agents que pode ser disparada por trigger.

---

## Índice de Workflows

### Genéricos

| ID | Trigger | Tipo | Agents |
|----|---------|------|--------|
| `feature-mode` | "implementar X" | sequential | orchestrator → explorer → test-writer → code-reviewer → tdd-enforcer |
| `bugfix-mode` | "corrigir bug" | sequential | orchestrator → explorer → test-writer → code-reviewer → tdd-enforcer |
| `refactor-mode` | "refatorar" | sequential | refactorer → test-writer → code-reviewer → tdd-enforcer |
| `security-mode` | "auditoria segurança" | sequential | security-auditor → code-reviewer |
| `docs-mode` | "documentar" | sequential | doc-writer → code-reviewer |
| `task-mode` | "todo / tarefa" | single | task-manager |
| `explore-mode` | "como funciona X?" | single | explorer |
| `review-mode` | "revisar PR / código" | single | code-reviewer + tdd-enforcer |
| `release-mode` | "preparar release X.Y.Z" | sequential | doc-writer → code-reviewer → task-manager |
| `ci-defense-mode` | "blindar CI / auditar pipeline" | sequential | monorepo-specialist → ci-defense-in-depth → code-reviewer |
| `state-aware-planning` (v1.8.0+) | "planejar / state-aware / snapshot antes de planejar" | sequential | state-aware-planning (skill) → specialist-router (camada 1; opcional) |
| `retrospective-mode` | "capturar aprendizados / post-mortem" | sequential | explorer → retrospective-capture → doc-writer (+ task-manager) |
| `review-routing` | — | sequential | review-router → specialists (auto-dispatched via matriz) |
| `specialist-routing` | specialist-router | sequential | router → controller (decide planejar ou bloquear) |
| `pr-refresh` | "atualizar título/descrição do PR" | single | pr-refresh-scan → agente (reclassifica + reescreve) |
| `pr-pendencias` (v1.11.0+) | "revisar pendências do PR / o que ficou para depois" | parallel→merge | 1 agente por pendência (mede) → adversarial (reroda) → agente (consolida) |

### Por Stack (workflows detalhados em `.agents/workflows/`)

| ID | Trigger | Tipo | Agents | Detalhe |
|----|---------|------|--------|---------|
| `backend-feature` | "implementar endpoint NestJS" | sequential | nestjs-specialist → test-writer → code-reviewer → tdd-enforcer | [`.agents/workflows/backend-feature.md`](./workflows/backend-feature.md) |
| `frontend-feature` | "criar página/rota Next.js" | sequential | nextjs-specialist → test-writer → code-reviewer → tdd-enforcer | [`.agents/workflows/frontend-feature.md`](./workflows/frontend-feature.md) |
| `monorepo-change` | "adicionar/mover pacote ou app" | sequential | monorepo-specialist → code-reviewer | [`.agents/workflows/monorepo-change.md`](./workflows/monorepo-change.md) |
| `archive-demand` | "arquivar demanda implementada" | single | archive-demand skill (controller) | [`.agents/workflows/archive-demand.md`](./workflows/archive-demand.md) |

| `feedback-to-spec` | "feedback to spec / próxima spec de finding / T1/T2/T3 → spec" | sequential | task-manager → orchestrator → specialist-router → specialist (template spec) → task-manager | [workflows/feedback-to-spec.md](./workflows/feedback-to-spec.md) |

---

## Resumo dos workflows inline

### `security-mode` — Auditoria de Segurança

**Composição:** `SECURITY-AUDITOR → CODE-REVIEWER`

Foco: OWASP Top 10 (A01:2021 a A10:2021), supply chain, secrets em código, validação de input/output encoding, auth/sessão, criptografia em trânsito e repouso.

### `docs-mode` — Documentação

**Composição:** `DOC-WRITER → CODE-REVIEWER`

Foco: linguagem clara, exemplos de código, diagramas para fluxos complexos, manutenção de refs cruzadas.

### `task-mode` — Gestão de Tarefas

**Composição:** `TASK-MANAGER` (single)

Output:

```yaml
- id: TASK-001
  title: ...
  status: todo | in_progress | done
  priority: low | medium | high | critical
  assignee: ...
  dependencies: [...]
  acceptance_criteria: [...]
```

### `explore-mode` — Exploração Read-Only

**Composição:** `EXPLORER` (single, read-only)

Saída típica: arquivos relevantes, dependências, padrões arquiteturais, pontos de extensão.

### `review-mode` — Revisão de Código

**Composição:** `CODE-REVIEWER` (+ `tdd-enforcer` em PR)

Categorias: 🐛 Bugs · ⚠️ Smells · 🔒 Segurança · ⚡ Performance · 🧪 Testabilidade · 📐 Estilo.

### `release-mode` — Bump de Versão

**Composição:** `DOC-WRITER → CODE-REVIEWER → TASK-MANAGER`

Detalhes: [`workflows/release-mode.md`](./workflows/release-mode.md) · spec: [`.agents/specs/conventions/post-merge-release.md`](./specs/conventions/post-merge-release.md).

### `review-routing` — Orquestrador de Revisão Pós-Task

Despacha specialists baseado em classificação de diff.

**Triggers:** Manual (controller invoca após implementer DONE) ou automático via CI (`review-stack.yml`).

**Outputs:** `.agents/runs/<timestamp>-review-<n>.yaml` com classification + reviewers_dispatched + findings_aggregated.

**Cross-refs:** [`.agents/specs/conventions/review-routing.md`](./specs/conventions/review-routing.md) · [`.agents/skills/review-routing/SKILL.md`](./skills/review-routing/SKILL.md).

### `specialist-routing` — Orquestrador de Demanda Pré-Planning

Classifica demanda (keywords + paths + scope) via matriz canônica e despacha specialists em paralelo. Bloqueia se `gap_detected`.

**Outputs:** `.agents/runs/<timestamp>-specialist-<n>.yaml` com classification + specialists_dispatched + plans_aggregated.

Detalhes: [`workflows/specialist-routing.md`](./workflows/specialist-routing.md) · spec: [`.agents/specs/conventions/specialist-routing.md`](./specs/conventions/specialist-routing.md).

### `retrospective-mode` — Captura de Aprendizados Pós-Atividade

**Trigger:** "capturar aprendizados" · plano ≥3 tasks · bugfix > 30min · 1ª adoção de skill.

**Composição:** sequential + task-manager paralelo no final

```yaml
explorer → retrospective-capture:{success_criteria:"diff+memories+≥3 events"}
retrospective-capture → doc-writer:{success_criteria:"0 proposals conf<70;result file ≤300 linhas"}
doc-writer + task-manager (paralelo):{success_criteria:"proposals → memory/PR/backlog"}
```

Detalhes: [`workflows/retrospective-mode.md`](./workflows/retrospective-mode.md) · skill: [`.agents/skills/retrospective-capture/SKILL.md`](./skills/retrospective-capture/SKILL.md).

### `feedback-to-spec` (v1.9.0+) — Fecha o Engineering Loop

Pega proposals T1/T2/T3 com confidence ≥ 70 do `retrospective-mode` e estrutura a criação de **specs filhas** via state-aware-planning → specialist-router → template `spec.md`.

**Composição:** sequential (5 estágios)

```text
RETRO RESULT → TRIAGE → STATE-AWARE → SPECIALIST-ROUTER → SPEC CREATION → LOOP CLOSE
```

Detalhes: [`.agents/workflows/feedback-to-spec.md`](./workflows/feedback-to-spec.md) · spec: [`engineering-loop.md`](./specs/conventions/engineering-loop.md) §4.

---

## `pr-refresh` (v1.10.0+) — Título e Descrição de um PR Aberto

```text
PUSH NOVO → T1 PR aberto? → T2 branch avançou? → T3 ≥1 claim DIVERGENTE? → T4 ainda OPEN? → reescreve SÓ as linhas divergentes
               (gh pr list,     (rev-list --count)    (pr-refresh-scan.ts)        (re-checar no     (gh api -X PATCH …/pulls/N
                mede stdout)                                               momento da escrita) -F body=@arquivo)
```

**Quando usar:** PR aberto + push novo. **Quando NÃO usar:** PR MERGED/CLOSED (histórico imutável) · PR sem description (isso é criação) · branch sem PR aberto.

**T3 carrega o peso:** T1 + T2 são verdadeiros em 100% dos pushes de uma branch com PR aberto — disparar só com eles é a **classe 1**. E **T1 mede o stdout do `gh`, não o `$?`**: auth expirado devolve lista vazia _e_ exit ≠ 0, e testar o exit acusa "não há PR" quando o truth é "não consegui perguntar".

**Fronteira dura:** o corpo do PR é entrada não confiável e mutável; o scanner **não executa nada que venha dele** (é regex; o único subprocesso é o `git`) — executar o comando de re-medição escrito no corpo seria RCE em CI. Offline por padrão, porque o `preflight` roda sem rede e `.husky/pre-push:9` faz `|| exit 1` em qualquer branch.

Detalhes: [`.agents/workflows/pr-refresh.md`](./workflows/pr-refresh.md) · script: [`tooling/scripts/pr-refresh-scan.ts`](../tooling/scripts/pr-refresh-scan.ts) · spec: [`guard-classes.md`](./specs/conventions/guard-classes.md).

---

## `pr-pendencias` (v1.11.0+) — Pendências Declaradas de um PR Aberto

```text
CORPO DO PR ──► 1 agente POR PENDÊNCIA (roda o comando, devolve veredito + evidência)
                     │
                     ▼
              ADVERSARIAL (reroda o comando central por conta própria) ──► consolida
                     │
   ┌─────────────────┼─────────────────┬──────────────────────┬───────────────────────────┐
   ▼                 ▼                 ▼                      ▼                           ▼
resolvida          viva          mudou-de-forma      decisão-de-NÃO-construir        corpo do PR
(sai da lista)     → issue       → issue, com a      → issue que REGISTRA a          ficou falso →
                                    descrição certa        decisão                       corrigir o corpo
```

**Por que é separado do `pr-refresh`:** o `pr-refresh` mede o que o **git** mede (regex determinística sobre números). Pendência é afirmação sobre _trabalho não feito_ — cada uma tem o seu comando, e nenhuma regex os cobre sem cobrir só o formato que ela mesma escreveu.

**Cada pendência sai com um veredito — inclusive `resolvida`, e inclusive quando `vivas = 0`.** `[]` quer dizer "não há pendência" e também "não li as pendências", e o leitor não distingue as duas. Por isso a contagem `vivas / medidas` vai no result file: `0 vivas de 6` é um resultado; linha vazia é ausência.

**Fronteira dura:** igual ao `pr-refresh` — o corpo do PR é lido, nunca **executado**. O revisor roda o comando que escolheu; a pendência é uma descrição, não um comando.

Detalhes: [`.agents/workflows/pr-pendencias.md`](./workflows/pr-pendencias.md) · spec: [`guard-classes.md`](./specs/conventions/guard-classes.md) (classes 1 e 7).

---

## Workflows por Stack

- [`backend-feature`](./workflows/backend-feature.md) · [`frontend-feature`](./workflows/frontend-feature.md) · [`monorepo-change`](./workflows/monorepo-change.md) · [`archive-demand`](./workflows/archive-demand.md) · [`state-aware-planning`](./workflows/state-aware-planning.md) (v1.8.0+)

## Customização

Para criar um workflow customizado: defina `trigger`, escolha a `composição` (sequential/parallel/hierarchical), liste os `agents` em ordem, defina os `handoffs`, adicione entrada na tabela acima, e documente em `.agents/workflows/<id>.md` se for complexo (>30 linhas).

**Mantido por:** projeto-base contributors
**Versão do padrão:** 1.9.0
