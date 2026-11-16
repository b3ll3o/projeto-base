// apps/web/tailwind.config.ts
//
// ⚠️ ESTE ARQUIVO É INERTE. É a sintaxe do Tailwind 3, e o Tailwind 4 só lê
// um config JS/TS se o CSS o pedir com `@config` — e `globals.css` NÃO pede
// (MEDIDO 2026-11-16: `grep -c "@config" apps/web/app/globals.css` → 0).
//
// A fonte da verdade do estilo é o bloco `@theme` de `apps/web/app/globals.css`
// (convenção `.agents/specs/conventions/estilizacao.md` §2).
//
// ⚠️ A ARMADILHA: se alguém adicionar `@config "../tailwind.config.ts"` no
// `globals.css`, o `content` deste arquivo (sintaxe v3) passa a valer — e ele
// NÃO varre `src/telemetry/`, que é de onde vem o `web-vitals-reporter`. O
// build passa e a classe some do CSS.
//
// Por que ele continua aqui: o plano
// `docs/superpowers/plans/2026-11-10-estilizacao-frontend.md` (D2) decidiu
// que o `@theme` é o dono e que este arquivo fica como está. Apagá-lo é uma
// decisão de outro escopo — o que não pode é ele continuar parecendo ativo.
import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
