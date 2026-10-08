// FLUXO: F6 — Navegação entre as telas
// Cobre: a home renderiza, o link da listagem leva ao formulário, e o
//        "Cancelar" do formulário devolve para a listagem.
//
// pt-BR: este é o primeiro arquivo da suíte de propósito — o caminho mais curto
// do fluxo inteiro.
//
// ⚠️ A versão anterior deste cabeçalho prometia que este arquivo "não precisa de
// banco nem de API" e que, quebrando aqui, "o problema está antes da aplicação".
// MEDIDO 2026-10-08: `grep -n "auto: true" e2e/support/fixtures.ts` → linha 85,
// e `baseLimpa` chama `limparBase()` na linha 82 — as duas frases deste cabeçalho
// são falsas. `limparBase()` faz `GET /users`, então sem API o fixture derruba
// TODOS os testes deste arquivo, inclusive o da home, que não precisa de API
// nenhuma. O sintoma que sobraria ("GET /users respondeu 500" no teste da home)
// aponta para FLUXO e a causa está em BOOTSTRAP: o oposto do que se prometia.
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
    // ⚠️ `<h1>Usuários</h1>` e o link do cabeçalho estão FORA do ternário que
    // escolhe entre erro / vazio / lista (`app/users/page.tsx`), então os dois
    // testes acima passam igualmente no estado de ERRO — que é o que a tela
    // mostra quando o Next não consegue falar com a API. As duas asserções
    // abaixo são o que distingue "voltou para a listagem" de "voltou para uma
    // página que não conseguiu carregar nada".
    await expect(page.getByText('Nenhum usuário cadastrado')).toBeVisible();
    await expect(page.getByText('Não foi possível carregar a lista.')).toHaveCount(0);
  });
});
