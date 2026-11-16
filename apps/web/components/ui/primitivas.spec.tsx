// @vitest-environment jsdom

// apps/web/components/ui/primitivas.spec.tsx
//
// As primitivas do padrão de estilização.
//
// pt-BR: este spec existe porque as primitivas CARREGAM comportamento, não
// só aparência: a fiação de `aria-invalid`/`aria-describedby` do campo, o
// `role` do alerta (que decide se o leitor de tela interrompe a fala) e o
// `scope` do cabeçalho de tabela. Um teste que só confere a classe não
// mede nada disso — e a classe é justamente o que o padrão proíbe.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Alerta } from './alerta';
import { Botao } from './botao';
import { CabecalhoPagina } from './cabecalho-pagina';
import { CabecalhoSecao } from './cabecalho-secao';
import { Campo } from './campo';
import { Container } from './container';
import { EstadoVazio } from './estado-vazio';
import { CabecalhoTabela, CelulaTabela, Tabela } from './tabela';

// pt-BR: o `cleanup` é explícito porque o `vitest.setup.ts` só carrega os
// matchers — a limpeza automática do Testing Library depende de `globals`,
// e o Vitest deste app roda com `globals: false`. Sem o `cleanup`, a DOM do
// teste anterior fica no documento e a consulta seguinte acha DOIS elementos.
afterEach(() => {
  cleanup();
});

describe('Campo', () => {
  it('liga o rótulo ao controle pelo id', () => {
    render(<Campo id="email" rotulo="E-mail" />);

    expect(screen.getByLabelText('E-mail')).toBe(screen.getByRole('textbox'));
  });

  it('sem erro, o campo é `aria-invalid="false"` (e não "true")', () => {
    render(<Campo id="email" rotulo="E-mail" />);

    // O e2e `f4-cadastro-email-duplicado.spec.ts:89` afirma
    // `aria-invalid="false"` no campo sem erro: ausente também passaria, mas
    // "false" é o que o campo tem hoje e o que o leitor de tela espera.
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
  });

  it('com erro, o campo é `aria-invalid="true"` e o erro é `role="alert"`', () => {
    render(<Campo id="email" rotulo="E-mail" erro="Informe o email." />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o email.');
  });

  it('o erro e a dica são os alvos de `aria-describedby`, na ordem erro → dica', () => {
    render(<Campo id="slug" rotulo="Identificador" erro="Inválido." dica="Minúsculo." />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'slug-erro slug-dica');
  });

  it('sem erro e sem dica, `aria-describedby` some', () => {
    render(<Campo id="email" rotulo="E-mail" />);

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
  });

  it('a dica NÃO é `role="alert"` (dica não interrompe a fala)', () => {
    render(<Campo id="slug" rotulo="Identificador" dica="Minúsculo." />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Minúsculo.')).toBeInTheDocument();
  });
});

describe('Botao', () => {
  it('sem `href` é um `<button>`', () => {
    render(<Botao>Salvar</Botao>);

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('com `href` é um link', () => {
    render(<Botao href="/users/novo">Cadastrar usuário</Botao>);

    expect(screen.getByRole('link', { name: 'Cadastrar usuário' })).toHaveAttribute(
      'href',
      '/users/novo',
    );
  });

  it('o `type` e o `disabled` chegam ao `<button>`', () => {
    render(
      <Botao type="submit" disabled>
        Entrando…
      </Botao>,
    );

    const botao = screen.getByRole('button');
    expect(botao).toHaveAttribute('type', 'submit');
    expect(botao).toBeDisabled();
  });
});

describe('Alerta', () => {
  it('erro é `role="alert"` (interrompe a fala)', () => {
    render(<Alerta variante="erro">Não foi possível carregar.</Alerta>);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar.');
  });

  it('sucesso é `role="status"` (não interrompe)', () => {
    render(<Alerta variante="sucesso">Cadastro feito.</Alerta>);

    expect(screen.getByRole('status')).toHaveTextContent('Cadastro feito.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('tabela', () => {
  it('o cabeçalho tem `scope="col"`', () => {
    render(
      <Tabela legenda="Pessoas">
        <thead>
          <tr>
            <CabecalhoTabela>Nome</CabecalhoTabela>
          </tr>
        </thead>
        <tbody>
          <tr>
            <CelulaTabela>Ana</CelulaTabela>
          </tr>
        </tbody>
      </Tabela>,
    );

    expect(screen.getByRole('columnheader', { name: 'Nome' })).toHaveAttribute('scope', 'col');
  });

  it('a legenda vira `<caption>` invisível', () => {
    render(
      <Tabela legenda="Perfis cadastrados">
        <tbody>
          <tr>
            <CelulaTabela>Ana</CelulaTabela>
          </tr>
        </tbody>
      </Tabela>,
    );

    expect(screen.getByRole('table', { name: 'Perfis cadastrados' })).toBeInTheDocument();
  });
});

describe('Container e CabecalhoPagina', () => {
  it('o container é o `<main>` da tela (um por tela)', () => {
    render(
      <Container>
        <p>conteúdo</p>
      </Container>,
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('o cabeçalho tem UM `h1` e a descrição', () => {
    render(<CabecalhoPagina titulo="Usuários" descricao="3 usuários cadastrados" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Usuários');
    expect(screen.getByText('3 usuários cadastrados')).toBeInTheDocument();
  });

  it('a ação vai para a direita do cabeçalho', () => {
    render(<CabecalhoPagina titulo="Usuários" acao={<Botao href="/users/novo">Novo</Botao>} />);

    expect(screen.getByRole('link', { name: 'Novo' })).toBeInTheDocument();
  });
});

describe('CabecalhoSecao', () => {
  it('é o `h2` da tela e o `className` do caller é ADICIONAL', () => {
    render(<CabecalhoSecao className="mt-8">Metadados</CabecalhoSecao>);

    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2).toHaveTextContent('Metadados');
    // O vão do caller ENTRA, e o estilo do título continua o do dono.
    expect(h2.className).toContain('mt-8');
    expect(h2.className).toContain('text-lg');
  });
});

describe('EstadoVazio', () => {
  it('diz o que está vazio, o que fazer e oferece a ação', () => {
    render(
      <EstadoVazio
        titulo="Nenhum usuário cadastrado"
        descricao="Cadastre o primeiro usuário para começar."
        acao={<Botao href="/users/novo">Cadastrar usuário</Botao>}
      />,
    );

    expect(screen.getByText('Nenhum usuário cadastrado')).toBeInTheDocument();
    expect(screen.getByText('Cadastre o primeiro usuário para começar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar usuário' })).toBeInTheDocument();
  });
});
