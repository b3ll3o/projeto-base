---
name: plano-system-design-padrao
description: "Plano da demand de system design padrão — um conjunto de documentos canônicos que qualquer aplicação derivada do projeto-base estende: contexto, contêiner, componente, dados, segurança, operação e contrato de extensão, com template e ADR."
version: 1.2.0
updated: 2026-11-09
status: revisto
state_snapshot: .agents/runs/state-snapshot-20261109T213637Z.md
---

# Plano — system design padrão e extensível

> **Demand:** *"analise a aplicação e crie um system design padrão que as
> aplicações que forem criadas a partir desse projeto base possam estender;
> analise as melhores práticas de system design e implemente no plano; crie um
> system design o mais bonito possível; revise o plano, implemente, revise
> tudo, commit, push e abra o PR"*.
>
> **Snapshot de estado:** [`.agents/runs/state-snapshot-20261109T213637Z.md`](../../../.agents/runs/state-snapshot-20261109T213637Z.md)
> (`proceed: true`, `gaps_detectados: 4`, todos de documentação).
>
> **v1.2.0** — a revisão do **conteúdo** entrou depois da execução: o
> `code-reviewer` devolveu **18 achados** (5 P0, 7 P1, 6 P2) sobre os docs já
> escritos, e 17 foram corrigidos. O detalhamento das três revisões está em
> [§Revisão](#revisão).

---

## §1. O problema que este plano resolve

Hoje a arquitetura do projeto-base **existe, mas não tem endereço**. Ela está
espalhada em 6 lugares, cada um dono de um pedaço:

| Onde | O que mora | Contagem |
|---|---|---|
| `docs/adr/` | decisões e alternativas rejeitadas | 9 ADRs (8 `Aceito` + 1 `Substituído` — o 0008 → 0009) |
| `docs/STACK.md` | tecnologias, versões, justificativa | 1 tabela por camada |
| `docs/MONOREPO.md` | convenções de monorepo | 1 seção por convenção |
| `docs/api/*.md` | contrato HTTP por bounded context | 6 BCs |
| `docs/flows/` | **o caminho de um request**, derivado da IR | 15 `flow.md` |
| `docs/runbooks/` | procedimentos (subir, observar, e2e, edge) | 4 runbooks |

Nenhum desses responde às três perguntas de quem **estende** o template:

1. **"Qual é a topologia, do ator ao banco?"** — existe, espalhada em prosa de
   6 arquivos; nenhum diagrama mostra a cadeia inteira **com o corte por
   profile e as redes**.
2. **"Onde eu plugo a minha peça?"** — a regra DDD/Hexagonal responde *"onde
   coloco o código"*, não *"como eu adiciono um BC, um armazenamento, um
   consumidor ou um exporter novo sem quebrar o que existe"*.
3. **"O que já foi decidido e não deve ser re-litigado?"** — existe em
   `docs/adr/`, mas quem não sabe que o diretório existe não chega lá.

**O que este plano entrega:** um conjunto de documentos canônicos lido de
cima para baixo (contexto → contêiner → componente → código), mais um
**contrato de extensão** — a parte que faz o padrão *estender* em vez de só
*descrever*.

### Não-objetivos (explícitos, para a revisão não reinventar escopo)

- ❌ **Não** redesenhar a arquitetura. Os ADRs aceitos decidem; este plano
  documenta o que eles decidiram.
- ❌ **Não** criar código, script, gate ou dependência nova no `package.json`.
  (O renderizador Mermaid usado na validação é **ad-hoc**, fora do repo.)
- ❌ **Não** inventar o que o repo não tem (fila, cache distribuído, service
  mesh). Se o repo não tem, o doc diz que não tem — e diz o que custaria.
- ❌ **Não** reescrever ADR nenhum. O doc de system design **aponta**.
- ❌ **Não** redesenhar o que `docs/flows/**` já desenha — lá o dono é o
  `flow.md`; aqui o doc **linka**.

---

## §2. Decisões fechadas

| # | Decisão | Escolha | Por que |
|---|---------|---------|---------|
| **D1** | Onde mora | Pasta `docs/system-design/` com `README.md` como índice | **7 arquivos** (1 índice + 6 focais) cabem no teto de 300 linhas por doc; 1 documento de 600 não cabe |
| **D2** | Níveis | Um documento por nível do C4: `contexto` (L1+L2), `modulo` (L3); **nível código não é doc** — é o repositório, mapeado por `estrutura-e-versionamento.md` | Cada nível responde uma pergunta; misturá-los produz o diagrama ilegível |
| **D3** | Donos concorrentes | O doc de system design **aponta** para todos: `docs/adr/` (decisão), `docs/STACK.md` (versões), `docs/MONOREPO.md` (monorepo), `docs/api/<bc>.md` (contrato HTTP), `docs/web/rotas.md` (rotas), `docs/flows/<dominio>/<fluxo>/flow.md` (**fluxo**), `docs/runbooks/` (procedimento), `docs/agents/domain.md` (**índice de ADRs**) | `dry.md`: o fato tem UMA representação. Nomear os concorrentes é o que impede o doc novo de virar uma segunda fonte |
| **D4** | Extensão | `extensao.md` é o **contrato** (onde plugar, com que custo); `.agents/specs/templates/system-design.md` é o **formulário** copiado pelo derivado | Regra e formulário são coisas diferentes; um doc só não dá os dois |
| **D5** | Beleza | **Uma forma por papel**: ator `([ ])`, contêiner `[ ]`, dado `[( )]`, observabilidade `{{ }}`, guarda `{ }`, externo `[/ /]` | "Bonito" = o leitor entende o diagrama **sem legenda mental**. A forma carrega o tipo — duas cores para a mesma forma não carregam nada |
| **D6** | Verdade | Toda afirmação aponta `arquivo:linha` ou o ADR dono; **todo número vem com o comando que o produz** (`tamanho-e-revisao.md §Verificabilidade de Claims Numéricos`) | `documentacao.md` §1.2: doc que mente é defeito P0 |
| **D7** | Rótulo único | Cada linha da análise de práticas recebe **um** rótulo: `fato` · `[derivado]` · `lacuna` | Misturar "o repo faz X" com "um bom design faz Y" é como um doc começa a mentir sem ninguém editar |
| **D8** | Escopo | 8 docs + 1 template + 1 ADR; **1 linha** no mapa do `doc-sync`; **1 linha** na tabela de donos de `documentacao.md` §2. Nenhuma mudança em `apps/`, `packages/`, `infra/` | Demanda é de documentação; o snapshot confirmou que nenhum gate de runtime é acionado |

### A régua da honestidade (D7)

| Prática | Estado medido | Rótulo | Onde entra |
|---|---|---|---|
| C4 em níveis | O repo tem L1/L2/L3 **implícitos**; C4 é o rótulo adotado aqui | `[derivado]` | `contexto.md`, `modulo.md` |
| Ports & Adapters | Boundary `domain/application/infrastructure` + guard | `fato` | `modulo.md` — ADR-0001 |
| Falha em profundidade | RLS + aplicação; Zod + VO | `fato` | `seguranca.md` |
| Fail-closed por omissão | Escopo ausente ⇒ 0 linhas | `fato` | `seguranca.md`, `dados.md` — ADR-0004 |
| Menor privilégio por credencial | `app_runtime` / `app_system` / dono | `fato` | `seguranca.md` — ADR-0004 |
| Fonte única do dado | Postgres é o registro; sem fila, sem cache | `fato` | `dados.md` |
| Correlação de traces | `request.id` → `traceparent` | `fato` | `operacao.md` — ADR-0003 |
| Locking otimista | `If-Match` / `ETag` no controller e no repositório | `fato` | `dados.md` |
| Eventos → auditoria | 4 eventos de domínio → `users_history` / `users_archive` | `fato` | `dados.md` |
| Expansão/contração de migration | Regra dos 3 passos | `fato` | `dados.md` — convenção `migracao-de-dados.md` |
| Evolução de contrato | `openapi.json` versionado + gate de drift | `fato` | `contexto.md` |
| Rate limit / cota | Throttler global + limite de login | `fato` | `operacao.md` |
| **Idempotência de escrita** | **Não há `Idempotency-Key`.** Re-executar `POST /users` com o mesmo e-mail responde **409** (`email` é `@unique`, P2002 → 409) — não duplica | `lacuna` | `dados.md` §Lacunas |
| **SLO / error budget** | **Não existe.** O doc propõe os SLIs | `[derivado]` | `operacao.md` §SLO |
| **Resiliência entre serviços** | **Não há** — há um serviço. Sem circuit breaker, sem bulkhead | `[derivado]` | `operacao.md` §Proteção |
| **Orçamento de latência por camada** | O web tem timeout de 10 s; a api não tem | `[derivado]` | `operacao.md` §Orçamento |

---

## §3. Melhores práticas de system design — a análise

16 práticas consolidadas contra o que o repo **realmente** faz. Nenhuma foi
admitida por autoridade: cada linha tem estado medido.

| # | Prática | Estado medido no repo | Onde entra |
|---|---|---|---|
| 1 | **C4** — níveis de abstração | Não há C4 escrito; há ADRs + `STACK.md` + `MONOREPO.md` que descrevem L1/L2/L3 espalhados | `contexto.md`, `modulo.md` — **nomeia** o que existia |
| 2 | **Qualidade como atributo** | Existe como prosa nos ADRs (ex.: `FORCE RLS` não é usado, de propósito) | `contexto.md` §Trade-offs |
| 3 | **ADR** para decisão não óbvia | 9 ADRs, com alternativas rejeitadas | `docs/agents/domain.md` — **índice** (dono), o conjunto **linka** |
| 4 | **Fronteira de confiança** | Implícita: browser → web → api → banco, com 3 credenciais | `seguranca.md` §Fronteiras |
| 5 | **Modelo de ameaça** | Não escrito; disperso em ADRs (replay de refresh, escalada de membership) | `seguranca.md` §Ameaças — **6 superfícies** + o que fecha cada uma |
| 6 | **Menor privilégio** | Feito e não óbvio: 3 papéis de banco | `seguranca.md` §Credenciais |
| 7 | **Fail-closed** | Feito: escopo ausente ⇒ 0 linhas | `seguranca.md`, `dados.md` |
| 8 | **Fonte única do dado** | Feito: Postgres é o registro; sem fila/cache/Redis | `dados.md` §Fonte única |
| 9 | **Consistência explícita** | Transação ACID por operação; escopo por `SET LOCAL` | `dados.md` §Consistência |
| 10 | **Locking otimista** | `If-Match`/`ETag` no controller e no repositório | `dados.md` §Concorrência |
| 11 | **Eventos e trilha de auditoria** | 4 eventos de domínio → 2 tabelas de auditoria | `dados.md` §Auditoria |
| 12 | **Idempotência** | **Ausente** — sem `Idempotency-Key`; re-execute dá 409, não 201 | `dados.md` §Lacunas |
| 13 | **Rate limit / cota** | Throttler global (100/min) + limite de login por `ip:email` | `operacao.md` §Proteção |
| 14 | **Timeout e orçamento** | Feito no web (`AbortController`, 10 s); ausente na api | `operacao.md` §Orçamento |
| 15 | **Observabilidade em 3 pilares + correlação** | Feito e medido: 3 policies de tail sampling, `request.id`→`traceparent` | `operacao.md` §Telemetria |
| 16 | **SLO + error budget** | **Ausente** | `operacao.md` §SLO — `[derivado]` |

**Balanço:** 12 `fato` · 3 `[derivado]` · 1 `lacuna`.

### §3.1 Os números que o plano usa (com o comando que os reproduz)

| Número | Comando |
|---|---|
| 9 ADRs (8 `Aceito` + 1 `Substituído`) | `ls docs/adr/*.md \| wc -l` · `grep -h 'Status:\*\*' docs/adr/*.md \| sort \| uniq -c` |
| 6 bounded contexts | `ls -d apps/api/src/modules/*/ \| wc -l` |
| 11 models Prisma | `grep -c '^model ' apps/api/prisma/schema.prisma` |
| 9 tabelas com RLS | `grep -rh 'ALTER TABLE .* ENABLE ROW LEVEL SECURITY' apps/api/prisma/migrations/*/migration.sql \| awk '{print $3}' \| sort -u \| wc -l` |
| 29 policies | `grep -rh '^CREATE POLICY' apps/api/prisma/migrations/*/migration.sql \| awk '{print $3}' \| sort -u \| wc -l` |
| 7 serviços no Compose (3 sempre ativos + 4 no profile `observability`) | `python3 -c "import yaml;print(list(yaml.safe_load(open('docker-compose.yml'))['services']))"` |
| 3 redes no Compose | `python3 -c "import yaml;print(list(yaml.safe_load(open('docker-compose.yml'))['networks']))"` |
| 15 `flow.md` | `find docs/flows -name flow.md \| wc -l` |
| 23 paths / 29 operações no OpenAPI | `node -p "Object.keys(require('./apps/api/openapi.json').paths).length"` |

---

## §4. Mapa dos arquivos

| Arquivo | Responde a |
|---------|------------|
| `docs/system-design/README.md` | Índice, propósito, **linguagem visual**, os 8 princípios, como estender |
| `docs/system-design/contexto.md` | C4 L1 (o sistema) + L2 (os contêineres, o corte por profile, as 3 redes), fronteira de confiança, trade-offs, política do contrato HTTP |
| `docs/system-design/modulo.md` | C4 L3 (um bounded context por dentro), a regra de dependência, a cadeia de um request |
| `docs/system-design/dados.md` | Modelo de dados, escopo de empresa, consistência, concorrência, auditoria, idempotência, migração, custo por empresa |
| `docs/system-design/seguranca.md` | Fronteiras, as 6 superfícies de ameaça × defesa, as 3 credenciais, identidade, autorização, segredos |
| `docs/system-design/operacao.md` | Telemetria, correlação, SLO `[derivado]`, proteção, orçamento, escala, degradação, **ambientes** |
| `docs/system-design/extensao.md` | **O contrato de extensão**: 6 peças novas × onde encaixa × o que o derivado precisa; checklist de conformidade |
| `.agents/specs/templates/system-design.md` | O formulário que o app derivado copia |
| `docs/adr/0010-system-design-canonico.md` | A decisão, com alternativas rejeitadas |

**Total: 9 arquivos novos** (7 em `docs/system-design/` + 1 template + 1
ADR). **Nenhum `decisoes.md`**: o índice de ADRs tem **um** dono, e esse é
[`docs/agents/domain.md`](../../agents/domain.md) — o conjunto apenas **linka**
(§3, linha 3).

### §4.1 A linguagem visual (D5)

Uma forma por papel:

| Papel | Forma | Classe | Cor |
|-------|-------|--------|-----|
| Ator | `([ … ])` — cápsula | `ator` | violeta |
| Contêiner/processo | `[ … ]` — retângulo | `app` | azul |
| Dado/estado | `[( … )]` — cilindro | `dado` | verde |
| Observabilidade | `{{ … }}` — hexágono | `obs` | âmbar |
| Guarda/segurança | `{ … }` — losango | `seg` | vermelho |
| Terceiro/externo | `[/ … /]` — paralelogramo | `ext` | cinza |

Com `%%{init}%%` fixando `theme: base` + `themeVariables`, para o render não
depender do tema do GitHub. **A init block é duplicada em cada arquivo** — é
limitação do Mermaid (o `init` é por documento) — e o README declara isso
como exceção conhecida ao DRY, em vez de esconder a duplicação.

---

## §5. Tarefas

Cada tarefa tem critério de aceite **verificável por comando**.

| # | Tarefa | Arquivo | Aceite |
|---|--------|---------|--------|
| **T1** | Conteúdo: contexto | `docs/system-design/contexto.md` | Diagrama C4 L1; diagrama L2 com **3 serviços sempre ativos + 4 no profile `observability`** e as **3 redes** com a regra de isolamento; fronteira de confiança; tabela de trade-offs (decidido X porque Y); **política** de versionamento do contrato HTTP + link para `docs/api/<bc>.md` — **zero** tabela de endpoint; ponteiro para a IR de `docs/flows/ci-cd-and-defenses/docker-compose-local-stack/` |
| **T2** | Conteúdo: módulo | `docs/system-design/modulo.md` | Diagrama C4 L3 de um BC real; a regra de dependência das 3 camadas; a cadeia **L3** de um request (controller → use case → porta → adapter) com **ponteiro** para `docs/flows/http-api/http-api-users-create/flow.md` (que é o dono do caminho detalhado) |
| **T3** | Conteúdo: dados | `docs/system-design/dados.md` | Diagrama ER dos 11 models; escopo de empresa; consistência; locking otimista (`If-Match`/`ETag`); eventos → auditoria (4 eventos, 2 tabelas); idempotência como **lacuna** (409, não duplicata); migração expand/contract; custo por empresa |
| **T4** | Conteúdo: segurança | `docs/system-design/seguranca.md` | Diagrama de fronteiras; **6 superfícies de ameaça** × o que fecha cada uma; as **3 credenciais** (runtime, sistema, dono) com `arquivo:linha`; identidade (JWT + refresh revogável); RBAC; feature flags; segredos |
| **T5** | Conteúdo: operação | `docs/system-design/operacao.md` | Pipeline de telemetria (com ponteiro para `docs/flows/telemetry-observability/telemetry.collector.otlp.pipeline.dataflow/flow.md`); correlação `request.id`→`traceparent`; SLO `[derivado]`; proteção; orçamento de latência; escala; degradação; **matriz de ambientes** (dev / Docker / observability / e2e / CI / edge) com links para `docs/como-rodar.md` e `docs/runbooks/cloudflare-edge.md` |
| **T6** | Conteúdo: extensão | `docs/system-design/extensao.md` | Matriz das **6 peças novas** (BC, porta de saída, armazenamento, consumidor de evento, exporter de telemetria, integração externa) × onde encaixa × o que o derivado precisa; **checklist de conformidade de 12 itens** |
| **T7** | Índice + linguagem visual | `docs/system-design/README.md` | Índice com os **6 focais**; paleta com as **6 classes** e **6 formas distintas**; os **8 princípios** (P1–P8, listados em §5.1) com dono; o índice de ADRs vira **link** para `docs/agents/domain.md` |
| **T8** | Template | `.agents/specs/templates/system-design.md` | Frontmatter no formato dos templates existentes; os **6 blocos** de §5.2 (1:1 com o conjunto canônico); marcadores `<...>`; ponteiro para `extensao.md` |
| **T9** | ADR | `docs/adr/0010-system-design-canonico.md` | Contexto, decisão, consequências (positivas e negativas), alternativas rejeitadas, "ver também"; slug **ASCII** como os outros 9; **status de cada ADR** ao lado (o 0008 é substituído) |
| **T10** | Donos e índices | `documentacao.md` §2, `tooling/scripts/doc-sync.ts`, `docs/agents/domain.md`, `docs/superpowers/README.md` | 1 linha na tabela de donos (§2 de `documentacao.md`); `docs/system-design/dados.md` no mapeamento do `schema.prisma` no `doc-sync`; `docs/agents/domain.md` com os **10 ADRs** e o 0008 marcado; contagem de planos em `docs/superpowers/README.md` atualizada |
| **T11** | Versão e índices | `README.md`, `AGENTS.md`, `docs/STACK.md`, `docs/MONOREPO.md`, `docs/TEMPLATE_USAGE.md`, `.agents/specs/conventions/estrutura-e-versionamento.md` | Os **6 footers** de versão vão de `1.25.0` para `1.26.0` (`check-version-footers`); **linha `1.26.0` no Histórico de Versões** dos 4 que têm tabela (`MONOREPO.md`, `STACK.md`, `TEMPLATE_USAGE.md`, `estrutura-e-versionamento.md`); `README.md` e `docs/MONOREPO.md` estão **em 300 linhas** — a inserção é **substituição**, não acréscimo; `AGENTS.md` (295) aceita no máximo 4 linhas novas |
| **T12** | Validação | — | `git add -N` **antes** do gate (senão `git ls-files` não vê o doc novo); `pnpm ci:preflight` verde; **todo** bloco Mermaid renderizado — `npx -y @mermaid-js/mermaid-cli` sob demanda, **fora do repo e fora do preflight** (nenhuma dependência nova entra no `package.json`); `check-doc-refs` sem link quebrado; `check-doc-size` ≤ 300 |

### §5.1 Os 8 princípios (T7)

| # | Princípio | Dono |
|---|---|---|
| **P1** | A dependência aponta para dentro | ADR-0001 |
| **P2** | A fronteira é a credencial, não o dado | ADR-0004 |
| **P3** | Fail-closed por omissão | ADR-0004 |
| **P4** | Decisão não óbvia vira ADR | ADR-0010 |
| **P5** | Fato e recomendação têm rótulos diferentes | ADR-0010 |
| **P6** | A forma carrega o significado | `docs/system-design/README.md` §2 |
| **P7** | Nenhum número sem o comando que o produz | convenção `tamanho-e-revisao.md` |
| **P8** | O que não existe é parte do design | `docs/system-design/dados.md` §Lacunas |

### §5.2 Os 6 blocos do template (T8)

**Um bloco por documento do conjunto canônico** — é o que faz o derivado e o
base terem o **mesmo esqueleto**:

1. `# System Design — <aplicação>` — cabeçalho + `> Medido em <AAAA-MM-DD>`
2. `## §1. Contexto e contêineres` — ator, o que o sistema faz, fronteira de
   confiança, a topologia e o que é plugável
3. `## §2. Módulos` — os bounded contexts e a regra de dependência
4. `## §3. Dados` — modelo, escopo, consistência
5. `## §4. Segurança` — ameaças e defesas
6. `## §5. Operação` — telemetria, SLO, escala, **e os ambientes** (§5.1)
7. `## §6. Extensão` — a matriz de onde cada peça nova encaixa + o checklist

> **Derivados de** `.agents/specs/templates/spec.md` (11 seções) **adaptados**
> para system design — o template não é cópia, e a lista acima é a dele.
> O bloco de **Extensão** não pode faltar: é ele que faz o derivado
> *estender* o padrão em vez de só copiá-lo (ADR-0010 §5).

### §5.3 Ordem de execução

```
T1..T6 (conteúdo)  →  T7 (índice)  →  T8 (template)  →  T9 (ADR)
   →  T10 (donos)  →  T11 (versão e índices)  →  T12 (validação)  →  revisão  →  PR
```

O índice vem **depois** do conteúdo (T2 do plano anterior escrevia o índice
com links para 6 arquivos que ainda não existiam), e o ADR vem por último
porque ele **aponta** para o conjunto. A validade dos links é conferida em
T12, quando todos os arquivos existem.

---

## §6. Riscos

| Risco | Como o plano o trata |
|---|---|
| **Doc que inventa** (P0 de `documentacao.md`) | D6: `arquivo:linha` ou dono; todo número com comando; rótulo único por linha (§2) |
| **Diagrama que duplica `docs/flows/**`** | D3 nomeia o dono do fluxo; T1/T2/T5 **linkam** o `flow.md` e desenham só o corte por profile, as redes e a cadeia L3 |
| **Gate cego para arquivo untracked** | T12 exige `git add -N` antes do gate |
| **Mermaid que não renderiza** | T12 renderiza todo bloco com `npx -y @mermaid-js/mermaid-cli` **sob demanda** — o binário **não** entra no repo (`which mmdc` → nada). O custo é declarado: download do Chromium a cada uso |
| **README e MONOREPO já em 300 linhas** | T11: inserção por **substituição**; `AGENTS.md` (295) limitado a 4 linhas novas |
| **Doc que envelhece** | T10: `docs/system-design/dados.md` entra no mapa do `doc-sync` (o `schema.prisma` é o gatilho); o resto do conjunto é verificado na revisão — e o ADR registra a lacuna restante |
| **Dois índices de ADR** | §4: **não existe** `decisoes.md`; o dono do índice é `docs/agents/domain.md` |
| **Beleza que vira ruído** | D5: 6 papéis, 6 formas distintas; a legenda existe para o diagrama ser lido sem texto |

---

## §7. O que este plano NÃO entrega (e por quê)

- **Não** um dashboard de SLO pronto — exigiria backend de métricas que o
  Prometheus local não tem. O doc propõe os SLIs; a implementação fica com o
  app derivado.
- **Não** um diagrama de implantação em nuvem (ECS/K8s) — o repo implanta em
  Docker Compose; desenhar um cluster que não existe seria ficção.
- **Não** um "design system" de UI — o repo tem as skills `ui-*` para isso, e
  `ux-design-specialist` é o dono. Aqui, "system design" é arquitetura de
  software.
- **Não** um gate novo que valide o conjunto — o `check-doc-coverage` mede
  *unidade de código → doc canônico*, e o conjunto não é unidade de código.
  Declarar a família na matriz §3 **exigiria** mudar o gate no mesmo PR
  (`documentacao.md` §3); o plano prefere declarar o dono na tabela de
  donos (§2) e registrar a lacuna no ADR.

---

## Revisão

> **v1.1.0** — revisão adversarial por `code-reviewer` + `documentation-specialist`,
> em paralelo, sobre o plano e sobre o ADR já escrito. **3 P0, 11 P1 e 3 P2
> corrigidos.** Os achados que mudaram o plano:

| # | Sev. | Achado | Correção |
|---|------|--------|----------|
| R1 | P0 | O plano afirmava que `POST /users` re-executado **duplica** | **Não duplica**: `email` é `@unique` e o repositório traduz P2002 em **409**. A lacuna real é "retry não é seguro / não há `Idempotency-Key`" — o texto do plano e do ADR foram corrigidos |
| R2 | P0 | T12 exigia `mmdc`, que **não existe** no repo — e o não-objetivo proibia a dependência que o tornaria possível | T12 passou a exigir `npx -y @mermaid-js/mermaid-cli` **sob demanda, fora do repo**; o critério é manual, não um gate |
| R3 | P0 | T3/T4/T7 **redesenhavam** o que `docs/flows/**` já desenha (topologia do Compose, pipeline de telemetria, composição de módulos) | D3 passou a nomear `docs/flows/**` como dono do fluxo; T1/T2/T5 agora **linkam** o `flow.md` e desenham só o que não tem flow (corte por profile, as 3 redes, a cadeia L3) |
| R4 | P1 | "9 ADRs aceitos" — são **8 `Aceito` + 1 `Substituído`** (0008 → 0009); a frase já estava publicada no ADR | §1 e o ADR corrigidos; o índice passa a marcar o status de cada ADR |
| R5 | P1 | A tabela de práticas tinha 16 linhas e o texto dizia 14; o balanço "9/3/4" não fechava; o SLO recebia 3 rótulos | §2 passou a ter **um rótulo por linha** (`fato`/`[derivado]`/`lacuna`) e o balanço deriva dela: **12/3/1** |
| R6 | P1 | C4 era "fato" na régua e "não escrito" na tabela | C4 virou `[derivado]` nas duas linhas: o repo tem L1/L2 **implícitos**, o conjunto os **nomeia** |
| R7 | P1 | As contagens do conjunto não fechavam (6 / 8 / 9 / 10) | **7 arquivos** em `docs/system-design/` (1 índice + 6 focais) + 1 template + 1 ADR = **9** |
| R8 | P1 | Dois índices de ADR (`decisoes.md` + `docs/agents/domain.md`) | **`decisoes.md` não existe.** O dono é `docs/agents/domain.md`; o conjunto linka |
| R9 | P1 | D6 ("nenhum número sem comando") **não tinha instrumento**: o `check-doc-claims` cobre só os 6 docs de API | D6 passa a exigir o **comando inline** (é o que `tamanho-e-revisao.md` cobra); o ADR deixou de prometer que o gate cobra o conjunto novo |
| R10 | P1 | O plano citava ~20 números **sem comando** | §3.1 agora traz a tabela número → comando |
| R11 | P1 | `README.md` e `docs/MONOREPO.md` estão **em 300 linhas** — T11 os reprovava | T11 passou a exigir **substituição**; `AGENTS.md` (295) limitado a 4 linhas novas |
| R12 | P1 | Faltava a linha de `1.26.0` no **Histórico de Versões** (o gate compara só o footer) | T11 exige a linha nos 4 arquivos que têm tabela de histórico |
| R13 | P1 | Cobertura incompleta: eventos → auditoria, locking otimista e a matriz de ambientes não entravam em nenhum doc | T3 ganhou eventos/auditoria e locking; T5 ganhou a **matriz de ambientes** (dev / Docker / observability / e2e / CI / edge) |
| R14 | P1 | `contexto.md` disputava o contrato HTTP com `docs/api/*.md` | T1 passou a exigir a **política** de versionamento + link — **zero** tabela de endpoint |
| R15 | P2 | A paleta tinha 2 papéis com a mesma forma (`obs` e `seg`) | D5 passou a exigir **uma forma por papel**: guarda virou losango `{ }`, externo virou paralelogramo `[/ /]` |
| R16 | P2 | Critérios de aceite com contagens não enumeradas (8 princípios, 6 superfícies, 3 credenciais, 12 itens) | §5.1 e §5.2 enumeram; T4/T6 passam a citar as contagens |
| R17 | P2 | Ordem quebrada: o índice (T2) era escrito antes dos docs que ele indexa | Ordem corrigida em §5.3: conteúdo → índice → ADR |

### O que a execução produziu

| Artefato | Arquivo | Estado |
|---|---|---|
| Índice + linguagem visual | `docs/system-design/README.md` | criado |
| Contexto e contêineres | `docs/system-design/contexto.md` | criado |
| Módulos e cadeia do request | `docs/system-design/modulo.md` | criado |
| Dados | `docs/system-design/dados.md` | criado |
| Segurança | `docs/system-design/seguranca.md` | criado |
| Operação | `docs/system-design/operacao.md` | criado |
| Contrato de extensão | `docs/system-design/extensao.md` | criado |
| Template do derivado | `.agents/specs/templates/system-design.md` | criado |
| A decisão | `docs/adr/0010-system-design-canonico.md` | criado |
| Donos e índices | `documentacao.md` §2 · `tooling/scripts/doc-sync.ts` · `docs/agents/domain.md` · `docs/superpowers/README.md` | alterados |
| Versão e índices | `README.md` · `AGENTS.md` · `docs/STACK.md` · `docs/MONOREPO.md` · `docs/TEMPLATE_USAGE.md` · `estrutura-e-versionamento.md` | alterados (footers `1.25.0` → `1.26.0`) |

**Desvios do plano, e por quê:** (a) `decisoes.md` **não** foi criado — o
índice de ADRs tem um dono só (`docs/agents/domain.md`); (b) o **plano** de
validação T12 passou a usar `npx -y @mermaid-js/mermaid-cli` sob demanda, sem
dependência no repo; (c) `docs/superpowers/README.md` foi além do previsto: a
tabela de famílias partia 106 planos e o disco já tinha 118 — a reconciliação
da partição veio junto, porque uma contagem que não fecha com a soma é
mentira.

### A revisão do conteúdo (3º reviewer)

O `code-reviewer` foi despachado **sobre os documentos já escritos**, com
mandato de caçar *fato errado* (número, rota, constante, valor de TTL, linha
de código). Voltou com **18 achados**: 5 P0, 7 P1 e 6 P2.

| # | Sev. | Achado | Correção |
|---|------|--------|----------|
| C1 | P0 | o comando `docker compose config --services` devolve **3** serviços, não 7 — os 4 do profile só aparecem com `--profile observability` (e a flag vai **antes** de `config`) | README e `contexto.md` passam a usar o comando com o profile e a qualificar "3 sem profile + 4 com" |
| C2 | P0 | o repo **não** emite `application/problem+json` — o filtro monta o shape RFC 7807 e o Fastify serializa como `application/json` | os 2 docs dizem "shape RFC 7807 servido como `application/json`" |
| C3 | P0 | o guard de boot não recusa por **denylist de valor** — a lista por valor saiu no #133; o critério é **prefixo + mínimo de 24 bytes** | `seguranca.md` reescreve a bullet e diz que a lista por valor **saiu de propósito** |
| C4 | P0 | o guard de boot tem **três** recusas, e a terceira (as duas credenciais nomeando o mesmo papel gerenciado — a inversão da #118) não estava no doc | `seguranca.md` §2.1 lista as três |
| C5 | P1 | o cache de 5 s **cacheia o array de permissões** — dizer "nunca a autorização" é falso; o que não é cacheado é o **veredito da membership** | `seguranca.md` e `dados.md` reescrevem a frase |
| C6 | P1 | os **10 s** são o *fallback* do `api-client`; o cliente real passa `defaultTimeoutMs` por operação (o logout usa 2 s) | `operacao.md` e `extensao.md` distinguem o fallback do valor efetivo |
| C7 | P1 | `chaves_de_assinatura`: o que exclui o runtime é o **`REVOKE ALL`**, não a RLS sem policy (que é a segunda barreira) | `dados.md` §1.1 corrige o mecanismo |
| C8 | P1 | `operacao.md` acusava o `STACK.md` de "mentir" sobre a ponte `request.id → traceparent` — o `STACK.md` fala da **camada de instrumentação**, que é outra coisa | a acusação sai; o doc passa a descrever a divergência **medida** entre as duas correlações |
| C9 | P1 | `README.md` §5 dizia "o resto do conjunto" (implícito 6) onde são **5** focais sem gatilho | "os **outros 5 focais**" |
| C10 | P2 | o `DROP TABLE` do `migrate diff` é o caso do model **removido** sem migration — não do model novo sem migration | `extensao.md` §2 corrige o verbo |
| C11 | P2 | "porta nasce em `domain/ports/`" tem exceção não declarada: as **ports transversais** (`AuditServicePort`) moram em `shared/<concern>/domain/` | `modulo.md` §3.1 declara a exceção |
| C12 | P2 | `shared/` tem **4 áreas**, e a tabela achatava `infrastructure/` em 4 linhas (o leitor contava 7) | `modulo.md` §5 diz "4 áreas" e agrupa `infrastructure/` |
| C13 | P2 | o **subject** do token tem 3 campos, mas o **payload assinado** tem 4 (com o `jti`) | `seguranca.md` §3.2 distingue os dois |
| C14 | P2 | o template dizia "7 blocos" e não tinha o bloco de **Extensão** — que é o que o ADR-0010 §5 chama de primeira classe | o template passou a **6 blocos 1:1** com o conjunto canônico, com Extensão |

**Um achado era falso positivo** (o revisor o descartou ele mesmo: as duas
frases sobre quem escreve `refresh_tokens` eram compatíveis), e **um já
estava corrigido** antes de o revisor ler o arquivo (a contagem de VOs e
DTOs do `users`).

**v1.0.0** — primeira versão do plano.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.2.0
