// FLUXO: F1 — Listagem de usuários
// Cobre: com dados, vazio, e o estado de erro quando a API não responde.
//
// pt-BR: os três estados são telas distintas, e o vazio é o mais fácil de
// quebrar em silêncio — um `data?.data.map()` que vira `undefined` (o defeito
// real que esta tela já teve) produz uma lista vazia SEM MENSAGEM, e um teste
// que só contasse itens passaria. Por isso o estado vazio é afirmado pelo
// texto que só ele exibe.

import { derrubarApiDoTeste, subirApiDoTeste } from './support/api';
import { expect, itensDaLista, test } from './support/fixtures';
import { emailUnico } from './support/dados';

test.describe('F1 — Listagem de usuários', () => {
  test('com usuários cadastrados, mostra cada um com nome, email e versão', async ({
    page,
    irPara,
    semear,
  }) => {
    // pt-BR: email por execução, nunca literal. `limparBase()` faz
    // soft-delete e o `email` continua `@unique` na linha apagada — um email
    // fixo reprova no segundo `--repeat-each` com 412, longe do fluxo que
    // este teste cobre. Ver `emailUnico`.
    const emailAna = emailUnico('ana');
    const emailBruno = emailUnico('bruno');
    await semear('Ana Verificacao Local', emailAna);
    await semear('Bruno Verificacao Local', emailBruno);

    await irPara('/users');

    await expect(page.getByText('2 usuários cadastrados')).toBeVisible();
    await expect(itensDaLista(page)).toHaveCount(2);
    // pt-BR (MEDIDO): o nome é um `<div class="font-medium…">`, não um
    // heading. A primeira versão deste arquivo afirmava
    // `getByRole('heading', {name})` e falhava com "element(s) not found" —
    // uma falha que parece "a lista não renderizou", e era o seletor.
    await expect(itensDaLista(page).getByText('Ana Verificacao Local')).toBeVisible();
    await expect(page.getByText(emailAna)).toBeVisible();
    // pt-BR: `v1` aparece nos DOIS itens. Sem escopo, `getByText('v1')` casa
    // dois elementos e o Playwright aborta por `strict mode violation` — que
    // parece falha de tela e é falha de seletor.
    await expect(itensDaLista(page).first().getByText('v1')).toBeVisible();
  });

  test('sem usuários, mostra o estado vazio com o próximo passo', async ({ page, irPara }) => {
    await irPara('/users');

    await expect(page.getByText('Nenhum usuário cadastrado')).toBeVisible();
    await expect(page.getByText('Cadastre o primeiro usuário para começar.')).toBeVisible();
    await expect(page.getByText('0 usuários cadastrados')).toBeVisible();
    await expect(itensDaLista(page)).toHaveCount(0);
  });

  test('com a API fora do ar, diz que não conseguiu carregar', async ({ page, irPara }) => {
    await derrubarApiDoTeste();
    try {
      await irPara('/users');

      // O título continua lá: a tela não some, ela informa. É o que a pessoa
      // precisa ver para saber que o problema é o dado, não a página.
      await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
      await expect(page.getByText('Não foi possível carregar a lista.')).toBeVisible();
      await expect(page.getByText(/^Erro ao carregar:/)).toBeVisible();
      await expect(itensDaLista(page)).toHaveCount(0);
    } finally {
      // O `finally` é o que mantém a janela de falha confinada a este teste:
      // sem ele, uma asserção vermelha deixaria a API fora e o próximo spec
      // falharia por um motivo que não é dele.
      await subirApiDoTeste();
    }
  });
});
