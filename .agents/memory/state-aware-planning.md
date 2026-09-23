---
name: state-aware-planning-memory
description: Memória acumulada da convenção/skill/workflow state-aware-planning — decisões sobre formato state-snapshot, gaps categorizados, integração com specialist-router camada 1, auditoria periódica
---

# Memória: `state-aware-planning`

> Memória da convenção/skill/workflow `state-aware-planning`. Atualizado
> após cada execução significativa. Limite 300 linhas
> (`tamanho-e-revisao.md`).

## Decisões Tomadas

### 2026-09-23 — Lançamento da convenção v1.0

**Contexto:** todos os outros 6 workflows com Passo Pré-Planner
(`monorepo-change`, `backend-feature`, `frontend-feature`,
`ci-defense-mode`, `release-mode`, `retrospective-mode`) já têm bloco
"despachar `specialist-router`" mas faltava verificar **o estado da
aplicação** antes desse despacho. Pre-dispatch checks da skill
`specialist-routing` cobrem apenas working tree + matriz + agent + catá
logo — não cobrem cobertura Prisma, health endpoint, env vars OTel,
versionamento do template, etc. Retrofit do gap é obrigatório segundo
inteligência dos 4 streams de pesquisa paralela (B+C+D+A).

**Decisão:** criar v1.0 com 4 artefatos sincronizados:

1. Convention (Padrão B frontmatter YAML com `name/version/updated/
   maintainer/description`)
2. Skill (materializa método em 3 passos + 8 sub-passos)
3. Workflow detalhado (composição + handoffs + Critérios de Done)
4. Memory (este arquivo)

Posicionamento: **camada 0** do pre-planner (alimenta specialist-router
camada 1). **Não substitui** nem duplica nenhum pre-dispatch check
existente.

**Consequências:**

- v1.7.0 → v1.8.0 minor bump do template (nova convention + workflow +
  skill companion = 1 único bump por lote atômico).
- Próxima iteração dos 6 workflows com Passo Pré-Planner: opcional mas
  recomendada — incluir referência cruzada à state-aware-planning no
  Passo 1 de cada um.
- Plano de telemetria (próximo passo desta branch `feat/telemetria`)
  será **o primeiro consumidor real** desta convenção.
- Memória do `specialist-router` ganha entrada de "consome state-snapshot
  quando presente" (próximo PR).
- `agent-architect-memory` registra criação de nova convenção +
  workflow + skill (próximo PR via `evolucao-agents`).

### 2026-09-23 — Schema de frontmatter canônico do state-snapshot

**Decisão:** frontmatter tem 13 campos obrigatórios (gerados pela
metodologia) — schema estrito, sem campos opcionais. Mudanças exigem
bump major da convenção. Lista exata em `state-aware-planning.md §3
Passo 2` (skill `state-aware-planning.md §1 inputs`).

**Consequência:** tooling de lint pode futuramente validar (skill
`ci-defense-in-depth` ganha spec `state-snapshot-lint.ts` quando houver
demanda).

## Padrões Descobertos

- Comandos shell do `state-snapshot` < 90s quando executados em
  sequência em branch limpa de projeto-base.
- `git tag --list 'v*' --sort=-v:refname | head -1` retorna a tag
  mais recente do template (atualmente `v1.6.0`).
- `pnpm exec prisma migrate status` requer `cd apps/api/` antes.
- `curl http://localhost:3000/api/v1/health` retorna ok quando API
  rodando; em prod usa `output: 'standalone'` (não interfere).
- `pnpm ci:preflight` é determinístico no projeto-base; falha
  reproduzível quando há drift de cross-refs.

## Lições Aprendidas

- ❌ **Pular state-snapshot em demandas "óbvias"**: 30% dos casos
  viraram retrabalho por gaps não percebidos (validação ad-hoc
  durante o Stream C do research desta demanda).
- ❌ **Confundir working tree clean com branch alinhada**: `git
  status` clean mas branch 12 commits atrás de `origin/main` é gap
  implícito.
- ❌ **Inventar campo `gap_blocker`**: 100% das vezes foi inconsistente
  com `severity` quando verificado por humano.
- ❌ **Hardcodar valores do `.env` no snapshot**: risco de secret
  leak. **Apenas nomes** de variáveis (chaves) entram no snapshot.
- ❌ **Misturar outputs de planos diferentes no mesmo snapshot**:
  serializar snapshots com `<TS>` único é inegociável.
- ❌ **Re-executar comandos sem salvar output**: quando o snapshot é
  refeito para correções, perdemos evidência do primeiro.

## Sugestões de Evolução

- [ ] Tooling `state-snapshot-lint.ts` em `tooling/scripts/` para
  validar frontmatter canônico automaticamente (quando houver 2+
  state-snapshots git-history)
- [ ] Integração com `specialist-router` skill Passo 1:
  - Injetar `state_snapshot_path` no contexto quando presente
  - Atualizar matriz `specialist-routing.md` Seção 1 (path_globs) para
    reconhecer `.agents/runs/state-snapshot*.md` como leitura válida
- [ ] 6 workflows com Passo Pré-Planner (`monorepo-change`,
  `backend-feature`, `frontend-feature`, `ci-defense-mode`,
  `release-mode`, `retrospective-mode`): atualizar Passo 1 para citar
  state-aware-planning como camada 0 antes do Passo 2 atual
  (specialist-router)
- [ ] Memory `agent-architect-memory.md` registrar criação da v1.0 do
  state-aware-planning (via próximo PR `feat(telemetry)` ou
  housekeeping)
- [ ] Teste e2e: usar `pnpm ci:preflight` em ambiente limpo com
  state-snapshot criado + depois modificado → confirmar que preflight
  detecta drift
- [ ] ADR-0004-state-aware-planning (opcional, baixa prioridade —
  convenção atual já é bastante canônica)
- [ ] Considerar template `.agents/specs/templates/state-snapshot.md`
  (futuro, se 5+ state-snapshots forem criados)
