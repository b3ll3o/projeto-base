import type * as React from 'react';

/**
 * O título de seção — o `h2` da tela.
 *
 * pt-BR: a classe do `h2` era `text-lg font-medium text-foreground` em 7
 * lugares. O `h1` ganhou dono (`CabecalhoPagina`) e o `h2` ficou sem dono —
 * e "sem dono" é exatamente a dívida que o padrão de estilização vem para
 * pagar: a convenção `estilizacao.md` §3 promete que as primitivas são a
 * ÚNICA fonte de classe do app.
 *
 * ⚠️ O `className` do caller é **ADICIONAL** (o vão `mt-8` das seções
 * entra por ele), não substitutor: o estilo do título tem um só dono.
 */
export function CabecalhoSecao({ children, className, ...props }: React.ComponentProps<'h2'>) {
  const base = 'text-lg font-medium text-foreground';
  return (
    <h2 {...props} className={className ? `${base} ${className}` : base}>
      {children}
    </h2>
  );
}
