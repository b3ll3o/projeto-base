# Histórico de Versões — specialist-routing

> Apêndice apenas-leitura. O histórico completo de versões da
> convenção `specialist-routing` vive aqui para preservar o limite de
> 300 linhas do spec principal. A entrada mais recente fica também
> no `## 7. Histórico de Versões` do spec principal (em forma compacta).

| Versão | Data | Mudança |
|--------|------|---------|
| 1.5 | 2026-10-16 | T4: 13 path_globs novos cobrem 11 agents órfãos (`agent-architect`, `code-reviewer`, `doc-sync`, `explorer`, `orchestrator`, `otelcol-infra-specialist`, `review-router`, `specialist-router`, `stack-code-reviewer`, `task-manager`, `tdd-enforcer`). Aditivo. |
| 1.4 | 2026-10-08 | Resolve conflitos: mergeia v1.3 (audit specialists + 1 orchestrator) + v1.3 da main (ux-design-specialist). 15 specialists; 41 path_globs; 16 demand_keywords. Aditivo. |
| 1.3 | 2026-10-06 | Bump menor — adiciona `ux-design-specialist` (UX/design de interface). 2 path_globs novos (`apps/web/app/**.tsx`, `apps/web/app/globals.css`) + 1 demand_keyword novo. Total: 10 specialists; 31 path_globs; 10 demand_keywords. |
| 1.2 | 2026-09-23 | Bump menor — adiciona `telemetry-specialist` transversal. 4 path_globs + 1 demand_keyword. Total: 9 specialists; 29 path_globs; 9 demand_keywords. |
| 1.1 | 2026-09-23 | Adiciona `derived_tags` (prisma_binary + compose_with_healthcheck). Atualiza `classify()` para retornar `derived_tags` no resultado. Atualiza skill docker com checklist healthcheck. B22 polish. |
| 1.0 | 2026-09-23 | Lançamento inicial: 8 specialists (monorepo, nestjs, nextjs, docker, security-auditor, test-writer, doc-writer, refactorer); 21 path_globs; 8 demand_keywords; 8 demand_scopes; 5 skip_rules; `monorepo-specialist` always-on. Source of truth para classificador headless e lint. |
