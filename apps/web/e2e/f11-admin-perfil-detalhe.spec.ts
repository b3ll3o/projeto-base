// FLUXO: F11 — Detalhe de perfil e troca de permissões (admin)
//
// Cobre: as DUAS renderizações de `/admin/profiles/[slug]` — a editável
// (perfil comum, com form) e a somente-leitura (perfil de sistema). O par é o
// que fecha o M1 do #97, cujo sintoma era o botão "Salvar" parecer funcionar
// sobre um perfil que a API recusa alterar.

import { expect, plantarSessao, test } from './support/fixtures';
import { semearPerfil, semearQuaseAdmin } from './support/rbac';

test.describe('F11 — Detalhe de perfil (admin)', () => {
  test('perfil comum: marca uma permissão, salva, e a tela reflete', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-editavel';
    await semearPerfil(slug, []);

    await irPara(`/admin/profiles/${slug}`);

    const caixa = page.locator('input[name="permissionKey"][value="users.read"]');
    await expect(caixa).not.toBeChecked();
    await caixa.check();
    await page.getByRole('button', { name: 'Salvar' }).click();

    // Sem `reload`: o Server Action responde com a árvore re-renderizada, e
    // recarregar aqui transformaria "a tela mostra o salvo" em "a tela mostra
    // o que está no banco" — verde se o PUT tivesse sido um no-op.
    await expect(page.getByRole('heading', { name: 'Permissões (1)' })).toBeVisible();
    await expect(caixa).toBeChecked();
  });

  test('perfil de sistema: somente leitura, sem form e sem botão', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-sistema';
    await semearPerfil(slug, ['users.read'], { isSystem: true });

    await irPara(`/admin/profiles/${slug}`);

    await expect(page.getByRole('heading', { name: 'Flags' })).toBeVisible();
    await expect(page.locator('li', { hasText: 'isSystem' })).toHaveText(/✅/);
    // O conteúdo: a tela de sistema lista as permissões COMO TEXTO, num
    // `<ul>` sem input. Afirmar a ausência do checkbox é o que prova que o
    // bloqueio é de renderização — a API, sozinha, recusaria o POST depois.
    await expect(page.locator('input[name="permissionKey"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);
    await expect(page.locator('li', { hasText: 'users.read' })).toHaveText(/✅/);
  });

  test('quem não é admin vê "Acesso restrito" em vez do perfil', async ({ page, irPara }) => {
    const slug = 'perfil-indesejado';
    await semearPerfil(slug, ['users.read']);
    const quase = await semearQuaseAdmin();
    await plantarSessao(page, quase.tokens);

    await irPara(`/admin/profiles/${slug}`);

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O slug não pode aparecer: ele é o dado que a tela promete não entregar.
    await expect(page.locator('main code')).toHaveCount(0);
  });
});
