---
name: nextjs-specialist-memory
description: Memória acumulada do agent nextjs-specialist — decisões sobre arquitetura frontend Next.js
---

# Memória: `nextjs-specialist`

> Arquivo de memória do agent `nextjs-specialist`. Atualizado após cada execução significativa.

## Decisões Tomadas

### 2026-09-21 — Stack frontend definido

**Contexto:** Frontend do monorepo será Next.js.

**Decisão:**

- **Versão:** Next.js 15 (App Router estável, React 19)
- **Linguagem:** TypeScript estrito
- **Styling:** Tailwind CSS 4 + shadcn/ui (componentes copiados, não importados)
- **State:** mínimo — URL state para filtros/paginação, React state local, server state via RSC
- **Forms:** `react-hook-form` + `zod` (Client Component) ou Server Actions (sem JS extra)
- **Data fetching:** Server Components + Server Actions (default); TanStack Query só em casos extremos
- **Auth:** NextAuth.js (Auth.js v5) com JWT em cookie HttpOnly + middleware
- **Testes:** Vitest (unit) + Playwright (E2E)
- **Qualidade:** Lighthouse ≥ 90 em todas as métricas (Performance, A11y, Best Practices, SEO)
- **Ícones:** `lucide-react` (tree-shakeable)

## Padrões Descobertos

- Server Components por padrão — `'use client'` é exceção justificada
- Layouts aninhados por feature (root > authenticated > feature > page)
- Loading + Error + NotFound em toda rota
- Metadata API (não `<head>` manual)
- `<Image>` (next/image) e `next/font` sempre — nunca `<img>` ou CSS `@import`

## Lições Aprendidas

- ❌ `'use client'` no topo da árvore vira SPA e mata o benefício de RSC
- ❌ `useEffect` + `fetch` quando `await` em RSC resolve é desperdício
- ❌ Esquecer `loading.tsx` em rota com async data gera tela branca ruim
- ❌ `Date.now()` ou `Math.random()` em render causa hydration mismatch

## Sugestões de Evolução

- [ ] Criar template de rota com layout + loading + error + not-found
- [ ] Adicionar Storybook para componentes compartilhados (`packages/ui`)
- [ ] Documentar estratégia de feature flags (Vercel Edge Config / LaunchDarkly)
