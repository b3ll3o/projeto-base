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

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import LoginPage from './page';
import { AVISO_CADASTRO_CONCLUIDO, PARAM_CADASTRO_CONCLUIDO } from './state';

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
