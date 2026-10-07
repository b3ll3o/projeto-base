// apps/web/components/cadastro-usuario-form.spec.tsx
//
// Teste de comportamento do formulário: o que a pessoa que usa a tela
// enxerga e consegue fazer.
//
// pt-BR: a Action entra por prop (`action`) em vez de ser importada
// direto dentro do componente. É o padrão suportado pelo Next para Server
// Action em Client Component, e é o que torna o formulário testável sem
// rede — o stub abaixo devolve o MESMO `CadastroUsuarioState` que a Action
// real devolve, então o que se testa aqui é o que a tela faz com ele.
//
// Roda em jsdom: precisa de DOM de verdade (labels, foco, aria), não de um
// simulacro.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CadastroUsuarioForm } from './cadastro-usuario-form';
import { CADASTRO_INICIAL, type CadastroUsuarioState } from '@/app/users/novo/state';

function resposta(over: Partial<CadastroUsuarioState> = {}): CadastroUsuarioState {
  return { ...CADASTRO_INICIAL, ...over };
}

function acaoQue(estado: CadastroUsuarioState | Promise<CadastroUsuarioState>) {
  return vi.fn(async () => estado);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// pt-BR: o Testing Library só registra o cleanup automático quando o
// ambiente de teste expõe `afterEach` global (`globals: true` no Vitest),
// que este projeto não usa. Sem este `cleanup` explícito, o DOM de cada
// teste acumula no mesmo `document` e a consulta seguinte encontra DOIS
// elementos — o erro vira "achou mais de um", que parece um defeito do
// componente e é acúmulo de sujo do teste.
afterEach(() => {
  cleanup();
});

describe('CadastroUsuarioForm — rótulos e campos', () => {
  it('cada campo tem um rótulo que o identifica (não só um placeholder)', () => {
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Nome')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement);
  });

  it('o email é digitado no tipo certo (teclado de email no celular)', () => {
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  });
});

describe('CadastroUsuarioForm — validação antes de enviar', () => {
  it('nome vazio mostra a mensagem e não chama a Action', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(await screen.findByText('Informe o nome do usuário.')).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('email inválido mostra a mensagem com exemplo e não chama a Action', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'nao-e-email');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(await screen.findByText(/Exemplo: nome@empresa\.com/)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('o campo inválido é anunciado como inválido para leitor de tela', async () => {
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    // pt-BR: o email é preenchido de propósito. Com o formulário todo
    // vazio os DOIS campos são inválidos e o teste passaria pelo motivo
    // errado: marcaria os dois e não distinguiria "soube qual está errado"
    // de "marca tudo".
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
  });

  it('campo vazio pede o campo, não acusa o formato', async () => {
    // pt-BR: email vazio reprova em `min(1)` E em `email()`. Se as duas
    // mensagens competirem, a que fica é a do formato — e a pessoa é
    // repreendida por um problema de formato num campo que está vazio.
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(await screen.findByText('Informe o email.')).toBeInTheDocument();
    expect(screen.queryByText(/Exemplo: nome@empresa\.com/)).not.toBeInTheDocument();
  });

  it('o foco vai para o primeiro campo inválido', async () => {
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());
  });
});

describe('CadastroUsuarioForm — erros que vêm da API', () => {
  it('erro de campo da API aparece junto do campo, não só no topo', async () => {
    const action = acaoQue(
      resposta({
        fieldErrors: { email: 'Este email já está cadastrado.' },
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(await screen.findByText('Este email já está cadastrado.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('erro de formulário aparece num região anunciada como alerta', async () => {
    const action = acaoQue(
      resposta({
        formError: 'Não foi possível cadastrar o usuário. Código de rastreamento: trace-123.',
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('trace-123');
  });

  it('o que a pessoa digitou sobrevive à falha', async () => {
    const action = acaoQue(
      resposta({
        fieldErrors: { email: 'Este email já está cadastrado.' },
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Maria Silva'));
    expect(screen.getByLabelText('Email')).toHaveValue('maria@empresa.com');
  });

  it('os campos ficam travados enquanto a requisição está em voo', async () => {
    // pt-BR: sem `disabled`, a pessoa pode corrigir o email enquanto o POST
    // está em voo. Quando a resposta chega, o `form.reset(estado.valores)`
    // reescreve os campos com o valor ANTIGO e apaga a correção — perda de
    // dado silenciosa, sem erro em lugar nenhum. O bloqueio durante o envio
    // é o que torna o reset seguro.
    let liberar!: (v: CadastroUsuarioState) => void;
    const action = vi.fn(
      () =>
        new Promise<CadastroUsuarioState>((r) => {
          liberar = r;
        }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeDisabled());
    expect(screen.getByLabelText('Email')).toBeDisabled();

    liberar(resposta({ ok: true }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toBeEnabled());
  });
});

describe('CadastroUsuarioForm — durante e depois do envio', () => {
  it('o botão desabilita e avisa que está em andamento (não dá para enviar duas vezes)', async () => {
    let liberar!: (v: CadastroUsuarioState) => void;
    const action = vi.fn(
      () =>
        new Promise<CadastroUsuarioState>((r) => {
          liberar = r;
        }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    const botao = await screen.findByRole('button', { name: /cadastrando/i });
    expect(botao).toBeDisabled();

    liberar(resposta({ ok: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: /cadastrar/i })).toBeEnabled());
  });

  it('sem erro, a tela não mostra nenhum alerta', async () => {
    const action = acaoQue(resposta({ ok: true }));
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
