# TDR-0001 — System design canônico

> O registro do **raciocínio** da mudança que introduziu o system design
> canônico no repositório: as alternativas avaliadas, os riscos aceitos, o
> rollout e a revisão.
>
> **O dono da decisão** é o
> [ADR-0010](../adr/0010-system-design-canonico.md). **O dono do desenho** é o
> conjunto [`docs/system-design/`](../system-design/README.md). Este doc não
> repete nenhum dos dois: aponta.

- **Status:** Aceito
- **Data:** 2026-11-18 (o registro da decisão é de 2026-11-09)
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Relacionados:** [ADR-0010](../adr/0010-system-design-canonico.md) · [`docs/system-design/`](../system-design/README.md) · [`docs/adr/`](../adr/) (índice: [`docs/agents/domain.md`](../agents/domain.md))

## Proposta

**O que foi proposto:** dar ao repositório um **desenho de sistema próprio** —
a topologia do ator ao banco, a fronteira de confiança, o caminho de um
request e o **contrato de extensão** — em vez de deixar a arquitetura
espalhada por 6 arquivos sem endereço.

A **decisão** que sustentou a proposta está no
[ADR-0010](../adr/0010-system-design-canonico.md) §Decisão: um conjunto de **7
documentos** em `docs/system-design/` (1 índice + 6 focais) —
`ls docs/system-design/*.md | wc -l` → **7** — mais **1 template**
(`.agents/specs/templates/system-design.md`) que o app derivado copia, mais o
próprio ADR.

### As alternativas avaliadas

O ADR-0010 §Alternativas consideradas é o dono desta lista; aqui está o
**raciocínio**, não a repetição.

| # | Alternativa | Por que foi rejeitada |
|---|---|---|
| A1 | **Um documento único** (`docs/SYSTEM-DESIGN.md`) | Não cabe no teto de 300 linhas do [`check-doc-size`](../../.tooling/scripts/ci/check-doc-size.ts), e um documento de 600 linhas que ninguém lê é pior que 8 documentos de 200 que alguém percorre. |
| A2 | **Só um diagrama bonito, sem prosa** | Um diagrama sem dono de fato (ADR, arquivo, linha) volta a mentir na primeira mudança de código. A beleza serve à leitura; não substitui a âncora. |
| A3 | **Reescrever o [`STACK.md`](../STACK.md) como system design** | O `STACK.md` é o dono das versões e da justificativa de cada tecnologia; misturar topologia com versão torna os dois piores. |
| A4 | **Gerar o system design do código** (ferramenta de análise que extrai a arquitetura do repositório) | O que falta não é extrair a estrutura — ela está no disco — é **explicar a intenção** por trás dela, e a intenção não está no código. O repo já tem o `graphify` para pergunta de estrutura. |
| A5 | **Um quarto nível C4 ("código") como documento** | Ele é o repositório, e o dono dele é a convenção [`estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md). Escrevê-lo duplicaria o que a convenção já mede. |
| A6 | **Um segundo índice de ADRs** (`docs/decisoes.md`) | Um índice de ADRs tem **um** dono: [`docs/agents/domain.md`](../agents/domain.md). O conjunto apenas linka. |
| A7 | **Um gate novo que valide o conjunto** | O [`check-doc-coverage`](../../.tooling/scripts/ci/check-doc-coverage.ts) mede *unidade de código → doc canônico*, e o conjunto **não é** unidade de código. Declarar a família na matriz §3 exigiria mudar o gate no mesmo PR — a alternativa foi declarar o dono na tabela de donos e **registrar a lacuna** no ADR. |

### O que ficou de fora, e por quê

- **Um dashboard de SLO pronto** — exigiria backend de métricas; o Prometheus
  local não tem o que um SLI precisa. O doc **propõe** os SLIs e marca como
  `[derivado]`.
- **Um diagrama de implantação em nuvem** — o repo implanta em Docker Compose;
  desenhar um cluster que não existe seria ficção.
- **Um "design system" de UI** — o repo tem as skills `ui-*`; aqui, "system
  design" é arquitetura de software.

## Riscos

O ADR-0010 §Consequências é o dono da lista completa; o que muda o desenho é
o **tratamento** de cada risco.

| # | Risco | Por que é real | Como foi tratado | Onde está registrado |
|---|---|---|---|---|
| T1 | **O desenho envelhecer sem instrumento automático** | O conjunto tem 7 documentos vivos, e só **1** deles tem gatilho de revisão | O `doc-sync` mapeia `schema.prisma` → [`dados.md`](../system-design/dados.md). Os **outros 5 focais** **não** têm gatilho | [`system-design/README.md`](../system-design/README.md) §5 ("Parcialmente") e §Em aberto do [ADR-0010](../adr/0010-system-design-canonico.md) |
| T2 | **O doc repetir o conteúdo do ADR** | O ADR e o desenho falam da mesma arquitetura | **Proibido** pelo ADR-0010: onde os dois falam do mesmo fato, o desenho **aponta** | [ADR-0010](../adr/0010-system-design-canonico.md) §Consequências |
| T3 | **O doc afirmar número sem o comando que o produz** | O `check-doc-claims` cobre só os 6 docs de API — o conjunto novo **não** está no registry | A regra vira **humana**: o comando vai inline, como a convenção [`tamanho-e-revisao.md`](../../.agents/specs/conventions/tamanho-e-revisao.md) exige | [ADR-0010](../adr/0010-system-design-canonico.md) §Consequências |
| T4 | **`[derivado]` promovido a fato** | Um SLO inventado como fato é a pior mentira possível: parece que alguém já pensou nisso | Rótulo único por linha: `fato` · `[derivado]` · `lacuna`. Um `[derivado]` que vira medido muda de rótulo **no mesmo commit** que passa a medir | [ADR-0010](../adr/0010-system-design-canonico.md) §Decisão 4 |
| T5 | **7 documentos para manter** | Mais superfície para envelhecer | Dono explícito por arquivo + o mapeamento do `doc-sync` para o modelo de dados | [ADR-0010](../adr/0010-system-design-canonico.md) §Consequências |
| T6 | **O `check-doc-coverage` não medir o conjunto** | O gate mede unidade de código → doc; o conjunto não é unidade de código | Declarado na tabela de donos de [`documentacao.md`](../../.agents/specs/conventions/documentacao.md) §2 — declarado, não esquecido | [ADR-0010](../adr/0010-system-design-canonico.md) §Consequências |
| T7 | **Lacuna de cobertura que ninguém vê** | O `doc-sync` é cego para 5 dos 6 focais | A lacuna está **escrita** como Em aberto no ADR e listada em [`system-design/README.md`](../system-design/README.md) §6 | [ADR-0010](../adr/0010-system-design-canonico.md) §Em aberto |

## Segurança

**A mudança, em si, não tocou superfície atacável.** O plano que a executou
tinha escopo de documentação: **nenhuma mudança** em `apps/`, `packages/` nem
`infra/` — o snapshot de estado que o precedeu confirmou que nenhum gate de
runtime seria acionado. O único artefato fora de `docs/` é o **template**
copiado pelo derivado, e nenhum segredo foi escrito em disco: o conjunto nomeia
**papéis** de banco (`app_runtime`, `app_system`, dono) e **variáveis de
ambiente** (`SYSTEM_DATABASE_URL`, …), nunca valores.

**O risco real é o oposto:** o desenho **afirma** coisas sobre o modelo de
segurança — fronteira de credencial, RLS como segunda camada, escopo ausente
lendo zero linhas — e uma afirmação falsa ali é **falsa assurance**, que é
pior que ausência. Por isso o desenho foi submetido a uma **medição de
conformidade** antes de ser considerado verdade: o plano
[`2026-11-10-conformidade-system-design.md`](../superpowers/plans/2026-11-10-conformidade-system-design.md)
mediu **4 divergências** entre o que o desenho afirmava e o que o código fazia
(`grep -cE '^\| \*\*X[0-9]' docs/superpowers/plans/2026-11-10-conformidade-system-design.md`
→ **4**). As que tocavam segurança e operação:

| Divergência | O desenho afirmava | O código fazia | Por que importa |
|---|---|---|---|
| **X1** | a rota de health não é contada pelo rate limit | **não existia** `@SkipThrottle()` — e **dois comentários do código** afirmavam que existia | a forma mais grave de divergência: **o código** afirmando um controle que não existe. O probe derrubava o container |
| **X2** | API → banco: nenhum timeout | o papel `app_runtime` **não tinha** `statement_timeout` | uma query lenta segurava conexão do pool — e o pool é o limite de escala |
| **X4** | a correlação entre resposta e auditoria é única | **duas** derivações de `traceId` | o log e o erro que o usuário viu apontavam para identificadores diferentes — a correlação que é a razão de o log existir |

O tratamento não foi "corrigir o doc": foi **corrigir o código** para casar
com o desenho, com ADR novo quando a correção era decisão
([ADR-0011](../adr/0011-idempotencia-de-escrita.md),
[ADR-0012](../adr/0012-orcamento-de-tempo-no-banco.md)) e com **medição com
comando** em cada tarefa.

O que ficou **declarado** como não resolvido: a lista de lacunas do §6 do
[índice do desenho](../system-design/README.md) — fila, cache distribuído,
consistência eventual, SLO, resiliência entre serviços, a coluna de
`correlationId` na trilha de auditoria e o `Idempotency-Key` em `/auth`.

## Rollout

A cronologia real, com os artefatos e as datas que existem em disco.

| # | Data | O que aconteceu | Artefato |
|---|---|---|---|
| 1 | 2026-11-09 | Snapshot de estado da demanda (`proceed: true`, 4 gaps, todos de documentação) | [`.agents/runs/state-snapshot-20261109T213637Z.md`](../../.agents/runs/state-snapshot-20261109T213637Z.md) |
| 2 | 2026-11-09 | Plano v1.0.0, com as decisões fechadas (D1–D8) e a régua da honestidade | [`2026-11-09-system-design-padrao.md`](../superpowers/plans/2026-11-09-system-design-padrao.md) |
| 3 | 2026-11-09 | Revisão adversarial do **plano** (v1.1.0): **3 P0, 11 P1 e 3 P2 corrigidos** | §Revisão do mesmo plano |
| 4 | 2026-11-09 | Execução: 7 docs + 1 template + o ADR; os 6 footers vão de `1.25.0` para `1.26.0` | §O que a execução produziu, do mesmo plano |
| 5 | 2026-11-09 | Revisão do **conteúdo** (v1.2.0): o `code-reviewer` devolveu **18 achados** (5 P0, 7 P1, 6 P2) e **17** foram corrigidos | §A revisão do conteúdo (3º reviewer), do mesmo plano |
| 6 | 2026-11-09 | O ADR é aceito: a decisão fecha | [ADR-0010](../adr/0010-system-design-canonico.md) |
| 7 | 2026-11-10 | Snapshot da demanda de conformidade | [`.agents/runs/state-snapshot-20261110T123209Z.md`](../../.agents/runs/state-snapshot-20261110T123209Z.md) |
| 8 | 2026-11-10 | Plano da conformidade (v1.0.0 → v1.1.0): as **4 divergências** medidas são fechadas **no código** | [`2026-11-10-conformidade-system-design.md`](../superpowers/plans/2026-11-10-conformidade-system-design.md) |
| 9 | 2026-11-10 | Nascem os 2 ADRs da conformidade (idempotência e orçamento de tempo) e os footers vão para `1.27.0` | [ADR-0011](../adr/0011-idempotencia-de-escrita.md) · [ADR-0012](../adr/0012-orcamento-de-tempo-no-banco.md) |

> **Por que o rollout tem duas etapas.** A primeira entrega o desenho; a
> segunda faz o **código casar** com ele. Sem a segunda, o desenho seria uma
> afirmação sobre o código — e o próprio repo já tinha medido, no ADR-0010,
> que uma doc que afirma o que o código não faz é defeito P0.

**O que o rollout não entregou** (e ficou declarado): o gate que valida o
conjunto (A7), e a instrumentação automática dos 5 focais sem gatilho (T1).

## Revisão

### Quem revisou

| Revisor | Papel | Momento |
|---|---|---|
| `code-reviewer` | revisão adversarial do **plano** | 2026-11-09 (plano v1.1.0) |
| `documentation-specialist` | revisão adversarial do **plano**, em paralelo | 2026-11-09 (plano v1.1.0) |
| `code-reviewer` | revisão de **conteúdo**, com mandato de caçar *fato errado* (número, rota, constante, TTL, linha de código) | 2026-11-09 (plano v1.2.0) |
| `code-reviewer` + `security-auditor` | revisão da **conformidade**, que tocou código | 2026-11-10 (plano §3, tarefa T8) |

A matriz que decide quem revisa o quê é a
[`review-routing.md`](../../.agents/specs/conventions/review-routing.md); o
processo, o [`pr-review-mode.md`](../../.agents/workflows/pr-review-mode.md).

### O que a revisão mudou

| Revisão | Números | O que mudou de verdade |
|---|---|---|
| Plano (v1.1.0) | **3 P0**, **11 P1**, **3 P2** — `grep -cE '^\| R[0-9]+ \| P[0-9]' docs/superpowers/plans/2026-11-09-system-design-padrao.md` → **17** | A premissa do plano estava errada: ele afirmava que `POST /users` re-executado **duplica** — não duplica (o `email` é `@unique` e o repositório traduz o `P2002` em **409**); a lacuna real é *"retry não é seguro"*, que virou o [ADR-0011](../adr/0011-idempotencia-de-escrita.md) um dia depois. Também: o índice de ADRs deixou de ser duplicado, as contagens passaram a fechar, e o critério de frescor virou **comando inline**. |
| Conteúdo (v1.2.0) | o plano relata **18 achados** (5 P0, 7 P1, 6 P2) e **17** corrigidos; a tabela do plano enumera **14** (4 P0, 5 P1, 5 P2) — `grep -cE '^\| C[0-9]+ \| P[0-9]' docs/superpowers/plans/2026-11-09-system-design-padrao.md` → **14** | O `code-reviewer` caçou o **fato errado** e o achou: o comando de serviços do Compose devolvia **3**, não 7 (os 4 do profile só aparecem com `--profile observability`); o repo **não** emite `application/problem+json` — o shape RFC 7807 é servido como `application/json`; o cache de 5 s **cacheia o array de permissões**, e dizer "nunca a autorização" era falso. **1** achado era falso positivo e **1** já estava corrigido antes de o revisor ler. |
| Conformidade (2026-11-10) | **4** divergências medidas (mesma medição da §Segurança) | A revisão de auditoria mediu que o balde do rate limit é **por rota**, não global — o risco da rota de health era mais estreito do que o plano afirmava, e o texto foi ajustado **ao fato**, não ao medo. |

> **O que a revisão não mudou** — e é o ponto: ela não reescreveu a
> arquitetura. Ela corrigiu **afirmações**. O desenho é o que o ADR decidiu
> que seria; a revisão cuidou de ele não afirmar o que o código não faz.

**Ver Também**

- [`../adr/0010-system-design-canonico.md`](../adr/0010-system-design-canonico.md) — a decisão.
- [`../system-design/README.md`](../system-design/README.md) — o desenho.
- [`../system-design/extensao.md`](../system-design/extensao.md) — o contrato de extensão (o que o derivado copia).
- [`docs/tdr/README.md`](./README.md) — o índice dos TDR deste repo.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.30.0
