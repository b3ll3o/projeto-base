// apps/web/components/login-form.spec.tsx
//
// Teste de comportamento do formulário de login: o que a pessoa que usa a
// tela enxerga e consegue fazer.
//
// pt-BR: a Action entra por prop (`action`) em vez de ser importada direto
// dentro do componente — o mesmo padrão do `CadastroUsuarioForm`, e pelo
// mesmo motivo (é o padrão suportado pelo Next para Server Action em Client
// Component, e é o que torna a tela testável sem rede).
//
// pt-BR (a consulta de alerta, que é o detalhe não óbvio deste arquivo):
// os `role="alert"` são buscados com `within(form)`, e NÃO com
// `screen.getByRole('alert')`. No browser, a consulta de página inteira
// devolve três elementos — o do formulário, um vazio e a live-region do
// Next Dev Tools — e `getByRole` estoura em "achou mais de um". No jsdom o
// Dev Tools não existe, então a consulta de página funcionaria e o teste
// passaria verde enquanto o e2e da mesma tela quebraria. Escopar no
// formulário é o que mantém o teste e o browser falando do mesmo objeto.
//
// Roda em jsdom: precisa de DOM de verdade (labels, foco, aria).

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';
import { LOGIN_INICIAL, type LoginState } from '@/app/login/state';

function resposta(over: Partial<LoginState> = {}): LoginState {
  return { ...LOGIN_INICIAL, ...over };
}

function acaoQue(estado: LoginState | Promise<LoginState>) {
  // pt-BR: os dois parâmetros são declarados de propósito — sem eles o
  // `useActionState` tipa `mock.calls` como tupla de comprimento 0 e o
  // teste que precisa LER o FormData enviado não compila.
  return vi.fn(async (_estado: LoginState, _formData: FormData) => estado);
}

/** O `<form>` da tela — o escopo de toda consulta a `role="alert"`. */
function formDaTela(): HTMLElement {
  const form = document.querySelector('form');
  if (!form) throw new Error('a tela não renderizou um <form>');
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// pt-BR: o projeto NÃO usa `globals: true`, então o Testing Library não
// registra o cleanup automático. Sem este `cleanup` explícito o DOM
// acumulado faz a consulta seguinte achar DOIS elementos — erro que parece
// defeito do componente e é sujo de teste.
afterEach(() => {
  cleanup();
});

describe('LoginForm — rótulos e campos', () => {
  it('cada campo tem um rótulo que o identifica (não só um placeholder)', () => {
    render(<LoginForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('E-mail')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Senha')).toBeInstanceOf(HTMLInputElement);
  });

  it('o e-mail é digitado no tipo certo', () => {
    render(<LoginForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
  });

  it('a senha é um campo de senha — nunca texto puro', () => {
    render(<LoginForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  it('a senha usa autoComplete "current-password", não "new-password"', async () => {
    // pt-BR: é o valor que faz o gerenciador de senhas PREENCHER o campo
    // em vez de OFERECER GERAR uma. Num campo de entrada, `new-password`
    // faria o Chrome sugerir uma senha nova para quem está tentando
    // entrar — a microcopy do atributo está errada e o efeito é visível.
    render(<LoginForm action={acaoQue(resposta())} />);

    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
  });
});

describe('LoginForm — saída para quem não tem conta', () => {
  // pt-BR (2026-10-13): este link era o ÚNICO elemento interativo da tela sem
  // nenhum teste. Ele é a saída para quem ainda não tem conta, e sair é
  // justamente o caminho que uma tela de recusa precisa exercitar.
  //
  // O `href` é literal aqui de propósito: este teste fixa para ONDE a tela
  // manda quem quer se cadastrar. Fixar o destino é o que impede tanto a
  // remoção silenciosa (quem não tem conta ficaria sem saída) quanto a troca de
  // destino sem revisão.
  //
  // ⚠️ Este comentário dizia, até 2026-10-13, que "`/users/novo` é uma rota que
  // `exigirSessao()` protege" e chamava isso de tensão visível no código. A
  // frase era falsa — e a tensão tinha sido resolvida de propósito, no commit
  // `209d5a8`, removendo a exigência da tela de cadastro. Com ela no lugar, o
  // link "Criar conta" levava ao cadastro, o cadastro voltava ao login, e o
  // login oferecia de novo "Criar conta": em produção **ninguém conseguia
  // criar a primeira conta** pela interface, porque `POST /users` é o único
  // jeito de criar usuário e não há seed. Quem lesse o comentário hoje
  // concluiria que a tela ainda é protegida, e reintroduziria o beco.
  //
  // O F8 é quem segura essa decisão com uma medição: ele afirma as duas
  // metades — `/users` leva ao login, `/users/novo` é alcançável — porque
  // uma metade sozinha passaria com o produto inteiro do avesso.
  it('oferece um caminho para criar conta, e ele vai para /users/novo', () => {
    render(<LoginForm action={acaoQue(resposta())} />);

    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/users/novo',
    );
  });
});

describe('LoginForm — envio', () => {
  it('com par válido, despacha a Action com email e senha', async () => {
    const action = acaoQue(resposta());
    const pessoa = userEvent.setup();
    render(<LoginForm action={action} />);

    await pessoa.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'segredo123');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const enviado = action.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('email')).toBe('maria@empresa.com');
    expect(enviado.get('senha')).toBe('segredo123');
  });

  it('campo inválido NÃO despacha a Action', async () => {
    // pt-BR: é este teste que segura a decisão de não ter `action={fn}`
    // no `<form>`. Com o atributo, o pedido sairia mesmo com validação
    // local, e o formulário perderia a única barreira que ele tem.
    const action = acaoQue(resposta());
    const pessoa = userEvent.setup();
    render(<LoginForm action={action} />);

    await pessoa.type(screen.getByLabelText('E-mail'), 'nao-e-email');
    await pessoa.type(screen.getByLabelText('Senha'), 'segredo123');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() =>
      expect(within(formDaTela()).getAllByRole('alert').length).toBeGreaterThan(0),
    );
    expect(action).not.toHaveBeenCalled();
  });

  it('o erro de validação local fica ANNCORADO no campo que está errado', async () => {
    const pessoa = userEvent.setup();
    render(<LoginForm action={acaoQue(resposta())} />);

    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    const email = screen.getByLabelText('E-mail');
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    // pt-BR: `aria-describedby` é o que LIGA o campo à mensagem. Sem ele a
    // pessoa que usa leitor de tela ouve "campo inválido" e nunca recebe
    // o texto que diz como corrigir.
    expect(email).toHaveAttribute('aria-describedby', 'email-erro');
  });

  it('a pessoa precisa redigitar a senha depois do erro — o campo volta vazio', async () => {
    // pt-BR: o preço de não devolver o segredo. O stub devolve EXATAMENTE o
    // que a Action devolve — e-mail de volta, senha vazia. Devolver aqui um
    // estado com a senha preenchida faria este teste passar por um motivo
    // errado (ele veria '' e concluiria que o reset funcionou, sem nunca
    // ter provado que o reset APAGOU o que estava no campo).
    const pessoa = userEvent.setup();
    render(
      <LoginForm
        action={acaoQue(
          resposta({
            formError: 'E-mail ou senha incorretos.',
            valores: { email: 'maria@empresa.com', senha: '' },
          }),
        )}
      />,
    );

    await pessoa.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'segredo123');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    // ⚠️ Aqui o `waitFor` NÃO é vácuo: no instante da asserção o campo tem
    // 'segredo123', então a condição só fica verdadeira quando o reset
    // roda. É o que distingue este teste do de e-mail, abaixo.
    await waitFor(() => expect(screen.getByLabelText('Senha')).toHaveValue(''));
  });

  it('o e-mail é REPOPULADO com o que a Action devolveu — não é o que sobrou do que foi digitado', async () => {
    // ⚠️ Este teste era VACUOSO até 2026-10-13. A versão anterior digitava
    // `maria@empresa.com` e depois esperava o campo ter `maria@empresa.com`
    // — condição verdadeira ANTES do round-trip, porque o próprio teste
    // tinha digitado aquilo. O `waitFor` resolvia no primeiro poll e o
    // teste ficava verde com o `form.reset` totalmente removido do
    // componente: ele provava que o campo guardava o que estava nele, que
    // é a propriedade mais banal possível de um input.
    //
    // A correção é trocar o valor de origem: o campo começa com
    // `digitado-errado@…` e a Action devolve `maria@…`. Só o reset pode
    // produzir essa troca, então agora o teste tem dente.
    const pessoa = userEvent.setup();
    render(
      <LoginForm
        action={acaoQue(
          resposta({
            formError: 'E-mail ou senha incorretos.',
            valores: { email: 'maria@empresa.com', senha: '' },
          }),
        )}
      />,
    );

    await pessoa.type(screen.getByLabelText('E-mail'), 'digitado-errado@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'segredo123');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByLabelText('E-mail')).toHaveValue('maria@empresa.com'));
  });
});

describe('LoginForm — o erro genérico de credencial', () => {
  it('aparece num alerta dentro do formulário, com a mensagem que a pessoa lê', async () => {
    const pessoa = userEvent.setup();
    render(<LoginForm action={acaoQue(resposta({ formError: 'E-mail ou senha incorretos.' }))} />);

    await pessoa.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'errada');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    // ⚠️ `waitFor` aqui, e a asserção DIRETA que ele substitui era um flake.
    // `pessoa.click()` resolve no DESPACHO: o `useActionState` ainda tem que
    // resolver a Action e o React tem que renderizar o estado novo, e nada
    // disso está dentro do `await`. Sem a espera, `getAllByRole('alert')`
    // consulta um form que ainda não tem alerta — e o erro que ela levanta é
    // "não encontrou", que parece teste quebrado e não é.
    // MEDIDO 2026-10-20: este caso caiu 1 vez em ~15 execuções do
    // `test:coverage` do web, só quando a suíte rodava sob carga (turbo
    // disparando as 11 tasks do gate em paralelo). Os outros dois casos que
    // consultam o MESMO `role="alert"` (linhas 153 e 334) já usavam
    // `waitFor` — este era o único sem ele.
    await waitFor(() =>
      expect(within(formDaTela()).getAllByRole('alert').length).toBeGreaterThan(0),
    );
    const alertas = within(formDaTela()).getAllByRole('alert');
    expect(alertas.map((a) => a.textContent)).toContain('E-mail ou senha incorretos.');
  });

  it('o erro de credencial NÃO marca nenhum campo — a tela não diz qual falhou', async () => {
    // pt-BR: este é o teste que fecha a enumeração de contas no lado do
    // cliente. Marcar `email` em vermelho seria a mesma informação que a
    // API se recusa a dar, entregue só porque o desenho ficou bonito.
    const pessoa = userEvent.setup();
    render(<LoginForm action={acaoQue(resposta({ formError: 'E-mail ou senha incorretos.' }))} />);

    await pessoa.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'errada');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(within(formDaTela()).getAllByRole('alert').length).toBe(1));
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'false');
  });

  it('sem erro, a tela não mostra nenhum alerta', () => {
    render(<LoginForm action={acaoQue(resposta())} />);

    expect(within(formDaTela()).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LoginForm — envio em andamento', () => {
  it('o botão desabilita e o texto muda, para o envio não valer duas vezes', async () => {
    // pt-BR: um duplo clique em "Entrar" dispararia DUAS tentativas de
    // login e dois cookies — e o segundo sobrescreveria o primeiro sem que
    // ninguém percebesse.
    let liberar!: () => void;
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const action = vi.fn(async (_e: LoginState, _f: FormData) => {
      await pendente;
      return resposta();
    });
    const pessoa = userEvent.setup();
    render(<LoginForm action={action} />);

    await pessoa.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'segredo123');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    const botao = await screen.findByRole('button', { name: /Entrando/ });
    expect(botao).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeDisabled();

    liberar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
  });
});

describe('LoginForm — o aviso de "cadastro concluído"', () => {
  it('aparece quando a página entrega o aviso, em `role="status"`', () => {
    // ⚠️ `status` e NÃO `alert`: o aviso é uma confirmação, e `alert` é
    // `assertive` — interrompe a fala de quem usa leitor de tela no meio
    // do que já estava sendo anunciado.
    render(<LoginForm action={acaoQue(resposta())} aviso="Cadastro feito." />);

    expect(screen.getByRole('status')).toHaveTextContent('Cadastro feito.');
  });

  it('NÃO aparece sem o prop — o login comum não ganha um aviso que não explica nada', () => {
    render(<LoginForm action={acaoQue(resposta())} />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('o aviso NÃO é anunciado como erro, e o erro NÃO é anunciado como aviso', async () => {
    // ⚠️ Os dois convivem na mesma tela depois de um erro de credencial
    // numa visita que veio do cadastro. Um nó com os DOIS papéis seria
    // lido duas vezes, e por leitor de tela a segunda leitura chega na
    // cor errada.
    //
    // O `formError` só existe DEPOIS do envio — `acaoQue` devolve o estado
    // da resposta, não o inicial. Renderizar e consultar direto acharia
    // zero `alert` e o teste falharia sem que houvesse defeito.
    const pessoa = userEvent.setup();
    render(
      <LoginForm
        action={acaoQue(resposta({ formError: 'E-mail ou senha incorretos.' }))}
        aviso="Cadastro feito."
      />,
    );

    await pessoa.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'errada');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(within(formDaTela()).getAllByRole('alert')).toHaveLength(1));
    expect(within(formDaTela()).getByRole('status')).toHaveTextContent('Cadastro feito.');
    expect(within(formDaTela()).getByRole('alert')).toHaveTextContent(
      'E-mail ou senha incorretos.',
    );
  });
});
