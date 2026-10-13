---
name: ui-review
version: 1.0
updated: 2026-10-13
description: "Processo determinístico de revisão de UI em apps/web — mapeia os arquivos de superfície, decide quais das 4 skills de UI carregar (ui-modes, ui-craft, ui-break, motion), roda a revisão na ordem certa, agrega os achados com severidade e emite relatório em .agents/runs/. Carregada por ux-design-specialist e pelo controller de review. Habilitada pela matriz review-routing v1.7 (path_globs apps/web/**)."
---

# Skill: `ui-review`

> **Quem invoca:** `ux-design-specialist` (que a carrega quando a task é de
> revisão e não de criação) e o `review-router`, via a matriz
> `review-routing.md` v1.7.
>
> **Quando invocar:** PR ou diff que toca `apps/web/app/**`,
> `apps/web/components/**` ou `apps/web/app/globals.css`. Também sob demanda
> ("revise a UI", "essa tela está feia", "audite a11y").

## Pré-condições

- Diff ou escopo definido. Revisão de UI **sem alvo** não produz achado.
- Árvore de trabalho conhecida (`git status --porcelain`) — o que é novo é o que
  se revisa.

## Passo 1 — Mapear a superfície

```bash
git diff --name-only main...HEAD -- apps/web/
# ou, sem branch:
git diff --name-only -- apps/web/
```

Classifique cada arquivo:

| Classe | Arquivo | Skill que entra |
|--------|---------|-----------------|
| Renderiza dado de fora | `page.tsx`, componente com lista/formulário | `ui-break` |
| Define ou altera aparência/tokens | `globals.css`, token novo | `ui-craft` |
| Tela nova ou redesign | qualquer `page.tsx` novo | `ui-modes` primeiro |
| Introduz ou altera movimento | transição, `@keyframes`, `animation` | `motion` |
| Spec e2e que descreve fluxo com tela | `apps/web/e2e/**` | `ui-craft` §6 (estados) |

**Nenhum arquivo tocado em `apps/web/**`?** A review não se aplica — devolva
`skipped` com o motivo. Não invente escopo.

## Passo 2 — Carregar as skills, na ordem

A ordem importa: `ui-modes` decide **para que** a tela serve, e sem isso as
outras três discordam entre si.

1. **`ui-modes`** — sempre, se houver tela nova ou redesign. Se a tela já existe
   e não mudou de propósito, registre o modo como **Operar** e siga.
2. **`ui-craft`** — se o diff mexe tokens, tipografia, espaçamento, cor ou estado.
3. **`ui-break`** — se o diff renderiza dado vindo da API. É a mais cara das
   quatro: ela constrói fixture e mede em largura/zoom/dark mode. Não rode em
   componente estático.
4. **`motion`** — se o diff introduziu ou alterou transição/animação.

## Passo 3 — Rodar

Cada skill tem seu próprio formato de saída. Não misture: a tabela de achados do
`motion` e as 3 partes do `ui-break` têm formatos diferentes porque respondem a
perguntas diferentes.

**Severidade canônica (a mesma para as 4):**

| Sev. | Definição | Bloqueia merge? |
|------|-----------|-----------------|
| **P0** | Conteúdo ilegível, ação inalcançável, dado errado, `outline: none` sem substituto | Sim |
| **P1** | Legível mas visivelmente errado, ou frágil a um passo realista (avatar espremido, "1 membros", erro só por cor) | Não, mas precisa de conserto no mesmo PR |
| **P2** | Cosmético ou teórico; registro para depois | Não |

## Passo 4 — Agregar e persistir

```yaml
# .agents/runs/ui-review-<ts>.yaml
scope:
  files: [apps/web/app/users/page.tsx]
  mode: Operar
skills_loaded: [ui-modes, ui-craft, ui-break]
findings:
  - id: ui-001
    severity: P0
    file: apps/web/app/users/page.tsx:42
    from_skill: ui-break
    title: "Coluna de nome sem min-width:0 — email longo empurra a ação para fora"
    evidence: "320px: botão sair da linha"
    fix: "min-width: 0 na coluna de texto; flex-shrink: 0 na ação"
totals: { p0: 1, p1: 3, p2: 2 }
skipped: []
```

**Toda linha tem `file:line`.** Achado sem localização é opinião.

## Passo 5 — Ler o resultado

| Situação | O que fazer |
|----------|-------------|
| Algum P0 | **Bloquear merge.** Consertar e re-rodar só a skill que o produziu. |
| P1 sem P0 | Consertar no mesmo PR, ou registrar como issue com `type:ui`. |
| Só P2 | Registrar no relatório; não bloqueia. |
| `skipped` com motivo | Não é verde — é ausência. Distinga sempre os dois. |

> **O que não conta como achado.** "Eu faria diferente." "Ficaria mais bonito
> com um gradiente." Comparação com um site. Achado de UI é critério observável
> com `file:line`, não preferência.

## Erros comuns

| Erro | Causa | Fix |
|------|-------|-----|
| Review devolve "nada a fazer" sem `skipped` | Escopo vazio não foi declarado | Declarar `files: []` + `skipped: [motivo]` |
| Achado de `motion` com curva inventada | Valor chutado em vez de puxado da tabela | Puxar de `motion` §"Valores exatos" |
| `ui-break` rodando em componente estático | Overhead sem alvo | Passo 2: `ui-break` só com dado de fora |
| 2 skills dão conserto contraditório | `ui-modes` não rodada primeiro | Passo 2: modo decide, resto executa |
| Foto do achado sem largura medida | Afirmou quebra sem ver | Re-rodar em 320px e na largura real |

## Referências

- Agent: `.agents/agents/ux-design-specialist.md`
- Skills: `ui-modes` · `ui-craft` · `ui-break` · `motion`
- Matriz que habilita esta review: `.agents/specs/conventions/review-routing.md` v1.7
- E2E de fluxo com tela: `.agents/specs/conventions/e2e-playwright.md`
- Auditável com: `pnpm --filter @projeto/web test:unit` + `pnpm --filter @projeto/web test:e2e`