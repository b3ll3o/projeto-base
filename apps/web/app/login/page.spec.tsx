// apps/web/app/login/page.spec.tsx
//
// Teste da tela de login como página: o que a query string faz com ela.
//
// pt-BR: existe porque o defeito que este arquivo cobre era SILENSO. A tela
// recebia `?cadastrado=1`, não fazia nada com isso, e aparecia igual — sem
// nenhum sinal visível de que o parâmetro estava ali. O teste do
// `LoginForm` (`components/login-form.spec.tsx`) prova que ele SABE
// mostrar um aviso; este prova que a página LHE ENTREGA o aviso. São as
// duas metades de um cable, e cada uma verde não diz nada sobre a outra.
//
// ⚠️ `next/navigation` é mockado pelo mesmo motivo do spec do cadastro: o
// `redirect` real lança `NEXT_REDIRECT`, e o componente que ele arrastaria
// junto é a Server Action de login. Aqui nada navega.

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// pt-BR (onboarding de empresa, 2026-10-21): a Action de login é mockada
// porque o que este spec mede é o CABO entre a página e o formulário — a
// página LÊ a query string e ENTREGA o token. Com a Action real, o envio
// sairia para a rede; mockada, o `FormData` chega no `mock.calls` e o token
// pode ser conferido.
//
// ⚠️ O estado devolvido é literal, e não `LOGIN_INICIAL`: a fábrica do
// `vi.mock` é içada para o topo do arquivo e não pode ler importações de
// fora — o `LOGIN_INICIAL` ainda estaria no tempo de execução da ligação.
vi.mock('./actions', () => ({
  entrar: vi.fn(async (_estado: unknown, _formData: FormData) => ({
    ok: false,
    fieldErrors: {},
    formError: null,
    valores: { email: '', senha: '' },
  })),
}));

import LoginPage from './page';
import { entrar } from './actions';
import {
  AVISO_CADASTRO_CONCLUIDO,
  AVISO_EMPRESA_PENDENTE,
  PARAM_CADASTRO_CONCLUIDO,
  PARAM_EMPRESA_PENDENTE,
} from './state';
import { PARAM_CONVITE } from '@/lib/convite-schema';

async function renderCom(params: Record<string, string | string[] | undefined>) {
  render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

// pt-BR: o projeto não usa `globals: true`, então o Testing Library não
// registra o cleanup automático. Sem isto, o DOM acumulado faz o terceiro
// e o quarto teste acharem DOIS elementos com `role="status"` — e a falha
// parece um defeito da página quando é sujeira de teste.
afterEach(() => {
  cleanup();
});

// pt-BR: as chamadas da Action mockada ACUMULAM entre os testes, e o
// `mock.calls[0]` do segundo teste seria a chamada do PRIMEIRO. Medido:
// os dois casos "o convite NÃO é entregue" liam o token do caso anterior e
// falhavam com um token de 64 hex que ninguém tinha passado. `clearAllMocks`
// limpa as chamadas e preserva a implementação — que é o que o `vi.mock`
// instalou.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage — o aviso de cadastro concluído', () => {
  it('com o param de cadastro, mostra a confirmação que explica o próximo passo', async () => {
    await renderCom({ [PARAM_CADASTRO_CONCLUIDO]: '1' });

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent(AVISO_CADASTRO_CONCLUIDO);
  });

  it('sem o param, NÃO mostra nada — o login comum continua limpo', async () => {
    // ⚠️ A asserção é por AUSÊNCIA (`queryByRole` retorna `null`), e não por
    // texto: um aviso fixo sempre presente ensinaria a pessoa a ler a tela
    // sem olhar, que é o oposto do que um aviso de sucesso quer.
    await renderCom({});

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('aceita o param com QUALQUER valor — a query não é um dado, é um sinal', async () => {
    // `?cadastrado=` e `?cadastrado=0` não são "cadastro não concluído":
    // o sinal é a PRESENÇA da chave. Um teste que exigisse o valor '1'
    // passaria, e um bug que escrevesse `0` passaria também.
    await renderCom({ [PARAM_CADASTRO_CONCLUIDO]: '' });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('param duplicado (chega como array) também mostra — o aviso não some em silêncio', async () => {
    // `?cadastrado=1&cadastrado=2` chega como `string[]` no Next. Comparar
    // array com string nunca dá verdadeiro, e o resultado do bug seria um
    // `undefined` silencioso — o aviso SOME, que é pior do que aparecer
    // errado porque ninguém percebe que o caminho de erro existe.
    await renderCom({ [PARAM_CADASTRO_CONCLUIDO]: ['1', '2'] });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('LoginPage — o aviso de empresa pendente', () => {
  it('com o param de empresa, mostra que a sessão venceu antes da empresa', async () => {
    // pt-BR: sem este aviso, a pessoa que preenchia o formulário de criação
    // de empresa era levada ao login sem explicação, entrava, e voltava para
    // `/empresa/nova` com o formulário vazio — sem saber o que tinha
    // acontecido. É o mesmo "beco sem saída de dois saltos" que o
    // `?cadastrado=1` já resolve no cadastro.
    await renderCom({ [PARAM_EMPRESA_PENDENTE]: '1' });

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent(AVISO_EMPRESA_PENDENTE);
  });

  it('o aviso da empresa PENDENTE tem prioridade sobre o do cadastro', async () => {
    // Os dois sinais nunca juntos na prática, e a ordem é uma decisão: o da
    // empresa pendente é o mais acionável — a pessoa sabe exatamente o que
    // fazer depois de entrar, e é ele que a traz de volta para `/empresa/nova`.
    await renderCom({
      [PARAM_EMPRESA_PENDENTE]: '1',
      [PARAM_CADASTRO_CONCLUIDO]: '1',
    });

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent(AVISO_EMPRESA_PENDENTE);
    expect(aviso).not.toHaveTextContent(AVISO_CADASTRO_CONCLUIDO);
  });
});

describe('LoginPage — o token do convite', () => {
  // pt-BR (onboarding de empresa, 2026-10-21): a sessão vence em 15 min, e o
  // aceite do convite devolve 401 quando isso acontece. O token do convite
  // viaja na query string porque o CONVITE É uma URL — e é por isso que ele
  // precisa sobreviver ao login: sem ele, a pessoa entra sem convite nenhum,
  // o funil pergunta "qual empresa?" e a responde `/empresa/nova`, porque o
  // convite AINDA NÃO foi aceito e a conta não tem membership nenhuma.
  const TOKEN = 'c'.repeat(64);

  async function enviar(params: Record<string, string | string[] | undefined>) {
    await renderCom(params);

    const pessoa = userEvent.setup();
    await pessoa.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await pessoa.type(screen.getByLabelText('Senha'), 'segredo123');
    await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(vi.mocked(entrar)).toHaveBeenCalled());
    return vi.mocked(entrar).mock.calls[0]?.[1];
  }

  it('entrega o token do convite ao formulário — é o que o faz sobreviver ao login', async () => {
    const enviado = await enviar({ [PARAM_CONVITE]: TOKEN });

    expect(enviado?.get('convite')).toBe(TOKEN);
  });

  it('token com formato errado NÃO é entregue — a query string é entrada de usuário', async () => {
    // pt-BR: a validação do formato é o que impede um token adulterado de
    // escolher a rota. A página recusa antes de entregar, e a Action valida
    // de novo (o `FormData` não é fronteira de confiança).
    const enviado = await enviar({ [PARAM_CONVITE]: 'token-adulterado' });

    expect(enviado?.get('convite')).toBeNull();
  });

  it('sem o param, o formulário NÃO recebe convite nenhum', async () => {
    const enviado = await enviar({});

    expect(enviado?.get('convite')).toBeNull();
  });
});
