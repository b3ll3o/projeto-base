---
name: specialist-routing-gaps-v1.0
version: 1.0
updated: 2026-10-08
maintainer: specialist-router
description: "Apêndice histórico dos 7 gaps conhecidos remanescentes do lançamento v1.0 do specialist-routing. Movido da §6 do specialist-routing.md para preservar o limite de 300 linhas. Apenas leitura."
---

# Apêndice: Gaps Conhecidos v1.0 — specialist-routing

> Histórico. A matriz canônica está em
> [specialist-routing.md](./specialist-routing.md). Apenas leitura —
> não editar.

Gaps remanescentes do lançamento v1.0, avaliados em B22 e considerados
fora do escopo do polish (todos P3). Mantidos para rastreabilidade até
v1.2/v2.0.

| # | Sev | Gap | Mitigação |
|---|-----|-----|-----------|
| G1 | P3 | `docker-specialist` referenciado na matriz mas agent definition só será criado na Task 9. Mitigação: lint da matriz (Task 5) deve permitir a referência enquanto agent não existe, OU criar agent placeholder antes da Task 4 | Aceito em v1.0; lint permite ref pendente |
| G2 | P3 | `perf` scope não adiciona nenhum specialist (sem `perf-specialist` em v1.0) | v1.1 deve incluir perf-specialist OU adicionar keyword/scope para nestjs + nextjs quando paths em apps/api ou apps/web |
| G3 | P3 | Demand keywords regex é ingênuo (não semântico) — pode dar FP em demandas com "docker" como adjetivo ("docker hub" sem ser containerização real) | Adicionar `scope_filter: infra` para keywords docker; refinar após 5 demandas reais |
| G4 | P3 | Skip rules são textuais (não programáticas) — futuro v2 pode parsear YAML para skip_if estruturado | Aceito em v1.0; alinhado com review-router (também usa strings textuais) |
| G5 | P3 | `blocking` em path_globs v1.0 só aplicado a `pnpm-workspace.yaml` e `turbo.json`; paths em `apps/api/**` e `apps/web/**` são `blocking: false` mesmo quando mudança é cross-cutting | v1.1 deve anotar blocking por path_glob baseado em criticidade (security/auth, infra monorepo, etc.) |
| G6 | P3 | **Retro B21 Gap #1:** heurística `diff_pattern: 'COPY.*--from=builder' + paths vs build context` não implementada — alto risco de FP. Sugerida após bug `COPY --from=builder /repo/pnpm-lock.yaml pnpm-workspace.yaml ./` (path relativo-Workdir, fixado em e4c4212) | Marcada para v1.2 após 5 demandas reais com dockerização |
| G7 | P3 | **Retro B21 Gap #3:** ordem processual "skill antes de agent na matriz" não codificada na matriz. Em B21 Fase 2, agent foi criado em Task 9 e skill em Task 10 — agent despachado antes da skill existir (funcionou, mas não garante consistência futura) | Codificar como convenção operacional em `.agents/specs/conventions/evolucao-agents.md` (v1.2) |
