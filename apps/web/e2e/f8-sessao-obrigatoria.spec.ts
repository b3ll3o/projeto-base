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

  test('sem cookie, /users/novo é alcançável — é a porta de entrada', async ({ page, irPara }) => {
    await clearCookies(page);

    await irPara('/users/novo');

    // `/users/novo` é onde a pessoa se CADASTRA, e `POST /users` é PÚBLICO na
    // API (D-2). Exigir sessão aqui não impedia ninguém de criar conta — só
    // impedia a PESSOA, num beco sem saída: o link "Criar conta" da tela de
    // login aponta para esta página, e quem não tem conta voltava para o
    // login. Medido em 2026-10-13: com a tela protegida, este teste e o F7
    // ("o login não deixa a pessoa numa tela sem saída") afirmavam coisas
    // opostas, e o F7 falhava de forma intermitente — a proteção da tela não
    // comprava nada que a API pública já não devolvesse.
    //
    // A tela que exige sessão é `/users`, a listagem, testada nos dois testes
    // acima. Cadastro é a porta de entrada; listagem é onde os dados estão.
    await expect(page).toHaveURL(/\/users\/novo$/);
    await expect(page.getByRole('heading', { name: 'Cadastrar usuário' })).toBeVisible();
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
