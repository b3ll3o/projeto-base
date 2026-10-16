// FLUXO: F13 — Meu perfil
// Cobre: a tela "quem sou eu" para admin, para usuário com perfil e para
// usuário sem perfil nenhum, e o destino de quem não tem sessão.
//
// pt-BR — por que esta tela precisa de spec.
//
// MEDIDO 2026-10-16: `/me/profile` era a ÚNICA tela do app com `page.tsx` e
// nenhum spec. O gate de cobertura e2e reconciliava o inventário com os
// cabeçalhos `// FLUXO:` dos specs — dois conjuntos escritos à mão — e
// anunciava "reconciliado sobre 12 fluxo(s) e 12 spec(s)" com a tela fora.
// A regra agora confere a coluna `Rota` contra os `page.tsx` do disco, e foi
// essa coluna que apontou esta linha.
//
// pt-BR — o que estes quatro estados seguram.
//
// A tela tem TRÊS renderizações distintas e uma quarta que é um redirect:
// admin (bypass, lista de permissões vazia), usuário com perfil (nome, slug,
// permissões efetivas) e usuário SEM perfil (`Sem perfil — deny-by-default`).
// Sem o terceiro, "Sem perfil" é indistinguível de "carregou e eu não achei" —
// o `<em>` do `page.tsx` é texto que o olho lê como conteúdo de tela, e um
// teste que só olhasse o `<h1>` passaria pelo motivo errado.

import { clearCookies, expect, plantarSessao, test } from './support/fixtures';
import { SENHA_DE_TESTE, emailUnico, parDeTokens, semearUsuario } from './support/dados';
import { semearContaComPerfil, semearPerfil } from './support/rbac';

test.describe('F13 — Meu perfil', () => {
  test('admin vê o próprio perfil, o bypass e a contagem de permissões', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;

    await irPara('/me/profile');

    await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();
    // Admin nasce SEM permissões porque o bypass vive no `isAdmin`, não na
    // lista. O `<h2>` que diz "(0)" é o que prova que a tela conta a lista de
    // verdade em vez de mostrar um número fixo.
    await expect(page.getByRole('heading', { name: 'Permissões (0)' })).toBeVisible();
    // E o texto do bypass, não só o "Sim": "Sim (bypass total)" diz POR QUE a
    // lista está vazia. Um "Sim" sozinho deixaria indistinguível o admin de
    // um usuário comum cuja lista renderizou vazia.
    await expect(page.getByText('Sim (bypass total)')).toBeVisible();
  });

  test('usuário com perfil vê nome, slug e as permissões efetivas', async ({ irPara, page }) => {
    const perfilId = await semearPerfil('leitor', ['users.read', 'profiles.read']);
    const conta = await semearContaComPerfil('Leitor Com Perfil', perfilId);
    // O token semeado sobrescreve o da sessão `auto` do harness. A ordem é o
    // comportamento: `semearContaComPerfil` LIGA o perfil antes de logar,
    // porque o `JwtAuthGuard` hidrata as claims no primeiro request e cacheia.
    await plantarSessao(page, conta.tokens);

    await irPara('/me/profile');

    // Nome e slug são a prova de que a tela leu o PERFIL DA SESSÃO, e não uma
    // constante: um slug hard-coded passaria no `toBeVisible` do `<h1>`.
    await expect(page.locator('main code').filter({ hasText: 'leitor' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Permissões (2)' })).toBeVisible();
    // As chaves uma a uma, não só a contagem: uma tela que contasse certo e
    // listasse as erradas passaria no `(2)`.
    await expect(page.locator('main li code').filter({ hasText: 'users.read' })).toHaveCount(1);
    await expect(page.locator('main li code').filter({ hasText: 'profiles.read' })).toHaveCount(1);
    // E o NEGATIVO do bypass: sem `isAdmin` a tela não diz "Sim".
    await expect(page.getByText('Sim (bypass total)')).toHaveCount(0);
  });

  test('usuário SEM perfil vê "deny-by-default", não uma tela vazia', async ({ irPara, page }) => {
    // Conta real e sessão real, sem `profileId` — o estado que existe quando
    // alguém é cadastrado e ainda não é ligado a nenhum perfil.
    const email = emailUnico('sem-perfil');
    await semearUsuario('Conta Sem Perfil', email);
    await plantarSessao(page, await parDeTokens(email, SENHA_DE_TESTE));

    await irPara('/me/profile');

    await expect(page.getByText('Sem perfil — deny-by-default')).toBeVisible();
    // E as permissões NÃO somem por silêncio: uma conta sem perfil tem lista
    // vazia, e a tela precisa dizer isso em vez de renderizar `<ul>` vazio.
    await expect(page.getByRole('heading', { name: 'Permissões (0)' })).toBeVisible();
  });

  test('sem sessão vai para o login, e não entrega perfil de ninguém', async ({ irPara, page }) => {
    // `comSessao` é `auto` e planta o cookie ANTES do corpo do teste; sem
    // este `clearCookies` a rota seria alcançada com sessão e o teste mediria
    // a tela em vez do redirect.
    await clearCookies(page);

    await irPara('/me/profile');

    await expect(page).toHaveURL(/\/login/);
    // O conteúdo NÃO é entregue. O redirect é server-side, então o HTML do
    // perfil não chega ao browser — e um `toHaveURL` sozinho passaria mesmo
    // que ele tivesse vindo no payload da navegação.
    await expect(page.getByRole('heading', { name: 'Meu perfil' })).toHaveCount(0);
  });
});
