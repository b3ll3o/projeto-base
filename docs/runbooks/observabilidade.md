# Runbook de observabilidade — Grafana, Tempo, Prometheus e o OTel Collector

> Parte do [runbook canônico](../como-rodar.md). Índices:
> [Ambiente 1 (dev local pnpm nativo) →](../como-rodar.md#1-ambiente-1--dev-local-pnpm-nativo)
> · [Ambientes 2 e 3 (Docker) →](./docker.md)
> · [Ambientes 5 e 6 (e2e e CI) →](./e2e-e-ci.md)

Ambiente **4**: o perfil `observability` do Compose.

Legenda: **✅ medido** = executado, com saída observada · **📖 lido do código** =
derivado do YAML/config, não executado.

---

## §1. Subir o perfil

```bash
docker compose --profile observability up -d
```

Sobe quatro serviços: o `otel-collector` (`infra/otelcol/config.yaml`) mais os três
backends — Tempo (`infra/tempo/tempo.yaml`), Prometheus
(`infra/prometheus/prometheus.yml`) e Grafana (datasources em
`infra/grafana/provisioning/`). O perfil é opt-in: sem a flag, `docker compose
config` não lista nenhum dos quatro.

| Onde | O quê |
|---|---|
| <http://localhost:3300> | Grafana — a tela. Login `admin` / `GF_SECURITY_ADMIN_PASSWORD` |
| <http://localhost:9090> | Prometheus — UI de consulta PromQL |

O Tempo **não** é publicado: ele é consultado pelo Grafana, pela rede interna do
perfil.

### §1.1 Antes do primeiro `up`

`GF_SECURITY_ADMIN_PASSWORD` precisa existir no `.env.production` (já está
documentado em `.env.production.example`). Sem ela o Grafana **sobe saudável e não
avisa** — gera uma senha aleatória e só a imprime no log do container. O único
sintoma é um `401` na tela de login com a senha que você escolheu.

```bash
# uma vez só, para gerar a senha
echo "GF_SECURITY_ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)" >> .env.production
```

---

## §2. Onde a telemetria vai

`OTEL_EXPORTER_OTLP_ENDPOINT` **não é obrigatória**: sem ela a api cai no default de
`tracing.ts` (`http://otel-collector:4318/v1/traces`), que é o certo para o
Compose — e o collector sobe normalmente, sem falhar. Em dev local (pnpm), para o
web enviar traces do browser:
`NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces`.

No **Compose** a mesma telemetria de browser vem pelo `build.args` do serviço
`web`, não pelo `environment:`: `NEXT_PUBLIC_*` é inlined no build do Next.js, então
a chave no ambiente chegaria tarde demais. O `ARG` do `apps/web/Dockerfile` nasce
vazio — build fora do Compose (inclusive o job `docker-build-prod` do CI) segue sem
telemetria de browser.

### §2.1 O sampling é em DUAS camadas — e é por isso que a tela fica vazia

O `tail_sampling` segura cada trace por `decision_wait: 10s` antes de decidir se
guarda. Espere, não recarregue em laço. **Mas esses 10s não são a razão principal
de uma tela vazia: o motivo é que a maioria dos traces é descartada ANTES de chegar
ao collector.**

| Camada | Onde | O que descarta |
| --- | --- | --- |
| 1. SDK | `tracing.ts` **não passa `sampler`**, então o SDK Node lê `OTEL_TRACES_SAMPLER` do ambiente | `parentbased_traceidratio` + `ARG=0.1` (o que `.env.production.example` entrega) mata 90% dos traces raiz. Sem essas chaves o fallback é `AlwaysOn` e a camada não descarta nada |
| 2. Collector | `infra/otelcol/config.yaml` `tail_sampling` | dos que sobraram, passa qualquer um destes: `status_code` erro, mais lento que 1s, **ou** a baseline probabilística de 5%. As policies são combinadas com **OR** (basta uma casar) e a ordem delas no YAML é irrelevante — MEDIDO ao vivo: 30 traces enviados por OTLP/HTTP, busca `/api/search` do Tempo devolveu erro 10/10, lenta 10/10, rápida 0/10; registro no bloco "MEDIDO ao vivo" acima de `tail_sampling` em `infra/otelcol/config.yaml` |

**Para um request rápido e bem-sucedido, com o `.env.production` copiado do
example: 10% × 5% ≈ 0,5% de chance de aparecer no Grafana.** Trace de erro e
request lento passam **pela camada 2**, mas isso não é garantia de chegada: a
camada 1 é um `TraceIdRatioBasedSampler`, que decide por XOR do trace-id e **não
enxerga status HTTP** — um request de erro tem exatamente a mesma chance de 10%
que um rápido. MEDIDO sobre 200 000 traceIds com o sampler real do SDK deste repo:
10,06% dos requests e 10,06% dos requests de erro. Ou seja, **~10% dos traces de
erro chegam ao backend**, e não 100%.

⚠️ **Estas taxas são da `api`.** O serviço `web` não tem `env_file` (MEDIDO), e
`OTEL_TRACES_SAMPLER` não é `NEXT_PUBLIC_*`, então nem é inlined no build: para
span de browser a camada 1 não existe, o fallback é `AlwaysOn` e a taxa real é
**100%**. Span de web entra inteiro e só passa pela camada 2.

Se você quer *ver* traces comuns durante o desenvolvimento, ponha
`OTEL_TRACES_SAMPLER=always_on` no `.env.production` — ou deixe de copiar essas duas
linhas do example. Para ver o efeito na prática: 100 requests de sucesso ≈ 0,5
trace.

### §2.2 Se a tela estiver vazia

Três perguntas, em ordem, respondidas pelo Prometheus:

```promql
sum(rate(otelcol_receiver_accepted_spans[5m]))    # a telemetria está chegando?
sum(rate(otelcol_exporter_send_failed_spans[5m]))  # o exportador está FALHANDO?
max(otelcol_exporter_queue_size)                  # fila > 0 = exportador atrasado
```

A segunda é `send_failed`, **não** `sent`: `exporter_sent_spans` conta o que
passou pelo `tail_sampling`, e com a taxa acima um `sent` baixo é o comportamento
saudável esperado — compará-lo com o `accepted` não isola nada e vira diagnóstico
de incidente onde a configuração está certa. O que acusa exportador quebrado é
`send_failed` subindo, ou `queue_size` empilhando.

Se `accepted_spans` não sobe, o problema está **antes** do collector: a aplicação
não está exportando (ou o sampling da camada 1 comeu tudo). Nesse caso
`docker compose logs api | grep -i telemetry`. Essas séries vêm do job
`otel-collector-pipeline` (porta 8888), separado do job `otel-collector` (8889) que
traz as métricas da aplicação.
