import type * as React from 'react';

/**
 * O cabeçalho de uma tela: título, descrição e a ação da direita.
 *
 * pt-BR: o `h1` de tela era `text-2xl font-semibold text-slate-900` em 16
 * arquivos e o subtítulo `mt-1 text-sm text-slate-500` em 10. O `h1` é a
 * única coisa que a tela NÃO repete: é o que a pessoa navega por ele.
 *
 * ⚠️ UM `h1` por tela. As duas telas que renderizam dois ramos mutuamente
 * exclusivos (`guard-admin.tsx`, `convite/[token]/page.tsx`) renderizam UM
 * `CabecalhoPagina` por ramo — nunca dois no mesmo render.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  /**
   * Metadado da tela. Entra em tinta secundária: é legenda, não título.
   *
   * É `ReactNode` e não `string` porque uma legenda pode trazer marcação —
   * o slug de um perfil, por exemplo, é `<code>` e não texto solto.
   */
  descricao?: React.ReactNode | undefined;
  /** A ação da direita (botão, link). */
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{titulo}</h1>
        {descricao ? <p className="mt-1 text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {acao ? <div className="flex items-center gap-3">{acao}</div> : null}
    </div>
  );
}
