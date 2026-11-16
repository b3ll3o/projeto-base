import type * as React from 'react';

/**
 * O estilo do CONTROLE — o campo de texto, o select e o checkbox.
 *
 * pt-BR: é o único dono da classe do controle. Antes do padrão, cada tela
 * escrevia a sua (`border-slate-300 px-3 py-2` num campo, `border-slate-300
 * px-2 py-1` no select, `size-4 rounded border-slate-300` no checkbox) — e o
 * `Campo` não cobria os dois últimos, então a regra do campo vivia só no
 * código das telas. Um dono é o que faz a regra sobreviver ao app derivado.
 *
 * ⚠️ O `border` aqui é o **contorno de controle** (`--color-control`), que
 * precisa de 3:1 contra a superfície (WCAG 1.4.11) — a borda decorativa
 * (`--color-border`) não tem essa obrigação e é mais fraca.
 *
 * ⚠️ A transição é de `border-color` e NÃO de `transition-colors`: a
 * transição padrão do Tailwind inclui `outline-color`, e o anel de foco
 * passava a SURGIR em 150ms, do `currentColor` para o token do anel
 * (MEDIDO 2026-11-16 no browser: `outline-color` computado mudava de
 * `rgb(15,23,41)` para `rgb(17,71,187)` ao longo de 150ms). O indicador de
 * foco tem que estar VISÍVEL no instante do foco.
 */
export const CLASSE_CONTROLE =
  'rounded-md border border-control text-sm text-foreground transition-[border-color] foco';

/**
 * O estilo do checkbox — mesma família, outra forma.
 *
 * ⚠️ O `border` (a LARGURA do fio) está aqui à mão, e a cor vem do token:
 * `border-control` sozinho é só cor, e o `size-6` (24px) é o alvo mínimo da
 * WCAG 2.5.8. O checkbox nativo do Chrome ignora `border`, mas um
 * `appearance: none` futuro não ignoraria.
 */
export const CLASSE_CHECKBOX = 'size-6 rounded-md border border-control accent-primary foco';

/**
 * Campo de formulário: rótulo, controle, dica e erro — com a fiação de
 * acessibilidade feita uma vez.
 *
 * pt-BR: a fiação era feita À MÃO em 7 campos de 3 formulários, e cada mão
 * erra de um jeito. O que este componente garante:
 *
 * - `label htmlFor` + `id` do controle — o nome acessível do campo é o
 *   RÓTULO (o e2e `f3-cadastro-validacao.spec.ts` consulta o campo pelo
 *   rótulo).
 * - `aria-invalid` — `"true"` quando há erro, `"false"` quando não. O
 *   e2e `f7-login.spec.ts:77` afirma `aria-invalid` **ausente de "true"** e
 *   o `f4-cadastro-email-duplicado.spec.ts:89` afirma `aria-invalid="false"`
 *   no campo sem erro: por isso o atributo é SEMPRE renderizado, e não só
 *   quando há erro.
 * - `aria-describedby` — aponta para o erro (`<id>-erro`) e para a dica
 *   (`<id>-dica`), **na ordem erro → dica**, que é a que o
 *   `empresa-form.tsx` já usava. Sem erro e sem dica, o atributo some.
 * - O erro é `role="alert"` (interrompe a fala) e a dica NÃO é — dica é
 *   texto de apoio, não evento.
 *
 * ⚠️ O erro é comunicado por COR **e** por TEXTO. A cor do fio do campo
 * (`aria-[invalid=true]:border-destructive`) é reforço, nunca o portador da
 * mensagem.
 *
 * ⚠️ `className` NÃO é prop deste componente: o estilo do campo tem um só
 * dono (o `CLASSE_CONTROLE`), e um `className` que "acrescenta" em vez de
 * "substitui" é a forma de a regra se dissolver na primeira tela que precisar
 * de uma exceção. Quem precisa de outra forma usa outro componente.
 */
type CampoProps = {
  /** Id do controle. O erro e a dica derivam dele (`<id>-erro`, `<id>-dica`). */
  id: string;
  /** Rótulo visível do campo. */
  rotulo: string;
  /** Mensagem de erro. Quando presente, o campo fica `aria-invalid="true"`. */
  erro?: string | undefined;
  /** Texto de apoio (formato, exemplo). Não é erro e não interrompe a fala. */
  dica?: string | undefined;
} & Omit<React.ComponentProps<'input'>, 'id' | 'className'>;

export function Campo({ id, rotulo, erro, dica, ...props }: CampoProps) {
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;
  const descritos =
    [erro ? idErro : null, dica ? idDica : null].filter((v): v is string => v !== null).join(' ') ||
    undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {rotulo}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={Boolean(erro)}
        aria-describedby={descritos}
        className={`${CLASSE_CONTROLE} mt-1 block w-full bg-surface px-3 py-2 focus:border-foreground aria-[invalid=true]:border-destructive`}
      />
      {dica ? (
        <p id={idDica} className="mt-1 text-sm text-muted-foreground">
          {dica}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} role="alert" className="mt-1 text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
