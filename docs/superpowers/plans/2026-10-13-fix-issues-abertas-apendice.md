---
title: Apêndice — Riscos e Métricas do plano de issues abertas
slug: fix-issues-abertas-2026-10-13-apendice
parent: 2026-10-13-fix-issues-abertas.md
generated_at: 2026-10-13T20:25:00Z
---

# Apêndice — Riscos e Métricas

> Detalhes extraídos do plano principal para manter o doc ≤ 300 linhas
> (regra `tamanho-e-revisao.md`). Tudo aqui é referenciado por §6 e §7 do
> plano principal; este apêndice é a expansão.

## A. Riscos (expansão de §6)

### A.1 `ALTER TABLE ... SET DEFAULT` em prod tem lock implícito

- **Probabilidade:** média
- **Impacto:** médio
- **Cenário:** rodar a migration em prod durante horário de pico pode segurar
  lock na tabela `users_history` enquanto reescreve default
- **Mitigação:** PR-3 não roda em prod sem `prisma migrate resolve --applied`;
  revisão do prisma-db-specialist valida ordem; migration usa `ADD DEFAULT`
  (instantâneo em PG ≥ 11) em vez de recriar tabela

### A.2 `digest` errado de imagem trava build

- **Probabilidade:** baixa
- **Impacto:** alto
- **Cenário:** SHA256 publicado na doc está desatualizado; `docker pull`
  retorna digest diferente; `docker compose up` falha com manifest unknown
- **Mitigação:** PR-1 roda `docker pull postgres:16-alpine` localmente e
  usa `docker inspect --format='{{index .RepoDigests 0}}'` para extrair
  o digest atual antes de pinar. Mesmo procedimento para otel-collector.
  Dockerfile `FROM node:22-bookworm-slim` exige build da imagem local
  para extrair digest.

### A.3 `@nestjs/throttler` quebra spec e2e

- **Probabilidade:** média
- **Impacto:** médio
- **Cenário:** spec Playwright que dispara 100+ requests em loop pode
  começar a receber 429
- **Mitigação:** throttler configurado com TTL 60s/limit 100 (folgado);
  spec e2e roda com `@SkipThrottle()` em `/health` (já previsto);
  spec Playwright de carga não existe no repo hoje, então risco é baixo

### A.4 PR-5 com bump errado dispara release-template antes da hora

- **Probabilidade:** baixa
- **Impacto:** alto
- **Cenário:** alguém mergeia PR-5 antes de PR-1, PR-2, PR-3, PR-4; tag
  v1.11.0 fica sem os fixes referenciados
- **Mitigação:** PR-5 tem regra explícita "só mergeia depois dos 4
  anteriores"; branch protection do `main` exige `required_status_checks`
  (já em vigor: `quality`)

### A.5 Token de release sem permissão de tag

- **Probabilidade:** baixa
- **Impacto:** médio
- **Cenário:** `GITHUB_TOKEN` em workflow release-template sem
  `contents: write`; tag `v1.11.0` falha
- **Mitigação:** workflow já tem `permissions: contents: write` (verificar
  no PR-5); fallback: tag manual via `git tag -a v1.11.0` + `git push --tags`

### A.6 CORS whitelist muito restritiva bloqueia dev local

- **Probabilidade:** média
- **Impacto:** baixo
- **Cenário:** dev adiciona nova porta (3002) mas esquece de adicionar
  em `ALLOWED_ORIGINS`; CORS bloqueia
- **Mitigação:** `ALLOWED_ORIGINS` default é `http://localhost:3001`
  (atual); `apps/web/Dockerfile` expõe 3001; novo dev adiciona env var
  no `.env.local`

## B. Métricas (expansão de §7)

### B.1 Antes (estado atual, 2026-10-13)

| Métrica | Valor | Como medir |
|---|---|---|
| Issues abertas | 9 (4 P0 + 5 P1) | `gh issue list --state open --limit 100` |
| Tag git atual | v1.10.0 (af6af0a) | `git tag --list 'v*' --sort=-v:refname \| head -1` |
| Drift de versão cross-doc | 2 (STACK, TEMPLATE_USAGE) | `grep '^**Vers' docs/STACK.md docs/MONOREPO.md .agents/specs/conventions/estrutura-e-versionamento.md docs/TEMPLATE_USAGE.md` |
| Containers com mem_limit | 0 | `docker-compose.yml: \| grep mem_limit` |
| Imagens com @sha256 | 0 | `grep -E 'image: .*@sha256' docker-compose.yml` |
| Rate-limit middleware | ausente | `grep -rE 'rate-limit\|throttler' apps/api/src apps/api/package.json` |
| CORS whitelist | `origin: true` (reflete qualquer origem) | `apps/api/src/main.ts:31-33` |
| Migration com DEFAULT uuid | 0 (drift entre schema e DDL) | `grep 'DEFAULT gen_random_uuid' apps/api/prisma/migrations/*/migration.sql` |
| Fetch timeout (web) | ilimitado | `apps/web/lib/api-client.ts` |
| PRs merged pós-v1.10.0 | 8 (#59 a #66) | `git log v1.10.0..HEAD --oneline \| wc -l` |
| Conventional commits | 100% pós-v1.10.0 | `git log v1.10.0..HEAD --pretty=%s` |

### B.2 Depois (esperado pós-PR-5 merge)

| Métrica | Valor esperado | Como verificar |
|---|---|---|
| Issues abertas | 0 | `gh issue list --state open --limit 100` |
| Tag git atual | v1.11.0 (e8ed335 ou posterior) | `git tag --list 'v*' --sort=-v:refname \| head -1` |
| Drift de versão cross-doc | 0 | grep idem |
| Containers com mem_limit | 4 (postgres, api, web, otel-collector) | `docker-compose.yml \| grep mem_limit \| wc -l` |
| Imagens com @sha256 | 3 (postgres, node, otel) | `grep -cE 'image: .*@sha256' docker-compose.yml` |
| Rate-limit middleware | ThrottlerGuard 100 req/min/IP | `grep -rE 'ThrottlerGuard\|@nestjs/throttler' apps/api/src` |
| CORS whitelist | lista de origens via `ALLOWED_ORIGINS` env | `apps/api/src/main.ts` |
| Migration com DEFAULT uuid | 2 (users_history, users_archive) | grep idem |
| Fetch timeout (web) | 10s padrão (configurável) | `apps/web/lib/api-client.ts` |
| PRs merged pós-v1.10.0 | 13 (8 originais + 5 do plano) | `git log v1.10.0..HEAD --oneline \| wc -l` |

## C. Detalhamento adicional de PR-1

(diff inline do plano principal é suficiente; este apêndice guarda o
detalhe do `infra/otelcol/config.yaml` que **complementa** #75)

```yaml
# infra/otelcol/config.yaml
processors:
  memory_limiter:        # novo — #75
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 25
  batch:
    timeout: 5s
    send_batch_size: 1024

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]   # memory_limiter PRIMEIRO
      exporters: [debug]
```

## D. Cross-refs

- Plano principal: [2026-10-13-fix-issues-abertas.md](../2026-10-13-fix-issues-abertas.md)
- State-snapshot: [`.agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md`](../../../.agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md)
- Convenção: [`.agents/specs/conventions/tamanho-e-revisao.md`](../../.agents/specs/conventions/tamanho-e-revisao.md) §Tamanho Máximo
