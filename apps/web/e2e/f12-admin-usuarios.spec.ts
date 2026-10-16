// FLUXO: F12 — Atribuição de perfil a usuário (admin)
//
// Cobre: `/admin/users` — a listagem, o select por usuário e o PUT que
// persiste a atribuição. É a única tela que escreve numa OUTRA entidade, e a
// única onde um erro silencioso não quebra a tela: sem perfil, a coluna
// "Perfil atual" simplesmente continua dizendo "sem perfil".

import { expect, plantarSessao, test } from './support/fixtures';
import { emailUnico, semearUsuario } from './support/dados';
import { semearPerfil, semearQuaseAdmin } from './support/rbac';

test.describe('F12 — Atribuição de perfil a usuário (admin)', () => {
  test('admin atribui um perfil e a coluna "Perfil atual" passa a mostrá-lo', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const perfilId = await semearPerfil('editor-x', ['users.read']);
    const alvo = await semearUsuario('Alice Alvo', emailUnico('alvo'));

    await irPara('/admin/users');

    const linha = page.locator('main table tbody tr').filter({ hasText: alvo.email });
    await expect(linha).toHaveCount(1);
    await expect(linha.getByRole('cell').nth(2)).toHaveText('sem perfil');

    await linha.locator('select').selectOption(perfilId);
    await linha.getByRole('button', { name: 'Salvar' }).click();

    // Sem `reload` de novo: o que muda a coluna é o `revalidatePath`, não o
    // banco sendo lido de novo. Recarregar tornaria o teste verde mesmo com
    // o PUT descartado, porque a segunda leitura traria o estado certo.
    await expect(linha.getByRole('cell').nth(2)).toHaveText('editor-x');
  });

  test('quem não é admin vê "Acesso restrito" em vez da lista de usuários', async ({
    page,
    irPara,
  }) => {
    await semearUsuario('Bob Visivel', emailUnico('bob'));
    const quase = await semearQuaseAdmin();
    await plantarSessao(page, quase.tokens);

    await irPara('/admin/users');

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O conteúdo: nome e e-mail dos usuários são o dado protegido. Um
    // `toHaveCount(0)` na tabela é o que separa "recusou" de "renderizou".
    await expect(page.locator('main table')).toHaveCount(0);
    await expect(page.getByText('Bob Visivel')).toHaveCount(0);
  });
});
