// apps/web/app/admin/tenancy/page.spec.tsx
//
// O FURO que este spec fecha: trocar `exigirAdminDoSistema()` por
// `exigirAdmin()` na tela do inventário deixaria a suíte INTEIRA verde e a
// tela errada — o `isAdmin` do DONO é `true` em toda empresa nova (MEDIDO:
// `prisma-tenant-onboarding.repository.ts:202`), então o gerente de empresa
// passaria pelo guard e a tela mostraria a base inteira, que a API recusa por
// D2.
//
// É o mesmo furo que `app/admin/flags/page.spec.tsx` fecha, do outro lado: as
// DUAS telas do admin do sistema leem o bucket GLOBAL, e nenhuma spec ligava
// essa escolha ao ponto de chamada.
//
// ⚠️ E o INVENTÁRIO é UMA LEITURA (2026-10-29): a página lê a sessão UMA vez
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

const exigirAdminDoSistema = vi.fn();
const exigirAdmin = vi.fn();
const listarInventario = vi.fn();
const exigirSessao = vi.fn();

// ⚠️ `../guard-admin` e NÃO `../../guard-admin`: este spec mora em
// `app/admin/tenancy/`, um nível a mais que `app/admin/profiles/[slug]/`. O
// caminho errado NÃO dá erro — o Vitest registra o mock sob uma chave que
// ninguém importa, a página usa o guard VERDADEIRO, e o spec falha sem dizer
// por quê (MEDIDO: o guard real rodou e devolveu "Serviço indisponível").
//
// ⚠️ E o mock é PARCIAL: `ServicoIndisponivel` é o VERDADEIRO. A tela de
// "Serviço indisponível" é do `guard-admin.tsx`, e um dublê escreveria o
// texto que a PRODUÇÃO escreve — o spec passaria com o texto errado em
// produção, e a asserção do heading mediria o dublê, não a tela. As DUAS
// funções de guard são as dublês: é delas que o spec precisa do veredito.
vi.mock('../guard-admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../guard-admin')>();
  return {
    ...real,
    exigirAdminDoSistema: (accessToken?: string) => exigirAdminDoSistema(accessToken),
    exigirAdmin: () => exigirAdmin(),
  };
});
// ⚠️ A sessão é lida PELA PÁGINA (`exigirSessao`), e é ela que entrega o
// token ao guard e à leitura do inventário. `lerTenant`/`lerTokens` estão
// aqui porque o `guard-admin.tsx` VERDADEIRO importa `lib/perfil.ts`, que os
// usa — e o mock é por MÓDULO resolvido: `../../../lib/sessao` e `./sessao`
// (de dentro de `lib/perfil.ts`) são o mesmo arquivo.
vi.mock('../../../lib/sessao', () => ({
  exigirSessao: () => exigirSessao(),
  lerTenant: vi.fn(async (): Promise<string | null> => null),
  lerTokens: vi.fn(async () => ({ accessToken: 'token-admin', refreshToken: null })),
}));
// ⚠️ O mock é PARCIAL: `vinculo` (o rótulo `papel · perfil`) passou a morar
// em `lib/tenancy.ts` — e um mock do módulo INTEIRO o deixaria `undefined`, e
// a página quebraria ao renderizar a tabela de membros. O spec passava só
// porque a fixture era `{empresas: [], usuarios: []}`: a tabela vazia nunca
// chamava `vinculo`. O teste do vínculo, aqui embaixo, é o que fecha esse
// buraco.
vi.mock('../../../lib/tenancy', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/tenancy')>();
  return {
    ...real,
    listarInventario: (accessToken: string) => listarInventario(accessToken),
  };
});

const { default: Page } = await import('./page');

describe('admin/tenancy — a página usa o guard do ADMINISTRADOR DO SISTEMA', () => {
  beforeEach(() => {
    exigirAdminDoSistema.mockReset();
    exigirAdmin.mockReset();
    listarInventario.mockReset().mockResolvedValue({ empresas: [], usuarios: [] });
    exigirSessao.mockReset().mockResolvedValue('token-admin');
    // As DUAS funções devolvem o MESMO veredito de "liberado": um spec que
    // só afirmasse "a página renderizou" passaria nas duas — o que dá o dente
    // ao simétrico abaixo.
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
    exigirAdmin.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
  });

  // O projeto não usa `globals: true`: sem `cleanup`, o DOM acumulado faz o
  // segundo teste achar o heading do primeiro.
  afterEach(() => {
    cleanup();
  });

  it('chama `exigirAdminDoSistema()` e NUNCA `exigirAdmin()`', async () => {
    await Page();

    expect(exigirAdminDoSistema).toHaveBeenCalledTimes(1);
    expect(exigirAdmin).not.toHaveBeenCalled();
  });

  it('manda o MESMO token para o guard e para a leitura — a sessão é lida UMA vez', async () => {
    await Page();

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

    expect(await Page()).toBe(tela);
    expect(listarInventario).not.toHaveBeenCalled();
  });

  it('a leitura que falha mostra "Serviço indisponível" — e NÃO propaga o erro', async () => {
    listarInventario.mockRejectedValue(new Error('500 Internal Server Error'));

    // Se a página não pegasse o erro, o `render` aqui MORRERIA com ele — e o
    // teste ficaria vermelho sem dizer nada sobre a tela.
    render(await Page());

    expect(screen.getByRole('heading', { name: 'Serviço indisponível' })).toBeInTheDocument();
    // E a tela é a de serviço fora — e NÃO a do inventário: um erro genérico
    // subindo para o `app/error.tsx` é a tela que não oferece retry.
    expect(screen.queryByRole('heading', { name: 'Empresas e usuários' })).not.toBeInTheDocument();
  });

  it('o membro aparece com o VÍNCULO `papel · perfil` — o rótulo que mora em `lib/tenancy`', async () => {
    // ⚠️ A fixture com um membro é o que dá DENTE ao mock parcial: com a
    // lista vazia, `vinculo` nunca era chamado, e o `undefined` do mock
    // inteiro passava despercebido.
    listarInventario.mockResolvedValue({
      empresas: [
        {
          id: 'e1',
          nome: 'Acme',
          slug: 'acme',
          membros: [
            {
              id: 'u1',
              nome: 'Dona Da Empresa',
              email: 'dona@exemplo.dev',
              role: 'gerente',
              perfil: 'gerente',
            },
          ],
        },
      ],
      usuarios: [],
    });

    render(await Page());

    // ⚠️ REGEX, e não string exata: o membro é renderizado como UM texto
    // ("Ana — ana@x.dev (gerente · gerente)"), e `getByText` compara o texto
    // do elemento com a string INTEIRA. A regex casa o mesmo elemento — o
    // `<li>` — e não o `<ul>` que o contém (o texto direto dele é vazio).
    expect(screen.getByText(/Dona Da Empresa/)).toBeInTheDocument();
    expect(screen.getByText(/papel: gerente · perfil: gerente/)).toBeInTheDocument();
  });
});
