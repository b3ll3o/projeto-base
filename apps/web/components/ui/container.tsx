import type * as React from 'react';

/**
 * O `<main>` da tela.
 *
 * pt-BR: existia como class string repetida em 16 arquivos
 * (`mx-auto max-w-3xl p-8`), e a repetição é o que o padrão de
 * estilização vem para acabar. A largura é a do CONTEÚDO do app — o que
 * muda por tela é o conteúdo, não a moldura.
 *
 * ⚠️ O `<main>` mora AQUI, e não no `layout.tsx`: uma tela tem UM
 * landmark `main` e o layout é compartilhado por todas (o e2e
 * `f14-admin-flags.spec.ts` e `f17-admin-tenancy.spec.ts` assertam
 * `page.locator('main')` com count 1).
 */
export function Container({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl p-4 sm:p-8">{children}</main>;
}
