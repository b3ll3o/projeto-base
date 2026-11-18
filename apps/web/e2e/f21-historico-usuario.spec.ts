// FLUXO: F21 — O histórico de auditoria de uma pessoa (admin do sistema)
//
// Cobre: `/users/[id]` — a seção "Histórico" do detalhe de UMA pessoa, lida
// pelo ADMINISTRADOR DO SISTEMA: as VERSÕES de auditoria dela (criação,
// alteração), cada uma com o nome e o e-mail de QUANDO aquela versão foi
// gravada, quando aconteceu, quem mudou e por quê.
//
// ⚠️ O DADO PRECISA EXISTIR: o histórico só tem entradas onde houve mutação.
// Uma pessoa recém-nascida tem UMA (a criação). O caminho que produz DUAS é:
// semear a pessoa e ela se renomear com o PRÓPRIO token — `PATCH /users/:id`
// com `If-Match: W/"v1"`, porque o `UserOwnershipGuard` exige que o `:id` da
// rota seja o `sub` do token. É a pessoa que se renomeia, e não o admin: o
// admin do sistema não é dono de ninguém, e a rota do DONO é a única que ele
// pode usar.
//
// ⚠️ O QUE ESTE SPEC SEGURA É O PAR RECUSA/LIBERDADE. O que separa o
// administrador do SISTEMA dos demais é o `isAdmin` GLOBAL — e o histórico é
// dado pessoal (o nome e o e-mail de cada versão da pessoa). Sem o par, "o
// admin vê o histórico" e "qualquer um vê o histórico" passam no mesmo
// arquivo.
//
// ⚠️ E O QUE O SPEC MEDE É O QUE A PESSOA LÊ: a versão, o que houve, o nome e
// o e-mail DAQUELA VERSÃO, e quem mudou. A API devolvendo o dado não prova
// nada — o que prova é a TELA.

import type { Page } from '@playwright/test';
import { expect, plantarEmpresa, plantarSessao, test } from './support/fixtures';
import {
  SENHA_DE_TESTE,
  criarEmpresa,
  emailUnico,
  paginaDoHistorico,
  parDeTokens,
  renomearUsuario,
} from './support/dados';
import { semearAdmin } from './support/rbac';

/**
 * Semeia a empresa COM o seu dono — a MESMA forma do F20.
 *
 * O dono veste o perfil `gerente` DA EMPRESA (o `isAdmin` de empresa é
 * `true` em toda empresa nova) e o `isAdmin` GLOBAL é falso — e é o global
 * que a tela exige. Sem esse ator, "não é admin do sistema" seria medido por
 * uma conta sem perfil nenhum, e a escalada que o `isAdmin` de empresa
 * representa passaria.
 */
async function semearEmpresaComDono(
  semear: (nome: string, email: string) => Promise<{ id: string }>,
) {
  const emailDono = emailUnico('dono-historico');
  const conta = await semear('Dona Do Historico', emailDono);
  const tokens = await parDeTokens(emailDono, SENHA_DE_TESTE);
  const empresa = await criarEmpresa(
    tokens.accessToken,
    'Empresa Do Historico',
    'empresa-historico',
  );
  return { emailDono, id: conta.id, empresa, tokens };
}

/**
 * A tabela do histórico — pelo NOME ACESSÍVEL (a legenda).
 *
 * ⚠️ O nome é o da PÁGINA: na primeira, "Histórico de <pessoa>, da mais
 * recente para a mais antiga"; na página do cursor, "Página do histórico de
 * <pessoa> com as versões mais antigas" — porque a página do cursor mostra
 * as versões MAIS ANTIGAS, e o texto fixo mentiria.
 */
function tabelaDoHistorico(page: Page) {
  return page.getByRole('table', { name: /histórico de/i });
}

test.describe('F21 — O histórico de auditoria de uma pessoa (admin do sistema)', () => {
  test('o admin do sistema vê as DUAS versões — a criação com o nome antigo e a alteração com o novo', async ({
    comoAdmin,
    irPara,
    page,
    semear,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;

    const email = emailUnico('historico');
    const conta = await semear('Pessoa Do Historico', email);

    // A SEGUNDA VERSÃO: a pessoa se renomeia com o PRÓPRIO token. O
    // `If-Match` traz a versão que o seed devolveu (`v1`) — sem ele a API
    // responde 428, e o histórico ficaria com UMA entrada só.
    await renomearUsuario(email, conta.id, conta.version, 'Pessoa Renomeada');

    await irPara(`/users/${conta.id}`);

    // A pessoa que ela É HOJE está no título da tela...
    await expect(page.getByRole('heading', { level: 1, name: 'Pessoa Renomeada' })).toBeVisible();

    // ...e o HISTÓRICO mostra o nome de CADA versão.
    const tabela = tabelaDoHistorico(page);
    await expect(tabela).toBeVisible();
    const linhas = tabela.locator('tbody tr');
    await expect(linhas).toHaveCount(2);

    // ⚠️ A ORDEM É DESCENDENTE — a versão mais NOVA primeiro. É o que a API
    // devolve desde que a ordem entrou no port de auditoria: a trilha do
    // administrador do sistema é lida de trás para frente, e a última
    // alteração é a primeira linha.
    //
    // A ALTERAÇÃO: o nome DEPOIS.
    await expect(linhas.nth(0)).toContainText('alteração');
    await expect(linhas.nth(0)).toContainText('Pessoa Renomeada');

    // A CRIAÇÃO: o nome e o e-mail ANTES da alteração. É o que prova que a
    // linha é a VERSÃO, e não a pessoa de hoje repetida.
    await expect(linhas.nth(1)).toContainText('criação');
    await expect(linhas.nth(1)).toContainText('Pessoa Do Historico');
    await expect(linhas.nth(1)).toContainText(email);

    // ⚠️ A COLUNA "QUEM MUDOU" é a 5ª (a ordem das colunas é a do contrato
    // da tela: Versão · O que houve · Nome e e-mail · Quando · Quem mudou).
    // A criação não tem ator — a rota de cadastro é pública — e a tela DIZ
    // que não houve ator, e não inventa um nome. (E não é o TRAÇO: o traço
    // é o "o dado não veio" de outra coluna, e o mesmo símbolo querendo
    // dizer duas coisas na mesma tabela esconde o dado.)
    await expect(linhas.nth(1).getByRole('cell').nth(4)).toHaveText('sem ator');
    // E a alteração tem: quem mudou é a própria pessoa, e a tela mostra o
    // NOME que está no inventário.
    await expect(linhas.nth(0).getByRole('cell').nth(4)).toContainText('Pessoa Renomeada');
  });

  // ⚠️ A PAGINAÇÃO — e o caminho que o inventário de fluxos promete ("'carregar
  // mais' leva às mais antigas"). MEDIDO 2026-11-17 na revisão do PR #171: o
  // link NUNCA aparecia (a tela pede 100 por página, e o dado semeado tem 2
  // versões → `nextCursor` null), e o caminho da paginação não era
  // exercitável por NENHUM spec.
  test('a página 2 mostra a versão MAIS ANTIGA — e há o volta para as mais recentes', async ({
    irPara,
    page,
    semear,
  }) => {
    const email = emailUnico('historico-pagina');
    const conta = await semear('Pessoa Do Historico', email);
    await renomearUsuario(email, conta.id, conta.version, 'Pessoa Renomeada');

    // O admin do SISTEMA — e o MESMO que a tela usa (o cookie). O perfil é
    // semeado aqui (e não pela fixture `comoAdmin`) porque o slug do perfil é
    // fixo, e semear duas vezes no mesmo teste violaria a unicidade.
    const admin = await semearAdmin();
    await plantarSessao(page, admin.tokens);

    // O cursor da PRIMEIRA página — pedido à API com `limit=1` (é a que dá o
    // cursor de verdade: o id da LINHA, que é o que a tela viaja na URL).
    const primeira = await paginaDoHistorico(admin.tokens.accessToken, conta.id, 1);
    expect(primeira.nextCursor).not.toBeNull();

    await irPara(`/users/${conta.id}?cursor=${encodeURIComponent(primeira.nextCursor ?? '')}`);

    // A tela mostra a versão que FICOU DE FORA da primeira página — a mais
    // antiga (a ordem é descendente: a mais nova primeiro).
    const linhas = tabelaDoHistorico(page).locator('tbody tr');
    await expect(linhas).toHaveCount(1);
    await expect(linhas.nth(0)).toContainText('criação');
    await expect(linhas.nth(0)).toContainText('Pessoa Do Historico');

    // E HÁ O VOLTA: a página 2 não é um beco sem saída — e o link volta para
    // a trilha do início (as versões mais recentes).
    const volta = page.getByRole('link', { name: /versões mais recentes/i });
    await expect(volta).toHaveAttribute('href', `/users/${conta.id}`);
  });

  test('quem não é admin do sistema não abre o detalhe — e o histórico não é entregue', async ({
    irPara,
    page,
    semear,
  }) => {
    const { emailDono, id, empresa, tokens } = await semearEmpresaComDono(semear);

    await plantarSessao(page, tokens);
    // ⚠️ O COOKIE DA EMPRESA NÃO é o que recusa: o guard desta tela
    // (`exigirAdminDoSistema`) lê o perfil GLOBAL — `obterMeuPerfilGlobal` usa
    // o `clientDoToken`, que envia `getTenant: () => null` — e o DONO de uma
    // empresa é recusado nos DOIS casos, porque o perfil global DELE não é
    // `isAdmin` (o `isAdmin` dele é o do perfil efetivo DA EMPRESA).
    //
    // O cookie muda o que a LISTAGEM mostra (`/users` manda `X-Tenant-Id`), e é
    // o cenário real do dono navegando dentro da empresa dele.
    await plantarEmpresa(page, empresa.id);

    // ⚠️ O DADO ESTÁ NA LISTAGEM — e isso é o que dá sentido à asserção
    // seguinte. Sem esta linha, "o histórico não aparece" passaria no VAZIO.
    await irPara('/users');
    await expect(page.getByText('Dona Do Historico')).toBeVisible();

    // E a página de detalhe, aberta pelo path, recusa.
    await irPara(`/users/${id}`);
    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();

    // O HISTÓRICO NÃO É ENTREGUE: nem a tabela, nem o dado que ela carrega.
    await expect(tabelaDoHistorico(page)).toHaveCount(0);
    await expect(page.getByText('Dona Do Historico')).toHaveCount(0);
    await expect(page.getByText(emailDono)).toHaveCount(0);
  });
});
