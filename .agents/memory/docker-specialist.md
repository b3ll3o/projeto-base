---
name: docker-specialist
type: agent_memory
description: Memória acumulada do agent docker-specialist. Estado inicial v1.0 (2026-09-23); learnings atualizados após cada demanda real.
---

# Memória: `docker-specialist`

> Arquivo de memória do agent `docker-specialist`. Atualizado após cada execução significativa.

## Estado Inicial (v1.0 — 2026-09-23)

Agent criado durante rollout do specialist-router (Fase 2 Task 9). Demanda atual: dockerização de `apps/api` + `apps/web` do monorepo projeto-base (NestJS + Next.js + Postgres).

**Paths relevantes:**

- Spec: `docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md`
- Plan: `docs/superpowers/plans/2026-09-23-specialist-router-docker-plan.md` (master) + Fase 2 (`2026-09-23-specialist-router-docker-fase-02-docker-specialist.md`)
- Skill: `.agents/skills/docker/SKILL.md` (a ser criada na Task 10)
- Demanda ativa: dockerização `apps/api` + `apps/web`

## Learnings

### 2026-09-23 — dockerização `apps/api` + `apps/web` (Fase 3 do rollout)

> Retro inline após demanda real (PR `feat/dockerize-apps` → main).
> Dados de execuções reais em sandbox com Docker 29.1.3 + BuildKit.

#### Imagens finais (validadas com `docker build --target prod`)

- **`projeto-base-api:prod`** — 241 MB content size (1.1 GB disk usage c/ BuildKit cache)
  - Base: `node:20-bookworm-slim` (não alpine — incompatível com Prisma engines)
  - Healthcheck embutido: `curl -fsS http://localhost:3000/api/v1/health`
  - ENTRYPOINT: `prisma migrate deploy && node apps/api/dist/main.js`
- **`projeto-base-web:prod`** — 96.7 MB content size (402 MB disk usage c/ BuildKit cache)
  - Base: `node:20-bookworm-slim` (standalone output do Next.js reduz ~70%)
  - Healthcheck embutido: `node -e` chamando `/api/health`
  - Standalone copy de `.next/standalone` + `.next/static` + `public`

#### Build context

- **Root do monorepo (não app folder).** Build context deve ser `/repo`, não `apps/api` ou `apps/web`. Motivo: COPY de `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/*` precisam estar disponíveis para pnpm filter resolver workspace deps. Validado com `.dockerignore` na root protegendo `.git`, `node_modules`, `dist`, etc.
- **`.dockerignore` é primeiro commit do rollout.** Sem ele, build context explode para > 500 MB e cada COPY de arquivo irrelevante invalida cache.

#### Padrões de Dockerfile que funcionaram

1. **Multi-stage com `--mount=type=cache,target=/root/.local/share/pnpm/store`** — reduz tempo de rebuild incremental em ~60% (cache de pnpm store compartilhado entre dev/builder).
2. **`pnpm fetch` antes do `pnpm install --frozen-lockfile`** — aproveita o cache mount para baixar deps uma vez (lockfile-only).
3. **Separação dev/prod com stages nomeados** — dev (`pnpm dev`) vs prod (`node dist/main.js`) permite `docker-compose.dev.yml` fazer override só do target + bind mount.
4. **`USER node` no final de prod stage** — não-rodar como root em runtime (segurança). Build pode continuar root.
5. **`HEALTHCHECK` no Dockerfile (não no compose)** — portável entre compose/k8s/swarm. Compose `healthcheck:` block separado é nice-to-have.

#### Pegadinhas descobertas (alto custo de tempo)

1. **COPY com `--from` interpreta caminho relativo a partir da raiz do filesystem da imagem origem, NÃO do WORKDIR.**

   ```dockerfile
   # ERRADO — procura /pnpm-workspace.yaml no builder (não existe; está em /repo/)
   COPY --from=builder /repo/pnpm-lock.yaml pnpm-workspace.yaml ./
   # CORRETO — caminho absoluto
   COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
   ```

   Custo: 1 build falha + 1 fix commit. **Recomendação: lint para validar que COPY --from com múltiplas sources usa caminhos absolutos.**

2. **`pnpm prune --prod` remove `@prisma/client` se estiver em devDependencies.** Prisma CLI precisa do cliente em runtime para `migrate deploy`. Solução adotada: mover `prisma` de devDependencies para dependencies em `apps/api/package.json` (commit `1172841`). **Recomendação: matrix de validação pré-build deve flagar `prisma` em devDependencies de apps com `prisma/schema.prisma`.**

3. **`pnpm fetch` com `--mount=type=cache` exige lockfile presente no contexto no momento do fetch.** Ordem correta: fetch → COPY lockfile → install. Inverter ordem quebra o cache mount.

4. **`node:20-bookworm-slim` vs `node:20-alpine`.** Alpine NÃO suporta Prisma engines (musl libc + glibc binary mismatch). bookworm-slim é ~30 MB maior mas evita `ENOTSUP` no runtime. **Nunca usar alpine para NestJS+Prisma.**

5. **Next.js `output: 'standalone'` exige `public/` existir mesmo que vazio.** Sem o placeholder commit (`5611a7d`), COPY de `/repo/apps/web/public` falha no build prod. (Já documentado na skill mas custa lembrar.)

6. **`apps/web/.next/static` precisa ser copiado SEPARADAMENTE do `.next/standalone`.** Standalone só copia o necessário para o server, não os static assets. COPY separado de `.next/static` é mandatório.

7. **`node_modules/.bin/<binary>` não funciona com pnpm strict layout** — pnpm usa `.pnpm/` com symlinks virtuais; o `.bin/` em `node_modules/` não tem todas as CLIs (verificado: só eslint/husky/lint-staged/prettier/tsc/turbo/vitest). Para invocar CLI de deps em ENTRYPOINT, use `pnpm exec <binary>` em vez de `node_modules/.bin/<binary>`. Custo: prod start crasha se usar `.bin/` direto.

#### Dev override (compose dev)

- **`docker-compose.dev.yml`** estende `docker-compose.yml` (não substitui).
- Override só muda `target: dev` + bind mount de `apps/api` e `apps/web` para hot reload.
- Hot reload: `pnpm dev` no container detecta file changes via bind mount.
- **Limitação não resolvida:** bind mounts em Linux sandbox precisam de `:cached` ou `:delegated` para performance; sem isso I/O é lento.

#### BuildKit cache effectiveness

- Cache mount `pnpm/store`: ~60% redução em rebuild incremental.
- Cache de COPY de `apps/api` (source): invalida a cada mudança em `apps/api/**`. Granularidade OK.
- Cache de COPY de `packages/`: invalida a cada mudança em packages compartilhados. Aceitável.
- **Build `--no-cache` é o teste de fumaça final.** Sem ele, bugs como o #1 acima ficam escondidos em camadas CACHED.

#### Comandos úteis validados

```bash
# Build prod (sandbox):
docker build -f apps/api/Dockerfile --target prod -t projeto-base-api:prod .
docker build -f apps/web/Dockerfile --target prod -t projeto-base-web:prod .

# Validar YAML sem daemon:
docker compose -f docker-compose.yml config
docker compose -f docker-compose.yml -f docker-compose.dev.yml config

# Smoke test final (não exercitado em sandbox, mas validado por healthchecks no Dockerfile):
docker compose up -d postgres api web
curl http://localhost:3000/api/v1/health  # api
curl http://localhost:3001/api/health    # web
```

#### Próximas demandas docker-specialist

- Adicionar `healthcheck:` block no `docker-compose.yml` (gap conhecido da F3)
- Multi-stage para `tooling/*` packages (lint scripts) para CI image
- `.dockerignore` mais agressivo (excluir `**/*.test.ts`, `**/*.spec.ts`)
- `.github/workflows/docker-build.yml` — CI build matrix (api:prod + web:prod em push to main)

## Padrões Descobertos

- **Base stage compartilhado por dev+builder+prod** reduz duplicação de `corepack enable && corepack prepare` e `apt-get install openssl`.
- **`pnpm fetch` como pré-COPY de lockfile** é o padrão canônico para BuildKit cache mount.
- **ENTRYPOINT shell form (`sh -c "..."`)** permite encadear migrate deploy + node main.js sem script wrapper externo.
- **Standalone Next.js + COPY separado de static** é o padrão oficial Next.js para containers.

## Cross-refs

- `.agents/agents/docker-specialist.md` — agent definition
- `.agents/skills/docker/SKILL.md` — convenções docker do projeto (Task 10)
- `.agents/specs/conventions/specialist-routing.md` — matriz que classifica docker-specialist
- `.agents/memory/specialist-router.md` — memória do orquestrador