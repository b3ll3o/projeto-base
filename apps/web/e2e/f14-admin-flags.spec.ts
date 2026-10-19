// FLUXO: F14 — Ativação e desativação de funcionalidades (admin)
//
// Cobre: `/admin/flags` — a tela que o ADMINISTRADOR DO SISTEMA usa para
// ligar e desligar funcionalidades, e o efeito do estado salvo sobre a rota
// que respeita a flag.
//
// pt-BR: o 2º teste é o que este arquivo não podia deixar de medir. O cenário
// 12 da API escreve a flag no BANCO e prova que a rota respeita; o
// `lib/flags.spec.ts` prova path e método contra um cliente MOCKADO. O que
// sobrava — a emenda entre os dois — é se o que o admin marca NA TELA é a
// mesma coisa que o guard LÊ. Um PUT na URL errada passaria nas duas pontas e
// deixaria a tela mentindo para quem acredita nela.

import type { Page } from '@playwright/test';
import { expect, plantarSessao, test } from './support/fixtures';
import { semearAdmin, semearQuaseAdmin } from './support/rbac';
import { exigirEstado } from './support/estado';

const CHAVE = 'tenancy.invites';

/** A linha da tabela da flag — usada nos dois primeiros testes. */
function linhaDaFlag(page: Page) {
  return page.locator('main table tbody tr').filter({ hasText: CHAVE });
}

/**
 * O input da linha, pelo nome acessível.
 *
 * O nome carrega o ESTADO (`tenancy.invites — ligada`), não a ação — era
 * "Ativar <chave>" nos dois estados, e quem navega por leitor de tela não
 * tinha como saber pelo nome se a linha estava ligada. O `^…` com alternância
 * deixa o locator estável entre os dois estados, e o estado em si é o que as
 * asserções `.toBeChecked()`/`not` afirmam.
 */
function caixaDaFlag(page: Page) {
  return linhaDaFlag(page).getByLabel(
    new RegExp(`^${CHAVE.replace('.', '\\.')} — (ligada|desligada)$`),
  );
}

test.describe('F14 — Ativação e desativação de funcionalidades (admin)', () => {
  test('admin desliga e religa a flag, e a tela reflete o que foi salvo', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;

    await irPara('/admin/flags');

    const caixa = caixaDaFlag(page);
    // D4: sem linha no banco a chave chega `true`, e a base está limpa
    // (`limparBase` trunca `feature_flags`), então `defaultChecked` mostra o
    // estado efetivo, não um palpite.
    await expect(caixa).toBeChecked();
    // E o NOME acessível diz o mesmo — as duas afirmações juntas fecham "a tela
    // mostra o estado, e o nome não mente sobre ele".
    await expect(linhaDaFlag(page).getByLabel(`${CHAVE} — ligada`)).toBeChecked();

    await caixa.uncheck();
    await linhaDaFlag(page).getByRole('button', { name: 'Salvar' }).click();

    // ⚠️ RECARREGA, e é obrigatório. `defaultChecked` num input uncontrolled
    // só vale na montagem: sem recarregar, o checkbox já aparece desmarcado
    // porque o USUÁRIO o desmarcou, e a asserção passaria mesmo com o PUT
    // descartado — verde por repetição do gesto, não por efeito. Recarregar
    // remonta o input com o que a API devolveu, e é aí que a afirmação passa
    // a depender do que foi gravado. (O F12 não recarrega porque a coluna que
    // ele afirma é texto re-renderizado pelo `revalidatePath`.)
    await irPara('/admin/flags');
    await expect(caixaDaFlag(page)).not.toBeChecked();

    // O caminho inverso no MESMO teste: um spec que só desliga passaria
    // também com um botão que só sabe desligar.
    await caixaDaFlag(page).check();
    await linhaDaFlag(page).getByRole('button', { name: 'Salvar' }).click();
    await irPara('/admin/flags');
    await expect(caixaDaFlag(page)).toBeChecked();
  });

  test('a flag que o admin desliga na tela é a que a rota de convites respeita', async ({
    irPara,
    page,
  }) => {
    // `semearAdmin` direto (e não a fixture `comoAdmin`) porque este teste
    // precisa do TOKEN para chamar a API — e o cookie é httpOnly, ou seja,
    // nenhum browser, nem por `evaluate`, consegue lê-lo.
    const admin = await semearAdmin();
    await plantarSessao(page, admin.tokens);

    const { apiBaseUrl } = exigirEstado();
    // Um tenant que não existe, de propósito: o pedido morre no `findRole`
    // (o admin do sistema não é dono de empresa nenhuma) e a resposta é
    // `403 FORBIDDEN`, o que prova que a chamada ATRAVESSOU o guard.
    // Desligada, a mesma chamada morre antes, no guard, com `404`.
    const url = `${apiBaseUrl}/tenants/0190a8b6-0000-7000-8000-00000000ffff/invitations`;
    const pedir = () =>
      page.request.post(url, {
        headers: {
          authorization: `Bearer ${admin.tokens.accessToken}`,
          // Sem `x-tenant-id` — D14. Enviar o header tira o ator do bucket
          // global, e é por isso que `lib/flags.ts` se recusa a mandá-lo.
        },
        data: { email: 'convidado@acme.test' },
      });

    await irPara('/admin/flags');
    await caixaDaFlag(page).uncheck();
    await linhaDaFlag(page).getByRole('button', { name: 'Salvar' }).click();

    // ⚠️ O SALVAMENTO É ESPERADO ANTES do pedido, e não por `waitForTimeout`.
    // MEDIDO 2026-10-18: sem esta espera o teste é uma CORRIDA — `click()`
    // resolve quando o clique é despachado, não quando a Server Action
    // volta, e o `pedir()` seguinte saía antes do PUT. Duas execuções do MESMO
    // código deram 403 e 404 para a mesma posição, em ordens opostas. Recarregar
    // e exigir o estado novo é a espera CORRETA porque é uma afirmação: se o
    // save não persistiu, ela falha AQUI, nomeando a causa, em vez de fazer o
    // `pedir()` seguinte mentir.
    await irPara('/admin/flags');
    await expect(caixaDaFlag(page)).not.toBeChecked();

    const desligada = await pedir();
    expect(desligada.status()).toBe(404);

    // O POSITIVO é obrigatório: 404 também é o que a rota devolve por outros
    // motivos, e sem o par o teste não distinguiria "a flag parou a rota" de
    // "a rota morreu antes, por outra coisa".
    await caixaDaFlag(page).check();
    await linhaDaFlag(page).getByRole('button', { name: 'Salvar' }).click();
    await irPara('/admin/flags');
    await expect(caixaDaFlag(page)).toBeChecked();

    const ligada = await pedir();
    expect(ligada.status()).toBe(403);
    // E o `title` diz QUEM recusou: o guard não nomeia a flag desligada, a
    // exceção de domínio nomeia o motivo. É o que separa os dois desfechos
    // sem depender do número.
    expect((await ligada.json()).title).toContain('dono da empresa');
  });

  test('quem não é admin do sistema vê "Acesso restrito" e não a lista de flags', async ({
    page,
    irPara,
  }) => {
    const quase = await semearQuaseAdmin();
    await plantarSessao(page, quase.tokens);

    await irPara('/admin/flags');

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O `<main>` EXISTE. MEDIDO 2026-10-18 (revisão adversarial, achado A5):
    // com o guard neutralizado, a página vira o digest de erro do Next — e um
    // digest também tem zero tabela, zero chave e zero link, então as contagens
    // abaixo sozinhas passam com a tela em 500. Elas dizem "não entregou o
    // dado"; quem diz "recusou" é o heading acima. Esta linha é a que separa
    // "recusou" de "explodiu".
    await expect(page.locator('main')).toHaveCount(1);
    // O conteúdo: as chaves e o estado de cada funcionalidade são o dado
    // protegido.
    await expect(page.locator('main table')).toHaveCount(0);
    await expect(page.getByText(CHAVE)).toHaveCount(0);
    // O menu também esconde o link: o guard de tela sem o gate de navegação
    // deixa um menu que oferece uma porta que não abre.
    await expect(page.getByRole('link', { name: 'Feature flags' })).toHaveCount(0);
  });
});
