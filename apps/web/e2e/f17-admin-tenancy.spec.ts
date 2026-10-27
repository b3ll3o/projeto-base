// FLUXO: F17 — Inventário de empresas e usuários (admin)
//
// Cobre: `/admin/tenancy` — a tela do ADMINISTRADOR DO SISTEMA que mostra a
// tenancy nas DUAS direções: as empresas com os seus membros, e os usuários
// com as suas empresas.
//
// ⚠️ O que este arquivo segura é o PAR RECUSA/LIBERDADE. O quase-admin tem as
// TRÊS chaves `admin.manage-*` no banco — o `PermissionsGuard` da API LIBERA
// ele — e mesmo assim a tela tem de recusar. Sem o par, "o admin vê a tela" e
// "qualquer um vê a tela" passam no mesmo arquivo, e a escalada que a
// permissão não segura (o `gerente` de empresa recebe `listAllPermissions()`)
// é justamente o que esta tela não pode abrir.
//
// ⚠️ O DADO PRECISA EXISTIR no caso da recusa: "não vê o nome do membro"
// passa no vazio, e um teste que passa no vazio não mede nada. Por isso os
// DOIS testes semeam a empresa e o membro antes de olhar a tela.

import type { Page } from '@playwright/test';
import { expect, plantarSessao, test } from './support/fixtures';
import { semearQuaseAdmin } from './support/rbac';
import { exigirEstado } from './support/estado';
import { SENHA_DE_TESTE, criarEmpresa, emailUnico, parDeTokens } from './support/dados';

/** A linha da tabela de EMPRESAS que fala desta empresa. */
function linhaDaEmpresa(page: Page, nome: string) {
  return page.locator('main table').first().locator('tbody tr').filter({ hasText: nome });
}

/** A linha da tabela de USUÁRIOS que fala desta pessoa. */
function linhaDoUsuario(page: Page, nome: string) {
  return page.locator('main table').nth(1).locator('tbody tr').filter({ hasText: nome });
}

/**
 * Semeia a empresa COM o seu dono — pela MESMA API que a tela usaria.
 *
 * `POST /tenants` é o caminho do onboarding: cria a empresa, os três perfis
 * dela e a membership do dono (`role: 'gerente'`, perfil `gerente`).
 */
async function semearEmpresaComDono(semear: (nome: string, email: string) => Promise<unknown>) {
  const emailDono = emailUnico('dona-inventario');
  await semear('Dona Do Inventario', emailDono);
  const tokens = await parDeTokens(emailDono, SENHA_DE_TESTE);
  const empresa = await criarEmpresa(
    tokens.accessToken,
    'Empresa Do Inventario',
    'empresa-do-inventario',
  );
  return { emailDono, empresa };
}

test.describe('F17 — Inventário de empresas e usuários (admin)', () => {
  test('o admin do sistema vê a empresa, o slug e o membro — e o usuário com a sua empresa', async ({
    comoAdmin,
    irPara,
    page,
    semear,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;

    const { emailDono } = await semearEmpresaComDono(semear);

    await irPara('/admin/tenancy');

    // ── a DIREÇÃO 1: a empresa, e quem está nela ──
    const empresa = linhaDaEmpresa(page, 'Empresa Do Inventario');
    await expect(empresa).toHaveCount(1);
    // O SLUG é o identificador legível da empresa — e é o que a tela mostra
    // para o admin distinguir uma empresa da outra.
    await expect(empresa.getByRole('cell').nth(1)).toHaveText('empresa-do-inventario');
    // E o MEMBRO: nome e e-mail. O nome sozinho não provaria que é a pessoa
    // certa; o e-mail sozinho não provaria que a tela mostra quem é.
    await expect(empresa).toContainText('Dona Do Inventario');
    await expect(empresa).toContainText(emailDono);
    // O vínculo aparece como `papel · perfil` — e o rótulo do vínculo NÃO é o
    // RBAC: é o papel do dono na empresa.
    await expect(empresa).toContainText('gerente');

    // ── a DIREÇÃO 2: a pessoa, e de quais empresas ela é ──
    const usuario = linhaDoUsuario(page, 'Dona Do Inventario');
    await expect(usuario).toHaveCount(1);
    await expect(usuario).toContainText(emailDono);
    await expect(usuario).toContainText('Empresa Do Inventario');

    // E o caso que a lista de empresas não alcança: a conta do ADMINISTRADOR
    // DO SISTEMA não pertence a empresa nenhuma, e mesmo assim é "todos os
    // usuários" — uma lista montada pelas empresas a esqueceria.
    const admin = linhaDoUsuario(page, 'Admin E2E');
    await expect(admin).toHaveCount(1);
    await expect(admin).toContainText('sem empresa');
  });

  test('quem não é admin do sistema vê "Acesso restrito" e não vê o nome do membro', async ({
    irPara,
    page,
    semear,
  }) => {
    // ⚠️ O DADO EXISTE. O quase-admin tem as três chaves `admin.manage-*` —
    // o guard da API o LIBERA — e mesmo assim a tela recusa.
    const { emailDono } = await semearEmpresaComDono(semear);

    const quase = await semearQuaseAdmin();
    await plantarSessao(page, quase.tokens);

    await irPara('/admin/tenancy');

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O `<main>` EXISTE: um digest de erro do Next também não tem tabela, e as
    // contagens abaixo sozinhas passariam com a tela em 500. Quem diz "recusou"
    // é o heading acima.
    await expect(page.locator('main')).toHaveCount(1);
    // O conteúdo protegido não é entregue: nem as tabelas, nem o nome, nem o
    // e-mail do membro.
    await expect(page.locator('main table')).toHaveCount(0);
    await expect(page.getByText('Dona Do Inventario')).toHaveCount(0);
    await expect(page.getByText(emailDono)).toHaveCount(0);
    // E o menu não oferece o link: um menu que oferece uma porta que não abre
    // é metade da dívida.
    await expect(page.getByRole('link', { name: 'Empresas e usuários' })).toHaveCount(0);

    // ⚠️ E A API RECUSA TAMBÉM — e esta linha é a que dá o DENTE ao spec.
    //
    // O `PermissionsGuard` LIBERA o quase-admin (ele tem `admin.manage-users`
    // no banco): quem barra é o D2 dentro da use case. Medir só a TELA
    // deixaria o spec passar com um guard de front QUE FOSSE O ÚNICO portão —
    // e a base inteira exposta, sem nada aqui vermelho.
    const { apiBaseUrl } = exigirEstado();
    const resposta = await page.request.get(`${apiBaseUrl}/admin/tenants`, {
      headers: {
        authorization: `Bearer ${quase.tokens.accessToken}`,
        // Sem `x-tenant-id` — D14. O header é capacidade declarada pelo
        // cliente, e mandá-lo tiraria o ator do bucket global (o caminho que
        // o `lib/tenancy.ts` recusa por construction).
      },
    });
    expect(resposta.status()).toBe(403);
    // ⚠️ O `code` NÃO distingue os dois 403 — o `PermissionsGuard` e o D2
    // devolvem `FORBIDDEN` (o `codeFromStatus` do `GlobalExceptionFilter`
    // traduz o status). Quem os distingue é o `detail`: o guard nomeia a
    // PERMISSÃO que faltou, e o D2 nomeia QUEM pode ver. Assertar o `code`
    // deixaria o spec passar com o portão errado.
    const corpo = await resposta.json();
    expect(corpo.code).toBe('FORBIDDEN');
    expect(corpo.detail).toContain('administrador do sistema');
  });
});
