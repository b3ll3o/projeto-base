# Fase 2 — docker-specialist + docker skill

> TDD step-by-step. Cada task = 1 commit + 2-stage review. **Branch:** `feat/dockerize-apps`. **Spec:** `docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md` §5.7-§5.9.

Pré-requisito: Fase 1 completa (specialist-router operacional para validação pós-criação).

---

### Task 9: docker-specialist agent + memory

**Files:** Create `.agents/agents/docker-specialist.md` (≤ 300 linhas), Create `.agents/memory/docker-specialist.md`.

- [ ] **Step 1: Criar agent definition** — Frontmatter:
```yaml
---
name: docker-specialist
description: Specialist em containerização. Cobre Dockerfile (multi-stage, BuildKit cache mounts), Compose (multi-file com override, profiles, networks, volumes, secrets), hardening (non-root, distroless, version pinning, healthchecks, signals), registries (multi-arch, OCI labels), runtime (init containers, graceful shutdown, observability), integração com monorepo pnpm+turbo. Use para criar/auditar Dockerfiles, configurar compose stacks, otimizar imagens, validar segurança de runtime, debugar build/runtime.
type: specialist
tools: Read, Glob, Grep, Bash, Write, Agent
---
```
12 seções: **Papel** (8 bullets — Dockerfiles/compose/hardening/BuildKit/registries/runtime/monorepo/auditoria), **Quando invocar** (9 bullets), **Quando NÃO** (4 — apps sem deploy container, k8s manifests puros, serverless cold start optimization, IaC terraform/pulumi), **Inputs** (yaml com task/context/expected_output/success_criteria), **Comportamento** (7 passos — analisar stack → escolher base → multi-stage dev+prod → aplicar hardening → criar compose → validar build verde → documentar), **Outputs** (plan YAML com dockerfiles/compose/.dockerignore/healthchecks/cors), **Coordenação** (tabela: nestjs-specialist para Prisma binary, nextjs-specialist para standalone output, monorepo-specialist para turbo, security-auditor para hardening), **Princípios** (6), **Anti-Padrões** (6 ❌: rodar root, latest tag, sem healthcheck, sem .dockerignore, secrets em ENV, build context = app folder em monorepo), **Referências Canônicas** (Docker docs, BuildKit docs, OWASP Docker Top 10, distroless, Prisma binaryTargets).

- [ ] **Step 2: Criar memory inicial** — Copiar de `.agents/memory/_template.md`. Frontmatter: `name: docker-specialist`, `type: agent_memory`, description livre. Body: Estado Inicial (data 2026-09-23, paths spec/plan/demand) / Learnings (vazio) / Padrões Descobertos (vazio) / Cross-refs.

- [ ] **Step 3: Verificar + commit**
```bash
wc -l .agents/agents/docker-specialist.md .agents/memory/docker-specialist.md  # agent ≤ 300, memory ≤ 50
git add .agents/agents/docker-specialist.md .agents/memory/docker-specialist.md
git commit -m "feat(agents): add docker-specialist agent + memory v1.0"
```

- [ ] **Step 4: Validar via specialist-router**
```bash
echo "dockerizar apps/api e apps/web" > /tmp/d.txt
printf 'apps/api/**\napps/web/**\n' > /tmp/p.txt
pnpm specialist:route --demand=/tmp/d.txt --paths=/tmp/p.txt --matrix=.agents/specs/conventions/specialist-routing.md
```
Esperado: YAML com `specialists: [docker-specialist, monorepo-specialist]` (validação end-to-end da Fase 1).

---

### Task 10: docker skill

**Files:** Create `.agents/skills/docker/SKILL.md` (≤ 200 linhas).

- [ ] **Step 1: Criar SKILL.md** — Frontmatter:
```yaml
---
name: docker
description: Convenções e processos docker específicos do monorepo projeto-base. Cobre ordem de build (db:generate → tsc antes de tsc), next.config.mjs output: 'standalone', entrypoint com prisma migrate deploy, .dockerignore mínimo, Compose profiles dev/prod, networks bridge, volumes nomeados, healthchecks via curl, non-root user, BuildKit cache mounts para pnpm. Use sempre que criar/editar Dockerfile, compose, ou .dockerignore no projeto.
---
```
Body: **Inputs** (yaml com stack alvo + paths + tipo dev/prod), **Comportamento** (10 passos):
1. Detectar stack (Node 20 + pnpm + NestJS/Next.js/Postgres)
2. Escolher base image (`node:20-bookworm-slim` para Prisma compat)
3. Multi-stage targets (`base` → `dev` → `prod`)
4. Para api: ordem `db:generate` antes de `tsc` (Prisma 6 + binary debian-openssl-3.0.x)
5. Para web: `next.config.mjs` com `output: 'standalone'` antes do build
6. Entrypoint: `prisma migrate deploy && node dist/main.js` (api) ou `node server.js` (web standalone)
7. `.dockerignore` mínimo (node_modules, .turbo, dist, .next, coverage, *.log; MANTER pnpm-lock.yaml + apps/api/prisma/migrations)
8. Healthcheck endpoint (api: `GET /api/v1/health` valida DB; web: `GET /api/health`)
9. Non-root user (`USER node` no stage runtime)
10. BuildKit cache mounts (`--mount=type=cache,target=/root/.local/share/pnpm/store`)

**Outputs** (yaml com Dockerfile final + .dockerignore + entrypoint script). **Anti-Padrões** (6 ❌). **Cross-refs** (agent + demand atual).

- [ ] **Step 2: Commit**
```bash
git add .agents/skills/docker/SKILL.md
git commit -m "feat(skills): add docker conventions skill (project-specific)"
```

---

## Done da Fase 2

```bash
ls .agents/agents/docker-specialist.md .agents/memory/docker-specialist.md .agents/skills/docker/SKILL.md  # todos existem
wc -l .agents/agents/docker-specialist.md .agents/skills/docker/SKILL.md  # ambos ≤ limites
pnpm specialist:route --demand=/tmp/d.txt --paths=/tmp/p.txt --matrix=.agents/specs/conventions/specialist-routing.md  # inclui docker-specialist
```

Avançar para Fase 3 (aplicação à demanda de dockerização).

**Mantido por:** projeto-base contributors