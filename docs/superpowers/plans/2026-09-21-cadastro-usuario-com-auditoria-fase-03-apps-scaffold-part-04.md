# Fase 3 — Apps Scaffold (Parte 4/4)

> **Continuação** da Fase 3. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold.md)
>
> Esta é a parte 4 de 4 da Fase 3. Pule para a próxima parte ao final.

---

```

---

## Task 3.11: ESLint config do web (Next.js plugin)

**Files:**
- Create: `apps/web/.eslintrc.js`

- [ ] **Step 1: Criar config ESLint**

```javascript
// apps/web/.eslintrc.js
import baseConfig from '@projeto/eslint-config';
import nextPlugin from 'eslint-config-next';

export default [
  ...baseConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      // regras específicas Next.js adicionadas em CI
    },
  },
];
```

- [ ] **Step 2: Adicionar lint script**

```json
{
  "scripts": {
    "lint": "next lint --max-warnings=0"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/.eslintrc.js
git commit -m "chore(web): wire ESLint config with shared base

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.12: Validar build dos apps

- [ ] **Step 1: Validar typecheck de ambos apps**

```bash
pnpm --filter @projeto/api typecheck
pnpm --filter @projeto/web typecheck
```

Expected: ambos passam.

- [ ] **Step 2: Validar build do web**

Run: `pnpm --filter @projeto/web build 2>&1 | tail -10`
Expected: build Next.js OK (sem erros de tipos).

- [ ] **Step 3: Rodar testes dos apps**

```bash
pnpm --filter @projeto/api test:unit
pnpm --filter @projeto/web test:unit
```

Expected: testes passam.

- [ ] **Step 4: Commit final (se ajustes)**

```bash
git status
```

---

## Task 3.13: Docker Compose para Postgres 16

**Files:**
- Create: `docker-compose.yml`
- Create: `apps/api/.env.example`

- [ ] **Step 1: Criar docker-compose**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: projeto-base-postgres
    environment:
      POSTGRES_USER: projeto
      POSTGRES_PASSWORD: projeto
      POSTGRES_DB: projeto_base
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U projeto']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

- [ ] **Step 2: Criar `.env.example` do api**

```text
# apps/api/.env.example
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://projeto:projeto@localhost:5432/projeto_base?schema=public
LOG_LEVEL=info
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml apps/api/.env.example
git commit -m "chore(dev): docker-compose for Postgres 16 + api env example

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.14: Subir Postgres e validar

- [ ] **Step 1: Subir Postgres**

```bash
docker compose up -d postgres
sleep 5
docker compose ps
```

Expected: `postgres` rodando.

- [ ] **Step 2: Validar conexão**

```bash
docker compose exec postgres psql -U projeto -c '\dt'
```

Expected: resposta `No relations found.` (ok — DB vazio).

- [ ] **Step 3: Commit (se houver ajustes)**

---

**Próxima fase:** [`fase-04-user-domain.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain.md)
