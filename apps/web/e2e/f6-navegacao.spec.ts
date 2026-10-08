// FLUXO: F6 — Navegação entre as telas
// Cobre: a home renderiza, o link da listagem leva ao formulário, e o
//        "Cancelar" do formulário devolve para a listagem.
//
// pt-BR: este é o primeiro arquivo da suíte de propósito — é o que não
// precisa de banco nem de API, e portanto o que separa uma falha de
// BOOTSTRAP (Postgres, Next, portas) de uma falha de FLUXO. Se a suíte
// quebrar aqui, o problema está antes da aplicação.
//
// pt-BR (por que a home fica fora do teste de navegação): ela é uma tela
// estática e não tem link para a listagem — o acesso é por URL direta.
// Testar "chegar em / e ver o título" basta; inventar navegação de onde não
// há seria escrever o teste contra o app imaginado, não contra o app.

import { expect, linkCadastrar, test } from './support/fixtures';

test.describe('F6 — Navegação', () => {
  test('a home apresenta o título do projeto', async ({ page, irPara }) => {
    await irPara('/');

    await expect(page.getByRole('heading', { name: 'Projeto Base' })).toBeVisible();
  });

  test('o link da listagem leva ao formulário de cadastro', async ({ page, irPara }) => {
    await irPara('/users');
    await linkCadastrar(page).click();

    await expect(page).toHaveURL(/\/users\/novo$/);
    await expect(page.getByRole('heading', { name: 'Cadastrar usuário' })).toBeVisible();
  });

  test('"Cancelar" no formulário devolve para a listagem', async ({ page, irPara }) => {
    await irPara('/users/novo');
    await page.getByRole('link', { name: 'Cancelar' }).click();

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  });
});
