# Convenções do Template (AGENTS.md §6)

> **Índice das sub-specs de convenções.** Detalhes completos nos arquivos abaixo.

Cada convenção está em arquivo próprio para manter este diretório e o AGENTS.md ≤ 300 linhas.

**Este arquivo e o [`AGENTS.md` §6](../../../AGENTS.md) são o MESMO índice, e ambos
são mantidos.** Houve um tempo em que divergiram: `evals.md` e `engineering-loop.md`
(as 2 mais novas, v1.9.0) entravam pelo `AGENTS.md` e nunca espelharam aqui, e
`demand-archiving`, `review-routing`, `specialist-routing` e seus apêndices não
entravam em nenhum dos dois. Convenção ausente de índice é convenção que ninguém
lê — a task 2.2 do plano `guard-classes` fecha isso. **Regra: criar uma convenção
é criar a linha nos DOIS índices**, no mesmo PR.

| Convenção | Arquivo | Descrição |
|-----------|---------|-----------|
| Idioma pt-BR | [`idioma.md`](./idioma.md) | Português Brasileiro como idioma padrão |
| Tamanho & Revisão | [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) | Limite de 300 linhas + checklist de revisão |
| TDD | [`tdd.md`](./tdd.md) | Desenvolvimento orientado a testes (Kent Beck) |
| Evolução de Agents | [`evolucao-agents.md`](./evolucao-agents.md) | Agents e skills evoluem junto com a aplicação |
| Git Workflow | [`git-workflow.md`](./git-workflow.md) | `main` protegida; merge apenas via PR; branch mergeada é apagada ([apêndice](./git-workflow-apendice.md)) |
| Estrutura & Versionamento | [`estrutura-e-versionamento.md`](./estrutura-e-versionamento.md) | Layout de diretórios e versionamento semântico |
| Cobertura de Testes | [`cobertura-testes.md`](./cobertura-testes.md) | Mínimo 80% agregado por projeto vitest; hard fail CI |
| Release Automático (Post-Merge) | [`post-merge-release.md`](./post-merge-release.md) | Auto-tagging `vX.Y.Z` via `.github/workflows/release-template.yml` após bump em main |
| CI Defense in Depth | [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) | 3 camadas: pre-push local + preflight CI + quality CI gated |
| CI Defense in Depth — pendências | [`ci-defense-in-depth-pendencias.md`](./ci-defense-in-depth-pendencias.md) | Pendências abertas dos gates (companion; cresce sem caber no documento da convenção) |
| Retrospective Capture | [`retrospective-capture.md`](./retrospective-capture.md) | Captura estruturada de aprendizados pós-atividade (T1/T2/T3 + threshold confidence ≥ 70) |
| State-Aware Planning (v1.8.0+) | [`state-aware-planning.md`](./state-aware-planning.md) | Camada 0 do pre-planner — `state-snapshot-<ts>.md` antes de planejar; alimenta `specialist-router` camada 1 |
| Evals (v1.9.0+) | [`evals.md`](./evals.md) | 7 tipos de eval; `specs/<feature>/evals/*.evals.yaml`; gate rules por severidade |
| Engineering Loop (v1.9.0+) | [`engineering-loop.md`](./engineering-loop.md) | Ciclo UNDERSTAND → IMPLEMENT → TEST → REVIEW → OBSERVE → LEARN; fecha via workflow `feedback-to-spec` |
| Demand Archiving | [`demand-archiving.md`](./demand-archiving.md) | Quando e como arquivar uma demanda; frontmatter canônico validado por `archive:lint` |
| Review Routing | [`review-routing.md`](./review-routing.md) | Matriz que decide quem revisa o quê; apêndice de exemplos em [`review-routing-examples.md`](./review-routing-examples.md) |
| Specialist Routing | [`specialist-routing.md`](./specialist-routing.md) | Roteamento por especialidade; apêndice de exemplos em [`specialist-routing-examples.md`](./specialist-routing-examples.md) |
| Guard Classes | [`guard-classes.md`](./guard-classes.md) | As 7 classes pelas quais um controle falha reportando verde; receita de detecção por classe **e a coluna "não pega"** |

## Regra Geral

Estas convenções são OBRIGATÓRIAS e referenciadas por [AGENTS.md §6](../../../AGENTS.md).
Em caso de divergência entre este índice e os arquivos detalhados, prevalecem os arquivos detalhados.
Em caso de divergência entre este índice e o `AGENTS.md` §6, **cada `.md` deste
diretório tem de aparecer nos dois** — nenhum dos dois é canônico, e a task 2.2 do
plano `guard-classes` é o que impediu a divergência de virar órfã silenciosa.
