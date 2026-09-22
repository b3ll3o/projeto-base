---
name: monorepo-specialist-memory
description: Memória acumulada do agent monorepo-specialist — decisões sobre estrutura de workspaces, pipelines e versionamento
---

# Memória: `monorepo-specialist`

> Arquivo de memória do agent `monorepo-specialist`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-21 — Stack escolhido

**Contexto:** projeto-base será monorepo para múltiplos projetos.

**Decisão:**

- **Gerenciador:** `pnpm` (workspaces nativos, eficiente em disco, hoisting seguro)
- **Orquestrador de build:** `Turborepo` (cache distribuído, pipelines declarativos)
- **Layout:** `apps/` (deployables) + `packages/` (libs internas) + `tooling/` (configs)
- **Versionamento:** `Changesets` (versionamento semântico + changelog automático)

**Stack de apps inicial:** NestJS (backend) + Next.js (frontend)

### 2026-09-22 — Validação de CI após mudanças estruturais

**Contexto:** Mudanças em `turbo.json` / `pnpm-workspace.yaml` podem quebrar cache determinístico ou criar drift em tsconfig/eslint refs. Sem gate explícito, esses problemas só aparecem em CI (~4min) ou em runtime.

**Decisão:** Após mudanças em artefatos estruturais do monorepo, monorepo-specialist recomenda rodar `pnpm ci:local` (defesa em 3 camadas — pre-push + preflight + quality CI gated) ou `pnpm ci:preflight` (~10s) para validação rápida de drift. Documentação canônica em `.agents/specs/conventions/ci-defense-in-depth.md` e skill `.agents/skills/ci-defense-in-depth/SKILL.md`.

**Consequências:**

- Falhas estruturais detectadas em ~5-30s localmente vs ~4min no CI
- Reduz iteração devs → CI → fix → CI (loop caro)

## Padrões Descobertos

- Apps isolados — comunicação entre apps via packages ou HTTP, nunca import direto
- TypeScript path aliases via `tsconfig.base.json` no root
- Scripts orquestrados via `turbo run lint/test/build/typecheck`
- Cache de build em `dist/` e `.next/` com `outputs` declarado no `turbo.json`

## Lições Aprendidas

- ❌ App importar de outro app gera ciclo de build e dor de cabeça em CI
- ❌ Versão fixa (`"1.2.3"`) em vez de caret trava atualizações de segurança
- ❌ `node_modules` no root + em cada package duplica deps (sempre filtrar via `.npmrc`)

## Sugestões de Evolução

- [ ] Adicionar suporte a Nx como alternativa ao Turborepo
- [ ] Criar template de `packages/` para os tipos compartilhados
- [ ] Documentar estratégia de migração de single-package para monorepo
