// FLUXO: F7 — Login de usuário
// Cobre: login com sucesso, senha errada e e-mail inexistente.
//
// pt-BR — por que o terceiro teste é o mais importante deste arquivo.
//
// O teste do "e-mail inexistente" NÃO está aqui para descobrir se a tela
// mostra um erro: ele está aqui para provar que o erro é o MESMO da senha
// errada. A resposta do `POST /auth/login` é 401 genérico justamente para
// não dizer qual das duas foi a que falhou — sem isso, "e-mail inexistente"
// e "senha errada" viram um oráculo que permite a quem está testando
// descobrir se uma pessoa tem conta aqui, sem nunca ter a senha.
//
// É por isso que a asserção compara o TEXTO dos dois casos, e não apenas a
// presença de um erro. Um `toBeVisible()` passaria com as duas telas
// mostrando mensagens diferentes — que é exatamente o defeito que este
// teste existe para pegar. A garantia é a IGUALDADE.

import { clearCookies, expect, test } from './support/fixtures';
import { SENHA_DE_TESTE, criarEmpresa, emailUnico, parDeTokens } from './support/dados';

const MENSAGEM_INVALIDA = 'E-mail ou senha incorretos.';

test.describe('F7 — Login de usuário', () => {
  test('com credenciais válidas, entra e cai na listagem', async ({ page, irPara, semear }) => {
    // A conta é semeada pelo PRÓPRIO spec, e não vem do harness. Duas
    // razões, e as duas importam: a conta do harness é apagada em
    // soft-delete ao nascer (portanto não consegue logar), e um login
    // plantado pelo harness mediria o formulário provando o que o harness já
    // tinha provado.
    const email = emailUnico('login-ok');
    await semear('Pessoa Que Entra', email);
    // ⚠️ pt-BR (onboarding de empresa, 2026-10-21): a conta ganha EMPRESA
    // antes de entrar. O funil do login manda para `/empresa/nova` quem não
    // pertence a empresa nenhuma, e o F16 é o fluxo que mede esse destino.
    // Aqui o que se mede é o LOGIN — o cookie gravado e o destino alcançado —
    // e o destino de quem TEM empresa é a listagem. Uma conta sem empresa
    // levaria este teste a medir o onboarding, que é de outro arquivo.
    const tokens = await parDeTokens(email, SENHA_DE_TESTE);
    await criarEmpresa(tokens.accessToken, 'Empresa Do Login', 'empresa-do-login');
    // Sem isto o cookie da `comSessao` (auto) está presente, e `irPara('/login')`
    // mostraria a tela de login a quem JÁ tem sessão — o que não é o estado
    // que este arquivo mede.
    await clearCookies(page);
    await irPara('/login');

    await page.locator('#email').fill(email);
    await page.locator('#senha').fill(SENHA_DE_TESTE);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    // A prova de que o cookie foi gravado não é o redirect: é a listagem
    // carregando. Se `guardarTokens` deixasse de gravar, o `redirect('/users')`
    // continuaria levando à listagem — e `exigirSessao()` redirecionaria de
    // volta para `/login`. O par (destino alcançado + dado carregado) é o que
    // distingue "entrou" de "chegou num lugar que exige entrada".
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  });

  test('com senha errada, diz que e-mail ou senha está incorreto', async ({
    page,
    irPara,
    semear,
  }) => {
    const email = emailUnico('login-senha-errada');
    await semear('Pessoa Da Senha Errada', email);
    await clearCookies(page);
    await irPara('/login');

    await page.locator('#email').fill(email);
    await page.locator('#senha').fill('SenhaCompletamenteErrada123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.locator('form [role="alert"]')).toHaveText(MENSAGEM_INVALIDA);
    // O erro é do formulário inteiro, não de um campo: a API não diz qual
    // falhou, então marcar "o e-mail" seria inventar informação. Um
    // `aria-invalid` em `#email` aqui afirmaria o que o sistema não sabe.
    await expect(page.locator('#email')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#senha')).not.toHaveAttribute('aria-invalid', 'true');
    // E continua na tela de login — não há sessão para onde ir.
    await expect(page).toHaveURL(/\/login$/);
  });

  test('com e-mail inexistente, diz EXATAMENTE a mesma mensagem (anti-enumeração)', async ({
    page,
    irPara,
  }) => {
    await clearCookies(page);
    await irPara('/login');

    await page.locator('#email').fill('ninguem-e2e@example.com');
    await page.locator('#senha').fill(SENHA_DE_TESTE);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.locator('form [role="alert"]')).toHaveText(MENSAGEM_INVALIDA);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('o campo de senha é do tipo que gerenciadores entendem', async ({ page, irPara }) => {
    // pt-BR: `type="password"` esconde o valor, e `autoComplete="current-password"` é
    // o que faz o gerenciador PREENCHER em vez de OFERECER GERAR. `new-password`
    // aqui faria o Chrome sugerir uma senha nova para quem está entrando numa
    // conta que já existe — o botão fica errado e o campo, por baixo dele.
    await irPara('/login');

    await expect(page.locator('#senha')).toHaveAttribute('type', 'password');
    await expect(page.locator('#senha')).toHaveAttribute('autocomplete', 'current-password');
  });

  test('login sem cookie não deixa a pessoa numa tela sem saída', async ({ page, irPara }) => {
    // pt-BR: quem chega ao login sem conta precisa de uma saída. O link para o
    // cadastro é o que impede que o login seja beco sem saída — e ele é
    // renderizado pela tela, não pelo layout, então some junto com ela.
    await clearCookies(page);
    await irPara('/login');

    const criarConta = page.getByRole('link', { name: 'Criar conta', exact: true });
    await expect(criarConta).toBeVisible();
    await criarConta.click();
    await expect(page).toHaveURL(/\/users\/novo$/);
  });
});
