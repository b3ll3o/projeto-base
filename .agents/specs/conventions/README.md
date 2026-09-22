# Convenções do Template (AGENTS.md §6)

> **Índice das sub-specs de convenções.** Detalhes completos nos arquivos abaixo.

Cada convenção está em arquivo próprio para manter este diretório e o AGENTS.md ≤ 300 linhas.

| Convenção | Arquivo | Descrição |
|-----------|---------|-----------|
| Idioma pt-BR | [`idioma.md`](./idioma.md) | Português Brasileiro como idioma padrão |
| Tamanho & Revisão | [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) | Limite de 300 linhas + checklist de revisão |
| TDD | [`tdd.md`](./tdd.md) | Desenvolvimento orientado a testes (Kent Beck) |
| Evolução de Agents | [`evolucao-agents.md`](./evolucao-agents.md) | Agents e skills evoluem junto com a aplicação |
| Git Workflow | [`git-workflow.md`](./git-workflow.md) | `main` protegida; merge apenas via PR |
| Estrutura & Versionamento | [`estrutura-e-versionamento.md`](./estrutura-e-versionamento.md) | Layout de diretórios e versionamento semântico |
| Cobertura de Testes | [`cobertura-testes.md`](./cobertura-testes.md) | Mínimo 80% agregado por projeto vitest; hard fail CI |
| Release Automático (Post-Merge) | [`post-merge-release.md`](./post-merge-release.md) | Auto-tagging `vX.Y.Z` via `.github/workflows/release-template.yml` após bump em main |

## Regra Geral

Estas convenções são OBRIGATÓRIAS e referenciadas por [AGENTS.md §6](../../../AGENTS.md).
Em caso de divergência entre este índice e os arquivos detalhados, prevalecem os arquivos detalhados.
