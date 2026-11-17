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
  });

  it('devolve a TELA do guard quando o guard bloqueia — e não busca o inventário', async () => {
    // A tela negativa é do guard ("Acesso restrito" / "Serviço indisponível"),
    // e a página não reescreve esse texto: são DUAS cópias do mesmo texto que
    // divergem sozinhas.
    const tela = { tipo: 'negativa-do-guard' };
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: true, tela });

    expect(await Page(params('u1'))).toBe(tela);
    expect(listarInventario).not.toHaveBeenCalled();
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
