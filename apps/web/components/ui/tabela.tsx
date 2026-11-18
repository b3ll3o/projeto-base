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
  id,
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
  /**
   * O `id` do `<caption>` — e opcional.
   *
   * ⚠️ Quem não passar, o id sai da LEGENDA (determinístico — o
   * `useId` é hook, e hook não roda em Server Component). Duas tabelas com a
   * MESMA legenda na mesma tela shareariam o id — e o `aria-labelledby`
   * apontaria para o primeiro. Quem renderiza as duas, dá um id para cada.
   */
  id?: string;
}) {
  const base = 'w-full border-collapse text-sm';
  // ⚠️ O NOME da região é o MESMO texto do `<caption>`, e não uma segunda
  // cópia: `aria-label={legenda}` punha a frase duas vezes no DOM (a região
  // e a legenda), e o leitor de tela anunciava as duas ao entrar na tabela.
  // O `aria-labelledby` APONTA para o caption — o texto vive uma vez só, e a
  // região o nomeia.
  const idDaLegenda = id ?? idDaLegendaDaTabela(legenda);
  return (
    // ⚠️ A REGIÃO ROLÁVEL é alcançável por TECLADO (MEDIDO 2026-11-17): sem
    // `tabindex`, ela só era focável no Chromium (que torna região rolável
    // focável por padrão) — no Firefox e no Safari, as colunas que ficam
    // FORA da tela a 320px eram inalcançáveis, e o `role` + o nome acessível
    // é o que diz ao leitor de tela o que há ali.
    //
    // ⚠️ E `foco`: a região é um elemento FOCÁVEL novo (o `tabIndex`), e a
    // convenção `estilizacao.md` §4.3 exige o utilitário `foco` em TODO
    // elemento focável — sem ele, a região ganha o anel DEFAULT do browser e
    // a app passa a ter dois sistemas de foco na mesma tela.
    <div
      className="mt-6 overflow-x-auto foco"
      tabIndex={0}
      role="region"
      aria-labelledby={idDaLegenda}
    >
      <table {...props} className={className ? `${base} ${className}` : base}>
        <caption id={idDaLegenda} className="sr-only">
          {legenda}
        </caption>
        {children}
      </table>
    </div>
  );
}

/**
 * O `id` do `<caption>` — e a REGIÃO rolável o nomeia por ele.
 *
 * ⚠️ Ele vem da LEGENDA, e não de um contador: a primitiva é usada em Server
 * Component, e `useId` é hook (hook não roda no servidor). A legenda é o
 * texto que já distingue uma tabela da outra — e duas tabelas com a MESMA
 * legenda na mesma tela shareariam o `id` (o `aria-labelledby` apontaria
 * para a primeira), o que é raro e não vale um contador global.
 */
function idDaLegendaDaTabela(legenda: string): string {
  return `tabela-${legenda
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
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
 * ⚠️ A base é `break-words` (`overflow-wrap: break-word`), e ela **NÃO**
 * reduz a contribuição min-content da célula: a especificação diz que só
 * `anywhere` reduz. MEDIDO 2026-11-17: com e-mail de 249 chars, a tabela
 * media **2.097px** dentro de um wrapper de 288px a 320px — e com
 * `overflow-wrap: normal` mediava os **mesmos** 2.097px. O que impedia a
 * **página** de rolar era o `overflow-x-auto` do wrapper — e o comentário
 * antigo atribuía isso ao `break-words`.
 *
 * ⚠️ E a base NÃO impõe `anywhere`: MEDIDO 2026-11-17 a 320px, `anywhere` em
 * todas as células fez a tabela de `/admin/users` caber em 295px — e a coluna
 * de e-mail cair para **52px**, rendendo o e-mail em 9 fragmentos
 * ("pess / oa.d / .a.em / pres / a@ex / empl / o.dev / .br"). Dado tabular
 * PODE rolar na horizontal (WCAG 1.4.10), e palavra quebrada no meio é
 * pior que rolagem.
 *
 * ⚠️ QUEM PRECISA que a célula não alargue a tabela OPT-IN: põe
 * `wrap-anywhere` no conteúdo INTERNO da célula (e não na própria célula —
 * as duas classes na mesma etiqueta se resolvem pela ORDEM do CSS
 * compilado, e essa ordem é do Tailwind, não do código). Com `anywhere` no
 * conteúdo e uma largura fixa na célula (`w-48`), a coluna respeita a
 * largura: MEDIDO, a tabela da trilha de auditoria cai de 2.097px para a
 * largura das colunas.
 */
export function CelulaTabela({ children, className, ...props }: React.ComponentProps<'td'>) {
  const base = 'break-words border-b border-border/60 py-3 pr-4 text-foreground';
  return (
    <td {...props} className={className ? `${base} ${className}` : base}>
      {children}
    </td>
  );
}
