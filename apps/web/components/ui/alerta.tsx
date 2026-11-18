import type * as React from 'react';

/**
 * Alerta de feedback: erro ou confirmação.
 *
 * pt-BR: os dois alertas do app eram class strings repetidas (4× a de erro,
 * 1× a de sucesso) e cada um repetia à mão a decisão de `role`:
 *
 * - **erro** → `role="alert"`. É `assertive`: interrompe o que o leitor de
 *   tela estava falando, porque a pessoa precisa saber AGORA que o
 *   formulário não foi aceito. O e2e `f5-cadastro-erro-generico.spec.ts`
 *   afirma `form [role="alert"]` com count 1.
 * - **sucesso** → `role="status"`. É `polite`: anuncia sem cortar a fala,
 *   porque a confirmação não é urgente. O e2e `f2-cadastro-sucesso.spec.ts`
 *   afirma `getByRole('status')`.
 *
 * A decisão vem da VARIANTE, não de quem chama: `role` não é prop. Um
 * `role="alert"` em confirmação, ou um `role="status"` em erro, é o tipo de
 * divergência que ninguém percebe — e o leitor de tela é quem paga.
 *
 * ⚠️ A cor do alerta é reforço. A mensagem é texto, e é o texto que a
 * pessoa lê.
 *
 * ⚠️ E O `role="alert"` NÃO É O QUE FAZ O ALERTO SER LIDO — MEDIDO
 * 2026-11-17 (revisão do PR #171): uma região viva só anuncia MUDANÇA, e um
 * `Alerta` que entra no HTML inicial do Server Component não é uma mudança.
 * Quem chega por leitor de tela lê o texto na ORDEM DE LEITURA (ele está no
 * DOM), e é isso que importa — o `role` continua sendo o que dá a
 * semântica de "isto é um erro" para quem navega por região.
 */
type AlertaProps = {
  /** `erro` interrompe a fala; `sucesso` anuncia sem interromper. */
  variante?: 'erro' | 'sucesso';
  children: React.ReactNode;
} & Omit<React.ComponentProps<'p'>, 'children' | 'role'>;

export function Alerta({ variante = 'erro', children, className, ...props }: AlertaProps) {
  const base =
    variante === 'erro'
      ? 'rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
      : 'rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success';

  return (
    // ⚠️ O `role` vem DEPOIS do spread: `role` não é prop (o tipo não deixa
    // passar), e a decisão vem da VARIANTE. Antes, o `role` do caller vencia.
    <p
      {...props}
      role={variante === 'erro' ? 'alert' : 'status'}
      className={className ? `${base} ${className}` : base}
    >
      {children}
    </p>
  );
}
