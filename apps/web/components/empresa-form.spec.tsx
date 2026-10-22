// apps/web/components/empresa-form.spec.tsx
//
// Teste de comportamento do formulário de empresa: o que a pessoa que usa a
// tela enxerga e consegue fazer.
//
// pt-BR: a Action entra por prop (`action`) em vez de ser importada direto
// dentro do componente — o mesmo padrão do `cadastro-usuario-form.spec.tsx`.
// O stub devolve o MESMO `EmpresaState` que a Action real devolve, então o
// que se testa aqui é o que a TELA faz com ele.
//
// Roda em jsdom: precisa de DOM de verdade (labels, foco, aria), não de um
// simulacro.
//
// ⚠️ O que este spec segura que o spec da Action NÃO segura: o caminho do
// CLIENTE. A Action valida de novo no servidor, mas entre a digitação e a
// Action há uma validação no navegador que decide se o pedido sai — e é ela
// que dá a resposta imediata. Um defeito aqui é visível (a pessoa clica e
// nada acontece) e silencioso (a Action nunca é chamada, o verde continua).

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmpresaForm } from './empresa-form';
import { EMPRESA_INICIAL, type EmpresaState } from '@/app/empresa/nova/state';
import { SLUG_MAX } from '@/lib/empresa-schema';

function resposta(over: Partial<EmpresaState> = {}): EmpresaState {
  return { ...EMPRESA_INICIAL, ...over };
}

function acaoQue(estado: EmpresaState | Promise<EmpresaState>) {
  // pt-BR: os dois parâmetros são declarados de propósito — o `useActionState`
  // CHAMA a Action com `(estadoAnterior, formData)`, e um stub de zero
  // parâmetros tipa `mock.calls` como tupla de comprimento 0.
  return vi.fn(async (_estado: EmpresaState, _formData: FormData) => estado);
}

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

describe('EmpresaForm — rótulos e campos', () => {
  it('cada campo tem um rótulo que o identifica (não só um placeholder)', () => {
    render(<EmpresaForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Nome da empresa')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Identificador')).toBeInstanceOf(HTMLInputElement);
  });

  it('o identificador tem o teto do schema, para o navegador travar o over typing', () => {
    render(<EmpresaForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Identificador')).toHaveAttribute('maxlength', String(SLUG_MAX));
  });

  it('o formato do identificador é explicado no campo, não só no placeholder', () => {
    // pt-BR: o placeholder desaparece quando a pessoa digita — e o formato é
    // a regra que ela mais erra (maiúscula, espaço, hífen na ponta).
    //
    // pt-BR: o texto é EXATO, e não um `/letras minúsculas/i` — a mensagem de
    // erro do campo repete as mesmas palavras ("Use apenas letras
    // minúsculas, números e hífens…"), e um matcher frouxo acharia DUAS
    // coisas quando o erro estivesse na tela.
    render(<EmpresaForm action={acaoQue(resposta())} />);

    expect(
      screen.getByText('Letras minúsculas, números e hífens. Ex.: acme-ltda'),
    ).toBeInTheDocument();
  });
});

describe('EmpresaForm — a validação no cliente', () => {
  it('nome vazio pede o nome e NÃO despacha a Action', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<EmpresaForm action={action} />);

    await user.type(screen.getByLabelText('Identificador'), 'acme');
    await user.click(screen.getByRole('button', { name: /criar empresa/i }));

    expect(await screen.findByText('Informe o nome da empresa.')).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('identificador fora do padrão diz o formato e NÃO despacha a Action', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<EmpresaForm action={action} />);

    await user.type(screen.getByLabelText('Nome da empresa'), 'ACME');
    await user.type(screen.getByLabelText('Identificador'), 'ACME LTDA');
    await user.click(screen.getByRole('button', { name: /criar empresa/i }));

    expect(await screen.findByText(/^Use apenas letras minúsculas/i)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('o erro é anunciado para quem não enxerga o campo vermelho', async () => {
    const user = userEvent.setup();
    render(<EmpresaForm action={acaoQue(resposta())} />);

    await user.type(screen.getByLabelText('Identificador'), 'acme');
    await user.click(screen.getByRole('button', { name: /criar empresa/i }));

    const erro = await screen.findByRole('alert');
    expect(erro).toHaveTextContent('Informe o nome da empresa.');
    expect(screen.getByLabelText('Nome da empresa')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('EmpresaForm — o despacho', () => {
  it('manda nome e identificador APARADOS para a Action', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<EmpresaForm action={action} />);

    await user.type(screen.getByLabelText('Nome da empresa'), '  ACME  ');
    await user.type(screen.getByLabelText('Identificador'), '  acme  ');
    await user.click(screen.getByRole('button', { name: /criar empresa/i }));

    expect(action).toHaveBeenCalledTimes(1);
    const enviado = action.mock.calls[0]?.[1];
    expect(enviado?.get('nome')).toBe('ACME');
    expect(enviado?.get('slug')).toBe('acme');
  });

  it('mostra o erro de formulário que a Action devolveu', async () => {
    const action = acaoQue(
      resposta({
        formError: 'Não foi possível criar a empresa. Código de rastreamento: trace-1.',
      }),
    );
    const user = userEvent.setup();
    render(<EmpresaForm action={action} />);

    await user.type(screen.getByLabelText('Nome da empresa'), 'ACME');
    await user.type(screen.getByLabelText('Identificador'), 'acme');
    await user.click(screen.getByRole('button', { name: /criar empresa/i }));

    expect(await screen.findByText(/Não foi possível criar a empresa/)).toBeInTheDocument();
  });
});
