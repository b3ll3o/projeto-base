// apps/web/app/admin/flags/page.spec.tsx
//
// O FURO que este spec fecha: `perfil.spec.ts` provava que
// `obterMeuPerfilGlobal` monta o client SEM `getTenant`, e que
// `obterMeuPerfil` monta COM. Nenhum spec ligava essas provas ao ponto de
// chamada. Trocar `obterMeuPerfilGlobal()` por `obterMeuPerfil()` na linha 41
// deixaria a suíte inteira verde e a tela errada — o `isAdmin` do DONO é
// `true` em toda empresa nova (MEDIDO:
// `prisma-tenant-onboarding.repository.ts:202`), então a tela mostraria a
// tabela para um ator que a API recusa por D2.
//
// A página é RSC e está fora do denominador de cobertura
// (`vitest.config.ts`: `app/**/*.tsx`), e o `next build` só a compila. Este
// spec não muda essa decisão — ele fixa a ESCOLHA da função, que é a única
// coisa que nenhum outro arquivo fixa.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const obterMeuPerfilGlobal = vi.fn();
const obterMeuPerfil = vi.fn();
const listarFeatureFlags = vi.fn();
const revalidatePath = vi.fn();

vi.mock('../../../lib/perfil', () => ({
  obterMeuPerfilGlobal: () => obterMeuPerfilGlobal(),
  obterMeuPerfil: () => obterMeuPerfil(),
}));
vi.mock('../../../lib/flags', () => ({
  listarFeatureFlags: () => listarFeatureFlags(),
  definirFeatureFlag: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { default: Page } = await import('./page');

describe('admin/flags — a página chama a variante GLOBAL do perfil', () => {
  beforeEach(() => {
    obterMeuPerfilGlobal.mockReset();
    obterMeuPerfil.mockReset();
    listarFeatureFlags.mockReset().mockResolvedValue([]);
    obterMeuPerfilGlobal.mockResolvedValue({ isAdmin: true });
    obterMeuPerfil.mockResolvedValue({ isAdmin: true });
  });

  it('pede o perfil pelo bucket GLOBAL, nunca pelo de empresa', async () => {
    await Page();
    expect(obterMeuPerfilGlobal).toHaveBeenCalledTimes(1);
    // O simétrico é o que dá o dente: as DUAS funções devolvem `{isAdmin:true}`,
    // então um spec que só afirmasse "a página renderizou" passaria nas duas.
    expect(obterMeuPerfil).not.toHaveBeenCalled();
  });

  it('D2: gerente de empresa NÃO administrator do sistema não vê a tabela', async () => {
    // Gerente é `isAdmin: true` na empresa dele. Se a página usasse
    // `obterMeuPerfil`, este ator passaria pelo `isAdmin` e a API recusaria o
    // PATCH — a tela affirmando uma permissão que o servidor não tem.
    obterMeuPerfil.mockResolvedValue({ isAdmin: true });
    obterMeuPerfilGlobal.mockResolvedValue({ isAdmin: false });

    await Page();

    expect(listarFeatureFlags).not.toHaveBeenCalled();
  });
});
