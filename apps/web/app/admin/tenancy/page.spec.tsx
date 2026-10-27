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
// A página é RSC e está fora do denominador de cobertura
// (`vitest.config.ts`: `app/**/*.tsx`), e o `next build` só a compila. Este
// spec não muda essa decisão — ele fixa a ESCOLHA do guard, que é a única
// coisa que nenhum outro arquivo fixa.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const exigirAdminDoSistema = vi.fn();
const exigirAdmin = vi.fn();
const listarEmpresasComMembros = vi.fn();
const listarUsuariosComEmpresas = vi.fn();

// ⚠️ `../guard-admin` e NÃO `../../guard-admin`: este spec mora em
// `app/admin/tenancy/`, um nível a mais que `app/admin/profiles/[slug]/`. O
// caminho errado NÃO dá erro — o Vitest registra o mock sob uma chave que
// ninguém importa, a página usa o guard VERDADEIRO, e o spec falha sem dizer
// por quê (MEDIDO: o guard real rodou e devolveu "Serviço indisponível").
vi.mock('../guard-admin', () => ({
  exigirAdminDoSistema: () => exigirAdminDoSistema(),
  exigirAdmin: () => exigirAdmin(),
}));
vi.mock('../../../lib/tenancy', () => ({
  listarEmpresasComMembros: () => listarEmpresasComMembros(),
  listarUsuariosComEmpresas: () => listarUsuariosComEmpresas(),
}));

const { default: Page } = await import('./page');

describe('admin/tenancy — a página usa o guard do ADMINISTRADOR DO SISTEMA', () => {
  beforeEach(() => {
    exigirAdminDoSistema.mockReset();
    exigirAdmin.mockReset();
    listarEmpresasComMembros.mockReset().mockResolvedValue([]);
    listarUsuariosComEmpresas.mockReset().mockResolvedValue([]);
    // As DUAS funções devolvem o MESMO veredito de "liberado": um spec que
    // só afirmasse "a página renderizou" passaria nas duas — o que dá o dente
    // ao simétrico abaixo.
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
    exigirAdmin.mockResolvedValue({ bloqueio: false, me: { isAdmin: true } });
  });

  it('chama `exigirAdminDoSistema()` e NUNCA `exigirAdmin()`', async () => {
    await Page();

    expect(exigirAdminDoSistema).toHaveBeenCalledTimes(1);
    expect(exigirAdmin).not.toHaveBeenCalled();
  });

  it('devolve a TELA do guard quando o guard bloqueia — e não busca as listas', async () => {
    // A tela negativa é do guard ("Acesso restrito" / "Serviço indisponível"),
    // e a página não reescreve esse texto: são DUAS cópias do mesmo texto que
    // divergem sozinhas.
    const tela = { tipo: 'negativa-do-guard' };
    exigirAdminDoSistema.mockResolvedValue({ bloqueio: true, tela });

    expect(await Page()).toBe(tela);
    expect(listarEmpresasComMembros).not.toHaveBeenCalled();
    expect(listarUsuariosComEmpresas).not.toHaveBeenCalled();
  });
});
