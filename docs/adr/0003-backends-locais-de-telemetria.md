# ADR-0003: Backends locais de telemetria (Grafana + Tempo + Prometheus)

- **Status:** Aceito
- **Data:** 2026-10-19
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/plans/2026-10-19-stack-observabilidade.md`](../superpowers/plans/2026-10-19-stack-observabilidade.md)
- **ADR anterior:** [`0002-autenticacao-jwt-argon2.md`](./0002-autenticacao-jwt-argon2.md)

## Contexto

O repositório já produzia telemetria OpenTelemetry desde as issues #86 e #87: o
`NodeSDK` da api instrumenta HTTP/NestJS/Pino e o web exporta web-vitals. O
problema é que **ninguém consumia nada disso**.

Três achados, todos medidos antes de decidir:

1. **O collector exportava para um domínio que não existe.** `infra/otelcol/config.yaml`
   mandava `traces` e `metrics` para `${env:OTEL_EXPORTER_OTLP_ENDPOINT}`, e
   `.env.production.example:84` fixava `https://otelcol-backend.exemplo.com:4317`.
   O collector subia saudável, retentava por 300s (`retry_on_failure`) e descartava
   os spans. Nenhum erro: uma fila de reenvio que esvazia com sucesso para o vazio.

2. **A api lia o mesmo endereço.** O `env_file` do serviço `api` carregava a mesma
   variável, então o `NodeSDK` também exportava para o domínio inexistente.

3. **Não existe `MeterProvider` em lugar nenhum do repositório.** Os 5 histogramas
   de web-vitals em `apps/web/src/telemetry/web-vitals-reporter.tsx` registram
   contra um `NoopMeter`: o código está certo e o dado some no SDK.

O efeito líquido era um sistema que parecia ter observabilidade e não tinha
nenhuma. Faltava a decisão sobre **onde** a telemetria deve chegar.

## Decisão

Adotar uma stack **LGTM** (Grafana + Loki + Tempo + Metrics), com um recorte
deliberado: **sem Loki**.

| Componente | Imagem | Papel |
|---|---|---|
| Grafana | `grafana/grafana:11.2.0` | A tela. Datasources provisionados por arquivo. |
| Tempo | `grafana/tempo:2.5.0` | Backend de traces. Backend local (WAL + blocos), sem S3/GCS. |
| Prometheus | `prom/prometheus:v2.54.1` | Métricas, por **scrape**, não push. |

Os três entram no perfil `observability` do Compose, `read_only: true`,
`cap_drop: ALL`, `no-new-privileges`, imagens pinadas por digest e portas
publicadas **só em loopback** (`127.0.0.1`). Subir a stack é um comando:

```bash
docker compose --profile observability up -d
```

### Decisões que deserveem registro

**Prometheus faz scrape; o collector não faz push.** O exporter `prometheus` do
collector expõe `0.0.0.0:8889` e o job `otel-collector` do
`infra/prometheus/prometheus.yml` o coleta a cada 15s. Push exigiria
remote-write, que exige token — e token num compose é segredo versionado por
acidente.

**`resource_to_telemetry_conversion: true` é obrigatório.** Sem ele o collector
descarta `service.name`, `service.version` e `deployment.environment`, e toda
métrica perde a label que diz de qual serviço veio — api e web ficam indistinguíveis
no Grafana.

**O collector é scraped em uma segunda porta.** O exporter `prometheus` (8889)
serve só o que a aplicação exportou. A telemetria interna do collector fica na
porta padrão **8888** e é o que responde "a telemetria está chegando e o
exportador está dando conta?" — `otelcol_receiver_accepted_spans`,
`otelcol_exporter_sent_spans`, `otelcol_exporter_queue_size`. Sem esse job, uma
falha de exportação aparece como um Grafana vazio, sem pista de onde veio.

**A senha do Grafana não vive no compose.** `${GF_SECURITY_ADMIN_PASSWORD:?}`
em `environment:` quebraria `docker compose config`, `ps` e `down`, que interpolam
antes de ler o `env_file`. O Grafana lê do `env_file: .env.production`, como o
`JWT_SECRET`. E o default do Grafana **não** é pedir senha: sem a variável ele
gera uma aleatória e só a imprime no log — o admin fica inacessível sem nenhum
sintoma, só um `401` na tela de login.

**Loki fica de fora.** A api não emite logs para o collector: o Pino escreve em
stdout e quem indexa é o driver de container. Loki exigiria trocar o backend de
log ou rodar um `filelog` receiver — trabalho que não serve ao objetivo
"acompanhar a telemetria da aplicação" e adiciona um quarto serviço. Se o
volume de logs precisar de busca, é uma decisão nova, não um detalhe deste ADR.

## Consequências

**Positivas**

- Um comando sobe uma tela que responde a pergunta que a telemetria existe para
  responder. Antes disso, era preciso saber ler `debug` no log do collector.
- `resource.name` vira dado de verdade, então a separação api/web deixa de ser
  uma convenção e passa a ser uma label.

**Negativas, e o que ficou em aberto**

- **A api ainda não exporta métricas.** Não há `MeterProvider` no repositório
  (achado 3), e fechar isso exige o pacote
  `@opentelemetry/exporter-metrics-otlp-http`, que **ainda não foi adicionado**.
  Hoje o Prometheus mostra a telemetria do pipeline — o que importa para
  diagnosticar a stack — e nada da aplicação: os histogramas de web-vitals
  continuam registrando num `NoopMeter`. Isto é uma lacuna nomeada, não um
  esquecimento.
- Tempo com backend local e `block_retention: 24h` não é para produção multi-node.
- O `tail_sampling` segura cada trace por `decision_wait: 10s` antes de decidir.
  Latência real de 10s para o trace aparecer no Grafana — aceitável em dev,
  questionável em tráfego alto.
- **O sampling é em duas camadas, e a primeira é invisível.** `tracing.ts` não
  passa `sampler`, então o SDK Node lê `OTEL_TRACES_SAMPLER` do ambiente — e
  `.env.production.example:96-97` entrega `parentbased_traceidratio` + `ARG=0.1`,
  que descarta 90% dos traces raiz **antes do collector**. O que sobrevive cai na
  `tail_sampling`, que guarda 5% do resto. Para um request rápido e bem-sucedido
  são ~0,5%. Erro e request lento passam pela camada 2, **mas a camada 1 não os
  favorece**: `TraceIdRatioBasedSampler` decide por XOR do trace-id e é cego ao
  status HTTP, então um trace de erro tem a mesma chance de 10% que um rápido
  (MEDIDO: 10,06% para ambos, 200 000 traceIds com o sampler real do SDK deste
  repo) — **~10% dos traces de erro chegam ao backend, não 100%**. Consequência:
  com o exemplo copiado sem edição, "a tela está vazia" é o resultado esperado,
  não um defeito — e nenhum sintoma no Prometheus denuncia isso, porque o que não
  chega também não gera erro. Para ver traces comuns em dev,
  `OTEL_TRACES_SAMPLER=always_on`.
- **As taxas acima são da `api`.** O serviço `web` não tem `env_file` (MEDIDO) e
  `OTEL_TRACES_SAMPLER` não é `NEXT_PUBLIC_*`, logo não é inlined no build: para
  span de browser a camada 1 não existe, o fallback é `AlwaysOn` e a taxa é
  **100%**. Span de web entra inteiro e só passa pela camada 2 — o oposto da api.
- **Não há deep-link trace→métricas nem service map.** `tracesToMetrics` e
  `serviceMap` do datasource Tempo consultam as span-metrics, e nada no stack as
  produz: `tempo.yaml` está sem `metrics_generator` (que faria remote-write para o
  Prometheus) e o collector está sem o connector `spanmetrics`. As chaves foram
  removidas do datasource em vez de ligadas — com elas presentes o clique abre um
  gráfico vazio. Ligar junto com T5.
- Três serviços a mais consome memória da máquina de desenvolvimento, ainda que
  só com o perfil ligado.

## Alternativas consideradas

- **Grafana Cloud / Honeycomb** — resolve o problema do backend sem operar
  nada, mas exige conta, token e dado da aplicação indo para fora da máquina.
  Inviável para o objetivo de acompanhar em ambiente local.
- **Só Prometheus + métricas, sem traces** — mais simples, mas traces e métricas
  respondem perguntas diferentes: "quanto tempo levou" e "por que este request
  demorou". Sem traces, a segunda não tem resposta.
- **Grafana + Prometheus, sem Tempo** — foi a primeira hipótese e caiu por
  medição: o projeto produz traces e descartar a maior parte da telemetria
  existente seria entregar metade do que já foi construído.