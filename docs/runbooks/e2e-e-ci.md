# Runbook de e2e e CI — a suíte de navegador, o pipeline e a etapa `ci:boot`

> Parte do [runbook canônico](../como-rodar.md). Índices:
> [Ambiente 1 (dev local pnpm nativo) →](../como-rodar.md#1-ambiente-1--dev-local-pnpm-nativo)
> · [Ambientes 2 e 3 (Docker) →](./docker.md)
> · [Ambiente 4 (observabilidade) →](./observabilidade.md)

Ambientes **5** (e2e local) e **6** (CI), mais a etapa `ci:boot` — o harness que
sobe a aplicação local do jeito que o CI sobe.

Legenda: **✅ medido** = executado, com saída observada · **📖 lido do código** =
derivado do YAML/script, não executado.

---

## §1. Ambiente 5 — E2E local (Playwright) 📖 lido do código

```bash
pnpm turbo run test:e2e                              # api (vitest) + web (playwright)
pnpm --filter @projeto/web exec playwright install --with-deps chromium
```

O e2e do web **não** usa a stack do ambiente 1: `apps/web/e2e/global-setup.ts`
sobe o próprio Postgres em container, roda `next build` e sobe o servidor
standalone em porta aleatória, injetando `API_BASE_URL` no ambiente do build.

Para rodar **só** a suíte de navegador, o filtro é obrigatório: `@playwright/test`
está nos devDependencies do web e o pnpm isola `node_modules` — na raiz,
`pnpm exec playwright` não resolve e sai **0 sem instalar nada**, o pior tipo de
passo de CI, o que parece verde e não mediu nada.

---

## §2. Ambiente 6 — CI (GitHub Actions) 📖 lido do código

`.github/workflows/ci.yml`, disparado em push/PR, concurrency `ci-<pr|branch>`:

| Job | Passos |
|---|---|
| `preflight` | `pnpm install` → `format:check` → `ci:preflight` → `tooling:test` → `pr:marker` |
| `quality` | `install` → `db:generate` → `lint typecheck` → `test:coverage test:unit` → `test:integration test:e2e` (api) → `playwright install --with-deps chromium` → `test:e2e` (web) |
| `docker-build-prod` | valida que as imagens prod constroem |

Rodar o mesmo localmente, na ordem:

```bash
pnpm ci:local
```

> ⚠️ `pr:marker` lê o corpo do PR **do evento**: corrigir o corpo e re-run não
> revalida — só um push novo revalida (correção no `main` desde o #81). Outros
> workflows: `release-template.yml` (auto-tag pós-merge), `review-stack.yml`,
> `sync-docs.yml`.

O detalhamento de **qual** gate roda em **qual** camada (hooks locais, CI remoto,
processo de agents) está em
[`docs/fluxo-desenvolvimento.md`](../fluxo-desenvolvimento.md) — este arquivo é o
"como rodar", aquele é o "o que bloqueia".

---

## §3. A etapa `ci:boot` — subir a aplicação local e derrubá-la ✅ medido 2026-10-21

`pnpm ci:boot` sobe a aplicação **do jeito que quem desenvolve roda** (`tsx
src/main.ts` na API, `next dev` no web), espera a saúde dos dois e **derruba tudo**
no fim. É a etapa que o `pnpm ci:local` e o `.husky/pre-push` rodam.

```bash
pnpm ci:boot
# [ci:boot] ✓ API no ar (health: ok, banco: ok)
# [ci:boot] ✓ web no ar (health: ok)
# [ci:boot] ✓ aplicação local no ar — API :46095 · web :39149
```

✅ medido 2026-10-21: exit 0, e no fim **não sobra processo nem porta ocupada** —
nem `apps/web/.next-boot/`, que é apagado junto.

O log de cada processo fica em `node_modules/.cache/ci-boot/` — é lá que o sintoma
aparece quando a etapa falha.

| detalhe | por quê |
|---|---|
| portas **livres**, não 3000/3001 | o `pnpm dev` da pessoa pode estar no ar, e uma etapa que briga pela porta falha por um motivo que não é defeito |
| `distDir` = `.next-boot/` | `next dev` e `next build` não dividem o mesmo diretório — o Next apaga e reescreve o que o outro está servindo |
| o banco local é **pré-requisito** e a etapa **não o sobe** | o `postgres` do Compose não publica a porta no host (§1.1 do [runbook canônico](../como-rodar.md)); um banco efêmero aqui mediria outra configuração, não a local |
| a etapa **falha alto** | sem banco (ou sem `JWT_SECRET` no `.env`) ela sai 1 com o ponteiro para §1.1/§1.2 do [runbook canônico](../como-rodar.md) — ela nunca "pula" |
