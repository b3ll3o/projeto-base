// apps/web/app/users/[id]/page.spec.tsx
//
// O FURO que este spec fecha: trocar `exigirAdminDoSistema()` por
// `exigirAdmin()` no detalhe do usuário deixaria a suíte INTEIRA verde e a
// tela errada — o `isAdmin` do DONO é `true` em toda empresa nova, então o
// gerente de empresa passaria pelo guard e veria as empresas de uma pessoa,
// que a API recusa por D2.
//
// É o mesmo furo que `app/admin/tenancy/page.spec.tsx` fecha, do outro lado: as
// DUAS telas do admin do sistema leem o bucket GLOBAL, e nenhuma spec ligava
// essa escolha ao ponto de chamada.
//
// ⚠️ O INVENTÁRIO é UMA LEITURA: a página lê a sessão UMA vez
// (`exigirSessao`), manda o mesmo token para o guard E para a leitura do
// inventário, e uma leitura que falha cai na tela de "Serviço indisponível" —
// e não sobe como erro genérico do `app/error.tsx`, que não oferece retry.
//
// ⚠️ O HISTÓRICO é a SEGUNDA LEITURA, e ela é de outra categoria: o histórico
// é SECUNDÁRIO (a pessoa e as empresas são o conteúdo principal). A falha
// dele NÃO pode derrubar a tela — ela vira um `Alerta` dentro da seção. E o
// `401` é sessão expirada: vai para o login, como o de qualquer outra
// leitura.
//
// A página é RSC e está fora do denominador de cobertura
// (`vitest.config.ts`: `app/**/*.tsx`), e o `next build` só a compila. Este
// spec não muda essa decisão — ele fixa a ESCOLHA do guard, que é a única
// coisa que nenhum outro arquivo fixa.

// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ApiError } from '../../../lib/api-client';

const exigirAdminDoSistema = vi.fn();
const exigirAdmin = vi.fn();
const listarInventario = vi.fn();
const listarHistoricoDoUsuario = vi.fn();
const exigirSessao = vi.fn();

/** O corpo RFC 7807 de um erro da API — o que o `ApiError` carrega. */
const PROBLEMA = {
  type: 'about:blank',
  title: 'erro',
  status: 401,
  detail: 'detalhe',
  instance: '/admin/tenancy',
  code: 'ERRO',
  traceId: 'trace-1',
};

/**
 * O `snapshot` de uma versão — o `UserOutputDto` da pessoa NAQUELE momento.
 *
 * ⚠️ O NOME é o que a tela mostra: o histórico é a TRAILHA de VERSÕES, e cada
 * linha tem o nome e o e-mail deQUANDO aquela versão foi gravada — não o de
 * hoje. Um snapshot com o nome de hoje não provaria nada.
 */
const SNAPSHOT_ANTIGO = {
  id: 'u1',
  nome: 'Nome Antigo',
  email: 'antigo@exemplo.dev',
  profileId: null,
  version: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  deletedAt: null,
  isDeleted: false,
};

const SNAPSHOT_NOVO = {
  ...SNAPSHOT_ANTIGO,
  nome: 'Nome Novo',
  email: 'novo@exemplo.dev',
  version: 2,
};

/**
 * DUAS entradas: a CRIAÇÃO (sem ator — a rota de cadastro é pública) e a
 * ALTERAÇÃO (com ator — e o ator é a própria pessoa, que está no
 * inventário).
 */
const HISTORICO = {
  entries: [
    {
      entityId: 'u1',
      version: 1,
      previousVersion: null,
      operation: 'INSERT' as const,
      snapshot: SNAPSHOT_ANTIGO,
      changedAt: '2026-11-01T10:00:00.000Z',
      changedBy: null,
      reason: null,
    },
    {
      entityId: 'u1',
      version: 2,
      previousVersion: 1,
      operation: 'UPDATE' as const,
      snapshot: SNAPSHOT_NOVO,
      changedAt: '2026-11-02T12:30:00.000Z',
      changedBy: 'u1',
      // ⚠️ `reason: null` — o valor HONESTO: `users_history.reason` é sempre
      // `null` (o `DELETE` fixa `reason: null` e o `extractReason` só devolve
      // reason no evento `.deleted.v1`). Uma fixture com um motivo inventado
      // provaria um estado que a API não produz — e o spec passaria mesmo se a
      // tela não soubesse mostrar o motivo.
      reason: null,
    },
  ],
  nextCursor: null,
};

// ⚠️ `../../admin/guard-admin` e NÃO `../../../app/admin/guard-admin`: o
// caminho relativo é o que resolve o MESMO arquivo que a página importa, e um
// caminho que não resolve não dá erro — o Vitest registra o mock sob uma
// chave que ninguém importa, a página usa o guard VERDADEIRO, e o spec falha
// sem dizer por quê.
//
// ⚠️ E o mock é PARCIAL: `ServicoIndisponivel` é o VERDADEIRO. A tela de
// "Serviço indisponível" é do `guard-admin.tsx`, e um dublê escreveria o texto
// que a PRODUÇÃO escreve — o spec passaria com o texto errado em produção.
vi.mock('../../admin/guard-admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../admin/guard-admin')>();
  return {
    ...real,
    exigirAdminDoSistema: (accessToken?: string) => exigirAdminDoSistema(accessToken),
    exigirAdmin: () => exigirAdmin(),
  };
});
// ⚠️ A sessão é lida PELA PÁGINA (`exigirSessao`), e é ela que entrega o
// token ao guard e à leitura do inventário. `lerTenant`/`lerTokens` estão
// aqui porque o `guard-admin.tsx` VERDADEIRO importa `lib/perfil.ts`, que os
// usa — e o mock é por MÓDULO resolvido.
vi.mock('../../../lib/sessao', () => ({
  exigirSessao: () => exigirSessao(),
  lerTenant: vi.fn(async (): Promise<string | null> => null),
  lerTokens: vi.fn(async () => ({ accessToken: 'token-admin', refreshToken: null })),
}));
// ⚠️ O mock é PARCIAL por um motivo que apareceu depois: `vinculo` (o rótulo
// `papel · perfil`) passou a MORAR em `lib/tenancy.ts` — e um mock que só
// devolvesse `listarInventario` deixaria `vinculo` como `undefined`, e a
// página quebraria ao renderizar o card.
vi.mock('../../../lib/tenancy', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/tenancy')>();
  return {
    ...real,
    listarInventario: (accessToken: string) => listarInventario(accessToken),
    listarHistoricoDoUsuario: (accessToken: string, id: string, cursor?: string) =>
      listarHistoricoDoUsuario(accessToken, id, cursor),
  };
});

const { default: Page } = await import('./page');

/** Os params da rota — `id` é o UUID da pessoa. */
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('users/[id] — o detalhe do usuário usa o guard do ADMINISTRADOR DO SISTEMA', () => {
  beforeEach(() => {
    exigirAdminDoSistema.mockReset();
    exigirAdmin.mockReset();
    listarInventario.mockReset().mockResolvedValue({
      empresas: [],
      usuarios: [
        {
          id: 'u1',
          nome: 'Dona Da Empresa',
          email: 'dona@exemplo.dev',
          empresas: [{ id: 'e1', nome: 'Acme', slug: 'acme', role: 'gerente', perfil: 'gerente' }],
        },
      ],
    });
    listarHistoricoDoUsuario.mockReset().mockResolvedValue(HISTORICO);
    exigirSessao.mockReset().mockResolvedValue('token-admin');
    // As DUAS funções devolvem o MESMO veredito de "liberado": um spec que só
    // afirmasse "a página renderizou" passaria nas duas — o que dá o dente ao
    // simétrico abaixo.
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
    exigirAdmin.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
  });

  // O projeto não usa `globals: true`: sem `cleanup`, o DOM acumulado faz o
  // segundo teste achar o heading do primeiro.
  afterEach(() => {
    cleanup();
  });

  it('chama `exigirAdminDoSistema()` e NUNCA `exigirAdmin()`', async () => {
    await Page(params('u1'));

    expect(exigirAdminDoSistema).toHaveBeenCalledTimes(1);
    expect(exigirAdmin).not.toHaveBeenCalled();
  });

  it('manda o MESMO token para o guard e para a leitura — a sessão é lida UMA vez', async () => {
    await Page(params('u1'));

    expect(exigirSessao).toHaveBeenCalledTimes(1);
    expect(exigirAdminDoSistema).toHaveBeenCalledWith('token-admin');
    expect(listarInventario).toHaveBeenCalledWith('token-admin');
    // E o histórico leva o MESMO token — é a mesma sessão, e um token
    // diferente seria a segunda leitura sem sessão.
    expect(listarHistoricoDoUsuario).toHaveBeenCalledWith('token-admin', 'u1', undefined);
  });

  it('devolve a TELA do guard quando o guard bloqueia — e não busca nada', async () => {
    // A tela negativa é do guard ("Acesso restrito" / "Serviço indisponível"),
    // e a página não reescreve esse texto: são DUAS cópias do mesmo texto que
    // divergem sozinhas.
    const tela = { tipo: 'negativa-do-guard' };
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: true, tela });

    expect(await Page(params('u1'))).toBe(tela);
    expect(listarInventario).not.toHaveBeenCalled();
    // E o histórico também não é lido: o guard barra ANTES de qualquer leitura.
    expect(listarHistoricoDoUsuario).not.toHaveBeenCalled();
  });

  it('a leitura que falha mostra "Serviço indisponível" — e NÃO propaga o erro', async () => {
    listarInventario.mockRejectedValue(new Error('500 Internal Server Error'));

    // Se a página não pegasse o erro, o `render` aqui MORRERIA com ele — e o
    // teste ficaria vermelho sem dizer nada sobre a tela.
    render(await Page(params('u1')));

    expect(screen.getByRole('heading', { name: 'Serviço indisponível' })).toBeInTheDocument();
    // E a tela é a de serviço fora — e NÃO a do detalhe: um erro genérico
    // subindo para o `app/error.tsx` é a tela que não oferece retry.
    expect(screen.queryByRole('heading', { name: 'Dona Da Empresa' })).not.toBeInTheDocument();
  });

  // ⚠️ A TRIAGEM da falha mora em `guard-admin.tsx` (`telaDaFalhaDeLeitura`) —
  // e o `catch` nu tratava as três causas como "serviço indisponível". A
  // 401 é SESSÃO EXPIRADA (o login resolve) e a 403 é a API RECUSANDO o
  // ator (o serviço está de pé); "tente de novo" não resolve nenhuma das
  // duas.
  it('um 401 na leitura do inventário é SESSÃO EXPIRADA — e vai para o login', async () => {
    listarInventario.mockRejectedValue(new ApiError('Unauthorized', 'UNAUTHORIZED', 401, PROBLEMA));

    // O `redirect` lança NEXT_REDIRECT: a página NÃO renderiza, e o Next
    // transforma o lançamento no redirecionamento.
    await expect(Page(params('u1'))).rejects.toThrow('NEXT_REDIRECT');
  });

  it('um 403 na leitura do inventário é a API recusando o ator — e vira "Acesso restrito"', async () => {
    listarInventario.mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403, PROBLEMA));

    render(await Page(params('u1')));

    expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
    // E NÃO a de serviço fora — que é a tela que mente sobre a causa.
    expect(screen.queryByRole('heading', { name: 'Serviço indisponível' })).not.toBeInTheDocument();
  });

  it('mostra a pessoa e o card da empresa em que ela está inserida', async () => {
    render(await Page(params('u1')));

    expect(screen.getByRole('heading', { level: 1, name: 'Dona Da Empresa' })).toBeInTheDocument();
    expect(screen.getByText('dona@exemplo.dev')).toBeInTheDocument();
    // O card é o LINK para a empresa — é ele que abre a página da empresa, e
    // um card que não é link não abre nada.
    const card = screen.getByRole('link', { name: /Acme/ });
    expect(card).toHaveAttribute('href', '/empresa/e1');
    // E o vínculo: o rótulo do papel e o perfil efetivo NAQUELA empresa.
    expect(card).toHaveTextContent('papel: gerente · perfil: gerente');
  });
});

/**
 * O HISTÓRICO de auditoria da pessoa — a seção que mostra TODAS as versões.
 */
describe('users/[id] — o histórico da pessoa', () => {
  beforeEach(() => {
    exigirAdminDoSistema.mockReset().mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
    exigirSessao.mockReset().mockResolvedValue('token-admin');
    listarInventario.mockReset().mockResolvedValue({
      empresas: [],
      usuarios: [
        {
          id: 'u1',
          nome: 'Dona Da Empresa',
          email: 'dona@exemplo.dev',
          empresas: [],
        },
      ],
    });
    listarHistoricoDoUsuario.mockReset().mockResolvedValue(HISTORICO);
  });

  afterEach(() => {
    cleanup();
  });

  it('mostra as VERSÕES — a versão, o que houve, o nome e o e-mail daquele registro, o quando e quem mudou', async () => {
    render(await Page(params('u1')));

    // As CINCO colunas — e o cabeçalho nomeia o que a coluna é (o leitor de
    // tela precisa dele para associar a célula).
    expect(screen.getByRole('columnheader', { name: 'Versão' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'O que houve' })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Nome e e-mail naquele registro' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Quando' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Quem mudou' })).toBeInTheDocument();
    // ⚠️ A coluna "MOTIVO" NÃO existe — e a ausência é o que se mede.
    // `users_history.reason` é sempre `null` (medido na API), então a coluna
    // renderizaria "—" em toda linha: ruído que esconde o dado.
    expect(screen.queryByRole('columnheader', { name: 'Motivo' })).not.toBeInTheDocument();

    // A CRIAÇÃO: o nome e o e-mail de QUANDO ela nasceu — e não os de hoje.
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'criação' })).toBeInTheDocument();
    expect(screen.getByText('Nome Antigo')).toBeInTheDocument();
    expect(screen.getByText('antigo@exemplo.dev')).toBeInTheDocument();

    // A ALTERAÇÃO: o nome novo.
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'alteração' })).toBeInTheDocument();
    expect(screen.getByText('Nome Novo')).toBeInTheDocument();
    expect(screen.getByText('novo@exemplo.dev')).toBeInTheDocument();
  });

  it('mostra a DATA em pt-BR — e a data CRUA não entra na tela', async () => {
    render(await Page(params('u1')));

    const quando = new Date('2026-11-02T12:30:00.000Z').toLocaleString('pt-BR');
    expect(screen.getByText(quando)).toBeInTheDocument();
    // ⚠️ A data crua é o ISO — e ela é o que o `snapshot` traz. Se ela
    // aparecesse, a pessoa leria "2026-11-02T12:30:00.000Z" na tela.
    expect(screen.queryByText('2026-11-02T12:30:00.000Z')).not.toBeInTheDocument();
  });

  it('"Quem mudou" é o NOME de quem está no inventário — e o id cru quando não está', async () => {
    // O ator da alteração é a própria pessoa, e ela ESTÁ no inventário: o
    // nome é o que a tela mostra (o id cru é metadado).
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[1]!],
      nextCursor: null,
    });

    render(await Page(params('u1')));

    expect(screen.getByRole('cell', { name: 'Dona Da Empresa' })).toBeInTheDocument();

    // E quem NÃO está no inventário (conta apagada) entra pelo id CRU — um
    // rótulo inventado ("usuário desconhecido") seria mentira: o dado que
    // existe é o id.
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [
        {
          ...HISTORICO.entries[1]!,
          changedBy: 'a1b2c3d4-0000-4000-8000-000000009999',
        },
      ],
      nextCursor: null,
    });
    cleanup();
    render(await Page(params('u1')));

    expect(
      screen.getByRole('cell', { name: 'a1b2c3d4-0000-4000-8000-000000009999' }),
    ).toBeInTheDocument();
  });

  it('sem ator, a célula mostra o traço — e o dado que falta NÃO é inventado', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[0]!],
      nextCursor: null,
    });

    render(await Page(params('u1')));

    // O traço de "quem mudou": a criação por rota pública não tem ator.
    expect(screen.getAllByRole('cell', { name: '—' })).toHaveLength(1);
  });

  it('a falha do HISTÓRICO mostra o Alerta — e a pessoa CONTINUA na tela', async () => {
    listarHistoricoDoUsuario.mockRejectedValue(new Error('500 Internal Server Error'));

    render(await Page(params('u1')));

    expect(screen.getByRole('alert')).toHaveTextContent(/histórico/i);
    // ⚠️ A pessoa e as empresas são o CONTEÚDO PRINCIPAL: o histórico é
    // secundário, e a falha dele NÃO pode derrubar a tela.
    expect(screen.getByRole('heading', { level: 1, name: 'Dona Da Empresa' })).toBeInTheDocument();
    expect(screen.getByText('dona@exemplo.dev')).toBeInTheDocument();
    // E a tabela do histórico não existe — a tela não finge que mostrou.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('um 401 no HISTÓRICO é SESSÃO EXPIRADA — e vai para o login', async () => {
    listarHistoricoDoUsuario.mockRejectedValue(
      new ApiError('Unauthorized', 'UNAUTHORIZED', 401, PROBLEMA),
    );

    await expect(Page(params('u1'))).rejects.toThrow('NEXT_REDIRECT');
  });

  it('o TETO de páginas corta o histórico — e a tela DIZ que não coube tudo', async () => {
    // ⚠️ O teto (10 páginas de 100) é um caso PATOLÓGICO — e é por isso que
    // ele precisa de teste: sem uma linha que diga, a tela mostraria um
    // histórico PARCIAL parecendo completo. E o que ela mostra são as
    // versões MAIS ANTIGAS: a API devolve da mais antiga para a mais
    // recente, e o cursor anda para frente.
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[0]!],
      nextCursor: 'cursor-que-nunca-termina',
    });

    render(await Page(params('u1')));

    // Dez páginas — o teto — e nenhuma a mais.
    expect(listarHistoricoDoUsuario).toHaveBeenCalledTimes(10);
    expect(screen.getByText(/há mais histórico/i)).toBeInTheDocument();
  });

  it('segue o CURSOR até a última página — e diz quando o teto corta o histórico', async () => {
    // ⚠️ A primeira página vem com cursor, e a segunda fecha a sequência.
    // Uma tela que lê só a primeira página mostra um histórico PARCIAL sem
    // dizer — e o cursor é o que a API devolve para isso.
    listarHistoricoDoUsuario
      .mockResolvedValueOnce({ entries: [HISTORICO.entries[0]!], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ entries: [HISTORICO.entries[1]!], nextCursor: null });

    render(await Page(params('u1')));

    expect(listarHistoricoDoUsuario).toHaveBeenCalledTimes(2);
    expect(listarHistoricoDoUsuario).toHaveBeenNthCalledWith(2, 'token-admin', 'u1', 'cursor-2');
    // As DUAS entradas estão na tela — a segunda página entrou.
    expect(screen.getByText('Nome Antigo')).toBeInTheDocument();
    expect(screen.getByText('Nome Novo')).toBeInTheDocument();
  });
});
