// FLUXO: F8 — Rota protegida sem sessão
// Cobre: quem chega sem cookie é levado ao login, e a volta ao login não é
// um beco sem saída.
//
// pt-BR — o que este fluxo segura.
//
// `exigirSessao()` é a única coisa que separa a listagem de usuários de quem
// não tem conta. Ela mora no servidor, num `redirect`, e roda ANTES de
// qualquer chamada à API — então o sintoma de ela deixar de rodar não é um
// dado vazado em tela: é a tela inteira aparecendo.
//
// Daí a ordem das asserções. Chegar em `/users` não prova acesso indevido —
// prova acesso. O que prova indevido é o CONTEÚDO: o nome e o e-mail do
// usuário semeado aparecendo numa página que deveria ter redirecionado. Sem
// essa segunda parte, um `toHaveURL` passaria com a página inteira vazia, e a
// falha do `redirect` seria confundida com "não havia o que listar".

import { clearCookies, expect, test } from './support/fixtures';
import { SENHA_DE_TESTE, emailUnico } from './support/dados';
import { exigirEstado } from './support/estado';

test.describe('F8 — Rota protegida sem sessão', () => {
  test('sem cookie, /users leva ao login em vez de listar', async ({ page, irPara }) => {
    await clearCookies(page);

    await irPara('/users');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });

  test('sem cookie, /users/novo também leva ao login', async ({ page, irPara }) => {
    await clearCookies(page);

    await irPara('/users/novo');

    // ⚠️ `/users/novo` é onde a pessoa se CADASTRA, e o cadastro em si é
    // público na API (D-2). O que exige sessão é a PÁGINA: ela está atrás do
    // `exigirSessao()` do `page.tsx`. Os dois são decisões diferentes, e esta
    // é a segunda. Um teste futuro que "consertar" isto aqui, porque o cadastro
    // é público quebraria o que o plano descreve como escopo — por isso o
    // comentário, e por isso a asserção está aqui.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });

  test('sem sessão, a listagem NÃO entrega os dados de ninguém', async ({
    page,
    irPara,
    semear,
  }) => {
    const email = emailUnico('protegido');
    const nome = 'Pessoa Que Nao Deve Aparecer';
    await semear(nome, email);

    await clearCookies(page);
    await irPara('/users');

    // A asserção de conteúdo. Se `exigirSessao()` parasse de rodar, o
    // redirect acabaria e esta linha seria o único lugar onde a falha
    // apareceria como dado — não como URL.
    await expect(page.getByText(nome)).toHaveCount(0);
    await expect(page.getByText(email)).toHaveCount(0);
  });

  test('com cookie inválido, o login volta a ser exigido', async ({ page, irPara }) => {
    // pt-BR: um cookie de GARBAGE é um estado que um cookie expirado deixa
    // para trás, e também o que um cookie adulterado produziria. `exigirSessao()`
    // só checa se o valor EXISTE — quem valida é a API, no guard. Se este
    // teste passasse com o lixo, a sessão falsa chegaria à listagem e a
    // resposta 401 viraria o tratamento genérico de erro.
    // ⚠️ `url` e `path` são mutuamente exclusivos no `addCookies` — passar os
    // dois aborta com "Cookie should have either url or path" ANTES do teste
    // rodar. Com `url`, o Playwright deriva domain e path sozinho. (MEDIDO
    // 2026-10-13: os dois specs que plantavam cookie com os dois campos caíam
    // assim, e a suíte inteira ficava vermelha num erro de chamada.)
    await page.context().addCookies([
      {
        name: 'access_token',
        value: 'token.invalido.nao.e.um.jwt',
        url: exigirEstado().webUrl,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await irPara('/users');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('quem entra pelo login sai da tela de login para a listagem', async ({
    page,
    irPara,
    semear,
  }) => {
    // Fechamento do ciclo: o caminho inverso ao redirect. Sem ele, uma
    // regressão que deixasse a tela de login EMPIRICAMENTE acessível — o
    // botão sumindo, a action deixando de gravar o cookie — passaria por
    // "redirect funcionou".
    //
    // A conta é semeada aqui, e não vem do harness: a conta do harness é
    // apagada em soft-delete por `limparBase()` e não consegue mais logar.
    const email = emailUnico('login-volta');
    await semear('Pessoa Que Volta', email);
    await clearCookies(page);
    await irPara('/login');

    await page.locator('#email').fill(email);
    await page.locator('#senha').fill(SENHA_DE_TESTE);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  });
});
