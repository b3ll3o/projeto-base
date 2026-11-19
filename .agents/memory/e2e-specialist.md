---
name: e2e-specialist-memory
description: Memória acumulada do agent e2e-specialist — cobertura e2e de fluxos de usuário (Playwright)
---

# Memória: `e2e-specialist`

> Arquivo de memória do agent `e2e-specialist`. Atualizado após cada execução
> significativa.
>
> ⚠️ **Regra desta memória:** ela guarda o que o agent **decidiu** e o que ele
> **descobriu rodando** — não a transcrição das regras dos specs, que são da
> convenção [`e2e-playwright.md`](../specs/conventions/e2e-playwright.md).
> Uma memória que copia a convenção envelhece quando a convenção sobe.

## Decisões Tomadas

### 2026-11-18 — Nasce como dono do ciclo de cobertura e2e

**Contexto:** o repo já tinha a convenção `e2e-playwright.md` (21 fluxos, 15
rotas) e o gate `check-e2e-flow-coverage` — que mede **paridade declarativa**.
Nenhum agent era dono do ciclo completo (auditar → planejar → revisar o plano →
implementar → verificar → commitar/pushar). E o hook `pre-push` roda
`ci:preflight` + `ci:boot`: **a suíte e2e não roda no push local** — quem
descobria um spec quebrado era o CI.

**Decisão:** o `e2e-specialist` fecha o ciclo. O gate continua sendo o dono da
metade declarativa; a metade semântica (o spec afirma o efeito? cobre a
recusa? a semente é pela API?) é do agent.

**Consequências:** o agent roda `pnpm ci:local` no Passo 5 — o custo (Postgres
efêmero + API + `next build`) é o preço da prova que o hook não pagava.

### 2026-11-18 — O revisor do plano e o revisor do spec são outros agents

**Contexto:** a regra do repo é "reviewer ≠ implementer" e "review+fix em cada
task". Um plano — ou um spec — escrito e revisado pelo mesmo agent é o
agente confirmando a si mesmo.

**Decisão:** o Passo 3 despacha `code-reviewer` (ou a skill `grilling`) para o
**plano**, e o Passo 6 despacha `code-reviewer` (ou o `review-router`) para o
**spec implementado**. O schema é o canônico de `protocolos/dispatch.md`, com
`on_failure`.

**Consequências:** o despacho é explícito e rastreável, e a correção acontece
**antes** do spec existir — mais barato do que corrigir depois.

### 2026-11-18 — Fica registrado como reviewer dos specs e2e, com modo próprio

**Contexto:** o `review-routing.md` v1.10 roteia `apps/web/e2e/**` para este
agent. Um agent com um único modo (implementador que termina em `git push`)
seria perigoso nesse papel.

**Decisão:** o agent tem **dois modos** — o pipeline (implementador) e o
**modo revisor** (lê o diff, devolve `findings[]`, não escreve, não pusha).

**Consequências:** o despacho de revisão não pode terminar em push — o modo
revisor é explícito no corpo do agent.

## Padrões Descobertos

> Vazio de propósito: o agent ainda **não rodou**. esta seção se preenche com
> o que a primeira execução teach.

## Lições Aprendidas

> Vazio de propósito: o agent ainda **não rodou**. As lições entram aqui
> depois da primeira execução — as regras dos specs (semear pela API, assertar
> o efeito, `toHaveValue` em input uncontrolled) são da convenção
> `e2e-playwright.md` §"Regras que os Specs Devem Seguir", não daqui.

## Sugestões de Evolução

- [ ] Um gate que meça "todo spec `F<N>` afirma um efeito" (hoje é leitura do
      agent, não instrumento).
- [ ] Ligar a suíte e2e ao hook `pre-push` — hoje o hook roda preflight e boot,
      e o spec quebrado só aparece no CI.
- [ ] Um `state-aware-planning` específico do e2e: o snapshot já mede coverage,
      mas não mede a paridade tela↔fluxo↔spec.
