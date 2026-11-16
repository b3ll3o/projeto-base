import type * as React from 'react';

/**
 * Tabela de dado — e as suas três partes.
 *
 * pt-BR: as 5 tabelas do app repetiam `mt-6 w-full border-collapse text-sm`
 * no `<table>`, `py-2 pr-4 font-medium text-slate-500` no `<th>` e
 * `py-3 pr-4` no `<td>`. A repetição da classe é uma coisa; a repetição do
 * `scope` ausente é outra — 3 das 5 tabelas não declaravam `scope="col"`, e
 * o leitor de tela precisa dele para associar a célula ao cabeçalho.
 *
 * ⚠️ `scope="col"` vem aqui, sempre. `CabecalhoTabela` sem `scope` é erro
 * de acessibilidade silencioso: a tabela renderiza bonita e o leitor de
 * tela lê as células sem nome.
 *
 * ⚠️ A tabela é a exceção declarada do padrão anti-fio: dado tabular PODE
 * ter linha divisória (skill `ui-craft` §5). Por isso a borda aqui existe
 * e em painel não.
 */
export function Tabela({
  children,
  legenda,
  ...props
}: React.ComponentProps<'table'> & {
  /**
   * Nome acessível da tabela, renderizado como `<caption class="sr-only">`.
   *
   * ⚠️ Uma tabela sem nome acessível é uma lista de números para o leitor de
   * tela: ele lê a coluna, mas não sabe o que a coluna é. O texto é
   * invisível (`sr-only`) — é o rótulo, não o texto da tela.
   *
   * ⚠️ É OBRIGATÓRIA: a regra é da convenção `estilizacao.md` §5.5, e prop
   * opcional é regra que ninguém cobra — a tabela sem legenda passaria
   * despercebida.
   */
  legenda: string;
}) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table {...props} className="w-full border-collapse text-sm">
        <caption className="sr-only">{legenda}</caption>
        {children}
      </table>
    </div>
  );
}

/**
 * Célula de cabeçalho.
 *
 * `scope="col"` é o padrão e não precisa ser passado. `scope="row"` é para
 * cabeçalho de linha — e é raro; quando aparecer, é porque a primeira
 * coluna é a chave da linha.
 */
export function CabecalhoTabela({ children, scope = 'col', ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      scope={scope}
      {...props}
      className="border-b border-border py-2 pr-4 text-left font-medium text-muted-foreground"
    >
      {children}
    </th>
  );
}

/** Célula de dado. */
export function CelulaTabela({ children, ...props }: React.ComponentProps<'td'>) {
  return (
    <td {...props} className="border-b border-border/60 py-3 pr-4 text-foreground">
      {children}
    </td>
  );
}
