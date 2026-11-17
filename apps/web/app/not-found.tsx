// apps/web/app/not-found.tsx
//
// A tela do "não existe" — a ÚNICA que o Next renderiza quando a página
// chama `notFound()`.
//
// ⚠️ Sem este arquivo, o 404 é a PÁGINA PADRÃO do Next: em inglês, sem o
// `<main>` do app e sem volta para ele. Duas telas do app chamam `notFound()`
// — o detalhe do perfil (`/admin/profiles/[slug]`) e as telas novas do
// detalhe da pessoa e da empresa — e o texto em inglês numa app pt-BR é
// defeito visível.
//
// A tela é do MESMO SHAPE das demais: `Container` (o `<main>`), `CabecalhoPagina`
// (o `h1`) e a saída em texto (`LinkTexto`). E o `<main>` não é enfeite: o e2e
// do guard afirma `page.locator('main')` com count 1, e um digest de erro do
// Next não tem `main` — a tela de "recusou" e a de "não existe" precisam ser
// distinguíveis por um teste, não por um palpite.

import type * as React from 'react';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';
import { LinkTexto } from '@/components/ui/link-texto';

export default function NotFound(): React.JSX.Element {
  return (
    <Container>
      <CabecalhoPagina
        titulo="Não encontrado"
        descricao="O que você procurou não existe — ou foi removido."
      />
      <div className="mt-8">
        {/* ⚠️ A saída é o INÍCIO, e não a listagem de usuários: `/users` exige
            sessão (`exigirSessao()` → `redirect('/login')`), e quem erra a URL
            sem sessão recebia a tela de login por um link que promete a lista
            de usuários. A home é pública — e o `Sidebar` do layout já oferece
            "Usuários" para quem tem sessão. */}
        <LinkTexto href="/">Voltar para o início</LinkTexto>
      </div>
    </Container>
  );
}
