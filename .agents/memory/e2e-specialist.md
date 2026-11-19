---
name: e2e-specialist-memory
description: Memória acumulada do agent e2e-specialist — cobertura e2e de fluxos de usuário (Playwright)
---

# Memória: `e2e-specialist`

> Arquivo de memória do agent `e2e-specialist`. Atualizado após cada execução
> significativa.

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

**Consequências:** o agent roda a suíte no Passo 5 — o custo (Postgres
efêmero + API + `next build`) é o preço da prova que o hook não pagava.

### 2026-11-18 — O revisor do plano é outro agent

**Contexto:** a regra do repo é "reviewer ≠ implementer" e "review+fix em cada
task". Um plano escrito e revisado pelo mesmo agent é o plano confirmando a
si mesmo.

**Decisão:** o Passo 3 despacha `code-reviewer` (ou a skill `grilling`) como
revisor do plano, com as seis perguntas mínimas fixas no próprio agent.

**Consequências:** o despacho é explícito e rastreável, e a correção do plano
acontece **antes** do spec existir — mais barato do que corrigir depois.

## Padrões Descobertos

- O `// FLUXO: F<N>` na **primeira linha** do spec é o que liga o spec ao
  inventário. O nome do arquivo não liga nada — "o nome já diz" é coincidência.
- A linha do inventário e o spec entram no **mesmo diff**: o gate transforma o
  meio-cumprido em vermelho nomeando o fluxo.
- A coluna `Rota` do inventário é conferida contra os `page.tsx` do disco — é o
  único assertion do gate que não é declarativa, e é a que fecha o buraco.
- O `F<N>` novo é o **próximo livre** da sequência, não um número escolhido.
- `workers: 1` no Playwright tem dente: com 2 workers, um spec derruba o
  Postgres do outro (o container é compartilhado).

## Lições Aprendidas

- ❌ Paridade não é cobertura — reconciliar dois conjuntos escritos à mão
  provou paridade, e `/me/profile` (tela real, sem linha e sem spec) passou
  como "reconciliado sobre 12 fluxo(s) e 12 spec(s)".
- ❌ Spec que só verifica render passa com a validação desligada.
- ❌ "Não vê o nome" sem dado plantado passa no vazio.
- ❌ `toHaveValue` em input uncontrolled passa com a escrita perdida — o input
  conserva o que foi digitado depois do re-render; a prova é no banco.
- ❌ Semeiar o estado prévio pela tela mede o fluxo anterior dentro deste.

## Sugestões de Evolução

- [ ] Um gate que meça "todo spec `F<N>` afirma um efeito" (hoje é leitura do
      agent, não instrumento).
- [ ] Ligar a suíte e2e ao hook `pre-push` — hoje o hook roda preflight e boot,
      e o spec quebrado só aparece no CI.
- [ ] Um `state-aware-planning` específico do e2e: o snapshot já mede coverage,
      mas não mede a paridade tela↔fluxo↔spec.
