// FLUXO: F16 — Onboarding de empresa
// Cobre: a conta própria sem empresa é levada a criar uma; a empresa criada
// dá à pessoa o perfil de DONO; quem entra por convite entra NA empresa que
// convidou; e o administrador de SISTEMA fica de fora do funil.
//
// pt-BR — o que este fluxo segura.
//
// A regra do produto é uma só, e ela tem três pernas:
//
//   1. Quem entra por CONTA PRÓPRIA não tem empresa nenhuma — e por isso é
//      levado a CRIAR uma (e vira DONO dela).
//   2. Quem entra por CONVITE nasce na empresa que convidou.
//   3. O administrador de SISTEMA não pertence a empresa nenhuma — e por isso
//      NÃO é levado a criar uma.
//
// A perna 1 e a perna 3 são o mesmo código (o funil do login) com decisões
// opostas, e é por isso que os dois testes existem: um funil que mandasse
// TODO mundo para `/empresa/nova` passaria no teste 1 e falharia no 3 — e um
// funil que mandasse NINGUÉM passaria no 3 e falharia no 1.
//
// ⚠️ Por que o DONO é medido pelo PERFIL EFETIVO e não pelo nome da tela: o
// `gerente` é o único dos três perfis da empresa com `admin.manage-profiles`
// (o gestor administra PESSOAS, o funcionário só lê o diretório). Ver a
// permissão que a tela mostra: é o que separa "gerente" de "coordenador" sem
// depender do rótulo.
//
// pt-BR — o CONVITE é emitido pela API, e não pela tela.
//
// Não existe tela de emissão de convite no produto: o dono emitiria um
// convite por uma tela que ninguém pediu. O que este fluxo mede é a ENTRADA
// pelo convite — e a entrada é pela tela, do link ao login. Emitir pela
// mesma API que a tela usaria é o que `dados.ts` faz com todo o resto.

import {
  clearCookies,
  expect,
  itensDaLista,
  plantarEmpresa,
  plantarSessao,
  test,
} from './support/fixtures';
import {
  SENHA_DE_TESTE,
  criarEmpresa,
  emailUnico,
  emitirConvite,
  listarEmpresasDoAtor,
  parDeTokens,
} from './support/dados';
import { semearAdmin } from './support/rbac';
import type { Page } from '@playwright/test';

/** Entra pela TELA — o mesmo caminho que a pessoa percorre. */
async function entrarPelaTela(page: Page, email: string): Promise<void> {
  await page.locator('#email').fill(email);
  await page.locator('#senha').fill(SENHA_DE_TESTE);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test.describe('F16 — Onboarding de empresa', () => {
  test('conta própria sem empresa é levada a CRIAR uma', async ({ page, irPara, semear }) => {
    // A conta é semeada pelo PRÓPRIO spec: a do harness é apagada em
    // soft-delete ao nascer e não consegue logar.
    const email = emailUnico('sem-empresa');
    await semear('Pessoa Sem Empresa', email);
    await clearCookies(page);
    await irPara('/login');

    await entrarPelaTela(page, email);

    // A tela de criação é a que o funil entrega — e ela exige SESSÃO, então
    // o fato de ela ter desenhado já prova que o cookie foi gravado.
    await expect(page).toHaveURL(/\/empresa\/nova$/);
    await expect(page.getByRole('heading', { name: 'Criar empresa' })).toBeVisible();
  });

  test('a empresa criada dá à pessoa o perfil de DONO, com todas as permissões', async ({
    page,
    irPara,
    semear,
  }) => {
    const email = emailUnico('dona');
    const nome = 'Pessoa Dono';
    await semear(nome, email);
    await clearCookies(page);
    await irPara('/login');
    await entrarPelaTela(page, email);

    await expect(page).toHaveURL(/\/empresa\/nova$/);
    await page.locator('#nome').fill('Empresa do Teste');
    await page.locator('#slug').fill('empresa-do-teste');
    await page.getByRole('button', { name: 'Criar empresa', exact: true }).click();

    // A empresa criada é a empresa DA SESSÃO: o cookie `tenant_id` é o que
    // faz o `X-Tenant-Id` sair. Sem ele a listagem volta recortada para a
    // própria linha, e a tela não diz por quê.
    await expect(page).toHaveURL(/\/users$/);
    await expect(itensDaLista(page).getByText(nome)).toBeVisible();

    // E o perfil EFETIVO é o dono. O `<dd>` do perfil é o primeiro da
    // página (`Identidade`: Perfil · Admin?), e o do bypass o segundo.
    await irPara('/me/profile');
    await expect(page.locator('dd').first()).toContainText('(gerente)');
    await expect(page.locator('dd').nth(1)).toHaveText('Sim (bypass total)');

    // A permissão que só o DONO tem: `admin.manage-profiles` não está no
    // coordenador nem no funcionário. Vê-la na lista é o que separa "gerente" de
    // "qualquer um dos três" — o rótulo sozinho não provaria nada.
    await expect(page.getByText('admin.manage-profiles', { exact: true })).toHaveCount(1);
  });

  test('quem entra por convite entra NA empresa que convidou', async ({ page, irPara, semear }) => {
    // O DONO existe e convida — pela MESMA API que a tela usaria.
    const emailDono = emailUnico('dona-convidante');
    await semear('Dona Que Convida', emailDono);
    const tokensDono = await parDeTokens(emailDono, SENHA_DE_TESTE);
    const empresa = await criarEmpresa(
      tokensDono.accessToken,
      'Empresa Do Convite',
      'empresa-do-convite',
    );
    const emailConvidado = emailUnico('convidado');
    const token = await emitirConvite(tokensDono.accessToken, empresa.id, emailConvidado);

    // O convidado chega pelo link, SEM sessão.
    await clearCookies(page);
    await irPara(`/convite/${token}`);

    // Sem conta, o caminho é o CADASTRO COM o token — é de lá que a conta
    // nasce na empresa que convidou.
    await expect(page).toHaveURL(new RegExp(`/users/novo\\?convite=${token}`));
    await expect(page.getByRole('heading', { name: 'Cadastrar usuário' })).toBeVisible();

    await page.locator('#nome').fill('Pessoa Convidada');
    await page.locator('#email').fill(emailConvidado);
    await page.locator('#senha').fill(SENHA_DE_TESTE);
    await page.getByRole('button', { name: 'Cadastrar usuário', exact: true }).click();

    await expect(page).toHaveURL(/\/login\?cadastrado=1$/);

    // E, ao entrar, a pessoa NÃO é levada a criar empresa: ela já tem uma.
    await entrarPelaTela(page, emailConvidado);
    await expect(page).toHaveURL(/\/users$/);

    // A prova de que a empresa é a QUE CONVIDOU — a API responde a lista de
    // empresas do ator, e é a MESMA lista que o login consultou para decidir
    // o destino.
    const tokensConvidado = await parDeTokens(emailConvidado, SENHA_DE_TESTE);
    const empresas = await listarEmpresasDoAtor(tokensConvidado.accessToken);
    expect(empresas.map((e) => e.id)).toContain(empresa.id);

    // E o dono a vê na listagem DA EMPRESA — o que prova que ela entrou na
    // empresa que convidou, e não em outra qualquer. O dono recebe sessão e
    // empresa DE NOVO: quem emitiu o convite não passou pela tela de criação
    // de empresa, então não tem cookie de empresa nenhum.
    await clearCookies(page);
    await plantarSessao(page, tokensDono);
    await plantarEmpresa(page, empresa.id);
    await irPara('/users');
    await expect(itensDaLista(page).getByText('Dona Que Convida')).toBeVisible();
    await expect(itensDaLista(page).getByText('Pessoa Convidada')).toBeVisible();
  });

  test('quem JÁ tem conta entra pelo mesmo link e entra NA empresa que convidou', async ({
    page,
    irPara,
    semear,
  }) => {
    // A perna que faltava: o convite NÃO diz se a pessoa tem conta — o token
    // é do CONVITE, não da conta. Então a tela de convite leva todo mundo ao
    // CADASTRO, e quem já tem conta precisa de uma saída que a leve ao
    // LOGIN com o token, para o aceite voltar a funcionar depois.
    const emailDono = emailUnico('dona-convidante');
    await semear('Dona Que Convida', emailDono);
    const tokensDono = await parDeTokens(emailDono, SENHA_DE_TESTE);
    const empresa = await criarEmpresa(
      tokensDono.accessToken,
      'Empresa Do Convite De Quem Ja Tem Conta',
      'empresa-do-convite-com-conta',
    );

    // O convidado JÁ TEM CONTA — é a diferença entre esta perna e a de cima.
    const emailConvidado = emailUnico('convidado-com-conta');
    await semear('Pessoa Que Ja Tem Conta', emailConvidado);
    const token = await emitirConvite(tokensDono.accessToken, empresa.id, emailConvidado);

    // O convidado chega pelo link, SEM sessão.
    await clearCookies(page);
    await irPara(`/convite/${token}`);

    // A tela de convite não sabe se a conta existe, então ela leva ao
    // CADASTRO — e é aí que a pessoa com conta descobre que precisa entrar.
    await expect(page).toHaveURL(new RegExp(`/users/novo\\?convite=${token}`));

    // A saída que faltava: "Já tenho conta" leva ao LOGIN, com o token.
    await page.getByRole('link', { name: 'Já tenho conta' }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?convite=${token}`));

    // Entra pela tela — e o token ATRAVESSA o login: a sessão está na conta
    // errada (a conta de quem foi semeado pelo harness), e trocar de
    // identidade sem o token perderia a empresa que convidou.
    await entrarPelaTela(page, emailConvidado);
    await expect(page).toHaveURL(new RegExp(`/convite/${token}`));

    // E aceita.
    await page.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
    await expect(page).toHaveURL(/\/users$/);

    // A prova de que a empresa é a QUE CONVIDOU — a MESMA lista que o login
    // consultou para decidir o destino.
    const tokensConvidado = await parDeTokens(emailConvidado, SENHA_DE_TESTE);
    const empresas = await listarEmpresasDoAtor(tokensConvidado.accessToken);
    expect(empresas.map((e) => e.id)).toContain(empresa.id);
  });

  test('o administrador de SISTEMA não é levado a criar empresa', async ({ page, irPara }) => {
    // O admin de sistema administra a PLATAFORMA e não pertence a empresa
    // nenhuma — é a exceção da regra. É semeado pelo banco porque não existe
    // rota HTTP que crie um profile `isAdmin` (ver `support/rbac.ts`).
    const admin = await semearAdmin();
    await clearCookies(page);
    await irPara('/login');

    await entrarPelaTela(page, admin.email);

    // O destino é a listagem, e não a criação de empresa: mandá-lo para
    // `/empresa/nova` seria levá-lo a abrir uma empresa que ele não vai usar.
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  });
});
