# Fase 3b — Apps (health + CORS), Docs, CI, PR (Tasks 17-21)

> TDD step-by-step. **Branch:** `feat/dockerize-apps`. Pré-requisito: Fase 3a completa (Dockerfiles + compose prontos).
> Tasks 11-16 (dockerignore/next.config/Dockerfiles/compose) estão em [`fase-03a-dockerfiles-compose.md`](./2026-09-23-specialist-router-docker-fase-03a-dockerfiles-compose.md).

---

### Task 17: API health endpoint + CORS

**Files:** Create `apps/api/src/modules/health/health.controller.ts`, Create `apps/api/src/modules/health/health.module.ts`, Create `apps/api/src/modules/health/health.controller.spec.ts`, Modify `apps/api/src/app.module.ts`, Modify `apps/api/src/main.ts`.

- [ ] **Step 1: Teste RED** — `health.controller.spec.ts`:
```ts
describe('HealthController', () => {
  it('GET /health retorna 200 status=ok quando DB up', async () => {
    // mock PrismaService.$queryRawUnsafe('SELECT 1') → [{ '?column?': 1 }]
    // assert result.status === 'ok', checks.database === 'ok'
  });
  it('GET /health retorna 503 quando DB down', async () => {
    // mock $queryRawUnsafe → throw
    // assert result.status === 'degraded', checks.database === 'down'
  });
});
```

- [ ] **Step 2: FAIL** (`pnpm --filter @projeto/api test:unit -- health`).

- [ ] **Step 3: Implementar (GREEN)**
```ts
// health.controller.ts
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async check() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', checks: { database: 'ok' }, timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded', checks: { database: 'down' },
      });
    }
  }
}
// health.module.ts — registra HealthController + importa PrismaModule
```

- [ ] **Step 4: PASS** (2 testes).

- [ ] **Step 5: Registrar no AppModule** — `imports: [..., HealthModule]`.

- [ ] **Step 6: CORS em main.ts** — Após `app.setGlobalPrefix('api/v1')`:
```ts
if (process.env.NODE_ENV !== 'production') {
  app.enableCors({ origin: true, credentials: true });
}
```

- [ ] **Step 7: Validar + commit**
```bash
pnpm --filter @projeto/api typecheck  # exit 0
pnpm --filter @projeto/api test:unit  # todos PASS (incluindo novos)
git add apps/api/src/modules/health apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(api): add /api/v1/health endpoint + dev CORS"
```

---

### Task 18: Web health endpoint

**Files:** Create `apps/web/app/api/health/route.ts`.

- [ ] **Step 1: Criar route handler**
```ts
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

- [ ] **Step 2: Validar typecheck** (`pnpm --filter @projeto/web typecheck` → exit 0).

- [ ] **Step 3: Commit**
```bash
git add apps/web/app/api/health/route.ts
git commit -m "feat(web): add /api/health route handler"
```

---

### Task 19: docs/STACK.md + docs/MONOREPO.md updates

**Files:** Modify `docs/STACK.md`, Modify `docs/MONOREPO.md`.

- [ ] **Step 1: Adicionar seção Containerização em STACK.md** (após Tools table):
```markdown
## Containerização

- **Base image:** `node:20-bookworm-slim` (Prisma 6 compat)
- **Multi-stage:** `base` → `dev` → `prod` em ambos apps
- **Compose:** `docker-compose.yml` (prod) + `docker-compose.dev.yml` (override dev)
- **Healthchecks:** `curl /api/v1/health` (api) + node http.get (web)
- **Migrations:** entrypoint com `prisma migrate deploy`
- **Build cache:** BuildKit `--mount=type=cache,target=/root/.local/share/pnpm/store`
- **Runtime:** non-root user (`USER node`)
```

- [ ] **Step 2: Adicionar seção Docker em MONOREPO.md** (após Setup):
```markdown
## Docker

- `Dockerfile` em cada app (`apps/api/Dockerfile`, `apps/web/Dockerfile`)
- `docker-compose.yml` na raiz (postgres + api + web prod)
- `docker-compose.dev.yml` na raiz (override dev com hot reload)
- `.dockerignore` na raiz
- Comandos:
  - `docker compose up -d postgres api web` (prod)
  - `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` (dev)
```

- [ ] **Step 3: Bump footer version** — Atualizar `**Versão do documento:** X.Y.Z` em ambos para `1.2.0` (dispara release-template).

- [ ] **Step 4: Commit**
```bash
git add docs/STACK.md docs/MONOREPO.md
git commit -m "docs: add Docker sections + bump version to 1.2.0"
```

---

### Task 20: Preflight drift check para docker

**Files:** Create `.tooling/scripts/ci/check-docker-drift.ts`, Create `.tooling/scripts/ci/check-docker-drift.spec.ts`, Modify `.tooling/scripts/ci/preflight.ts`.

- [ ] **Step 1: Testes (RED)**
```ts
describe('checkDockerDrift', () => {
  it('passa quando .dockerignore existe');
  it('passa quando ambos Dockerfiles existem');
  it('falha se .dockerignore ausente');
  it('falha se Dockerfile > 100 linhas (over-engineering)');
  it('falha se base image != node:20-bookworm-slim');
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implementar (GREEN)** — Pure function `checkDockerDrift(repoRoot): CheckResult`. Valida `.dockerignore` + 2 Dockerfiles presentes, LOC ≤ 100, regex `FROM node:20-bookworm-slim` em ambos.

- [ ] **Step 4: PASS** (5 testes).

- [ ] **Step 5: Integrar em preflight.ts** — Adicionar `await checkDockerDrift(repoRoot)` na sequência (após `checkPackageJsonDrift`).

- [ ] **Step 6: Smoke** (`pnpm ci:preflight` → exit 0).

- [ ] **Step 7: Commit**
```bash
git add .tooling/scripts/ci/check-docker-drift.ts .tooling/scripts/ci/check-docker-drift.spec.ts .tooling/scripts/ci/preflight.ts
git commit -m "feat(ci): add docker drift check to preflight"
```

---

### Task 21: Validação end-to-end + PR para main

**Files:** Nenhum (validação).

- [ ] **Step 1: Build prod images**
```bash
docker build -f apps/api/Dockerfile --target prod -t projeto-base-api:prod .
docker build -f apps/web/Dockerfile --target prod -t projeto-base-web:prod .
```
Esperado: exit 0 ambos.

- [ ] **Step 2: Subir stack prod**
```bash
docker compose up -d postgres api web
sleep 20
docker compose ps  # todos Up + healthy
curl -f http://localhost:3000/api/v1/health  # 200
curl -f http://localhost:3001/api/health     # 200
curl -f http://localhost:3000/api/docs       # Swagger
```

- [ ] **Step 3: Validar dev override**
```bash
docker compose down
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres api web
sleep 20
# editar apps/api/src/main.ts (adicionar console.log temporário)
docker compose logs api | tail -30  # deve mostrar reload do tsx
```

- [ ] **Step 4: Testes dentro de container prod**
```bash
docker compose exec api pnpm test:unit
docker compose exec web pnpm test:unit
```
Esperado: todos PASS.

- [ ] **Step 5: Push + PR**
```bash
git push -u origin feat/dockerize-apps
gh pr create --base main \
  --title "feat(docker): dockerize apps (api+web+compose prod+dev) + specialist-router infra" \
  --body "..."
gh pr checks  # aguardar 4/4 verde
```

- [ ] **Step 6: Merge**
```bash
gh pr merge --squash  # após reviews
# release-template.yml dispara tag v1.2.0 automaticamente
```

- [ ] **Step 7: Retro specialist-router + docker-specialist** — Atualizar memórias:
- `.agents/memory/specialist-router.md` — adicionar seção "2026-09-23 — primeira demanda real (dockerização)" com métricas de despacho, FP/negativos, gaps observados
- `.agents/memory/docker-specialist.md` — adicionar aprendizados da demanda (imagem size, binary engine, build context, dev override patterns)

---

## Done Global

D1-D11 do plano mestre devem estar verdes. PR mergeado na main, tag v1.2.0 criada, memórias atualizadas.

**Mantido por:** projeto-base contributors