---
name: docker-prod-audit
version: 1.0
updated: 2026-10-08
description: "Processo determinístico de auditoria prod-readiness de containers — valida hardening runtime, multi-stage, healthchecks, secrets, image pinning, signal handling. Carregado por `docker-prod-specialist` quando a task é de auditoria (não escrita) de Dockerfiles/Compose."
---

# Skill: docker-prod-audit

> **Quem invoca:** `docker-prod-specialist` (papel, princípios, anti-padrões ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** revisão periódica (cron), PR que toca `Dockerfile`/`docker-compose*.yml`/`.dockerignore`, pré-tag, pré-deploy prod.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria hardening | validar build | auditar healthchecks>"

context:
  dockerfiles: ["apps/api/Dockerfile", "apps/web/Dockerfile"]
  compose: ["docker-compose.yml", "docker-compose.dev.yml"]
  dockerignore: [".dockerignore"]
  ci: [".github/workflows/ci.yml"]
  expected_services: ["api", "web", "postgres", "otel-collector", "jaeger"]
```

## Passo 1 — Validar build local

```bash
# Skip se Docker não disponível (marcar "skipped (no docker)" no findings)
docker buildx build -f apps/api/Dockerfile --target prod -t api:audit --load . 2>&1 | tail -20
docker buildx build -f apps/web/Dockerfile --target prod -t web:audit --load . 2>&1 | tail -20
```

## Passo 2 — Auditar hardening runtime (Compose)

```bash
# Esperado em todo serviço prod: user non-root, read_only, cap_drop, security_opt
for svc in api web postgres; do
  echo "=== $svc ==="
  yq -P ".services.$svc" docker-compose.yml 2>/dev/null \
    | grep -E "user:|read_only:|cap_drop:|cap_add:|security_opt:|privileged:" \
    || echo "(serviço $svc não encontrado ou sem hardening)"
done
```

## Passo 3 — Validar pinning de imagem

```bash
# 3.1 Sem :latest
grep -E "image:" docker-compose.yml apps/*/Dockerfile \
  | grep -v ":latest" \
  | head -20

# 3.2 FROM base no Dockerfile
grep -E "^FROM " apps/*/Dockerfile | head -20

# 3.3 Tags específicas (regex simples)
grep -E "image: [a-z0-9/:.-]+:[a-zA-Z0-9_.-]+$" docker-compose.yml | head -10
```

## Passo 4 — Auditar healthchecks prod

```bash
# 4.1 Healthchecks em todos os serviços
grep -A 6 "healthcheck:" docker-compose.yml

# 4.2 Critérios prod: interval≤10s, timeout≤3s, retries=3, start_period≤30s
# (validação programática abaixo; aqui só coletamos para review)
grep -E "interval:|timeout:|retries:|start_period:" docker-compose.yml

# 4.3 Comandos que dependem de binário (ex: curl em distroless)
grep -B 1 "curl\|wget" docker-compose.yml
```

## Passo 5 — Validar signal handling

```bash
# Init no PID 1 (dumb-init, tini, ou node --init)
grep -E "tini|dumb-init|init: " docker-compose.yml apps/*/Dockerfile
# Esperado: init para garantir reap de SIGTERM e shutdown gracioso
```

## Passo 6 — Auditar .dockerignore

```bash
# 6.1 Listar exclusões
cat .dockerignore | sort

# 6.2 Crítico: .git, node_modules (de apps que não são alvo), .env*, coverage/, .agents/runs/
for pattern in ".git" "node_modules" ".env" "coverage/" ".agents/runs/"; do
  grep -q "^$pattern" .dockerignore && echo "✓ exclui $pattern" || echo "✗ NÃO exclui $pattern"
done
```

## Passo 7 — Auditar secrets management

```bash
# 7.1 Hardcoded secrets em environment (CRITICAL)
grep -E "PASSWORD|SECRET|TOKEN|KEY" docker-compose.yml | grep -vE "^\s*#" | head -20

# 7.2 env_file presente
grep "env_file:" docker-compose.yml | head -10

# 7.3 Docker secrets (vs env literal)
grep -A 3 "secrets:" docker-compose.yml | head -20
```

## Passo 8 — Auditar restart policy

```bash
# 8.1 Em dev: unless-stopped é OK; em prod: orchestrator decide (omitir)
grep -E "restart:" docker-compose.yml
# Esperado: dev=unless-stopped, prod=sem restart (k8s/ECS decide)
```

## Passo 9 — Persistir findings

```yaml
- id: docker-SEC-001
  title: "Serviço api roda como root (USER não definido no Dockerfile)"
  severity: P0
  location: "apps/api/Dockerfile:25"
  cause: "Stage prod não tem USER node; herda USER root do base image."
  impact: "Em exploit (RCE), atacante tem root dentro do container; escape é trivial via /proc/sysrq ou mounts."
  evidence: "docker history api:audit mostra USER root no último layer."
  fix: |
    Adicionar antes de CMD/ENTRYPOINT:
    USER node
    # Garantir que /app tem ownership do node:node
    COPY --chown=node:node --from=builder /app/dist ./dist
  breaking_change: false
  category: "security|drift|gap|regression"
```

## Passo 10 — Devolver ao `finding-orchestrator`

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `docker buildx build` falha | Dockerfile malformado ou context com .env | Fix Dockerfile antes de auditar; reportar como finding DRIFT |
| `yq` não disponível | Sandbox sem yq instalado | `pip install yq` ou usar `python3 -c "import yaml; ..."` |
| `grep` retorna vazio em hardening | Serviços não têm hardening (esperado para dev) | Marcar como finding SEC P0 para prod; ignorar para dev profile |
| `docker history` falha | Imagem não foi construída | Re-rodar Passo 1 primeiro |
| `.dockerignore` tem `node_modules` mas o contexto de build ainda copia 500MB | Multi-stage com `COPY --from=` pode trazer node_modules se não for filtrado | Validar cada `COPY` no Dockerfile |

## Saída

- `findings.yaml` categorizado
- Lista de services sem hardening (para prod)
- Imagens com `:latest` (CRITICAL)
- `.dockerignore` gaps
- Hardcoded secrets detectados

## Referências

- Agent: `.agents/agents/docker-prod-specialist.md`
- Docker security: <https://docs.docker.com/engine/security/>
- Node Docker best practices: <https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md>
- Distroless: <https://github.com/GoogleContainerTools/distroless>
