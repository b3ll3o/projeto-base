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
  className,
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
  const base = 'w-full border-collapse text-sm';
  return (
    // ⚠️ A REGIÃO ROLÁVEL é alcançável por TECLADO (MEDIDO 2026-11-17): sem
    // `tabindex`, ela só era focável no Chromium (que torna região rolável
    // focável por padrão) — no Firefox e no Safari, as colunas que ficam
    // FORA da tela a 320px eram inalcançáveis, e o `role` + o nome acessível
    // é o que diz ao leitor de tela o que há ali.
    <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label={legenda}>
      <table {...props} className={className ? `${base} ${className}` : base}>
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
export function CabecalhoTabela({
  children,
  scope = 'col',
  className,
  ...props
}: React.ComponentProps<'th'>) {
  const base = 'border-b border-border py-2 pr-4 text-left font-medium text-muted-foreground';
  return (
    <th scope={scope} {...props} className={className ? `${base} ${className}` : base}>
      {children}
    </th>
  );
}

/**
 * Célula de dado.
 *
 * ⚠️ `wrap-anywhere` (MEDIDO 2026-11-17): um e-mail tem 254 chars e não tem
 * onde quebrar.
 *
 * ⚠️ **O `break-words` anterior NÃO fazia isto.** A medição: com e-mail de
 * 249 chars, a tabela media **2.097px** dentro de um wrapper de 288px a
 * 320px — e com `overflow-wrap: normal` mediava **os mesmos 2.097px**. A
 * classe é `overflow-wrap: break-word`, e a especificação diz que
 * `break-word` **não** reduz a contribuição min-content (quem reduz é
 * `anywhere`). O que impedia a **página** de rolar era o `overflow-x-auto` do
 * wrapper — e o comentário antigo atribuía isso ao `break-words`.
 *
 * ⚠️ E `anywhere` sozinho não resolve: MEDIDO, a tabela cai de 2.097px para
 * 2.066px. O que fecha é a **LARGURA** da célula — com `width` fixa, a
 * tabela cai para 442px e as colunas da direita deixam de estar a 7 telas de
 * rolagem. A largura é passada por quem chama (`className`), porque a
 * primitiva não sabe o que a célula guarda.
 */
export function CelulaTabela({ children, className, ...props }: React.ComponentProps<'td'>) {
  const base = 'wrap-anywhere border-b border-border/60 py-3 pr-4 text-foreground';
  return (
    <td {...props} className={className ? `${base} ${className}` : base}>
      {children}
    </td>
  );
}
