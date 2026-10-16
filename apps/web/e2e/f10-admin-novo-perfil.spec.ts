// FLUXO: F10 — Criação de perfil (admin)
//
// Cobre: o formulário de `/admin/profiles/new`, o POST que ele dispara e o
// `redirect` para o detalhe. O segundo teste segura o gate da tela.

import { expect, plantarSessao, test } from './support/fixtures';
import { semearQuaseAdmin } from './support/rbac';

test.describe('F10 — Criação de perfil (admin)', () => {
  test('admin cria perfil com permissão inicial e cai no detalhe', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    await irPara('/admin/profiles/new');
    await expect(page.getByRole('heading', { name: 'Novo perfil' })).toBeVisible();

    // Locator por `name`, não por label: o `<label>` embrulha o input com um
    // espaço antes dos dois-pontos, e o texto exato depende desse espaço.
    await page.locator('input[name="slug"]').fill('editor-x');
    await page.locator('input[name="name"]').fill('Editor X');
    await page.locator('input[name="permissionKey"][value="users.read"]').check();
    await page.getByRole('button', { name: 'Criar perfil' }).click();

    await expect(page).toHaveURL(/\/admin\/profiles\/editor-x$/);
    // O detalhe é a prova de que o POST deu 201 e não um 409 engolido: a
    // página de detalhe só renderiza com um `ProfileDetail` resolvido por slug.
    await expect(page.getByRole('heading', { name: 'Perfil: Editor X' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Permissões (1)' })).toBeVisible();
    // E `isAdmin`/`isSystem` não são offeridos — o formulário não tem onde
    // mandá-los, que é a forma de o "admin é só via seed" ser verdade na tela
    // e não só no comentário.
    await expect(page.locator('input[name="isAdmin"], input[name="isSystem"]')).toHaveCount(0);
  });

  test('quem não é admin vê "Acesso restrito"', async ({ page, irPara }) => {
    const quase = await semearQuaseAdmin();
    await plantarSessao(page, quase.tokens);

    await irPara('/admin/profiles/new');

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O conteúdo: o formulário é o que não pode ter vazado. Um `count(0)` no
    // `<form>` é o que distingue "recusou" de "renderizou e escondeu".
    await expect(page.locator('main form')).toHaveCount(0);
  });
});
