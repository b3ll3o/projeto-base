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
import { LinkTexto } from './link-texto';
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
    // ⚠️ A TAG, e não só a role: um `<div role="button">` passaria na
    // asserção da role (MEDIDO 2026-11-16, revisão do PR #168). O que
    // diferencia o botão de verdade é ser `<button>` — e `<button>` tem
    // `type`, o que a §4 do HTML usa para decidir se ele submete o form.
    expect(screen.getByRole('button', { name: 'Salvar' }).tagName).toBe('BUTTON');
  });

  it('sem `type` explícito, o `<button>` é `type="button"` (não submete o form)', () => {
    render(<Botao>Cancelar</Botao>);

    // ⚠️ No HTML, `<button>` sem `type` dentro de um `<form>` é `submit` — e
    // um "Cancelar" disparava a mutação. O default é `button`, e quem quer
    // submeter escreve `type="submit"` (MEDIDO 2026-11-16).
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('type', 'button');
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

  it('a REGIÃO ROLÁVEL é alcançável por teclado e tem nome acessível', () => {
    render(
      <Tabela legenda="Histórico de Ana, da mais antiga para a mais recente">
        <tbody>
          <tr>
            <CelulaTabela>Ana</CelulaTabela>
          </tr>
        </tbody>
      </Tabela>,
    );

    // ⚠️ O `tabIndex` é o que torna a região rolável alcançável por teclado
    // no Firefox e no Safari (o Chromium já a focava por padrão) — e sem ele,
    // as colunas que ficam FORA da tela a 320px eram inalcançáveis.
    const regiao = screen.getByRole('region', { name: /Histórico de Ana/ });
    expect(regiao).toHaveAttribute('tabindex', '0');
    expect(regiao.className).toContain('overflow-x-auto');
  });

  it('a célula que guarda dado longo NÃO pode estourar a largura da tabela', () => {
    render(
      <Tabela legenda="Pessoas">
        <tbody>
          <tr>
            <CelulaTabela className="w-48">{'a'.repeat(254)}</CelulaTabela>
          </tr>
        </tbody>
      </Tabela>,
    );

    // ⚠️ `wrap-anywhere` (e não `break-word`): o `break-word` NÃO reduz a
    // contribuição min-content de uma célula — MEDIDO, a tabela media os
    // mesmos 2.097px com e sem ele. E a largura fixa é o que fecha o
    // transbordo; a primitiva não a impõe, porque não sabe o que a célula
    // guarda.
    const celula = screen.getByRole('cell');
    expect(celula.className).toContain('wrap-anywhere');
    expect(celula.className).not.toContain('break-words');
    expect(celula.className).toContain('w-48');
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

    // ⚠️ O `<caption>` E a classe `sr-only` — e não só o nome acessível: um
    // `<div aria-label>` também daria nome à tabela, e o rótulo tem que ser
    // o `<caption>` (MEDIDO 2026-11-16, revisão do PR #168).
    const legenda = screen
      .getByRole('table', { name: 'Perfis cadastrados' })
      .querySelector('caption');
    expect(legenda).not.toBeNull();
    expect(legenda).toHaveTextContent('Perfis cadastrados');
    expect(legenda?.className).toContain('sr-only');
  });
});

describe('LinkTexto', () => {
  it('é um link com nome acessível, anel de foco e alvo mínimo', () => {
    render(<LinkTexto href="/login">Criar conta</LinkTexto>);

    const link = screen.getByRole('link', { name: 'Criar conta' });
    expect(link).toHaveAttribute('href', '/login');
    // O foco é o utilitário `foco` do padrão — sem ele, a tela tem dois
    // sistemas de foco (o anel do browser e o anel do padrão).
    expect(link.className).toContain('foco');
    // `min-h-6` é o alvo mínimo de 24px da WCAG 2.5.8 (MEDIDO 2026-11-16).
    expect(link.className).toContain('min-h-6');
  });

  it('o `className` do caller é ADICIONAL', () => {
    render(
      <LinkTexto href="/login" className="mt-8">
        Criar conta
      </LinkTexto>,
    );

    const link = screen.getByRole('link', { name: 'Criar conta' });
    expect(link.className).toContain('mt-8');
    expect(link.className).toContain('text-muted-foreground');
  });
});

/**
 * O `className` do caller é ADICIONAL em TODA primitiva que o aceita.
 *
 * ⚠️ MEDIDO 2026-11-16 (revisão do PR #168): a fiação só tinha teste em 1 das
 * 6 primitivas que aceitam `className` — e os ramos de `alerta.tsx`,
 * `tabela.tsx` (3×) e `link-texto.tsx` seguiam DESCOBERTOS. A regressão que
 * o PR corrigiu (o `className` como substitutor) voltaria sem aviso.
 */
describe('o className do caller entra em TODA primitiva que o aceita', () => {
  const casos: {
    nome: string;
    render: () => HTMLElement;
    donoDaClasse: string;
    classeDoCaller: string;
  }[] = [
    {
      nome: 'Alerta',
      render: () => {
        render(
          <Alerta variante="erro" className="mt-4">
            Falhou.
          </Alerta>,
        );
        return screen.getByRole('alert');
      },
      donoDaClasse: 'text-destructive',
      classeDoCaller: 'mt-4',
    },
    {
      nome: 'CabecalhoSecao',
      render: () => {
        render(<CabecalhoSecao className="mt-8">Metadados</CabecalhoSecao>);
        return screen.getByRole('heading', { level: 2 });
      },
      donoDaClasse: 'text-lg',
      classeDoCaller: 'mt-8',
    },
    {
      nome: 'LinkTexto',
      render: () => {
        render(
          <LinkTexto href="/login" className="mt-6">
            Criar conta
          </LinkTexto>,
        );
        return screen.getByRole('link', { name: 'Criar conta' });
      },
      donoDaClasse: 'text-muted-foreground',
      classeDoCaller: 'mt-6',
    },
    {
      nome: 'Tabela',
      render: () => {
        render(
          <Tabela legenda="Pessoas" className="mt-2">
            <tbody>
              <tr>
                <CelulaTabela>Ana</CelulaTabela>
              </tr>
            </tbody>
          </Tabela>,
        );
        return screen.getByRole('table');
      },
      donoDaClasse: 'border-collapse',
      classeDoCaller: 'mt-2',
    },
    {
      nome: 'CabecalhoTabela',
      render: () => {
        render(
          <Tabela legenda="Pessoas">
            <thead>
              <tr>
                <CabecalhoTabela className="w-10">Nome</CabecalhoTabela>
              </tr>
            </thead>
          </Tabela>,
        );
        return screen.getByRole('columnheader', { name: 'Nome' });
      },
      donoDaClasse: 'font-medium',
      classeDoCaller: 'w-10',
    },
    {
      nome: 'CelulaTabela',
      render: () => {
        render(
          <Tabela legenda="Pessoas">
            <tbody>
              <tr>
                <CelulaTabela className="w-24">Ana</CelulaTabela>
              </tr>
            </tbody>
          </Tabela>,
        );
        return screen.getByRole('cell', { name: 'Ana' });
      },
      donoDaClasse: 'wrap-anywhere',
      classeDoCaller: 'w-24',
    },
  ];

  it.each(casos)('$nome: a classe do DONO continua E a do caller ENTRA (não substitui)', (caso) => {
    const elemento = caso.render();
    expect(elemento.className).toContain(caso.donoDaClasse);
    expect(elemento.className).toContain(caso.classeDoCaller);
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
