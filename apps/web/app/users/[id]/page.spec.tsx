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
  // ⚠️ A ORDEM É DESCENDENTE — a mais NOVA primeiro. É o que a API devolve
  // desde que a ordem entrou no port de auditoria (`ListHistoryInput.ordem`):
  // a trilha do administrador do sistema é lida de trás para frente, e a
  // versão mais recente é a primeira da primeira página.
  entries: [
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
    // ⚠️ O `limite` só vai quando EXISTE: a chamada da página completa é a de
    // TRÊS argumentos, e um quarto `undefined` mudaria a assinatura
    // observada pelo spy.
    listarHistoricoDoUsuario: (
      accessToken: string,
      id: string,
      cursor?: string,
      limite?: number,
    ) =>
      limite === undefined
        ? listarHistoricoDoUsuario(accessToken, id, cursor)
        : listarHistoricoDoUsuario(accessToken, id, cursor, limite),
  };
});

const { default: Page } = await import('./page');

/** Os params da rota — `id` é o UUID da pessoa. */
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * A query da tela — e o **cursor** da paginação do histórico.
 *
 * ⚠️ O cursor viaja na URL, e a tela pede UMA página por visita: o "carregar
 * mais" é um link para `?cursor=`, e a página nova é a página antiga com o
 * cursor.
 */
const query = (cursor?: string) => ({ searchParams: Promise.resolve(cursor ? { cursor } : {}) });

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
    await Page({ ...params('u1'), ...query() });

    expect(exigirAdminDoSistema).toHaveBeenCalledTimes(1);
    expect(exigirAdmin).not.toHaveBeenCalled();
  });

  it('manda o MESMO token para o guard e para a leitura — a sessão é lida UMA vez', async () => {
    await Page({ ...params('u1'), ...query() });

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

    expect(await Page({ ...params('u1'), ...query() })).toBe(tela);
    expect(listarInventario).not.toHaveBeenCalled();
    // E o histórico também não é lido: o guard barra ANTES de qualquer leitura.
    expect(listarHistoricoDoUsuario).not.toHaveBeenCalled();
  });

  it('a leitura que falha mostra "Serviço indisponível" — e NÃO propaga o erro', async () => {
    listarInventario.mockRejectedValue(new Error('500 Internal Server Error'));

    // Se a página não pegasse o erro, o `render` aqui MORRERIA com ele — e o
    // teste ficaria vermelho sem dizer nada sobre a tela.
    render(await Page({ ...params('u1'), ...query() }));

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
    await expect(Page({ ...params('u1'), ...query() })).rejects.toThrow('NEXT_REDIRECT');
  });

  it('um 403 na leitura do inventário é a API recusando o ator — e vira "Acesso restrito"', async () => {
    listarInventario.mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403, PROBLEMA));

    render(await Page({ ...params('u1'), ...query() }));

    expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
    // E NÃO a de serviço fora — que é a tela que mente sobre a causa.
    expect(screen.queryByRole('heading', { name: 'Serviço indisponível' })).not.toBeInTheDocument();
  });

  it('mostra a pessoa e o card da empresa em que ela está inserida', async () => {
    render(await Page({ ...params('u1'), ...query() }));

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
    render(await Page({ ...params('u1'), ...query() }));

    // As CINCO colunas — e o cabeçalho nomeia o que a coluna é (o leitor de
    // tela precisa dele para associar a célula).
    expect(screen.getByRole('columnheader', { name: 'Versão' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'O que houve' })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Nome e e-mail naquele registro' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Quando' })).toBeInTheDocument();
    // ⚠️ O cabeçalho DIZ que o nome é o ATUAL: a coluna traz o nome de HOJE
    // do ator (tirado do inventário), e não o nome do momento da alteração.
    expect(
      screen.getByRole('columnheader', { name: 'Quem mudou (nome atual)' }),
    ).toBeInTheDocument();
    // ⚠️ A coluna "MOTIVO" NÃO existe — e a ausência é o que se mede.
    // O `reason` é `null` em quase toda linha (medido na API: o DELETE fixa
    // `reason: null`, a criação e a renomeação não têm motivo, e só a
    // restauração o grava quando o cliente manda um), então a coluna
    // renderizaria "—" em quase toda linha: ruído que esconde o dado.
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

  it('mostra a DATA em pt-BR com o fuso DECLARADO — e a data CRUA não entra na tela', async () => {
    render(await Page({ ...params('u1'), ...query() }));

    // ⚠️ A EXPECTATIVA É UMA LITERAL, e não `toLocaleString()` do próprio
    // runtime: o spec antigo derivava a expectativa do MESMO formatador do
    // código — e por isso não podia acusar nada. As 12:30 UTC são 09:30 em
    // São Paulo, e é isso que a tela tem que dizer.
    expect(screen.getByText('02/11/2026, 09:30:00')).toBeInTheDocument();
    // ⚠️ A data crua é o ISO — e ela é o que o `snapshot` traz. Se ela
    // aparecesse, a pessoa leria "2026-11-02T12:30:00.000Z" na tela.
    expect(screen.queryByText('2026-11-02T12:30:00.000Z')).not.toBeInTheDocument();
  });

  it('a data INVÁLIDA vira "—" — e não o literal "Invalid Date"', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [{ ...HISTORICO.entries[0]!, changedAt: 'nao-e-data' }],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
  });

  it('"Quem mudou" é o NOME de quem está no inventário — e o id cru quando não está', async () => {
    // O ator da alteração é a própria pessoa, e ela ESTÁ no inventário: o
    // nome é o que a tela mostra (o id cru é metadado).
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[0]!],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    expect(screen.getByRole('cell', { name: 'Dona Da Empresa' })).toBeInTheDocument();

    // E quem NÃO está no inventário (conta apagada) entra pelo id CRU — um
    // rótulo inventado ("usuário desconhecido") seria mentira: o dado que
    // existe é o id.
    //
    // ⚠️ **O ESTADO É CONSTRUÍDO À MÃO, e o app ainda não o produz.**
    // MEDIDO 2026-11-17 no banco: `users_history` tem 0 linhas com
    // `changed_by <> entity_id` — toda mutação de `User` é owner-only
    // (`PATCH`/`DELETE`/`restore` com o `UserOwnershipGuard`), e o `POST
    // /users` (público) grava o ator nulo. Logo, o ator de uma pessoa é a
    // PRÓPRIA pessoa — e ela está no inventário quando não está apagada
    // (e, quando está apagada, a página sai do inventário). O ramo é
    // DEFENSIVO (uma rota de admin que mexa na pessoa o torna alcançável),
    // e o spec diz isso — em vez de fingir que mede um estado real.
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
    render(await Page({ ...params('u1'), ...query() }));

    // ⚠️ O id cru COM o que ele é ("conta fora do inventário") — um id solto
    // na tela não diz se é conta removida ou defeito.
    expect(
      screen.getByRole('cell', { name: /a1b2c3d4-0000-4000-8000-000000009999/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/conta fora do inventário/i)).toBeInTheDocument();
  });

  it('sem ator, a célula DIZ que não houve ator — e o dado que falta NÃO é inventado', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[1]!],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    // ⚠️ "SEM ATOR", e não o travessão: o travessão é o "o dado não veio" de
    // OUTRA coluna, e o mesmo símbolo querendo dizer duas coisas na mesma
    // tabela é ruído que esconde o dado.
    expect(screen.getByRole('cell', { name: 'sem ator' })).toBeInTheDocument();
  });

  it('a falha do HISTÓRICO mostra o Alerta — e a pessoa CONTINUA na tela', async () => {
    listarHistoricoDoUsuario.mockRejectedValue(new Error('500 Internal Server Error'));

    render(await Page({ ...params('u1'), ...query() }));

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

    await expect(Page({ ...params('u1'), ...query() })).rejects.toThrow('NEXT_REDIRECT');
  });

  it('a tela pede UMA página por visita — e o link leva às versões MAIS ANTIGAS', async () => {
    // ⚠️ A tela antiga buscava até 10 páginas e mostrava as 100 mais ANTIGAS —
    // e o teto cortava justamente as mais recentes. Agora é uma página por
    // visita, com o cursor na URL.
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[0]!],
      nextCursor: 'cursor-da-pagina-2',
    });

    render(await Page({ ...params('u1'), ...query() }));

    // Uma requisição — e ela sem cursor (é a primeira página).
    expect(listarHistoricoDoUsuario).toHaveBeenCalledTimes(1);
    expect(listarHistoricoDoUsuario).toHaveBeenCalledWith('token-admin', 'u1', undefined);

    // ⚠️ E o link é HONESTO: ele TROCA a página (o cursor viaja na URL), e
    // "carregar mais" prometia ACESCENTAR — MEDIDO 2026-11-17 na revisão do
    // PR #171: o clique trocava as 100 versões mais recentes pelas 100 mais
    // antigas, e não havia volta.
    const maisAntigas = screen.getByRole('link', { name: /versões mais antigas/i });
    expect(maisAntigas).toHaveAttribute('href', '/users/u1?cursor=cursor-da-pagina-2');
    // E na PRIMEIRA página não há "volta para as mais recentes" — ela já é a
    // mais recente.
    expect(screen.queryByRole('link', { name: /versões mais recentes/i })).not.toBeInTheDocument();
  });

  it('o cursor da URL é o que a tela pede — a segunda página é a página antiga', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[1]!],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query('cursor-da-pagina-2') }));

    // ⚠️ A SEGUNDA página pede o cursor que a primeira devolveu — e não repete
    // a primeira.
    expect(listarHistoricoDoUsuario).toHaveBeenCalledTimes(1);
    expect(listarHistoricoDoUsuario).toHaveBeenCalledWith(
      'token-admin',
      'u1',
      'cursor-da-pagina-2',
    );
    // E a entrada da SEGUNDA página (a criação) está na tela.
    expect(screen.getByText('Nome Antigo')).toBeInTheDocument();
    // E não há "mais antigas" — a última página não tem cursor.
    expect(screen.queryByRole('link', { name: /versões mais antigas/i })).not.toBeInTheDocument();
    // ⚠️ E há o VOLTA: a segunda página não é um beco sem saída.
    const maisRecentes = screen.getByRole('link', { name: /versões mais recentes/i });
    expect(maisRecentes).toHaveAttribute('href', '/users/u1');
  });

  it('a ORDEM é descendente — a versão mais recente vem PRIMEIRO', async () => {
    render(await Page({ ...params('u1'), ...query() }));

    const versoes = screen
      .getAllByRole('cell')
      .filter((c) => /^\d+$/.test(c.textContent ?? ''))
      .map((c) => c.textContent);
    expect(versoes).toEqual(['2', '1']);
  });

  // ⚠️ O MOTIVO, quando existe, fica NA LINHA do evento — e não numa coluna:
  // a restauração é o único evento que o grava, e uma coluna de motivo
  // mostraria "—" em quase toda linha.
  it('o MOTIVO da versão aparece na linha do evento — e não numa coluna', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [
        { ...HISTORICO.entries[0]!, operation: 'RESTORE' as const, reason: 'a pessoa voltou' },
      ],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    // O motivo está na célula do evento.
    const celulaDoEvento = screen.getByRole('cell', { name: /restauração/ });
    expect(celulaDoEvento).toHaveTextContent('a pessoa voltou');
    // E NÃO existe uma coluna de motivo.
    expect(screen.queryByRole('columnheader', { name: 'Motivo' })).not.toBeInTheDocument();
  });

  it('a página do cursor DIZ que mostra as versões mais antigas — e o texto fixo mentiria', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [HISTORICO.entries[1]!],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query('cursor-da-pagina-2') }));

    // O texto da seção acompanha a PÁGINA.
    expect(screen.getByText(/Esta página mostra as versões mais antigas/)).toBeInTheDocument();
    // E a legenda (o nome acessível da tabela) também.
    expect(screen.getByRole('table', { name: /com as versões mais antigas/ })).toBeInTheDocument();
  });

  it('o 403 do HISTÓRICO NÃO diz "Tente de novo" — uma recusa não melhora com retry', async () => {
    listarHistoricoDoUsuario.mockRejectedValue(
      new ApiError('Forbidden', 'FORBIDDEN', 403, PROBLEMA),
    );

    render(await Page({ ...params('u1'), ...query() }));

    expect(screen.getByRole('alert')).toHaveTextContent(/permissão/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/tente de novo/i);
    // E o "tentar de novo" não aparece — ele só faz sentido na falha
    // transitória.
    expect(screen.queryByText('Tentar de novo')).not.toBeInTheDocument();
    // E a pessoa CONTINUA na tela.
    expect(screen.getByRole('heading', { level: 1, name: 'Dona Da Empresa' })).toBeInTheDocument();
  });

  it('a falha TRANSITÓRIA do HISTÓRICO ainda oferece o retry', async () => {
    listarHistoricoDoUsuario.mockRejectedValue(new Error('500 Internal Server Error'));

    render(await Page({ ...params('u1'), ...query() }));

    expect(screen.getByRole('alert')).toHaveTextContent(/tente de novo/i);
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
  });

  it('campo VAZIO no snapshot vira "—" — e não uma célula vazia', async () => {
    // ⚠️ A API PROJETA o snapshot, e um campo ausente sai como string VAZIA.
    // E `'' ?? '—'` é `''`: sem este cuidado, a célula ficaria vazia — que é
    // indistinguível de "a pessoa não tinha nome".
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [
        {
          ...HISTORICO.entries[0]!,
          snapshot: { ...SNAPSHOT_NOVO, nome: '', email: '' },
        },
      ],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Nome Novo')).not.toBeInTheDocument();
  });

  it('campo AUSENTE no snapshot vira "—" — e não uma célula vazia', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [
        {
          ...HISTORICO.entries[0]!,
          snapshot: { ...SNAPSHOT_NOVO, nome: undefined, email: undefined },
        },
      ],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    // ⚠️ Uma célula VAZIA é indistinguível de "a pessoa não tinha nome" — e o
    // "—" diz que o dado não veio.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Nome Novo')).not.toBeInTheDocument();
  });

  it('o snapshot NULO NÃO derruba a tela — a seção mostra "—" e a pessoa continua', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [{ ...HISTORICO.entries[0]!, snapshot: null as unknown as typeof SNAPSHOT_NOVO }],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    // ⚠️ O raio do erro é a SEÇÃO — e não a página inteira, que é o que a
    // seção existe para proteger.
    expect(screen.getByRole('heading', { level: 1, name: 'Dona Da Empresa' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('a PESSOA APAGADA aparece na tela — tirada do snapshot da última versão', async () => {
    // ⚠️ O INVENTÁRIO filtra `deletedAt: null` — a pessoa apagada não está
    // nele. E a API entrega a trilha dela.
    listarInventario.mockResolvedValue({ empresas: [], usuarios: [] });
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [
        {
          ...HISTORICO.entries[0]!,
          snapshot: { ...SNAPSHOT_NOVO, nome: 'Pessoa Que Saiu', isDeleted: true },
        },
      ],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query() }));

    // A pessoa continua na tela — com o nome COMO ELA FOI APAGADA.
    expect(screen.getByRole('heading', { level: 1, name: 'Pessoa Que Saiu' })).toBeInTheDocument();
    // E a tela DIZ que ela foi apagada — senão o administrador lia uma
    // pessoa sem empresa e sem explicação.
    expect(screen.getByText(/o histórico abaixo é a trilha que ela deixou/)).toBeInTheDocument();
    // E o estado vazio de "Empresas" NÃO contradiz o aviso: a ausência é de
    // agora, e o texto antigo ("não está inserida em nenhuma empresa")
    // negava o aviso na mesma tela.
    expect(screen.getByText(/as empresas em que ela estava não aparecem/)).toBeInTheDocument();
  });

  // ⚠️ A IDENTIDADE DA PESSOA não vem da página CORRENTE do histórico. Na
  // página 2 (o cursor na URL), a primeira linha é a versão mais ANTIGA — e
  // o `h1` passava a afirmar um nome falso, e o aviso de "apagada" sumia.
  // MEDIDO 2026-11-17 na revisão do PR #171.
  it('a PESSOA APAGADA na página 2 continua com o nome e o aviso de quem ELA É', async () => {
    listarInventario.mockResolvedValue({ empresas: [], usuarios: [] });
    // A página corrente é a 2ª: a entrada mais ANTIGA (o nome velho). E a
    // leitura da versão MAIS RECENTE devolve a pessoa como ela foi apagada.
    listarHistoricoDoUsuario.mockImplementation(
      async (_token: string, _id: string, cursor?: string, limite?: number) => {
        if (cursor === undefined && limite === 1) {
          return {
            entries: [
              {
                ...HISTORICO.entries[0]!,
                snapshot: { ...SNAPSHOT_NOVO, nome: 'Pessoa Que Saiu', isDeleted: true },
              },
            ],
            nextCursor: null,
          };
        }
        return {
          entries: [{ ...HISTORICO.entries[1]!, snapshot: SNAPSHOT_ANTIGO }],
          nextCursor: null,
        };
      },
    );

    render(await Page({ ...params('u1'), ...query('cursor-da-pagina-2') }));

    // ⚠️ A LEITURA DA VERSÃO MAIS RECENTE: é ela que sabe QUEM é a pessoa.
    // Sem ela, o `h1` diria "Nome Antigo" — e a pessoa apagada seria lida
    // como alguém que nunca saiu.
    expect(listarHistoricoDoUsuario).toHaveBeenCalledWith('token-admin', 'u1', undefined, 1);
    // E o `h1` é o nome de HOJE da pessoa (o da versão mais recente), e não o
    // da primeira linha da página corrente.
    expect(screen.getByRole('heading', { level: 1, name: 'Pessoa Que Saiu' })).toBeInTheDocument();
    // E o aviso de "apagada" continua.
    expect(screen.getByText(/o histórico abaixo é a trilha que ela deixou/)).toBeInTheDocument();
  });

  it('a pessoa NO INVENTÁRIO não gasta uma segunda leitura — o `h1` já é o dela', async () => {
    listarHistoricoDoUsuario.mockResolvedValue({
      entries: [{ ...HISTORICO.entries[1]!, snapshot: SNAPSHOT_ANTIGO }],
      nextCursor: null,
    });

    render(await Page({ ...params('u1'), ...query('cursor-da-pagina-2') }));

    // Uma requisição só — o inventário já diz quem é a pessoa.
    expect(listarHistoricoDoUsuario).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Dona Da Empresa' })).toBeInTheDocument();
  });

  // ⚠️ O 404 SÓ COM EVIDÊNCIA: uma falha TRANSITÓRIA do histórico com a
  // pessoa fora do inventário não é "a pessoa não existe" — e afirmar que
  // ela não existe é a tela mentindo sobre a causa.
  it('a falha TRANSITÓRIA do histórico com a pessoa fora do inventário NÃO vira "não existe"', async () => {
    listarInventario.mockResolvedValue({ empresas: [], usuarios: [] });
    listarHistoricoDoUsuario.mockRejectedValue(new Error('500 Internal Server Error'));

    render(await Page({ ...params('u1'), ...query() }));

    // A tela de serviço fora — e NÃO o "não existe" (o `notFound`).
    expect(screen.getByRole('heading', { name: 'Serviço indisponível' })).toBeInTheDocument();
  });

  it('o 400 do HISTÓRICO fora do inventário NÃO vira "serviço indisponível"', async () => {
    // ⚠️ O 400 é a QUERY INVÁLIDA (o cursor da URL) — e a API está de pé: quem
    // está quebrado é o LINK. A tela de "serviço indisponível" diria que a
    // API caiu, e a saída ("ver o histórico do início") ficaria fora da tela.
    listarInventario.mockResolvedValue({ empresas: [], usuarios: [] });
    listarHistoricoDoUsuario.mockRejectedValue(
      new ApiError('Bad Request', 'VALIDATION_ERROR', 400, PROBLEMA),
    );

    render(await Page({ ...params('u1'), ...query('cursor-invalido') }));

    // A tela NÃO é a de serviço fora.
    expect(screen.queryByRole('heading', { name: 'Serviço indisponível' })).not.toBeInTheDocument();
    // E a saída existe — é ela que resolve.
    const saida = screen.getByRole('link', { name: /histórico do início/i });
    expect(saida).toHaveAttribute('href', '/users/u1');
  });

  it('o 404 do histórico É a evidência de que a pessoa não existe', async () => {
    listarInventario.mockResolvedValue({ empresas: [], usuarios: [] });
    listarHistoricoDoUsuario.mockRejectedValue(
      new ApiError('Not Found', 'USER_NOT_FOUND', 404, PROBLEMA),
    );

    // O `notFound` do Next lança — e a página NÃO renderiza.
    await expect(Page({ ...params('u1'), ...query() })).rejects.toThrow();
  });

  // ⚠️ O 400 (cursor malformado ou de outra trilha) é PERMANENTE: o retry
  // recarregaria a MESMA URL quebrada, para sempre.
  it('o 400 do HISTÓRICO NÃO oferece retry — e oferece a SAÍDA (o início da trilha)', async () => {
    listarHistoricoDoUsuario.mockRejectedValue(
      new ApiError('Bad Request', 'VALIDATION_ERROR', 400, PROBLEMA),
    );

    render(await Page({ ...params('u1'), ...query('cursor-invalido') }));

    expect(screen.getByRole('alert')).toHaveTextContent(/link do histórico está incorreto/i);
    expect(screen.queryByText('Tentar de novo')).not.toBeInTheDocument();
    // E a saída: o caminho de volta para o início da trilha.
    const saida = screen.getByRole('link', { name: /histórico do início/i });
    expect(saida).toHaveAttribute('href', '/users/u1');
  });
});
