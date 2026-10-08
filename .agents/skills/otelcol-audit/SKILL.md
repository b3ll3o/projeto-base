---
name: otelcol-audit
version: 1.0
updated: 2026-10-08
description: "Processo determinístico de auditoria OTel Collector — valida schema YAML, audita receivers/processors, sampling, profiles Compose, pinning de versão. Carregado por `otelcol-infra-specialist` quando a task é de auditoria (não criação) do `infra/otelcol/config.yaml`."
---

# Skill: otelcol-audit

> **Quem invoca:** `otelcol-infra-specialist` (papel, princípios, anti-padrões ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** revisão periódica (cron), PR que toca `infra/otelcol/**`, mudança de exporter/sampling, pré-tag.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria config | drift version | sampling review>"

context:
  config_path: "infra/otelcol/config.yaml"
  compose_path: "docker-compose.yml"
  api_instrumentation: "apps/api/src/instrumentation.ts"  # opcional
  web_instrumentation: "apps/web/instrumentation.ts"      # opcional
  collector_version: "0.103.0"  # versão de referência para validate
```

## Passo 1 — Validar schema do config

```bash
# OTel Collector tem schema JSON próprio; validate é a primeira barreira
docker run --rm -v "$(pwd)/infra/otelcol:/cfg" \
  otel/opentelemetry-collector-contrib:0.103.0 \
  validate --config=/cfg/config.yaml
```

Se `docker` indisponível, pular e marcar como "skipped (no docker)".

## Passo 2 — Auditar receivers (princípio do mínimo)

```bash
# 2.1 Receivers declarados
grep -A 10 "^receivers:" infra/otelcol/config.yaml

# 2.2 Producers ativos (quem produz spans/metrics/logs que esse receiver consome?)
echo "--- otlp producers ---"
grep -rn "@opentelemetry/exporter-otlp\|OtlpExporter" apps/ | head -10
echo "--- prometheus producers ---"
grep -rn "@opentelemetry/exporter-prometheus\|--set-process-metrics\|prom-client" apps/ \
  || echo "sem producer prometheus"
echo "--- zipkin/jaeger producers ---"
grep -rn "zipkin\|jaeger" apps/ || echo "sem producer zipkin/jaeger"
```

Regra: receiver ativo sem producer = finding DRIFT (custo de export vazio).

## Passo 3 — Auditar processors essenciais

```bash
# 3.1 memory_limiter e batch (praticamente obrigatórios)
grep -E "memory_limiter|batch" infra/otelcol/config.yaml \
  || echo "✗ faltando memory_limiter ou batch"

# 3.2 tail_sampling — só com regra explícita
grep -A 20 "tail_sampling" infra/otelcol/config.yaml \
  || echo "(sem tail_sampling — esperado se não houver política)"

# 3.3 Ordem dos processors (memory_limiter DEVE vir antes de batch)
grep -E "memory_limiter:|batch:|tail_sampling:" infra/otelcol/config.yaml
```

## Passo 4 — Validar sampling decision propagation

```bash
# Esperado: parent_based para preservar decisão do caller (cost-efficiency)
grep -E "parent_based|probabilistic" infra/otelcol/config.yaml \
  || echo "✗ sem política de sampling declarada"
```

## Passo 5 — Auditar profile Compose

```bash
# OTel Collector NÃO pode ser default — deve ser opt-in via profile
grep -B 1 -A 1 "profiles:" docker-compose.yml

# Verificar se collector está em algum profile
grep -B 5 "otel-collector\|otelcol" docker-compose.yml | head -20
```

## Passo 6 — Drift OTel Collector version

```bash
# Versão travada (sem :latest)
grep "image: otel/" docker-compose.yml
# Esperado: tag específica (ex: 0.103.0), nunca :latest
```

## Passo 7 — Validar W3C propagation end-to-end

```bash
# apps/api
grep -rn "W3CTraceContextPropagator\|traceparent" apps/api/src/ | head -5
# apps/web
grep -rn "traceparent\|traceContext" apps/web/ | head -5
# Esperado: ambos propagam W3C
```

## Passo 8 — Persistir findings

```yaml
- id: otelcol-SEC-001
  title: "Collector sem memory_limiter — risco de OOM em pico"
  severity: P0
  location: "infra/otelcol/config.yaml"
  cause: "Pipeline de traces não tem processor memory_limiter."
  impact: "Em pico (1k+ spans/s), collector consome memória ilimitada, OOM kill, perda total de telemetria."
  evidence: "YAML não cita memory_limiter; collector contrib recomenda."
  fix: |
    Adicionar processor memory_limiter antes de batch:
    processors: [memory_limiter, batch]
    memory_limiter.check_interval: 1s
    memory_limiter.limit_percentage: 80
    memory_limiter.spike_limit_percentage: 20
  breaking_change: false
  category: "drift|gap|security|regression"
```

## Passo 9 — Devolver ao `finding-orchestrator`

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `docker run` falha com "image not found" | Collector version não publicada | Trocar para versão mais recente; documentar em PR |
| `validate` retorna erro de schema | YAML malformado ou campo deprecated | Fix YAML antes de auditar; reportar como finding DRIFT |
| `grep` retorna vazio em todos os receivers | Config está vazio (collector desligado) | Não é finding — profile opt-in é esperado. Marcar "skipped" |
| Sampling política é mista (parent_based em traces, nada em metrics) | Métricas geralmente não usam sampling | Esperado; reportar inconsistência se aplicável |

## Saída

- `findings.yaml` com findings categorizados (`drift|gap|security|regression`)
- Lista de receivers órfãos (ativos sem producer)
- Versão do collector vs versão de referência (`collector_version` do input)
- Status de W3C propagation (boolean: web OK, api OK, ambos OK, nenhum)

## Referências

- Agent: `.agents/agents/otelcol-infra-specialist.md`
- OTel Collector config: <https://opentelemetry.io/docs/collector/configuration/>
- W3C Trace Context: <https://www.w3.org/TR/trace-context/>
