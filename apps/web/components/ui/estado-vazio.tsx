import type * as React from 'react';

/**
 * Estado vazio — a tela que tem dado, mas não tem dado.
 *
 * pt-BR: o bloco existia uma vez só (`app/users/page.tsx`), e o padrão o
 * quer em todo lugar que tem lista. Ele diz DUAS coisas: **o que** está
 * vazio e **o que fazer** — e a segunda é a que evita a tela em branco.
 *
 * ⚠️ Estado vazio ≠ estado de erro. "Nenhum usuário cadastrado" é
 * informação; "Não foi possível carregar a lista" é problema. Nunca o mesmo
 * componente para os dois sem distinguir (skill `ui-craft` §4).
 */
export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: {
  /** O que está vazio. */
  titulo: string;
  /** O que a pessoa pode fazer. */
  descricao?: string | undefined;
  /** A ação que resolve (botão). */
  acao?: React.ReactNode;
}) {
  return (
    // ⚠️ Sem fio de 1px: a convenção `estilizacao.md` §2.3 só admite fio em
    // divisória decorativa e em dado tabular. A superfície se separa do
    // fundo por PASSO DE TOM (`bg-surface` sobre a página).
    <div className="rounded-md bg-surface p-12 text-center">
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {descricao ? <p className="mt-1 text-sm text-muted-foreground">{descricao}</p> : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}
