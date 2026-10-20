# Plano — Stack de observabilidade local (Grafana + Tempo + Prometheus)

> Data: 2026-10-19. Branch: `feat/stack-observabilidade`.
> Demanda: "implementar alguma stack/ferramenta que eu possa acompanhar a telemetria da aplicação".

---

## 1. Diagnóstico (medido, não suposto)

A aplicação **produz telemetria e a descarta**. Três destinos ausentes:

| # | Fato medido | Onde |
|---|---|---|
| D1 | O collector exportava para `${env:OTEL_EXPORTER_OTLP_ENDPOINT}`, e a linha 84 do example (`:90` depois do T6) era `https://otelcol-backend.exemplo.com:4317` — domínio inexistente. As duas citações abaixo são **do estado antes do T6**: o exporter placeholder do `config.yaml` foi removido e a linha 57 é hoje `status_codes: [ERROR]` | `infra/otelcol/config.yaml:57` (pré-T6), `.env.production.example:84` (pré-T6) |
| D2 | A API lê `OTEL_EXPORTER_OTLP_ENDPOINT` do `env_file: .env.production`, portanto **ela também** exporta para o domínio inexistente | `apps/api/src/shared/infrastructure/telemetry/tracing.ts:18` |
| D3 | **Não existe `MeterProvider` em lugar nenhum do repo.** `web-vitals-reporter.tsx:42` chama `metrics.getMeter()` → recebe `NoopMeter` → LCP/INP/CLS descartados em silêncio | `apps/web/src/telemetry/web-vitals-reporter.tsx:42` |

Consequência: `tail_sampling` decide com policy de `status_code` e descarta o resto; o `retry_on_failure` do exporter tenta por 300s e depois joga fora. **Traces existiam, mas ninguém podia vê-los.**

O que **já funciona** e não será tocado: bootstrap do SDK Node (`tracing.ts:11-50`), bridge Pino↔OTel (`tracing.ts:39-45`), propagação W3C (default do `NodeSDK`), idempotência via `globalThis.__otel_sdk__`, e a tela de web-vitals montada em `app/layout.tsx:15`.

## 2. Escopo

Stack escolhida: **Grafana + Tempo + Prometheus**, no perfil `observability` do Compose (opt-in, o mesmo gating que `compose-observability-profile.spec.ts` já exige do collector).

**Fora do escopo, nomeado:** Loki (busca de log). A bridge Pino↔OTel já injeta `trace_id` em cada log JSON, mas sem Loki os logs continuam visíveis por `docker compose logs` — que já funciona hoje. Adicionar Loki é um 4º container e um exporter de logs novo.

## 3. Tasks

| # | Arquivo | Mudança |
|---|---|---|
| T1 | `infra/otelcol/config.yaml` | `traces` → exporter `otlp/tempo`; `metrics` → exporter `prometheus` (`:8889`); `cors` no receiver HTTP; remove o `otlp` de endpoint placeholder |
| T2 | `docker-compose.yml` | `tempo`, `prometheus`, `grafana` no perfil `observability`; rede `observability` |
| T3 | `infra/prometheus/prometheus.yml` | scrape de `otel-collector:8889` |
| T4 | `infra/grafana/provisioning/datasources/*.yaml` | Tempo + Prometheus como datasources |
| T5 | `apps/api/.../telemetry/tracing.ts` | `metricReader` — habilita as métricas que o auto-bundle já emite |
| T6 | `.env.production.example:90` | endpoint placeholder → collector |
| T7 | `apps/web/instrumentation-client.ts` | `MeterProvider` no browser |
| T8 | `tooling/scripts/compose-observability-profile.spec.ts` | dentes para os 3 serviços novos |
| T9 | `docs/STACK.md`, `docs/adr/`, `docs/como-rodar.md` | ADR + runbook |
| T10 | — | `pnpm ci:preflight` + `pnpm ci:local` |

## 4. Restrições que os gates impõem

- `check-dockerfile-hardening.ts:221-233` — **todo** serviço precisa declarar `networks:` (enumeração dinâmica por regex, não lista fixa).
- `compose-observability-profile.spec.ts:99-103` — serviço sem `profiles:` aparece no render default e quebra o gating.
- `docker-prod-audit` Passo 2 — hardening ausente é finding **P0**, mesmo fora do gate mecânico.
- `check-runbook-drift.ts:73-79` — chave nova na tabela de env do runbook precisa existir num `.example`.
- `format:check` — YAML entra no glob do Prettier.

## 5. Critério de pronto

Um `docker compose --profile observability up` entrega traces de uma requisição real **e** métricas de aplicação visíveis no Grafana, com os gates do repo verdes.

---

## 6. Status de execução (2026-10-19)

### Entregue e medido ao vivo

| Task | Estado | Evidência |
|---|---|---|
| T1 | ✅ | `infra/otelcol/config.yaml` → `otlp/tempo` + `prometheus` + `cors` |
| T2 | ✅ | 3 serviços no perfil, `read_only`, `cap_drop: ALL`, digest, loopback |
| T3 | ✅ | 3 jobs de scrape (inclui o `otel-collector-pipeline` do item 6) |
| T4 | ✅ | 2 datasources provisionados, `uid` fixo |
| T6 | ✅ | endpoint placeholder → `http://otel-collector:4318/v1/traces` |
| T8 | ✅ | 6 dentes novos; **mutação verificada** (tirar o gating + desamarrar o loopback → 2 vermelhos, os outros 10 verdes) |
| T9 | ✅ | ADR-0003 + `STACK.md` + `como-rodar.md` |
| T10 | ✅ | `ci:preflight` 0 erro; `ci:local` (ver log da execução) |

Cadeia de traces provada ponta a ponta com span sintético injetado em
`localhost:4318/v1/traces` → resposta `{"partialSuccess":{}}` → `docker exec tempo`
consultando `/api/search` devolveu `rootServiceName: projeto-base-prova`,
`durationMs: 2000`. A cadeia de métricas idem: `prova_contador_total` apareceu no
Prometheus com `service_name="projeto-base-prova"`, o que prova o
`resource_to_telemetry_conversion`.

### Achado durante a execução, fora do plano original

O job `otel-collector` (8889) **não** traz a telemetria do próprio collector — o
exporter `prometheus` serve só o que a aplicação exportou. As 39 séries
`otelcol_*` vivem na porta padrão **8888** e precisaram de um job separado. Sem
ele, a pergunta "a telemetria está chegando e o exportador está dando conta?"
não tem resposta, e uma falha de exportação aparece como um Grafana vazio.
Contadores validados por injeção: `receiver_accepted_spans` subiu exatamente +5
para 5 spans injetados, e corretamente **não** subiu para 3 spans com `spanId`
malformado.

### NÃO entregue

**T5** (`metricReader` na api) e **T7** (`MeterProvider` no browser) continuam
abertos. Ambos exigem `@opentelemetry/exporter-metrics-otlp-http`, que **não está
no repositório** e cuja instalação foi barrada (pacote novo chosen pelo agent
exige autorização explícita). `sdk-metrics@1.27.0` já está no store do pnpm por
dependência transitiva, mas o exporter OTLP de métricas não está.

Consequência honesta: **o critério de pronto da §5 não foi atingido.** O que
funciona hoje é traces da aplicação + telemetria do pipeline. O Prometheus
mostra `otelcol_*`, não `http.server.duration` da aplicação, e os 5 histogramas
de web-vitals continuam registrando num `NoopMeter`. Fechar T5 é uma task de ~5
linhas em `tracing.ts` mais a instalação do pacote.

## 7. Rodada de revisão (2026-10-19)

Um subagente revisou o diff com `docker compose config` renderizado de verdade e
mutation testing dos dentes do spec. Veredito: **nenhum bloqueante**, o grosso
certo. O que saiu de lá foi corrigido:

| Achado | Correção |
| --- | --- |
| O teste de mount read-only **não tinha dente**: `/read_only:\s+true/` casa qualquer `read_only` do render, e a mutação (tirar o `:ro` do tempo) deixava 12/12 verdes | Ancorado no `read_only: true` que vem logo após o `target:` daquele mount. Mutação agora dá **2 vermelhos** (tempo + otelcol), os outros 10 verdes |
| O corte do bloco do Tempo era **fronteira morta**: o render sai em ordem alfabética (`grafana < tempo`), então `indexOf('\n  grafana:')` devolvia `-1` e o "bloco" ia até o fim do arquivo | Helper `blocoDoServico()` ancora na próxima chave de nível serviço. Mutação `expose`→`ports` continua vermelha |
| `docs/como-rodar.md` explicava tela vazia como "espere 10s" | O `decision_wait` é só a metade. Documentado o sampling em **duas camadas**: o SDK lê `OTEL_TRACES_SAMPLER` do ambiente (`.env.production.example:96-97` mata 90% dos roots) e a `tail_sampling` guarda 5% do resto — **~0,5% para request rápido e bem-sucedido** |
| O diagnóstico comparava `accepted_spans` com `exporter_sent_spans` e concluía "o exporter está falhando" | Trocado por `exporter_send_failed_spans`. `sent_spans` conta o que passou pelo sampling: com 0,5%, um valor baixo é o comportamento saudável, e a frase transformava configuração correta em incidente |
| ADR e datasource afirmavam deep-link trace→métricas e service map | **Removidos.** MEDIDO: `tempo.yaml` sem `metrics_generator`, collector sem connector `spanmetrics` — nada produz as span-metrics que os dois painéis consultam. Com o bloco no datasource, o botão abre um gráfico vazio |
| Comentário dizia que a chave de env "continua válida para api **e web**" | O `web` não tem `env_file` (MEDIDO). Corrigido, com o motivo de o `NEXT_PUBLIC_*` ser inlined no build |
| `allowed_origins` incluía `http://localhost:3000` | 3000 é a api; nenhuma página sai de lá. Anotado que 3001 é a única origem real de browser |
| Três citações de linha apontavam para o trecho errado | Corrigidas contra o arquivo (`66`, `84-91`, `90-91`) |
| Placeholder de senha do Grafana que o Grafana **aceita** | `CHANGE_ME_gerar_com_openssl_rand_base64_18` + aviso de que ali, diferente dos outros `CHANGE_ME`, o login funciona em vez de ser recusado |
| Comentário do healthcheck do Tempo descrevia ordem de subida que não existe | Anotado que **não há `depends_on`**, e o que de fato cobre a janela é o `retry_on_failure` do exporter |

### Estado da api (bloqueio pré-existente, não do plano)

Para expor trace **da aplicação** era preciso a api no ar, e ela não sobe por
dois defeitos que já existiam antes deste trabalho:

1. Imagem `base-api:latest` de 2026-10-16, anterior ao fix do Dockerfile
   (`COPY --from=builder /repo/apps/api/node_modules`, `376da79`) → `ERR_MODULE_NOT_FOUND`.
   Rebuild: resolvido.
2. `ENOENT`/`EACCES` ao criar `$HOME/.cache/node/corepack` — o `ENTRYPOINT` roda
   `pnpm exec prisma migrate deploy` antes de qualquer código, e o corepack
   precisa **criar** o diretório, que `read_only: true` proíbe. Diferencial medido
   com `docker run`: sem tmpfs → ENOENT; com tmpfs → `Prisma CLI Version : 6.19.3`.
   Corrigido com `/home/app/.cache:size=32m,mode=0755,uid=1001,gid=1001` no
   serviço `api` (o `mode/uid/gid` é o que troca o erro de ENOENT para EACCES —
   tmpfs nasce root:root, o processo roda 1001:1001).
3. **`DIRECT_DATABASE_URL` ausente do `.env.production` local.** O compose está
   certo (a chave vem do `env_file`, por convenção do repo); o arquivo da
   máquina, que é gitignored, tem só 7 chaves e nenhuma delas é essa. O Prisma
   exige `directUrl` para o CLI → `P1012 Environment variable not found`.
   **Precisa do usuário** escrever a chave no arquivo gitignored.


## 8. Correções do round 2

O plano de correção da 2ª rodada de revisão (8 achados, todos reproduzidos com
o comando ao lado) está em
[`2026-10-19-observabilidade-correcoes.md`](./2026-10-19-observabilidade-correcoes.md).
Fica em arquivo próprio porque, somado aqui, o plano passa do teto de 300 linhas
da convenção `tamanho-e-revisao`.
