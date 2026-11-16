import type * as React from 'react';
import NextLink from 'next/link';

/**
 * O estilo do BOTÃO — a base, os dois tamanhos e as duas variantes.
 *
 * pt-BR: é o único dono. O `<a href="">` de `guard-admin.tsx` (o "Tentar de
 * novo", que recarrega a página) usava a MESMA classe do botão secundário
 * — e era a segunda cópia da regra. Com o dono exportado, a segunda cópia
 * aponta para o mesmo lugar.
 *
 * ⚠️ O `className` do caller é **ADICIONAL**, não substitutor: ele entra
 * DEPOIS da base na string, e a ordem do CSS decide, não a da string. Um
 * `text-foreground` passado por cima de `text-primary-foreground` NÃO
 * troca a cor — as duas utilitárias têm a mesma especificidade. (Trocar isso
 * exigiria `tailwind-merge`, que o repo não usa.)
 *
 * ⚠️ A transição é de `background-color` e NÃO de `transition-colors`: a
 * transição padrão do Tailwind inclui `outline-color`, e o anel de foco
 * passava a SURGIR em 150ms (MEDIDO 2026-11-16 no browser). O indicador de
 * foco tem que estar VISÍVEL no instante do foco.
 *
 * ⚠️ O `hover:` é o do Tailwind 4, que o emite ATRÁS de
 * `@media (hover: hover)` (MEDIDO 2026-11-16 no CSS compilado) — ou seja, o
 * botão não gruda em `bg-primary-hover` no toque, que é o defeito que a
 * skill `motion` §8 proíbe.
 */
export const CLASSES_BOTAO = {
  base: 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-[background-color] foco disabled:cursor-not-allowed disabled:opacity-60',
  tamanhoMd: 'px-4 py-2',
  tamanhoSm: 'px-3 py-1',
  primario: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secundario: 'border border-control bg-surface text-foreground hover:bg-muted',
} as const;

/**
 * O botão secundário, pronto — para o `<a>` que recarrega a página.
 *
 * ⚠️ O `tamanhoMd` está AQUI (MEDIDO 2026-11-16, revisão do PR #168): sem
 * ele, o `<a>` renderizava SEM padding nenhum — o texto encostava no fio de
 * 1px do contorno. O padding vivia só na constante de tamanho, que o
 * `<a>` não recebia.
 */
export const CLASSES_BOTAO_SECUNDARIO = `${CLASSES_BOTAO.base} ${CLASSES_BOTAO.tamanhoMd} ${CLASSES_BOTAO.secundario}`;

type Variante = 'primario' | 'secundario';
type Tamanho = 'md' | 'sm';

/** O que os dois ramos têm em comum. */
type BaseBotao = {
  /** `primario` é a ação da tela; `secundario` é a alternativa. */
  variante?: Variante;
  /** `md` é o botão de tela; `sm` é o botão dentro de linha de tabela. */
  tamanho?: Tamanho;
  children: React.ReactNode;
  /** Classe ADICIONAL (não substitutora) — ver a nota em `CLASSES_BOTAO`. */
  className?: string | undefined;
};

/** Com `href`, o botão é um link do Next (navega). */
type PropsComHref = BaseBotao & {
  href: string;
} & Omit<React.ComponentProps<typeof NextLink>, 'children' | 'className' | 'href'>;

/** Sem `href`, o botão é um `<button>`. */
type PropsSemHref = BaseBotao & Omit<React.ComponentProps<'button'>, 'children' | 'className'>;

type BotaoProps = PropsComHref | PropsSemHref;

/**
 * Botão — primário ou secundário.
 *
 * pt-BR: as duas class strings de botão eram repetidas em 10 lugares
 * (`rounded-md bg-slate-900 px-4 py-2` era a primária) e 5 na secundária, e o
 * mesmo "botão" às vezes era `<button>` e às vezes `<a>`. Aqui os dois são o
 * MESMO componente: com `href` ele vira link do Next, sem `href` ele vira
 * `<button>`.
 *
 * ⚠️ A união é DISCRIMINADA por `href`, e não por tipo de prop: é ela que
 * impede o `onClick`/`aria-label` de um `<button>` de sumirem no ramo do
 * link (e vice-versa). O `Botao` sem `href` é `<button>`; com `href` é
 * `<a>` do Next, e as props são as do link.
 *
 * ⚠️ O `type` do `<button>` é `button` por PADRÃO (MEDIDO 2026-11-16,
 * revisão do PR #168). No HTML, `<button>` sem `type` dentro de um `<form>`
 * é `submit` — e um botão de "Cancelar" dentro de um formulário dispara a
 * mutação. O botão de submit do app escreve `type="submit"` explicitamente,
 * e por isso continua funcionando.
 */
export function Botao(props: BotaoProps) {
  // ⚠️ `variante` e `tamanho` são REMOVIDOS do objeto espalhado: sem isso
  // eles viravam atributo no DOM (`<button variante="secundario">`), que é
  // HTML inválido (MEDIDO 2026-11-16).
  const { variante = 'primario', tamanho = 'md', children, className, ...resto } = props;
  const base = `${CLASSES_BOTAO.base} ${CLASSES_BOTAO[variante]} ${CLASSES_BOTAO[tamanho === 'sm' ? 'tamanhoSm' : 'tamanhoMd']}`;
  const classes = className ? `${base} ${className}` : base;

  if ('href' in resto) {
    return (
      <NextLink {...resto} href={resto.href} className={classes}>
        {children}
      </NextLink>
    );
  }

  return (
    <button {...resto} type={resto.type ?? 'button'} className={classes}>
      {children}
    </button>
  );
}
