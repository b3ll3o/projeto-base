# `docs/superpowers/` — índice

> Índice do diretório de **histórico** do repo. Medido em **2026-10-29**:
> **106 planos** em `plans/` e **13 specs** em `specs/`.

## §1. O que é este diretório

Registro **datado** do que foi planejado e decidido. Não é documentação
canônica da aplicação: a verdade de como o sistema funciona hoje mora nos
docs de `docs/api/`, `docs/web/`, `packages/*/README.md` e no próprio código.

> ⚠️ **Histórico não envelhece — e por isso não é alvo de frescor.** Um plano
> de 2026-09 descreve o estado do mundo em 2026-09, e descrever o estado do
> mundo em 2026-09 continua correto. Por isso
> [`docs/superpowers/plans/**`](../../.agents/specs/conventions/documentacao.md)
> está declarado como **exceção** na convenção de documentação: reescrever um
> plano antigo para "combinar com o código de hoje" é falsificar o registro.

## §2. As duas subpastas

| Pasta | O que é | Como se lê |
|---|---|---|
| `plans/` | O **plano de execução**: as fases, os arquivos tocados, os passos. Vários planos por demanda (partes `part-01`, `part-02`…). | "Como o trabalho foi quebrado?" |
| `specs/` | A **spec de design**: a arquitetura, o modelo de dados, o contrato HTTP, a estratégia de testes. Um por tema, com numeração de capítulos. | "O que foi decidido e por quê?" |

Os dois são nomeados `<data>-<slug>.md`, com a data **ISO** (`YYYY-MM-DD`) e um
slug em `kebab-case` que descreve a demanda. A data **é a ordem de leitura**:
o `sort` por nome devolve a linha do tempo.

## §3. Famílias de planos

A contagem abaixo vem do prefixo do slug (a primeira palavra depois da data),
que **particiona** os 106 planos — a soma das linhas dá o total:

```bash
ls docs/superpowers/plans/*.md \
  | sed 's|.*/||; s|^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-||; s|-.*||' \
  | sort | uniq -c | sort -rn
```

| Família | Nº | O que regroupa |
|---|---|---|
| `cadastro` | 39 | O plano de "cadastro de usuário com auditoria": 10 fases (`fase-01` a `fase-10`, cada uma em partes) + o plano. O maior bloco do repo. |
| `melhorias` | 12 | "Melhorias do fluxo de desenvolvimento", em 4 fases (`fase-1-p0`, `fase-2-p1`, `fase-3-p1`, `fase-4-p2`). |
| `review` | 11 | O `review-router`, em 6 fases (`fase-01` a `fase-06`: foundation, catalog, pilot, memories, migration, consolidation) + o plano. |
| `specialist` | 5 | O `specialist-router` + a especialidade de Docker: `fase-01-infra-router`, `fase-02-docker-specialist`, `fase-03a-dockerfiles-compose`, `fase-03b-apps-health-docs-pr` + o plano. |
| `revisao` | 4 | Revisões adversarial de PR (PR #108, PR #109, PR #114). |
| `pendencias` | 3 | Pendências antes do gate (pré-gate) e de feature flags. |
| `guard` | 3 | As classes de guard (baseline, decisões, plano). |
| `feature` | 3 | Feature flags (plano + revisões). |
| `admin` | 3 | Visão de admin do sistema (editar perfil, empresas × usuários, correções de tenancy). |
| `observabilidade` | 2 | Correções de observabilidade (rounds 1 e 3). |
| `multi` | 2 | Multi-tenant (plano + revisões). |
| `issues` | 2 | Issues abertas (P0/P1 e issues #110/#111). |
| `fix` | 2 | Correções de issues abertas (+ apêndice). |
| `ci` | 2 | Robustez de CI e CI local com e2e. |
| `termos` | 1 | Termos de domínio. |
| `telemetria` | 1 | Plano de telemetria. |
| `stack` | 1 | Stack de observabilidade. |
| `pr115` | 1 | Achados do PR #115. |
| `pr` | 1 | Correções do PR #101. |
| `onboarding` | 1 | Onboarding de empresa. |
| `melhoria` | 1 | A demanda "melhoria da documentação da aplicação" (a que produziu este índice). |
| `login` | 1 | Login por usuário e senha. |
| `idor` | 1 | IDOR e rate limit. |
| `coverage` | 1 | Gate de cobertura. |
| `b23.2` | 1 | Polish do backlog (B23.2/B23.3). |
| `auditoria` | 1 | Auditoria de 6 defeitos. |
| `archify` | 1 | Subcomando `archify` de flow. |

**Total: 106** (`ls docs/superpowers/plans/*.md | wc -l`).

Período coberto: **2026-09-21 a 2026-10-29**.

## §4. As specs

13 specs, com a mesma convenção de nome:

```bash
ls docs/superpowers/specs/*.md | wc -l
```

| Família | Nº | O que é |
|---|---|---|
| `cadastro` | 8 | As specs do cadastro de usuário com auditoria: `01-arquitetura-ddd-hexagonal`, `02-modelo-dados`, `03-fluxos-operacoes`, `04-contrato-http`, `05-estrategia-testes`, `05b-exemplos-testes`, `06-impacto-cross-cutting` e `design`. |
| `review` | 1 | `09-22-review-router-design` — design do `review-router`. |
| `specialist` | 1 | `09-23-specialist-router-docker-design` — design do `specialist-router` de Docker. |
| `feature` | 1 | `10-18-feature-flags-contrato-http` — contrato HTTP de feature flags. |
| `archify` | 1 | `09-23-archify-flow-subcommand-design` — design do subcomando `archify`. |
| `b35` | 1 | `09-25-b35-parser-regen-analysis` — análise de regeneração do parser (B35). |

Período coberto: **2026-09-21 a 2026-10-18**.

## §5. Como o conteúdo se liga

O plano **aponta** para o que produziu; o doc canônico **aponta** para o
plano. As duas direções existem, e é o que impede que um plano vire órfão:

| Destino | Onde |
|---|---|
| ADR | [`docs/adr/`](../adr/) — decisão arquitetural que sobrevive ao plano |
| Doc de BC da API | [`docs/api/`](../api/) — o contrato legível |
| Catálogo de rotas | [`docs/web/rotas.md`](../web/rotas.md) — as rotas do frontend |
| Runbook | [`docs/como-rodar.md`](../como-rodar.md) — como subir o ambiente |
| Fluxos | [`docs/flows/`](../flows/) — o fluxo com IR |

## §6. Regras de manutenção

- **O nome é `<data>-<slug>.md`** e a data é a da demanda, não a da escrita.
- **Um plano é imutável depois de executado.** Correção de um plano antigo se
  faz em um plano novo, que aponta para o antigo — não editando o antigo.
- **`plans/` é maior que `specs/`** porque uma demanda pode gerar 10 partes de
  plano e nenhuma spec nova (a spec já existe).
- **Este README é índice, não dump.** Ele não lista os 106 planos um a um: as
  famílias e as contagens bastam para saber o que existe, e `ls` dá o resto.

## §7. Ver mais

- Convenção de documentação (e as exceções declaradas):
  [`.agents/specs/conventions/documentacao.md`](../../.agents/specs/conventions/documentacao.md)
- ADR: [`docs/adr/`](../adr/)
- Convenção de estado do harness: `.agents/runs/`
