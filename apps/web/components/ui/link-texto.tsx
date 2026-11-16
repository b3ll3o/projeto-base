import type * as React from 'react';
import NextLink from 'next/link';

/**
 * Link de texto — a saída de uma tela ("Cancelar", "Criar conta", "editar").
 *
 * pt-BR: a class string do link de texto estava repetida à mão em 5 lugares
 * (`text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900`
 * → `text-sm text-muted-foreground underline underline-offset-2
 * hover:text-foreground`). Cinco cópias de uma regra é a definição de "sem
 * dono" — e a regra do link é o que faz a pessoa saber que aquilo navega.
 *
 * ⚠️ O `focus` do link é o utilitário `foco`, o mesmo do campo e do botão.
 * Sem ele, o link fica com o anel DEFAULT do browser, e a app passa a ter
 * dois sistemas de foco na mesma tela (o anel azul no botão e o anel do
 * browser no link).
 *
 * ⚠️ A tinta é a SECUNDÁRIA: link é metadado navegável. O texto corrido da
 * tela é `text-foreground` — a exceção de uso está na convenção
 * `estilizacao.md` §2.1.
 */
export function LinkTexto({ children, ...props }: React.ComponentProps<typeof NextLink>) {
  return (
    <NextLink
      {...props}
      className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground foco"
    >
      {children}
    </NextLink>
  );
}
