---
name: doc-sync-memory
description: Memória acumulada do agent doc-sync — sincronização reativa code↔docs via hooks
---

# Memória: `doc-sync`

> Arquivo de memória do agent `doc-sync`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-22 — Estratégia reativa (não proativa)

**Contexto:** sincronização proativa gera churn e conflitos.

**Decisão:** doc-sync é invocado por hooks (pre-commit, push, PR, merge) após mudança de código, detectando drift via mapeamento heurístico code→docs.

**Consequências:** zero overhead quando não há mudança; ativação automática quando há.

### 2026-09-22 — Auto-apply conservador

**Contexto:** aplicação automática de mudanças em docs pode quebrar o build.

**Decisão:** auto-aplica APENAS findings `info` e `minor` (sincronização trivial); para `major` e `blocker`, gera alerta para revisão humana.

**Consequências:** confiança no pipeline + segurança editorial.

## Padrões Descobertos

- 4 ações por finding: `review` (padrão), `update` (auto-aplicado se info/minor), `create` (arquivo novo), `alert` (blocker/major → humano).
- Mapeamento heurístico code→docs: `apps/api/src/modules/<feature>/` → `docs/api/<feature>.md` + `docs/superpowers/specs/.../<feature>-*.md`. Cobertura não exaustiva — gaps viram `alert`.
- Idempotência: rodar doc-sync múltiplas vezes produz mesmo resultado (não duplica linhas, não cria arquivos duplicados).
- Rastreabilidade: cada finding tem `evidence` (path:linha + trecho + razão).

## Lições Aprendidas

- Doc-sync flagou `docs/api/users.md` como faltante antes do commit 79d18e0 — heurística funcionou.
- Cross-ref depth bug (ffb5342) capturado pelo preflight `check-doc-refs` — defesa em profundidade funciona.

## Sugestões de Evolução

- [ ] Adicionar trigger para `release-template.yml`: ao merge em main, preparar entradas de CHANGELOG consumidas pelo workflow de release
- [ ] Adicionar label `release-impact` em tasks que tocam `docs/MONOREPO.md` ou `docs/STACK.md` (versionados)