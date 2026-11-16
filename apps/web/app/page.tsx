// apps/web/app/page.tsx
//
// A home do app.
//
// pt-BR: era o boilerplate do `create-next-app` (`text-4xl`, `p-24`, tela
// centralizada). O padrão de estilização é o das telas do app — um `h1` de
// tela, o container do app e o mesmo peso de título das outras rotas. O
// e2e `f6-navegacao.spec.ts` afirma `getByRole('heading', { name: 'Projeto
// Base' })`, e o texto não mudou.

import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';

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
