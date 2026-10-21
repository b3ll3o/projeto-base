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
import { SENHA_MAX, SENHA_MIN } from '@/lib/cadastro-usuario-schema';

function resposta(over: Partial<CadastroUsuarioState> = {}): CadastroUsuarioState {
  return { ...CADASTRO_INICIAL, ...over };
}

function acaoQue(estado: CadastroUsuarioState | Promise<CadastroUsuarioState>) {
  // pt-BR: os dois parâmetros são declarados de propósito. O `useActionState`
  // CHAMA a Action com `(estadoAnterior, formData)`, e um stub de zero
  // parâmetros tipa `mock.calls` como tupla de comprimento 0 — aí
  // `mock.calls[0][1]` é TS2493 ("no element at index '1'") em vez de um
  // dado, e o teste que precisa LER o FormData enviado não compila. O tipo do
  // stub tem de ser a assinatura real do `ActionCadastro`.
  return vi.fn(async (_estado: CadastroUsuarioState, _formData: FormData) => estado);
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

  it('a senha é um campo de senha — nunca texto puro', () => {
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  it('a senha marca-se como senha NOVA, para o gerenciador oferecer uma forte', () => {
    // pt-BR: `new-password` é o que faz o Chrome e o Safari oferecerem
    // "sugerir uma senha forte" em vez de PREENCHER com a senha que a
    // pessoa já tem guardada para este site. `current-password` aqui seria
    // o valor errado e a sugestão forte nunca apareceria.
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('a senha tem o teto do schema, para o navegador travar o over typing', () => {
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Senha')).toHaveAttribute('maxlength', String(SENHA_MAX));
  });
});

describe('CadastroUsuarioForm — o campo de senha', () => {
  it('senha vazia pede a senha, não acusa comprimento', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(await screen.findByText('Informe a senha.')).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('senha curta demais diz o número mínimo', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'abc');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(
      await screen.findByText(`A senha deve ter pelo menos ${SENHA_MIN} caracteres.`),
    ).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('a senha é anunciada como inválida e o erro é lido pelo leitor de tela', async () => {
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'abc');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    const senha = screen.getByLabelText('Senha');
    await waitFor(() => expect(senha).toHaveAttribute('aria-invalid', 'true'));
    // `aria-describedby` + `role="alert"`: o primeiro LIGA o campo à
    // mensagem, o segundo faz a mensagem ser anunciada quando ela aparece.
    // Falta o primeiro e o campo fica vermelho para quem enxerga e
    // silencioso para quem não enxerga.
    expect(senha).toHaveAttribute('aria-describedby', 'senha-erro');
    expect(document.querySelector('#senha-erro')).toHaveAttribute('role', 'alert');
  });

  it('só o campo de senha é marcado de inválido, e não os outros dois', async () => {
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
  });

  it('a senha volta VAZIA depois de um erro, mas nome e email voltam preenchidos', async () => {
    // pt-BR: o `form.reset` repõe o formulário a partir do estado devolvido pela
    // Action, e a Action devolve a senha vazia de propósito (o estado
    // atravessa a rede até o browser). CUIDADO com o alcance deste teste:
    // ele afirma que o reset COPIA o que recebeu, e como o que chega já vem
    // vazio, ele ficaria verde mesmo sem a barreira do `useEffect` — quem
    // mede que o segredo é apagado no browser é o teste logo abaixo, que
    // entrega o estado COM a senha.
    const action = acaoQue(
      resposta({
        fieldErrors: { email: 'Este email já está cadastrado.' },
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com', senha: '' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'minhaSenhaSecreta');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    // A espera é pela SENHA, e não pelo nome. `Nome` já vale 'Maria Silva'
    // desde o `user.type` acima, então esperá-lo resolve na hora e as linhas
    // seguintes medem o DOM de ANTES do `useEffect` rodar. Medido em
    // 2026-10-13: em 12 repetições, 1 leu o campo com a senha ainda
    // digitada — e foi assim que este teste ficou vermelho no gate, com
    // `minhaSenhaSecreta` no documento. `Senha` começa preenchida e só fica
    // vazia quando o reset passa, então é a âncora que prova que ele rodou.
    await waitFor(() => expect(screen.getByLabelText('Senha')).toHaveValue(''));
    expect(screen.getByLabelText('Nome')).toHaveValue('Maria Silva');
    expect(screen.getByLabelText('Email')).toHaveValue('maria@empresa.com');
  });

  it('a senha NÃO volta preenchida MESMO que o estado venha com ela', async () => {
    // pt-BR: o teste de cima passa `senha: ''` no stub, então ele mede que o
    // reset COPIA o que recebeu — não que ele APAGUE o segredo. Com o valor já
    // vazio na entrada, `toHaveValue('')` ficaria verde mesmo com um
    // `form.reset(estado.valores)` cru, que repõe o que der. Aqui o estado
    // chega COM a senha e a afirmação continua sendo que o campo volta vazio:
    // é a segunda barreira, do lado do browser.
    //
    // Não é hipótese: `valoresSemSegredo` em `app/users/novo/actions.ts` já
    // apaga no servidor, mas a única coisa que segura o segredo dentro do
    // DOM é este `useEffect`. Sem ele, um caminho de erro novo que esqueça de
    // passar por `valoresSemSegredo` repõe a senha na tela — e o `type="password"`
    // só a mascara, continua no DOM.
    const action = acaoQue(
      resposta({
        fieldErrors: { email: 'Este email já está cadastrado.' },
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com', senha: 'minhaSenhaSecreta' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'minhaSenhaSecreta');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    // Mesma âncora do teste acima, e pelo mesmo motivo: `Nome` já está no
    // valor esperado desde o `user.type`, então esperar por ele não exige o
    // reset. Aqui a consequência seria pior — o `for` abaixo vasculha o DOM
    // procurando o segredo, e vasculhar o DOM antes do reset encontra o
    // segredo que ele deveria ter provado estar ausente.
    await waitFor(() => expect(screen.getByLabelText('Senha')).toHaveValue(''));
    expect(screen.getByLabelText('Nome')).toHaveValue('Maria Silva');
    expect(screen.getByLabelText('Email')).toHaveValue('maria@empresa.com');
    // o segredo não pode reaparecer em NENHUM input do formulário
    for (const campo of screen.getAllByRole('textbox')) {
      expect(campo).not.toHaveValue('minhaSenhaSecreta');
    }
  });

  it('a senha digitada não aparece no texto da tela (o campo é password)', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'minhaSenhaSecreta');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    // pt-BR: `type="password"` mascara o valor. Se alguém trocar por
    // `type="text"` o valor SOME do value mas some também deste texto —
    // é a assimetria que faz o teste valer.
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(screen.queryByText(/minhaSenhaSecreta/)).not.toBeInTheDocument();
  });

  it('a senha chega inteira à Action, sem espaço aparado', async () => {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), '  abcdefgh  ');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    // pt-BR: a senha chega CRUA — sem o `.trim()` que nome e email levam. É a
    // diferença entre uma identidade, que tolera normalização, e um segredo,
    // que não tolera. Se um dia alguém repassar a senha por um `.trim()`, o
    // espaço das pontas deixa de participar do que a pessoa digitou.
    const enviado = action.mock.calls[0]?.[1]?.get('senha');
    expect(enviado).toBe('  abcdefgh  ');
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
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
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
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
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
        // pt-BR: `senha: ''` e não a senha digitada. O estado atravessa a
        // rede até o browser, então devolver aqui o que a pessoa escreveu
        // colocaria o segredo no payload da Server Action — no histórico de
        // rede, no DevTools e no log de qualquer proxy no caminho. Ver a
        // justificativa em `app/users/novo/state.ts`.
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com', senha: '' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
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
        // pt-BR: `senha: ''` e não a senha digitada. O estado atravessa a
        // rede até o browser, então devolver aqui o que a pessoa escreveu
        // colocaria o segredo no payload da Server Action — no histórico de
        // rede, no DevTools e no log de qualquer proxy no caminho. Ver a
        // justificativa em `app/users/novo/state.ts`.
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com', senha: '' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('trace-123');
  });

  it('o que a pessoa digitou sobrevive à falha', async () => {
    const action = acaoQue(
      resposta({
        fieldErrors: { email: 'Este email já está cadastrado.' },
        // pt-BR: `senha: ''` e não a senha digitada. O estado atravessa a
        // rede até o browser, então devolver aqui o que a pessoa escreveu
        // colocaria o segredo no payload da Server Action — no histórico de
        // rede, no DevTools e no log de qualquer proxy no caminho. Ver a
        // justificativa em `app/users/novo/state.ts`.
        valores: { nome: 'Maria Silva', email: 'maria@empresa.com', senha: '' },
      }),
    );
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    // Este era o teste mais vazio do arquivo: a âncora era `Nome` valendo
    // 'Maria Silva', o que já era verdade desde o `user.type` — então ele
    // ficava verde com a falha nunca tendo acontecido, que é exatamente o
    // oposto do que o nome promete. Agora ele exige as DUAS coisas que a
    // falha produz: a mensagem de erro na tela e o reset já aplicado.
    await waitFor(() => expect(screen.getByLabelText('Senha')).toHaveValue(''));
    expect(document.querySelector('#email-erro')).not.toBeNull();
    expect(screen.getByLabelText('Nome')).toHaveValue('Maria Silva');
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
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
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
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
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
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('CadastroUsuarioForm — a entrada por convite', () => {
  // pt-BR (onboarding de empresa, 2026-10-21): o token do convite é o que
  // diz que a conta nasce NA empresa que convidou (o `destino` do
  // `POST /users`). Sem ele, a conta nasce sem empresa nenhuma e o funil do
  // login leva a pessoa à página de criação de empresa — o oposto do que o
  // convite pediu.
  const TOKEN = 'a'.repeat(64);

  async function enviarCom(convite?: string) {
    const action = acaoQue(resposta());
    const user = userEvent.setup();
    render(<CadastroUsuarioForm action={action} convite={convite} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('Email'), 'maria@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'senha1234');
    await user.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    return action.mock.calls[0]?.[1];
  }

  it('o token viaja no FormData do cadastro', async () => {
    const enviado = await enviarCom(TOKEN);

    expect(enviado?.get('convite')).toBe(TOKEN);
  });

  it('sem convite, o FormData NÃO leva o campo — a conta nasce sem empresa', async () => {
    const enviado = await enviarCom();

    expect(enviado?.get('convite')).toBeNull();
  });

  it('quem JÁ tem conta recebe a saída para o login — com o token do convite', () => {
    // pt-BR: quem já tem conta e chega pelo link de convite cai NESTA tela.
    // Sem a saída, o caminho é sem volta: o e-mail dela já está cadastrado,
    // o cadastro recusa, e a pessoa não descobre que o que ela precisa é
    // ENTRAR. O token viaja na query porque o login o leva até o aceite.
    render(<CadastroUsuarioForm action={acaoQue(resposta())} convite={TOKEN} />);

    const saida = screen.getByRole('link', { name: 'Já tenho conta' });
    expect(saida).toHaveAttribute('href', `/login?convite=${TOKEN}`);
  });

  it('sem convite, a tela NÃO oferece o login — não há convite a atravessar', () => {
    render(<CadastroUsuarioForm action={acaoQue(resposta())} />);

    expect(screen.queryByRole('link', { name: 'Já tenho conta' })).toBeNull();
  });
});
