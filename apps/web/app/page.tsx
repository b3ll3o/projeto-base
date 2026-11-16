// apps/web/app/page.tsx
//
// A home do app.
//
// pt-BR: era o boilerplate do `create-next-app` (`text-4xl`, `p-24`, tela
// centralizada). O padrão de estilização é o das telas do app — um `h1` de
// tela, o container do app e o mesmo peso de título das outras rotas. O
// e2e `f6-navegacao.spec.ts` afirma `getByRole('heading', { name: 'Projeto
// Base' })`, e o texto não mudou.
//
// ⚠️ A home tem `metadata` PRÓPRIA (MEDIDO 2026-11-16, revisão do PR #168):
// sem ela, `/` divide o título com `/users`, `/login` e `/admin/*` — e a
// home é a tela que este PR reescreveu do zero, ou seja, a mais fácil de
// resolver. As outras telas seguem com o título da raiz; quem quiser
// distinguí-las dá `metadata` a cada uma.

import type { Metadata } from 'next';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'Início · Projeto Base',
};

export default function HomePage() {
  return (
    <Container>
      <CabecalhoPagina
        titulo="Projeto Base"
        descricao="Monorepo Next.js 15 + Tailwind 4 com DDD/Hexagonal"
      />
    </Container>
  );
}
