// FLUXO: F2 — Cadastro de usuário com sucesso
// Cobre: o envio cria o usuário no backend, redireciona para a listagem, e o
//        usuário criado aparece lá.
//
// pt-BR: este arquivo e o `f3-cadastro-validacao.spec.ts` são um PAR, e vale
// explicar por quê antes de ler qualquer um dos dois.
//
// O modo de falha que a suíte precisa impedir é "a tela diz que o formulário
// recusou, e não grava nada" — mas também o oposto: "a tela diz que gravou, e
// nada foi gravado". Um teste que só olha a mensagem passa nos dois casos.
//
// Por isso F3 afirma que a contagem NÃO sobe, e F2 afirma que ela SOBE — e os
// dois leem a MESMA contagem, pela mesma API pública que a tela consome. F3
// verde com a validação desligada significaria que a barreira não é a que
// segura; F2 vermelho com o redirecionamento quebrado significaria que a
// tela mente. Nenhum dos dois é redundante.

import { expect, botaoEnviar, itensDaLista, test } from './support/fixtures';
import { emailUnico } from './support/dados';

test.describe('F2 — Cadastro com sucesso', () => {
  test('cria o usuário, redireciona para a listagem e mostra o que foi criado', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    expect(await contarUsuarios(), 'a listagem deve começar vazia').toBe(0);

    // pt-BR: email por execução. `limparBase()` faz soft-delete e o
    // `email @unique` da linha apagada continua tomado — com literal, o
    // `--repeat-each 2` reprovava com 412 e o sintoma era "a tela não
    // cadastrou". Ver `emailUnico`.
    const email = emailUnico('carla');

    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('Carla E2E');
    await page.getByLabel('Email').fill(email);
    await botaoEnviar(page).click();

    // O redirecionamento é parte do fluxo, não um detalhe: `redirect()` está
    // FORA do try/catch da Server Action de propósito (NEXT_REDIRECT é uma
    // exceção), e um `try/catch` que a engolisse deixaria a pessoa parada no
    // formulário com o usuário já criado.
    await expect(page).toHaveURL(/\/users$/);

    // pt-BR (MEDIDO): o nome na listagem é um `<div>`, não um heading — ver o
    // mesmo registro em `f1-listagem.spec.ts`. Aqui o escopo é o item da
    // lista, porque o nome também pode aparecer no formulário.
    await expect(itensDaLista(page).getByText('Carla E2E')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(itensDaLista(page)).toHaveCount(1);

    // A prova de que atravessou o backend, e não só a tela: a API devolve
    // o mesmo usuário. Um `toBeVisible` na lista passaria mesmo se a página
    // renderizasse o que foi digitado a partir de estado local do cliente.
    expect(await contarUsuarios(), 'o usuário tem de existir na API').toBe(1);
  });

  test('o nome é aparado e o email normalizado como a API define', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    // pt-BR: a API normaliza `trim().toLowerCase()` no email e colapsa
    // whitespace no nome. Se a normalização saísse, o usuário seria criado
    // duas vezes — uma por grafia — e a listagem mostraria duplicata.
    // O `toUpperCase()` é para o valor digitado discordar do gravado em caixa
    // E nas bordas, que é o que a normalização precisa cortar.
    const email = emailUnico('diego');
    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('  Diego   E2E  ');
    await page.getByLabel('Email').fill(`  ${email.toUpperCase()}  `);
    await botaoEnviar(page).click();

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(email)).toBeVisible();
    expect(await contarUsuarios()).toBe(1);
  });
});
