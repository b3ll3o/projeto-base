// apps/web/app/convite/[token]/aceitar-convite.spec.tsx
//
// Teste de comportamento do botão de aceitar o convite.
//
// pt-BR: o botão é Client Component porque o erro devolvido pela Action
// precisa aparecer NA TELA. O spec do `actions.spec.ts` prova que a Action
// traduz o erro; este prova que a tela o MOSTRA — são as duas metades de um
// cabo, e cada uma verde não diz nada sobre a outra.
//
// Roda em jsdom: precisa de DOM de verdade (botão, campo oculto, foco),
// não de um simulacro.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AceitarConvite } from './aceitar-convite';

vi.mock('./actions', () => ({
  aceitarConviteDoAtor: vi.fn(async () => ({ ok: false, formError: 'Este convite já foi usado.' })),
}));

const TOKEN = 'a'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
});

// pt-BR: o Testing Library só registra o cleanup automático quando o
// ambiente de teste expõe `afterEach` global (`globals: true` no Vitest),
// que este projeto não usa. Sem este `cleanup` explícito, o DOM de cada
// teste acumula no mesmo `document`.
afterEach(() => {
  cleanup();
});

describe('AceitarConvite — o que a pessoa vê', () => {
  it('oferece UM botão de aceitar, com o texto que diz o que acontece', () => {
    render(<AceitarConvite token={TOKEN} />);

    expect(screen.getByRole('button', { name: /aceitar convite/i })).toBeInTheDocument();
  });

  it('o token viaja no formulário — é ele que a Action valida', () => {
    render(<AceitarConvite token={TOKEN} />);

    // pt-BR: o campo é OCULTO de propósito — o token já está na URL do
    // convite, e mostrá-lo num input de texto seria uma cópia visível do
    // segredo. O que se afirma é que ele CHEGA.
    const campo = document.querySelector('input[name="token"]');
    expect(campo).not.toBeNull();
    expect(campo?.getAttribute('value')).toBe(TOKEN);
  });

  it('o erro devolvido pela Action aparece na tela, anunciado para quem não enxerga', async () => {
    const user = userEvent.setup();
    render(<AceitarConvite token={TOKEN} />);

    await user.click(screen.getByRole('button', { name: /aceitar convite/i }));

    const erro = await screen.findByRole('alert');
    expect(erro).toHaveTextContent('Este convite já foi usado.');
  });

  it('oferece a saída para entrar com outra conta — com o token do convite', () => {
    // pt-BR: esta é a única tela do convite que a pessoa vê COM sessão, e ela
    // pode estar logada na conta errada. Sem a saída, a pessoa fica presa:
    // o convite é de outro e-mail e a tela só oferece "Aceitar".
    render(<AceitarConvite token={TOKEN} />);

    const saida = screen.getByRole('link', { name: 'Entrar com outra conta' });
    expect(saida).toHaveAttribute('href', `/login?convite=${TOKEN}`);
  });
});
