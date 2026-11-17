// FLUXO: F20 — Detalhe do usuário e as empresas em que ele está (admin do sistema)
//
// Cobre: `/users` → `/users/[id]` → `/empresa/[id]` — a tela do ADMINISTRADOR
// DO SISTEMA que abre UMA pessoa da listagem, mostra as empresas em que ela
// está inserida (em cards clicáveis) e chega na empresa.
//
// ⚠️ O dado PRECISA EXISTIR no caso da recusa: "não vê o nome" passa no
// vazio, e um teste que passa no vazio não mede nada. Por isso os DOIS
// testes semeiam a empresa e o dono antes de olhar a tela.
//
// ⚠️ O QUE ESTE SPEC SEGURA É O PAR RECUSA/LIBERDADE. O que separa o
// administrador do SISTEMA dos demais é o `isAdmin` GLOBAL — e NÃO o recorte
// da listagem: sem o cookie `tenant_id`, `GET /users` responde no bucket
// GLOBAL (o carve-out documentado em `users.controller.ts`), e o
// administrador do sistema vê a base INTEIRA. O que ele tem a mais é o
// INVENTÁRIO da tenancy — as empresas de uma pessoa atravessando empresas.
// Sem o par, "o admin vê as empresas" e "qualquer um vê as empresas" passam
// no mesmo arquivo.

import type { Page } from '@playwright/test';
import { expect, plantarEmpresa, plantarSessao, test } from './support/fixtures';
import { SENHA_DE_TESTE, criarEmpresa, emailUnico, parDeTokens } from './support/dados';

/**
 * Semeia a empresa COM o seu dono — pela MESMA API que a tela usaria.
 *
 * `POST /tenants` é o caminho do onboarding: cria a empresa, os três perfis
 * dela e a membership do dono (`role: 'gerente'`, perfil `gerente`).
 *
 * O `id` do dono volta porque o caso da RECUSA precisa do path da página de
 * detalhe — sem ele, o teste não teria como abrir a porta que diz para fechar.
 * E os TOKENS voltam porque o caso da recusa é o DONO, acting com a própria
 * sessão.
 */
async function semearEmpresaComDono(
  semear: (nome: string, email: string) => Promise<{ id: string }>,
) {
  const emailDono = emailUnico('dona-detalhe');
  const conta = await semear('Dona Do Detalhe', emailDono);
  const tokens = await parDeTokens(emailDono, SENHA_DE_TESTE);
  const empresa = await criarEmpresa(
    tokens.accessToken,
    'Empresa Do Detalhe',
    'empresa-do-detalhe',
  );
  return { emailDono, id: conta.id, empresa, tokens };
}

/** O link da listagem que ABRE a pessoa — o nome é o que a pessoa lê. */
function linkDaPessoa(page: Page, nome: string) {
  return page.getByRole('link', { name: nome });
}

test.describe('F20 — Detalhe do usuário e as empresas em que ele está (admin)', () => {
  test('o admin do sistema abre a pessoa, vê as empresas em cards e chega na empresa', async ({
    comoAdmin,
    irPara,
    page,
    semear,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;

    const { emailDono } = await semearEmpresaComDono(semear);

    await irPara('/users');

    // ── a PORTA: a pessoa da listagem é clicável ──
    const pessoa = linkDaPessoa(page, 'Dona Do Detalhe');
    await expect(pessoa).toHaveCount(1);
    await pessoa.click();

    // ── o DETALHE: quem é a pessoa ──
    await expect(page.getByRole('heading', { level: 1, name: 'Dona Do Detalhe' })).toBeVisible();
    // O e-mail é o que distingue a pessoa — o nome, não.
    //
    // ⚠️ O e-mail da pessoa aparece na tela DUAS vezes desde o F21: na
    // legenda do cabeçalho e na coluna "Nome e e-mail" do HISTÓRICO (a
    // versão de criação). A asserção mede a PESSOA DE HOJE — a legenda —
    // e é `h1 + p` porque o `p` da descrição é o IRMÃO do `h1` (o
    // `CabecalhoPagina`). Sem o escopo, o `getByText` page-wide casaria os
    // dois e o spec cairia em strict mode.
    await expect(page.locator('main h1 + p')).toHaveText(emailDono);

    // ── os CARDS: as empresas em que ela está inserida ──
    const card = page.getByRole('link', { name: 'Empresa Do Detalhe' });
    await expect(card).toHaveCount(1);
    // O slug é o identificador legível da empresa — e é o que a distingue da
    // pessoa de outra empresa com o mesmo nome.
    await expect(card).toContainText('empresa-do-detalhe');
    // E o VÍNCULO: a papel que a pessoa veste na empresa.
    await expect(card).toContainText('gerente');

    // ── o CLIQUE no card abre a EMPRESA ──
    await card.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Empresa Do Detalhe' })).toBeVisible();
    await expect(page.getByText('empresa-do-detalhe')).toBeVisible();
    // E a empresa mostra QUEM está nela — a direção que o inventário também
    // mostra, e que a tela da pessoa não mostra sozinha.
    await expect(page.getByText('Dona Do Detalhe')).toBeVisible();
  });

  test('quem não é admin do sistema não abre o detalhe e não vê os dados', async ({
    irPara,
    page,
    semear,
  }) => {
    // ⚠️ O ATOR NEGATIVO É O DONO DA EMPRESA — o caso exato que esta tela
    // precisa recusar. O DONO veste o perfil `gerente`, que tem `isAdmin: true`
    // NA EMPRESA (`apps/api/src/modules/tenancy/domain/perfis-da-empresa.ts`);
    // com o cookie `tenant_id` plantado, o guard da EMPRESA (`exigirAdmin`) o
    // LIBERARIA, e o guard do SISTEMA (`exigirAdminDoSistema`) recusa —
    // porque o `isAdmin` que ele exige é o GLOBAL.
    //
    // ⚠️ O QUE ESTE SPEC PROVA (e o que NÃO prova): o DONO não vê o
    // inventário da tenancy — a afirmação de segurança do produto, medida no
    // browser com o dado plantado. A ESCOLHA do guard é do spec UNIT
    // (`app/users/[id]/page.spec.tsx`, que afirma `exigirAdminDoSistema` e
    // NUNCA `exigirAdmin`).
    //
    // MEDIDO 2026-11-17: mutando o guard de `/users/[id]` para `exigirAdmin`,
    // o spec unit cai (3 de 7) e o e2e NÃO — as duas recusas (a do guard e o
    // 403 da API) caem na MESMA tela de "Acesso restrito", e o browser não
    // distingue uma da outra. O quase-admin anterior também não distinguia:
    // ele produzia a mesma tela nos DOIS guards.
    const { emailDono, id, empresa, tokens } = await semearEmpresaComDono(semear);

    await plantarSessao(page, tokens);
    // ⚠️ O cookie da empresa é o que tira o ator do bucket GLOBAL — e sem
    // ele, o guard da EMPRESA leria o mesmo perfil (o global) que o do
    // SISTEMA, e o ator não seria o caso que esta tela precisa recusar.
    await plantarEmpresa(page, empresa.id);

    await irPara('/users');

    // ⚠️ O DADO ESTÁ NA LISTAGEM — e isso é o que dá sentido à asserção
    // seguinte. Sem esta linha, "não é clicável" passaria no VAZIO: uma
    // listagem que quebrasse para esse ator manteria o teste verde.
    await expect(page.getByText('Dona Do Detalhe')).toBeVisible();

    // A LISTAGEM continua sendo a da empresa — mas a pessoa NÃO é clicável:
    // o clique é o que leva ao inventário da tenancy, e o inventário é do
    // administrador do SISTEMA.
    await expect(linkDaPessoa(page, 'Dona Do Detalhe')).toHaveCount(0);

    // E a página de detalhe, aberta pelo path, recusa.
    await irPara(`/users/${id}`);
    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O `<main>` EXISTE: um digest de erro do Next também não tem o nome da
    // pessoa, e as contagens abaixo sozinhas passariam com a tela em 500.
    // Quem diz "recusou" é o heading acima.
    await expect(page.locator('main')).toHaveCount(1);
    // O conteúdo protegido não é entregue: nem o nome, nem o e-mail, nem o
    // slug da empresa.
    await expect(page.getByText('Dona Do Detalhe')).toHaveCount(0);
    await expect(page.getByText(emailDono)).toHaveCount(0);
    await expect(page.getByText('empresa-do-detalhe')).toHaveCount(0);
  });

  test('um id que não existe é 404 — e a tela é a de "não encontrado", em pt-BR', async ({
    appUrl,
    comoAdmin,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;

    // ⚠️ O STATUS é a asserção — e não o texto. Um id inexistente que
    // CAÍSSE na tela de "serviço indisponível" teria status 200, e a tela
    // mentiria sobre a causa ("não existe" e "a API está fora" são
    // respostas diferentes).
    const resposta = await page.goto(appUrl(`/users/${UUID_INEXISTENTE}`));
    expect(resposta?.status()).toBe(404);
    // E a tela é a de NOT FOUND do app — em português, com o `<main>`: sem
    // `app/not-found.tsx` o Next renderiza a página default, em inglês e sem
    // o landmark do app.
    await expect(page.getByRole('heading', { name: 'Não encontrado' })).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);

    const respostaDaEmpresa = await page.goto(appUrl(`/empresa/${UUID_INEXISTENTE}`));
    expect(respostaDaEmpresa?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Não encontrado' })).toBeVisible();
  });

  test('a 320px as duas telas não rolam na horizontal (WCAG 1.4.10)', async ({
    comoAdmin,
    irPara,
    page,
    semear,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;

    const { id } = await semearEmpresaComDono(semear);

    await page.setViewportSize({ width: 320, height: 640 });

    await irPara(`/users/${id}`);
    const medidaDoDetalhe = await medirLargura(page);
    expect(medidaDoDetalhe.scrollWidth).toBeLessThanOrEqual(medidaDoDetalhe.clientWidth);

    // E a página da empresa — o grid de cards e a tabela de membros.
    const empresaId = await idDaEmpresaPeloCard(page);
    await irPara(`/empresa/${empresaId}`);
    const medidaDaEmpresa = await medirLargura(page);
    expect(medidaDaEmpresa.scrollWidth).toBeLessThanOrEqual(medidaDaEmpresa.clientWidth);
  });
});

/** Um UUID que não existe — a forma do path, com um id fora do inventário. */
const UUID_INEXISTENTE = '00000000-0000-7000-8000-000000000000';

/**
 * A largura da tela — a MESMA medida que o F6 faz (`scrollWidth` contra
 * `clientWidth`).
 */
async function medirLargura(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/**
 * O id da empresa da dona — pelo LINK do card.
 *
 * ⚠️ O id vem do card, e não da API: o spec que mede o reflow precisa do
 * MESMO destino que a pessoa veria, e o card é o caminho que ela clica.
 */
async function idDaEmpresaPeloCard(page: Page): Promise<string> {
  const href = await page.getByRole('link', { name: /Empresa Do Detalhe/ }).getAttribute('href');
  expect(href).toBeTruthy();
  return href!.split('/').pop()!;
}
