# System Design — Operação

> **Medido em 2026-11-09:** a config do collector, os guards de taxa e os
> timeouts conferem com o código.
> **Dono do desenho:** este documento. **Dono do procedimento:**
> [`docs/runbooks/`](../runbooks/). **Dono do fluxo:**
> [`docs/flows/telemetry-observability/`](../flows/telemetry-observability/).

---

## §1. O pipeline de telemetria

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif","primaryColor":"#dbeafe","primaryTextColor":"#1e3a8a","primaryBorderColor":"#1d4ed8","secondaryColor":"#dcfce7","tertiaryColor":"#fef3c7","lineColor":"#64748b","textColor":"#0f172a","mainBkg":"#f8fafc","background":"#ffffff","clusterBkg":"#f8fafc","clusterBorder":"#cbd5e1","edgeLabelBackground":"#ffffff","fontSize":"14px","actorBkg":"#dbeafe","actorBorder":"#1d4ed8","actorTextColor":"#1e3a8a","signalColor":"#334155","signalTextColor":"#334155","labelBoxBkgColor":"#dbeafe","labelBoxBorderColor":"#1d4ed8","labelTextColor":"#1e3a8a","noteBkgColor":"#fef3c7","noteBorderColor":"#b45309","noteTextColor":"#78350f","activationBkgColor":"#ede9fe","activationBorderColor":"#6d28d9"},"flowchart":{"curve":"basis","nodeSpacing":45,"rankSpacing":55,"padding":12,"htmlLabels":true,"useMaxWidth":true},"sequence":{"useMaxWidth":true,"wrap":true,"diagramMarginX":20,"diagramMarginY":10}}}%%
flowchart LR
  subgraph instrumentado["Processos instrumentados"]
    apis["API<br/><small>NodeSDK + auto-instrumentations<br/>Fastify · Prisma · Pino</small>"]
    webs["Web<br/><small>RSC · browser SDK<br/>web-vitals → métricas</small>"]
  end

  col{{"OTel Collector<br/><small>memory_limiter → tail_sampling → batch</small>"}}
  temp{{"Tempo<br/><small>traces</small>"}}
  prom{{"Prometheus<br/><small>scrape :8889 a cada 15s</small>"}}
  grafa{{"Grafana<br/><small>painel</small>"}}

  apis -->|"OTLP| gRPC"| col
  webs -->|"OTLP| HTTP"| col
  col -->|"otlp/tempo"| temp
  col -->|"métricas expostas"| prom
  grafa --> temp
  grafa --> prom

  classDef obs fill:#fef3c7,stroke:#b45309,color:#78350f,stroke-width:1px
  classDef app fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a,stroke-width:1px

  class apis,webs app
  class col,temp,prom,grafa obs
```

> O **caminho completo**, com o que entra em cada etapa, está em
> [`docs/flows/telemetry-observability/telemetry.collector.otlp.pipeline.dataflow/` — a IR](../flows/telemetry-observability/telemetry.collector.otlp.pipeline.dataflow/telemetry.collector.otlp.pipeline.dataflow.dataflow.json).
> O **procedimento** de subir e consultar está em
> [`docs/runbooks/observabilidade.md`](../runbooks/observabilidade.md).

### §1.1 O sampling — e o que ele **não** garante

O `tail_sampling` decide **por trace**, e as policies são combinadas por
**OR** — a ordem no YAML é irrelevante:

| Policy | O que preserva |
|---|---|
| `errors` | qualquer trace com um span em `ERROR` |
| `slow` | latência acima de **1 s** |
| `baseline` | **5 %** probabilístico — o piso de quem não casou com nenhuma outra |

> ⚠️ **"Sempre preservar" é verdade só no escopo do collector.** A policy
> `errors` guarda todo trace que **chega** com span em erro — ela **não**
> garante que o trace chegue. A camada 1 (o SDK, `tracing.ts` sem `sampler`
> próprio → lê `OTEL_TRACES_SAMPLER`) já descartou ~90 % das raízes **antes**
> daqui, e ela é **cega ao status HTTP**. Ou seja: cerca de 10 % dos traces
> de erro chegam ao collector, e o collector mantém **todos** os que chegam.

> ⚠️ **A ordem importa no outro sentido:** `memory_limiter` é **sempre** o
> primeiro processor de um pipeline que aceita dados do receiver. Sem ele,
> um pico de tráfego OOM-killa o collector.

### §1.2 O que cada processo emite

| Fonte | O que emite | Como |
|---|---|---|
| API | spans de HTTP, Prisma, Fastify | auto-instrumentations (só `fs` e `pino` desabilitados) |
| API | `trace_id`, `span_id`, `trace_flags` **no log** | `PinoInstrumentation` |
| API | log estruturado JSON | Pino, com `authorization` e `cookie` **redigidos** |
| Web (servidor) | spans de RSC | `instrumentation.node.ts` |
| Web (browser) | spans de fetch e interação | `instrumentation-client.ts` |
| Web (browser) | `web.vitals.{lcp,cls,inp,fid,ttfb}` | `web-vitals-reporter.tsx` |

---

## §2. Correlação — a verdade medida

**Não existe uma ponte explícita `request.id` → `traceparent`.** O que existe
são **três** identificadores com uma **ordem de precedência**:

```text
traceIdDe(request)                    AuditContext.correlationId
  1º span W3C ativo                    1º span W3C ativo
  2º request.id do Fastify             2º randomUUID()      ← diverge
  3º UUID fixado no request
```

- `traceIdDe()` (`shared/infrastructure/http/trace-id.ts:42-53`) é o
  identificador que **volta na resposta** (campo `traceId` do
  `problem+json`) e no log do guard de flag.
- O `correlationId` da **auditoria** (`users.controller.ts:620-625`) usa outra
  derivação.
- O `traceparent` **entra** pelo header: a instrumentação HTTP do OTel extrai
  o `traceparent` W3C da requisição e cria o server span a partir dele.

> ⚠️ **A divergência, medida:** **sem** span OTel ativo, o `traceId` da
> resposta e o `correlationId` da linha de auditoria **não** compartilham
> identificador. Quem investiga "o que aconteceu neste request" pode não
> casar o log com a linha de auditoria pelo mesmo id.
>
> ⚠️ **`docs/STACK.md` §7 (v1.7.0) descreve "request.id → traceparent W3C"
> como se a ponte existisse.** O código prefere o **span** e só usa o
> `request.id` como reserva. O doc aqui segue o **código**.

**O que date de medição:** `traceIdDe` não grava nada em disco; a
correlação entre log e auditoria **não tem** coluna de trace no schema —
`users_history` guarda `changed_by` e `reason`, não `trace_id`.

---

## §3. Os 3 pilares — e onde cada um está

| Pilar | Ferramenta | Onde vive | Onde se vê |
|---|---|---|---|
| **Métricas** | Prometheus | scrape em `otel-collector:8889` | Grafana |
| **Traces** | Tempo | `otlp/tempo` | Grafana → Explore |
| **Logs** | Pino (stdout) | container | quem indexa é o driver de container |

> **Não há Loki.** O Pino escreve em stdout e **quem indexa é o driver de
> container** — o Compose não tem um backend de log. O log e o trace são
> **dois** streams separados, e a junção entre eles é o `trace_id` no
> campo do log.

---

## §4. SLO — `[derivado]`

> ⚠️ **O repo não define SLO.** Nada em `docs/` ou no código declara uma
> meta de disponibilidade ou latência. O que segue é uma **proposta** para
> o app derivado escolher e medir — não é um fato deste sistema.

| SLI | Definição proposta | SLO proposto | Por que este |
|---|---|---|---|
| **Disponibilidade da leitura** | requisições de leitura que não dão 5xx | **99,5 %** | o acesso de leitura é o caminho crítico do produto |
| **Disponibilidade da escrita** | mutações que não dão 5xx | **99 %** | a escrita tem validação e conflito: 4xx é esperado |
| **Latência de leitura** | p95 do `GET` | **< 500 ms** | o dado é local; acima disso é o banco ou o `EXISTS` da policy |
| **Latência de escrita** | p95 do `POST`/`PATCH` | **< 800 ms** | escreve em 2 tabelas (dado + auditoria) |
| **Erro de tenancy** | respostas 5xx em rota multi-empresa | **0** | qualquer um é um furo de isolamento |
| **Replay de refresh** | detecções de replay por hora | **0** | o detector revoga todas as sessões do usuário: qualquer um é incidente |

**Error budget:** com 99,5 % de disponibilidade, o orçamento é de **3,6 h de
indisponibilidade por mês**. A regra de consumo: se o budget acabar, o
trabalho passa a ser **estabilidade**, não features.

**O que medir para começar:** o `traceId` da resposta + o status HTTP já
existem em toda resposta — a coleta é o que falta, e ela depende do backend
de métricas que o app derivado escolher.

---

## §5. Proteção

| Controle | Valor | Onde |
|---|---|---|
| Rate limit global | **100 req/min** por IP (`THROTTLE_LIMIT`, `THROTTLE_TTL_MS`) | `app.module.ts:24-29` |
| Rate limit de login | **5/min** por `ip:email` | `auth.controller.ts:85`, `:126` |
| CORS | lista `ALLOWED_ORIGINS`; em produção o bootstrap **aborta** se só houver o default de dev | `main.ts:80-91` |
| Security headers | helmet, com CSP restritiva (a API é JSON pura: `script-src 'none'`) | `main.ts:48-71` |
| Redação de log | `authorization` e `cookie` redigidos | `app.module.ts:16` |
| Erro | RFC 7807, sem stack trace em produção | `global-exception.filter.ts` |

> ⚠️ **`/health` é contado pelo rate limit global.** `main.ts:75` e
> `app.module.ts:23` afirmam em comentário que rotas como `/health` usam
> `@SkipThrottle()`; **nenhum `@SkipThrottle` existe no código**
> (`grep -rn "SkipThrottle" apps/api/src/` → só os 2 comentários). Sob
> pressão, a probe de saúde **pode** receber 429 — e um healthcheck que
> falha derruba o container.

---

## §6. Orçamento de latência

> ⚠️ **Não existe orçamento de latência escrito no repo.** O web tem timeout
> de **10 s** (`AbortController` em `lib/api-client.ts:119-121`); a API **não
> tem timeout** para o banco.

| Camada | Timeout | Medido |
|---|---|---|
| Browser → web | o do fetch do Next | — |
| Web → API | **10 s** (`AbortController`) | `api-client.ts:119` |
| API → banco | **nenhum** | não há `statement_timeout` no papel de runtime — a query espera o Postgres desistir |

> **Lacuna:** sem timeout na API, um `SELECT` lento segura a conexão do pool
> até o Postgres desistir. A correção é um `statement_timeout` no papel de
> runtime — decisão de infra, e por isso **ADR novo**.

---

## §7. Escala

| Camada | Escala | Limite |
|---|---|---|
| **Web** | horizontal, sem estado | o limite é a origem: é o Next.js que fala com a API |
| **API** | horizontal, sem estado (o access token é stateless) | o limite é o **pool** de conexões do Postgres |
| **Banco** | **vertical** | um banco, uma migration; o custo por empresa está em [`dados.md`](./dados.md) §8 |
| **Observabilidade** | horizontal | o `memory_limiter` do collector é o primeiro processor de propósito |

**O que impede escalar horizontalmente hoje:** a API e o web **são**
stateless, mas o **Postgres é um** e o pool de conexões é por instância.
Duas réplicas da API dobram as conexões abertas.

**Ordem de escala, do mais barato ao mais caro:**

1. ** índices** — o `EXISTS` da policy de `users` é a query cara
   ([`dados.md`](./dados.md) §8);
2. **pool** — mais conexões, ou um pooler;
3. **réplicas da API** — trivial, porque são stateless;
4. **replicação do banco** — e aí aparece a **primeira decisão de
   consistência** do sistema (ver [`dados.md`](./dados.md) §4.1).

---

## §8. Degradação — o que acontece quando cada peça cai

| Peça que cai | Efeito | Quem absorve |
|---|---|---|
| **Postgres** | tudo dá 5xx; `/api/v1/health` devolve **503** `degraded` | a API; o container fica **unhealthy** |
| **Coletor** | a telemetria é **perdida** (fila com retry por 300 s); a aplicação **não** sente | o `sending_queue` do exporter |
| **Tempo / Prometheus** | o collector **retenta**; os traces ficam pendurados | o collector |
| **Grafana** | só a visualização | ninguém |
| **Redis** | — | **não existe**; nada cai |
| **Fila** | — | **não existe**; nada cai |

> **A degradação é assimétrica de propósito:** o banco é o único ponto
> único, e todo o resto é derivado dele. A consequência é que **tolerar a
> queda do banco** é o problema de resiliência do sistema — e ele **não**
> está resolvido.

---

## §9. Os ambientes

Sete ambientes, e **cada um tem um dono**:

| # | Ambiente | Como se sobe | Dono |
|---|---|---|---|
| 1 | **Dev local (pnpm nativo)** | `pnpm dev` — Postgres local na máquina | [`docs/como-rodar.md` §1](../como-rodar.md) |
| 2 | **Dev local (Docker, hot reload)** | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` | [`docs/runbooks/docker.md` §1](../runbooks/docker.md) |
| 3 | **Stack completa (imagens prod)** | `docker compose up -d` | [`docs/runbooks/docker.md` §2](../runbooks/docker.md) |
| 4 | **Perfil de observabilidade** | `docker compose --profile observability up -d` | [`docs/runbooks/observabilidade.md` §1](../runbooks/observabilidade.md) |
| 5 | **E2E local (Playwright)** | `pnpm test:e2e` | [`docs/runbooks/e2e-e-ci.md` §1](../runbooks/e2e-e-ci.md) |
| 6 | **CI (GitHub Actions)** | push/PR | [`docs/runbooks/e2e-e-ci.md` §2](../runbooks/e2e-e-ci.md) |
| 7 | **Conta Cloudflare (verificação)** | manual, **fora** do caminho da requisição | [`docs/runbooks/cloudflare-edge.md`](../runbooks/cloudflare-edge.md) |

> **O ambiente 7 não é parte da arquitetura por padrão** — o runbook entrega
> o **contrato de verificação** da conta Cloudflare (TLS, HSTS, MFA, DNSSEC),
> para uma pessoa conferir no dashboard; a §1 dele diz exatamente o que ele
> não é.

---

## Ver Também

- [`./contexto.md`](./contexto.md) — a topologia e as redes.
- [`./seguranca.md`](./seguranca.md) — de onde vêm os limites de taxa.
- [`./dados.md`](./dados.md) — o custo por empresa.
- [`../fluxo-desenvolvimento.md`](../fluxo-desenvolvimento.md) — o fluxo
  canônico, do primeiro comando ao merge.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.0.0
